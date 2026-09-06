'use strict';

const {
  BOARD,
  GO_SALARY,
  JAIL_POSITION,
  GO_TO_JAIL_POSITION,
  JAIL_FINE,
  STARTING_CASH,
  PROPERTY_GROUPS
} = require('./boardData');
const { TREASURE_TRAIL, RANDOM_EVENT, shuffledDeck } = require('./cards');

const RAILROAD_POSITIONS = BOARD.map((s, i) => (s.type === 'railroad' ? i : -1)).filter((i) => i >= 0);
const UTILITY_POSITIONS = BOARD.map((s, i) => (s.type === 'utility' ? i : -1)).filter((i) => i >= 0);

function nextInCircle(list, from) {
  const ahead = list.filter((i) => i > from);
  return ahead.length ? ahead[0] : list[0];
}

class GameError extends Error {}

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.properties = {}; // spaceIndex -> { owner, houses, mortgaged }
    this.turnIndex = 0;
    this.phase = 'lobby'; // lobby | awaiting-roll | awaiting-purchase | auction | game-over
    this.doublesCount = 0;
    this.turnState = { hasRolled: false, mustRollAgain: false };
    this.lastRoll = null;
    this.rollSeq = 0;
    this.lastCard = null;
    this.cardSeq = 0;
    this.chanceDeck = shuffledDeck(TREASURE_TRAIL);
    this.chancePos = 0;
    this.communityDeck = shuffledDeck(RANDOM_EVENT);
    this.communityPos = 0;
    this.log = [];
    this.pendingPurchase = null;
    this.auction = null;
    this.pendingDebt = null;
    this.trades = {};
    this.tradeSeq = 1;
    this.partyFund = 100;
    this.winnerId = null;
    this.started = false;
  }

  addLog(msg) {
    this.log.push({ t: Date.now(), msg });
    if (this.log.length > 200) this.log.shift();
  }

  findPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  activePlayers() {
    return this.players.filter((p) => !p.bankrupt);
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  isCurrent(id) {
    const cp = this.currentPlayer();
    return cp && cp.id === id && !cp.bankrupt;
  }

  assertLobby() {
    if (this.phase !== 'lobby') throw new GameError('Game already started.');
  }

  assertNoDebtBlocking(exceptPlayerId) {
    if (this.pendingDebt && this.pendingDebt.playerId !== exceptPlayerId) {
      throw new GameError('Waiting for a player to resolve a debt first.');
    }
  }

  // ---------- Lobby ----------

  addPlayer(id, name, tokenId) {
    if (this.started) throw new GameError('Game already in progress.');
    if (this.players.some((p) => p.tokenId === tokenId)) throw new GameError('That token is taken.');
    if (this.players.length >= 8) throw new GameError('Room is full (8 players max).');
    const player = {
      id,
      name: name.slice(0, 20) || 'Adventurer',
      tokenId,
      cash: STARTING_CASH,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      connected: true
    };
    this.players.push(player);
    this.addLog(`${player.name} joined the room.`);
    return player;
  }

  removePlayer(id) {
    if (!this.started) {
      this.players = this.players.filter((p) => p.id !== id);
      if (this.hostId === id && this.players.length) this.hostId = this.players[0].id;
      return;
    }
    const p = this.findPlayer(id);
    if (p) {
      p.connected = false;
      this.addLog(`${p.name} disconnected.`);
    }
  }

  startGame() {
    this.assertLobby();
    if (this.players.length < 2) throw new GameError('Need at least 2 players to start.');
    this.started = true;
    this.phase = 'awaiting-roll';
    this.turnIndex = 0;
    this.addLog('The game begins! ' + this.currentPlayer().name + ' rolls first.');
  }

  // ---------- Movement helpers ----------

  movePlayerBy(player, amount) {
    const old = player.position;
    let dest = (old + amount) % BOARD.length;
    if (dest < old) {
      player.cash += GO_SALARY;
      this.addLog(`${player.name} passes Lumbridge and collects ${GO_SALARY}gp.`);
    }
    player.position = dest;
    return dest;
  }

  movePlayerTo(player, dest, { collectGo = true } = {}) {
    const old = player.position;
    if (collectGo && dest <= old) {
      player.cash += GO_SALARY;
      this.addLog(`${player.name} passes Lumbridge and collects ${GO_SALARY}gp.`);
    }
    player.position = dest;
    return dest;
  }

  sendToJail(player) {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    this.doublesCount = 0;
    this.turnState.mustRollAgain = false;
    this.addLog(`${player.name} is sent to Draynor Jail!`);
  }

  ensureProperty(spaceIndex) {
    if (!this.properties[spaceIndex]) {
      this.properties[spaceIndex] = { owner: null, houses: 0, mortgaged: false };
    }
    return this.properties[spaceIndex];
  }

  ownsFullGroup(playerId, group) {
    const idxs = PROPERTY_GROUPS[group] || [];
    return idxs.length > 0 && idxs.every((i) => this.properties[i] && this.properties[i].owner === playerId);
  }

  getRent(spaceIndex, diceSum) {
    const space = BOARD[spaceIndex];
    const prop = this.properties[spaceIndex];
    if (!prop || !prop.owner || prop.mortgaged) return 0;
    if (space.type === 'property') {
      if (prop.houses > 0) return space.rent[prop.houses];
      const base = space.rent[0];
      return this.ownsFullGroup(prop.owner, space.group) ? base * 2 : base;
    }
    if (space.type === 'railroad') {
      const owned = RAILROAD_POSITIONS.filter((i) => this.properties[i] && this.properties[i].owner === prop.owner && !this.properties[i].mortgaged).length;
      return 25 * Math.pow(2, Math.max(0, owned - 1));
    }
    if (space.type === 'utility') {
      const owned = UTILITY_POSITIONS.filter((i) => this.properties[i] && this.properties[i].owner === prop.owner && !this.properties[i].mortgaged).length;
      const mult = owned >= 2 ? 10 : 4;
      return diceSum * mult;
    }
    return 0;
  }

  // ---------- Charging / debt / bankruptcy ----------

  chargePlayer(player, amount, payeeId) {
    if (amount <= 0) return;
    if (player.cash >= amount) {
      player.cash -= amount;
      if (payeeId) {
        const payee = this.findPlayer(payeeId);
        if (payee) payee.cash += amount;
        this.addLog(`${player.name} pays ${amount}gp to ${payee ? payee.name : 'the bank'}.`);
      } else {
        this.partyFund += amount;
        this.addLog(`${player.name} pays ${amount}gp into the Party Room Fund (now ${this.partyFund}gp).`);
      }
    } else {
      this.pendingDebt = { playerId: player.id, amount, payeeId: payeeId || null };
      this.addLog(`${player.name} owes ${amount}gp and doesn't have enough gold! Mortgage, sell buildings, or declare bankruptcy.`);
    }
  }

  resolvePendingDebtIfPossible() {
    if (!this.pendingDebt) return;
    const player = this.findPlayer(this.pendingDebt.playerId);
    if (player.cash >= this.pendingDebt.amount) {
      const { amount, payeeId } = this.pendingDebt;
      player.cash -= amount;
      if (payeeId) {
        const payee = this.findPlayer(payeeId);
        if (payee) payee.cash += amount;
      } else {
        this.partyFund += amount;
      }
      this.addLog(`${player.name} settles the ${amount}gp debt.`);
      this.pendingDebt = null;
    }
  }

  declareBankruptcy(playerId) {
    if (!this.pendingDebt || this.pendingDebt.playerId !== playerId) {
      throw new GameError('No debt to declare bankruptcy against.');
    }
    const player = this.findPlayer(playerId);
    const payeeId = this.pendingDebt.payeeId;
    const payee = payeeId ? this.findPlayer(payeeId) : null;

    const owned = Object.keys(this.properties).filter((i) => this.properties[i].owner === playerId).map(Number);

    if (payee) {
      payee.cash += player.cash;
      owned.forEach((i) => {
        this.properties[i].owner = payee.id;
      });
      this.addLog(`${player.name} goes bankrupt! Everything is handed over to ${payee.name}.`);
    } else {
      this.partyFund += player.cash;
      owned.forEach((i) => {
        this.properties[i] = { owner: null, houses: 0, mortgaged: false };
      });
      this.addLog(`${player.name} goes bankrupt! Their properties return to the bank.`);
    }
    player.cash = 0;
    player.bankrupt = true;
    this.pendingDebt = null;

    const remaining = this.activePlayers();
    if (remaining.length <= 1) {
      this.phase = 'game-over';
      this.winnerId = remaining[0] ? remaining[0].id : null;
      this.addLog(remaining[0] ? `${remaining[0].name} wins the game!` : 'The game has ended.');
    } else if (this.currentPlayer().id === playerId) {
      this.advanceTurn();
    }
  }

  // ---------- Cards ----------

  drawCard(deckKey, player, fromCard) {
    if (fromCard) return;
    const isChance = deckKey === 'chance';
    const deckDefs = isChance ? TREASURE_TRAIL : RANDOM_EVENT;
    let deck = isChance ? this.chanceDeck : this.communityDeck;
    let pos = isChance ? this.chancePos : this.communityPos;
    if (pos >= deck.length) {
      deck = shuffledDeck(deckDefs);
      pos = 0;
    }
    const card = deckDefs[deck[pos]];
    pos += 1;
    if (isChance) {
      this.chanceDeck = deck;
      this.chancePos = pos;
    } else {
      this.communityDeck = deck;
      this.communityPos = pos;
    }
    this.cardSeq += 1;
    this.lastCard = { deck: deckKey, text: card.text, playerName: player.name };
    this.addLog(`${player.name} draws: "${card.text}"`);
    this.applyCard(card, player);
  }

  applyCard(card, player) {
    switch (card.type) {
      case 'advance-to': {
        const dest = card.dest;
        this.movePlayerTo(player, dest, { collectGo: true });
        this.resolveLanding(player, dest, { fromCard: true });
        break;
      }
      case 'advance-to-nearest-railroad': {
        const dest = nextInCircle(RAILROAD_POSITIONS, player.position);
        this.movePlayerTo(player, dest, { collectGo: true });
        const prop = this.ensureProperty(dest);
        if (!prop.owner) {
          this.pendingPurchase = dest;
          this.phase = 'awaiting-purchase';
        } else if (prop.owner !== player.id) {
          const rent = this.getRent(dest, this.lastRoll ? this.lastRoll.d1 + this.lastRoll.d2 : 0) * 2;
          this.chargePlayer(player, rent, prop.owner);
        }
        break;
      }
      case 'advance-to-nearest-utility': {
        const dest = nextInCircle(UTILITY_POSITIONS, player.position);
        this.movePlayerTo(player, dest, { collectGo: true });
        const prop = this.ensureProperty(dest);
        if (!prop.owner) {
          this.pendingPurchase = dest;
          this.phase = 'awaiting-purchase';
        } else if (prop.owner !== player.id) {
          const diceSum = this.lastRoll ? this.lastRoll.d1 + this.lastRoll.d2 : 0;
          this.chargePlayer(player, diceSum * 10, prop.owner);
        }
        break;
      }
      case 'collect':
        player.cash += card.amount;
        break;
      case 'pay':
        this.chargePlayer(player, card.amount, null);
        break;
      case 'pay-each-player':
        this.activePlayers()
          .filter((p) => p.id !== player.id)
          .forEach((p) => this.chargePlayer(player, card.amount, p.id));
        break;
      case 'collect-from-each-player':
        this.activePlayers()
          .filter((p) => p.id !== player.id)
          .forEach((p) => this.chargePlayer(p, card.amount, player.id));
        break;
      case 'get-out-of-jail':
        player.jailCards += 1;
        break;
      case 'go-back': {
        const dest = (player.position - card.spaces + BOARD.length) % BOARD.length;
        this.movePlayerTo(player, dest, { collectGo: false });
        this.resolveLanding(player, dest, { fromCard: true });
        break;
      }
      case 'go-to-jail':
        this.sendToJail(player);
        break;
      case 'repairs': {
        let total = 0;
        Object.keys(this.properties).forEach((i) => {
          const p = this.properties[i];
          if (p.owner === player.id) {
            if (p.houses === 5) total += card.perHotel;
            else total += p.houses * card.perHouse;
          }
        });
        this.chargePlayer(player, total, null);
        break;
      }
      default:
        break;
    }
  }

  // ---------- Landing resolution ----------

  resolveLanding(player, spaceIndex, { fromCard = false } = {}) {
    const space = BOARD[spaceIndex];
    switch (space.type) {
      case 'property':
      case 'railroad':
      case 'utility': {
        const prop = this.ensureProperty(spaceIndex);
        if (!prop.owner) {
          this.pendingPurchase = spaceIndex;
          this.phase = 'awaiting-purchase';
        } else if (prop.owner !== player.id) {
          const diceSum = this.lastRoll ? this.lastRoll.d1 + this.lastRoll.d2 : 0;
          const rent = this.getRent(spaceIndex, diceSum);
          this.chargePlayer(player, rent, prop.owner);
        }
        break;
      }
      case 'tax':
        this.chargePlayer(player, space.amount, null);
        break;
      case 'chance':
        this.drawCard('chance', player, fromCard);
        break;
      case 'community':
        this.drawCard('community', player, fromCard);
        break;
      case 'go-to-jail':
        this.sendToJail(player);
        break;
      case 'free-parking':
        this.claimPartyFund(player);
        break;
      case 'go':
      case 'jail':
      default:
        break;
    }
  }

  claimPartyFund(player) {
    const amount = this.partyFund;
    player.cash += amount;
    this.addLog(`${player.name} claims the ${amount}gp Party Room Fund!`);
    this.partyFund = 100;
  }

  // ---------- Turn actions ----------

  rollDice(playerId) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'awaiting-roll') throw new GameError('Cannot roll right now.');
    if (!this.isCurrent(playerId)) throw new GameError('Not your turn.');
    if (this.turnState.hasRolled && !this.turnState.mustRollAgain) throw new GameError('Already rolled. End your turn.');

    const player = this.currentPlayer();
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.lastRoll = { d1, d2 };
    this.rollSeq += 1;
    const isDouble = d1 === d2;

    if (player.inJail) {
      this.turnState.hasRolled = true;
      this.turnState.mustRollAgain = false;
      if (isDouble) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(`${player.name} rolls doubles and breaks out of jail!`);
        const dest = this.movePlayerBy(player, d1 + d2);
        this.resolveLanding(player, dest);
      } else {
        player.jailTurns += 1;
        if (player.jailTurns >= 3) {
          this.chargePlayer(player, JAIL_FINE, null);
          if (!this.pendingDebt) {
            player.inJail = false;
            player.jailTurns = 0;
            this.addLog(`${player.name} pays the ${JAIL_FINE}gp fine after 3 failed attempts and is released.`);
            const dest = this.movePlayerBy(player, d1 + d2);
            this.resolveLanding(player, dest);
          }
        } else {
          this.addLog(`${player.name} rolls ${d1}+${d2} and stays in Draynor Jail (attempt ${player.jailTurns}/3).`);
        }
      }
      return { d1, d2 };
    }

    if (isDouble) {
      this.doublesCount += 1;
    } else {
      this.doublesCount = 0;
    }

    this.turnState.hasRolled = true;

    if (this.doublesCount === 3) {
      this.addLog(`${player.name} rolls doubles three times in a row and gets sent to jail!`);
      this.doublesCount = 0;
      this.turnState.mustRollAgain = false;
      this.sendToJail(player);
      return { d1, d2 };
    }

    this.turnState.mustRollAgain = isDouble;
    const dest = this.movePlayerBy(player, d1 + d2);
    this.resolveLanding(player, dest);
    return { d1, d2 };
  }

  payJailFine(playerId) {
    this.assertNoDebtBlocking(playerId);
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) throw new GameError('Not your turn.');
    if (!player.inJail) throw new GameError('You are not in jail.');
    if (this.turnState.hasRolled) throw new GameError('Too late, you already rolled this turn.');
    this.chargePlayer(player, JAIL_FINE, null);
    if (!this.pendingDebt) {
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(`${player.name} pays ${JAIL_FINE}gp bail and is released from jail.`);
    }
  }

  useJailCard(playerId) {
    this.assertNoDebtBlocking(playerId);
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) throw new GameError('Not your turn.');
    if (!player.inJail) throw new GameError('You are not in jail.');
    if (player.jailCards <= 0) throw new GameError('You have no Get Out of Jail Free scrolls.');
    if (this.turnState.hasRolled) throw new GameError('Too late, you already rolled this turn.');
    player.jailCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} uses a Get Out of Jail Free scroll.`);
  }

  buyProperty(playerId) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'awaiting-purchase') throw new GameError('No property to buy right now.');
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) throw new GameError('Not your turn.');
    const spaceIndex = this.pendingPurchase;
    const space = BOARD[spaceIndex];
    if (player.cash < space.price) throw new GameError('Not enough gold.');
    player.cash -= space.price;
    const prop = this.ensureProperty(spaceIndex);
    prop.owner = player.id;
    this.addLog(`${player.name} buys ${space.name} for ${space.price}gp.`);
    this.pendingPurchase = null;
    this.phase = 'awaiting-roll';
  }

  declineProperty(playerId) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'awaiting-purchase') throw new GameError('No property to decline right now.');
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) throw new GameError('Not your turn.');
    const spaceIndex = this.pendingPurchase;
    this.addLog(`${player.name} declines to buy ${BOARD[spaceIndex].name}. Up for auction!`);
    this.pendingPurchase = null;
    this.phase = 'auction';
    const activeIds = this.activePlayers().map((p) => p.id);
    this.auction = {
      spaceIndex,
      currentBid: 0,
      currentBidder: null,
      passed: []
    };
    this._auctionActive = activeIds;
  }

  placeBid(playerId, amount) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'auction') throw new GameError('No auction in progress.');
    const auction = this.auction;
    if (auction.passed.includes(playerId)) throw new GameError('You already passed on this auction.');
    if (!this._auctionActive.includes(playerId)) throw new GameError('You are not part of this auction.');
    const player = this.findPlayer(playerId);
    if (amount <= auction.currentBid) throw new GameError('Bid must be higher than the current bid.');
    if (amount > player.cash) throw new GameError('You cannot bid more gold than you have.');
    auction.currentBid = amount;
    auction.currentBidder = playerId;
    this.addLog(`${player.name} bids ${amount}gp for ${BOARD[auction.spaceIndex].name}.`);
    this.maybeCloseAuction();
  }

  passBid(playerId) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'auction') throw new GameError('No auction in progress.');
    const auction = this.auction;
    if (!auction.passed.includes(playerId)) {
      auction.passed.push(playerId);
      const player = this.findPlayer(playerId);
      this.addLog(`${player.name} passes on the auction.`);
    }
    this.maybeCloseAuction();
  }

  maybeCloseAuction() {
    const auction = this.auction;
    const remaining = this._auctionActive.filter((id) => !auction.passed.includes(id));
    if (remaining.length > 1) return;
    if (remaining.length === 1 && auction.currentBidder && remaining[0] === auction.currentBidder) {
      const winner = this.findPlayer(auction.currentBidder);
      winner.cash -= auction.currentBid;
      const prop = this.ensureProperty(auction.spaceIndex);
      prop.owner = winner.id;
      this.addLog(`${winner.name} wins the auction for ${BOARD[auction.spaceIndex].name} at ${auction.currentBid}gp.`);
    } else if (auction.currentBidder) {
      const winner = this.findPlayer(auction.currentBidder);
      winner.cash -= auction.currentBid;
      const prop = this.ensureProperty(auction.spaceIndex);
      prop.owner = winner.id;
      this.addLog(`${winner.name} wins the auction for ${BOARD[auction.spaceIndex].name} at ${auction.currentBid}gp.`);
    } else {
      this.addLog(`No bids. ${BOARD[auction.spaceIndex].name} stays unowned.`);
    }
    this.auction = null;
    this._auctionActive = null;
    this.phase = 'awaiting-roll';
  }

  endTurn(playerId) {
    this.assertNoDebtBlocking(playerId);
    if (this.phase !== 'awaiting-roll') throw new GameError('Finish the current action first.');
    if (!this.isCurrent(playerId)) throw new GameError('Not your turn.');
    if (!this.turnState.hasRolled) throw new GameError('Roll the dice first.');
    if (this.turnState.mustRollAgain) throw new GameError('You rolled doubles — roll again.');
    this.advanceTurn();
  }

  advanceTurn() {
    this.doublesCount = 0;
    this.turnState = { hasRolled: false, mustRollAgain: false };
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turnIndex + step) % n;
      if (!this.players[idx].bankrupt) {
        this.turnIndex = idx;
        break;
      }
    }
    if (this.phase !== 'game-over') {
      this.phase = 'awaiting-roll';
      this.addLog(`It's ${this.currentPlayer().name}'s turn.`);
    }
  }

  // ---------- Property management ----------

  buildHouse(playerId, spaceIndex) {
    this.assertNoDebtBlocking(playerId);
    const space = BOARD[spaceIndex];
    const prop = this.properties[spaceIndex];
    if (!space || space.type !== 'property' || !prop || prop.owner !== playerId) {
      throw new GameError('You do not own that property.');
    }
    if (!this.ownsFullGroup(playerId, space.group)) throw new GameError('You need the full set to build.');
    if (prop.mortgaged) throw new GameError('That property is mortgaged.');
    if (prop.houses >= 5) throw new GameError('Already at a castle (max level).');
    const groupIdxs = PROPERTY_GROUPS[space.group];
    const minHouses = Math.min(...groupIdxs.map((i) => this.properties[i].houses));
    if (prop.houses > minHouses) throw new GameError('Build evenly across the set first.');
    const player = this.findPlayer(playerId);
    if (player.cash < space.houseCost) throw new GameError('Not enough gold.');
    player.cash -= space.houseCost;
    prop.houses += 1;
    this.addLog(`${player.name} builds ${prop.houses === 5 ? 'a castle' : 'a hut'} on ${space.name}.`);
  }

  sellHouse(playerId, spaceIndex) {
    this.assertNoDebtBlocking(playerId);
    const space = BOARD[spaceIndex];
    const prop = this.properties[spaceIndex];
    if (!space || space.type !== 'property' || !prop || prop.owner !== playerId) {
      throw new GameError('You do not own that property.');
    }
    if (prop.houses <= 0) throw new GameError('No buildings to sell.');
    const groupIdxs = PROPERTY_GROUPS[space.group];
    const maxHouses = Math.max(...groupIdxs.map((i) => this.properties[i].houses));
    if (prop.houses < maxHouses) throw new GameError('Sell evenly across the set first.');
    const player = this.findPlayer(playerId);
    prop.houses -= 1;
    player.cash += Math.floor(space.houseCost / 2);
    this.addLog(`${player.name} sells a building on ${space.name}.`);
    this.resolvePendingDebtIfPossible();
  }

  mortgageProperty(playerId, spaceIndex) {
    this.assertNoDebtBlocking(playerId);
    const space = BOARD[spaceIndex];
    const prop = this.properties[spaceIndex];
    if (!space || !prop || prop.owner !== playerId) throw new GameError('You do not own that property.');
    if (prop.houses > 0) throw new GameError('Sell buildings on it first.');
    if (prop.mortgaged) throw new GameError('Already mortgaged.');
    const player = this.findPlayer(playerId);
    prop.mortgaged = true;
    player.cash += space.mortgage;
    this.addLog(`${player.name} mortgages ${space.name} for ${space.mortgage}gp.`);
    this.resolvePendingDebtIfPossible();
  }

  unmortgageProperty(playerId, spaceIndex) {
    this.assertNoDebtBlocking(playerId);
    const space = BOARD[spaceIndex];
    const prop = this.properties[spaceIndex];
    if (!space || !prop || prop.owner !== playerId) throw new GameError('You do not own that property.');
    if (!prop.mortgaged) throw new GameError('Not mortgaged.');
    const cost = Math.ceil(space.mortgage * 1.1);
    const player = this.findPlayer(playerId);
    if (player.cash < cost) throw new GameError('Not enough gold to lift the mortgage.');
    player.cash -= cost;
    prop.mortgaged = false;
    this.addLog(`${player.name} pays off the mortgage on ${space.name} for ${cost}gp.`);
  }

  // ---------- Trading ----------

  proposeTrade(fromId, toId, offer, request) {
    this.assertNoDebtBlocking(fromId);
    const from = this.findPlayer(fromId);
    const to = this.findPlayer(toId);
    if (!from || !to || from.bankrupt || to.bankrupt) throw new GameError('Invalid trade partner.');
    const id = String(this.tradeSeq++);
    this.trades[id] = {
      id,
      from: fromId,
      to: toId,
      offer: normalizeTradeSide(offer),
      request: normalizeTradeSide(request),
      status: 'pending'
    };
    this.addLog(`${from.name} proposes a trade to ${to.name}.`);
    return id;
  }

  respondTrade(tradeId, byId, accept) {
    const trade = this.trades[tradeId];
    if (!trade || trade.status !== 'pending') throw new GameError('Trade no longer available.');
    if (byId !== trade.to && byId !== trade.from) throw new GameError('Not your trade to respond to.');
    if (byId === trade.from || !accept) {
      trade.status = 'cancelled';
      delete this.trades[tradeId];
      this.addLog('A trade was cancelled.');
      return;
    }
    this.assertNoDebtBlocking(byId);
    const from = this.findPlayer(trade.from);
    const to = this.findPlayer(trade.to);
    this.validateTradeSide(from, trade.offer);
    this.validateTradeSide(to, trade.request);

    from.cash -= trade.offer.cash;
    to.cash += trade.offer.cash;
    to.cash -= trade.request.cash;
    from.cash += trade.request.cash;

    trade.offer.properties.forEach((i) => (this.properties[i].owner = to.id));
    trade.request.properties.forEach((i) => (this.properties[i].owner = from.id));

    from.jailCards -= trade.offer.jailCards;
    to.jailCards += trade.offer.jailCards;
    to.jailCards -= trade.request.jailCards;
    from.jailCards += trade.request.jailCards;

    trade.status = 'accepted';
    delete this.trades[tradeId];
    this.addLog(`${from.name} and ${to.name} complete a trade.`);
  }

  validateTradeSide(player, side) {
    if (player.cash < side.cash) throw new GameError(`${player.name} does not have enough gold for this trade.`);
    if (player.jailCards < side.jailCards) throw new GameError(`${player.name} does not have enough scrolls.`);
    side.properties.forEach((i) => {
      const prop = this.properties[i];
      if (!prop || prop.owner !== player.id) throw new GameError(`${player.name} no longer owns ${BOARD[i].name}.`);
      if (prop.houses > 0) throw new GameError(`${BOARD[i].name} has buildings on it and cannot be traded.`);
    });
  }

  // ---------- Serialization ----------

  toJSON() {
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      phase: this.phase,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        tokenId: p.tokenId,
        cash: p.cash,
        position: p.position,
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        jailCards: p.jailCards,
        bankrupt: p.bankrupt,
        connected: p.connected
      })),
      properties: this.properties,
      turnIndex: this.turnIndex,
      currentPlayerId: this.players[this.turnIndex] ? this.players[this.turnIndex].id : null,
      turnState: this.turnState,
      lastRoll: this.lastRoll,
      rollSeq: this.rollSeq,
      lastCard: this.lastCard,
      cardSeq: this.cardSeq,
      pendingPurchase: this.pendingPurchase,
      auction: this.auction
        ? { ...this.auction, active: this._auctionActive, spaceName: BOARD[this.auction.spaceIndex].name }
        : null,
      pendingDebt: this.pendingDebt,
      trades: Object.values(this.trades),
      partyFund: this.partyFund,
      log: this.log.slice(-40),
      winnerId: this.winnerId
    };
  }
}

function normalizeTradeSide(side) {
  return {
    cash: Math.max(0, Math.floor(Number(side && side.cash) || 0)),
    properties: Array.isArray(side && side.properties) ? side.properties.map(Number) : [],
    jailCards: Math.max(0, Math.floor(Number(side && side.jailCards) || 0))
  };
}

module.exports = { Room, GameError, BOARD };
