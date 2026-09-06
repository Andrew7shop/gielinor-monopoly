'use strict';

const socket = io();

let BOARD = [];
let TOKENS = [];
let myId = null;
let myCode = null;
let latestState = null;
let cellEls = [];
let chatLog = [];
let tradeModalOpen = false;

const el = (id) => document.getElementById(id);
const GROUP_LABEL = {
  brown: 'Brown', lightBlue: 'Light Blue', pink: 'Pink', orange: 'Orange',
  red: 'Red', yellow: 'Yellow', green: 'Green', darkBlue: 'Dark Blue',
  railroad: 'Spirit Tree', utility: 'Resource Site'
};

function fmtGp(n) { return `${n}gp`; }

function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.hidden = true; }, 3500);
}

function showScreen(name) {
  ['home', 'lobby', 'game'].forEach((s) => {
    el(`screen-${s}`).hidden = s !== name;
  });
}

// ---------------- Home screen ----------------

function selectedToken() {
  const btn = document.querySelector('.token-btn.selected');
  return btn ? btn.dataset.token : null;
}

function renderTokenPicker(takenIds = []) {
  const picker = el('token-picker');
  const prev = selectedToken();
  picker.innerHTML = '';
  TOKENS.forEach((tok) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'token-btn';
    btn.dataset.token = tok.id;
    btn.title = tok.label;
    btn.textContent = tok.icon;
    btn.disabled = takenIds.includes(tok.id);
    if (tok.id === prev && !btn.disabled) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.token-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    picker.appendChild(btn);
  });
  if (!document.querySelector('.token-btn.selected')) {
    const first = document.querySelector('.token-btn:not(:disabled)');
    if (first) first.classList.add('selected');
  }
}

el('create-room-btn').addEventListener('click', () => {
  const name = el('name-input').value.trim();
  const tokenId = selectedToken();
  if (!tokenId) return showToast('Pick a token first.');
  socket.emit('create-room', { name, tokenId });
});

el('join-room-btn').addEventListener('click', () => {
  const name = el('name-input').value.trim();
  const tokenId = selectedToken();
  const code = el('join-code-input').value.trim().toUpperCase();
  if (!tokenId) return showToast('Pick a token first.');
  if (!code) return showToast('Enter a room code.');
  socket.emit('join-room', { code, name, tokenId });
});

// ---------------- Socket wiring ----------------

socket.on('joined', ({ code, playerId }) => {
  myId = playerId;
  myCode = code;
});

socket.on('error-message', (msg) => showToast(msg));

socket.on('chat', (msg) => {
  chatLog.push(msg);
  if (chatLog.length > 200) chatLog.shift();
  renderChat();
});

socket.on('state', (state) => {
  latestState = state;
  if (!state.started) {
    showScreen('lobby');
    renderLobby(state);
  } else {
    showScreen('game');
    renderGame(state);
  }
});

fetch('/api/board').then((r) => r.json()).then((data) => {
  BOARD = data.board;
  TOKENS = data.tokens;
  renderTokenPicker();
  buildBoardCells();
});

// ---------------- Lobby ----------------

function renderLobby(state) {
  el('lobby-code').textContent = state.code || myCode;
  const list = el('lobby-players');
  list.innerHTML = '';
  state.players.forEach((p) => {
    const li = document.createElement('li');
    const tok = TOKENS.find((t) => t.id === p.tokenId);
    li.textContent = `${tok ? tok.icon : ''} ${p.name}${p.id === state.hostId ? ' (host)' : ''}`;
    list.appendChild(li);
  });
  const isHost = state.hostId === myId;
  const startBtn = el('start-game-btn');
  startBtn.hidden = !isHost;
  startBtn.disabled = state.players.length < 2;
  el('lobby-wait-msg').textContent = isHost
    ? (state.players.length < 2 ? 'Waiting for at least one more adventurer...' : 'Ready when you are!')
    : 'Waiting for the host to start the game...';
}

el('start-game-btn').addEventListener('click', () => socket.emit('start-game'));

// ---------------- Board building ----------------

function gridPos(i) {
  if (i === 0) return { row: 11, col: 11 };
  if (i >= 1 && i <= 9) return { row: 11, col: 11 - i };
  if (i === 10) return { row: 11, col: 1 };
  if (i >= 11 && i <= 19) return { row: 11 - (i - 10), col: 1 };
  if (i === 20) return { row: 1, col: 1 };
  if (i >= 21 && i <= 29) return { row: 1, col: (i - 20) + 1 };
  if (i === 30) return { row: 1, col: 11 };
  return { row: (i - 30) + 1, col: 11 }; // 31-39
}

function buildBoardCells() {
  const board = el('board');
  board.innerHTML = '';
  cellEls = [];
  BOARD.forEach((space, i) => {
    const { row, col } = gridPos(i);
    const cell = document.createElement('div');
    cell.className = 'cell';
    const isCorner = [0, 10, 20, 30].includes(i);
    if (isCorner) cell.classList.add('corner');
    cell.style.gridRow = row;
    cell.style.gridColumn = col;

    if (space.type === 'property') {
      const bar = document.createElement('div');
      bar.className = 'group-bar';
      bar.style.background = `var(--${space.group})`;
      cell.appendChild(bar);
    } else if (space.type === 'railroad') {
      const bar = document.createElement('div');
      bar.className = 'group-bar';
      bar.style.background = 'var(--railroad)';
      cell.appendChild(bar);
    } else if (space.type === 'utility') {
      const bar = document.createElement('div');
      bar.className = 'group-bar';
      bar.style.background = 'var(--utility)';
      cell.appendChild(bar);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = space.name;
    cell.appendChild(nameEl);

    if (space.price) {
      const priceEl = document.createElement('div');
      priceEl.className = 'price';
      priceEl.textContent = fmtGp(space.price);
      cell.appendChild(priceEl);
    }

    const housesEl = document.createElement('div');
    housesEl.className = 'houses';
    cell.appendChild(housesEl);

    const ownerEl = document.createElement('div');
    ownerEl.className = 'owner-chip';
    cell.appendChild(ownerEl);

    const tokensEl = document.createElement('div');
    tokensEl.className = 'tokens';
    cell.appendChild(tokensEl);

    board.appendChild(cell);
    cellEls[i] = { cell, housesEl, ownerEl, tokensEl };
  });
}

function updateBoardCells(state) {
  BOARD.forEach((space, i) => {
    const refs = cellEls[i];
    if (!refs) return;
    const prop = state.properties[i];
    refs.cell.classList.toggle('mortgaged', !!(prop && prop.mortgaged));
    refs.cell.classList.toggle('current-space', state.currentPlayerId != null && state.players.some((p) => p.id === state.currentPlayerId && p.position === i));

    refs.housesEl.innerHTML = '';
    if (prop && prop.houses > 0) {
      if (prop.houses === 5) {
        const d = document.createElement('div');
        d.className = 'house-dot hotel';
        refs.housesEl.appendChild(d);
      } else {
        for (let h = 0; h < prop.houses; h++) {
          const d = document.createElement('div');
          d.className = 'house-dot';
          refs.housesEl.appendChild(d);
        }
      }
    }

    if (prop && prop.owner) {
      const owner = state.players.find((p) => p.id === prop.owner);
      const tok = owner && TOKENS.find((t) => t.id === owner.tokenId);
      refs.ownerEl.textContent = tok ? tok.icon : '';
    } else {
      refs.ownerEl.textContent = '';
    }

    refs.tokensEl.innerHTML = '';
    state.players.filter((p) => !p.bankrupt && p.position === i).forEach((p) => {
      const tok = TOKENS.find((t) => t.id === p.tokenId);
      const span = document.createElement('span');
      span.className = 'token';
      span.title = p.name;
      span.textContent = tok ? tok.icon : '?';
      refs.tokensEl.appendChild(span);
    });
  });
}

// ---------------- Game rendering ----------------

function renderGame(state) {
  updateBoardCells(state);
  renderPlayers(state);
  renderControls(state);
  renderProperties(state);
  renderTrades(state);
  renderLog(state);
  renderChat();
  renderAutoModal(state);
}

function renderPlayers(state) {
  const panel = el('players-panel');
  panel.innerHTML = '<h3>Adventurers</h3>';
  state.players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (p.id === state.currentPlayerId && !p.bankrupt) row.classList.add('current');
    if (p.bankrupt) row.classList.add('bankrupt');
    const tok = TOKENS.find((t) => t.id === p.tokenId);
    row.innerHTML = `
      <span>${tok ? tok.icon : ''}</span>
      <span class="pname">${p.name}${p.id === myId ? ' (you)' : ''}</span>
      <span class="pcash">${fmtGp(p.cash)}</span>
      ${p.inJail ? '<span class="jail-tag">jailed</span>' : ''}
      ${!p.connected ? '<span class="disc-tag">offline</span>' : ''}
    `;
    panel.appendChild(row);
  });
  if (state.phase === 'game-over') {
    const banner = document.createElement('div');
    banner.className = 'winner-banner';
    const winner = state.players.find((p) => p.id === state.winnerId);
    banner.textContent = winner ? `🏆 ${winner.name} wins Gielinor Monopoly!` : 'Game over.';
    panel.appendChild(banner);
  }
}

function myPlayer(state) { return state.players.find((p) => p.id === myId); }

function renderControls(state) {
  const panel = el('controls-panel');
  panel.innerHTML = '<h3>Turn</h3>';
  if (state.phase === 'game-over') { panel.innerHTML += '<p>The game has ended.</p>'; return; }

  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const isMyTurn = state.currentPlayerId === myId;

  if (state.lastRoll) {
    const r = document.createElement('div');
    r.className = 'roll-result';
    r.textContent = `🎲 ${state.lastRoll.d1} + ${state.lastRoll.d2}`;
    panel.appendChild(r);
  }

  if (state.pendingDebt) {
    renderDebtPanel(panel, state);
    return;
  }

  if (state.phase === 'auction') {
    renderAuctionPanel(panel, state);
    return;
  }

  if (!isMyTurn) {
    const p = document.createElement('p');
    p.textContent = `Waiting for ${current ? current.name : '...'} to play...`;
    panel.appendChild(p);
    return;
  }

  if (state.phase === 'awaiting-purchase') {
    const p = document.createElement('p');
    p.textContent = `Decide on ${BOARD[state.pendingPurchase].name} (see popup).`;
    panel.appendChild(p);
    return;
  }

  const me = myPlayer(state);
  const row = document.createElement('div');
  row.className = 'action-row';

  if (me.inJail && !state.turnState.hasRolled) {
    const payBtn = document.createElement('button');
    payBtn.className = 'btn';
    payBtn.textContent = 'Pay 50gp Bail';
    payBtn.disabled = me.cash < 50;
    payBtn.onclick = () => socket.emit('pay-jail-fine');
    row.appendChild(payBtn);

    if (me.jailCards > 0) {
      const cardBtn = document.createElement('button');
      cardBtn.className = 'btn';
      cardBtn.textContent = `Use Scroll (${me.jailCards})`;
      cardBtn.onclick = () => socket.emit('use-jail-card');
      row.appendChild(cardBtn);
    }

    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn btn-primary';
    rollBtn.textContent = 'Roll for Doubles';
    rollBtn.onclick = () => socket.emit('roll-dice');
    row.appendChild(rollBtn);
  } else if (!state.turnState.hasRolled || state.turnState.mustRollAgain) {
    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn btn-primary';
    rollBtn.textContent = state.turnState.mustRollAgain ? 'Doubles! Roll Again' : 'Roll Dice';
    rollBtn.onclick = () => socket.emit('roll-dice');
    row.appendChild(rollBtn);
  } else {
    const endBtn = document.createElement('button');
    endBtn.className = 'btn btn-primary';
    endBtn.textContent = 'End Turn';
    endBtn.onclick = () => socket.emit('end-turn');
    row.appendChild(endBtn);
  }

  panel.appendChild(row);
}

function renderDebtPanel(panel, state) {
  const debt = state.pendingDebt;
  const debtor = state.players.find((p) => p.id === debt.playerId);
  const payee = debt.payeeId ? state.players.find((p) => p.id === debt.payeeId) : null;
  const info = document.createElement('p');
  info.innerHTML = `<strong>${debtor.name}</strong> owes <strong>${fmtGp(debt.amount)}</strong> to ${payee ? payee.name : 'the Grand Exchange'} and needs more gold!`;
  panel.appendChild(info);

  if (debt.playerId !== myId) return;

  const mine = ownedProps(state, myId);
  const list = document.createElement('div');
  list.className = 'prop-list';
  mine.forEach(({ idx, space, prop }) => {
    const row = document.createElement('div');
    row.className = 'prop-item';
    const actions = [];
    if (prop.houses > 0) actions.push(actionBtn('Sell Building', () => socket.emit('sell-house', { spaceIndex: idx })));
    if (!prop.mortgaged && prop.houses === 0) actions.push(actionBtn(`Mortgage (${fmtGp(space.mortgage)})`, () => socket.emit('mortgage-property', { spaceIndex: idx })));
    row.innerHTML = `<span class="prop-name">${space.name}</span>`;
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'prop-actions';
    actions.forEach((b) => actionsDiv.appendChild(b));
    row.appendChild(actionsDiv);
    list.appendChild(row);
  });
  panel.appendChild(list);

  const bankruptBtn = document.createElement('button');
  bankruptBtn.className = 'btn btn-danger';
  bankruptBtn.textContent = 'Declare Bankruptcy';
  bankruptBtn.onclick = () => socket.emit('declare-bankruptcy');
  panel.appendChild(bankruptBtn);
}

function renderAuctionPanel(panel, state) {
  const a = state.auction;
  const me = myPlayer(state);
  const title = document.createElement('p');
  title.innerHTML = `<strong>Auction:</strong> ${a.spaceName}<br/>Current bid: ${fmtGp(a.currentBid)} ${a.currentBidder ? `by ${state.players.find((p) => p.id === a.currentBidder)?.name}` : '(none)'}`;
  panel.appendChild(title);

  const passed = a.passed.includes(myId);
  const inAuction = a.active.includes(myId);
  if (!inAuction || passed) {
    const p = document.createElement('p');
    p.textContent = passed ? 'You passed.' : 'Watching the auction...';
    panel.appendChild(p);
    return;
  }

  const row = document.createElement('div');
  row.className = 'action-row';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = a.currentBid + 1;
  input.max = me.cash;
  input.value = a.currentBid + 10;
  input.style.width = '90px';
  row.appendChild(input);

  const bidBtn = document.createElement('button');
  bidBtn.className = 'btn btn-primary';
  bidBtn.textContent = 'Bid';
  bidBtn.onclick = () => socket.emit('place-bid', { amount: Number(input.value) });
  row.appendChild(bidBtn);

  const passBtn = document.createElement('button');
  passBtn.className = 'btn';
  passBtn.textContent = 'Pass';
  passBtn.onclick = () => socket.emit('pass-bid');
  row.appendChild(passBtn);

  panel.appendChild(row);
}

function actionBtn(label, onClick) {
  const b = document.createElement('button');
  b.className = 'btn btn-small';
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function ownedProps(state, playerId) {
  return Object.keys(state.properties)
    .map(Number)
    .filter((idx) => state.properties[idx].owner === playerId)
    .map((idx) => ({ idx, space: BOARD[idx], prop: state.properties[idx] }));
}

function ownsFullGroup(state, playerId, group) {
  const idxs = BOARD.map((s, i) => (s.type === 'property' && s.group === group ? i : -1)).filter((i) => i >= 0);
  return idxs.length > 0 && idxs.every((i) => state.properties[i] && state.properties[i].owner === playerId);
}

function renderProperties(state) {
  const panel = el('properties-panel');
  panel.innerHTML = '<h3>Your Holdings</h3>';
  const mine = ownedProps(state, myId);
  if (!mine.length) {
    panel.innerHTML += '<p class="hint">You do not own any properties yet.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'prop-list';
  const blockedByDebt = !!state.pendingDebt && state.pendingDebt.playerId !== myId;
  mine.forEach(({ idx, space, prop }) => {
    const row = document.createElement('div');
    row.className = 'prop-item';
    const groupIdxs = space.type === 'property' ? BOARD.map((s, i) => (s.type === 'property' && s.group === space.group ? i : -1)).filter((i) => i >= 0) : [];
    const minHouses = groupIdxs.length ? Math.min(...groupIdxs.map((i) => (state.properties[i] ? state.properties[i].houses : 0))) : 0;
    const maxHouses = groupIdxs.length ? Math.max(...groupIdxs.map((i) => (state.properties[i] ? state.properties[i].houses : 0))) : 0;

    row.innerHTML = `<span class="prop-name">${space.name}</span> ${prop.mortgaged ? '<em>(mortgaged)</em>' : ''} ${prop.houses ? `<span>Lv.${prop.houses}</span>` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'prop-actions';

    if (!blockedByDebt) {
      if (space.type === 'property' && !prop.mortgaged && ownsFullGroup(state, myId, space.group) && prop.houses < 5 && prop.houses <= minHouses) {
        actions.appendChild(actionBtn(`Build (${fmtGp(space.houseCost)})`, () => socket.emit('build-house', { spaceIndex: idx })));
      }
      if (space.type === 'property' && prop.houses > 0 && prop.houses >= maxHouses) {
        actions.appendChild(actionBtn('Sell Building', () => socket.emit('sell-house', { spaceIndex: idx })));
      }
      if (!prop.mortgaged && prop.houses === 0) {
        actions.appendChild(actionBtn(`Mortgage (${fmtGp(space.mortgage)})`, () => socket.emit('mortgage-property', { spaceIndex: idx })));
      }
      if (prop.mortgaged) {
        actions.appendChild(actionBtn(`Unmortgage (${Math.ceil(space.mortgage * 1.1)}gp)`, () => socket.emit('unmortgage-property', { spaceIndex: idx })));
      }
    }
    row.appendChild(actions);
    list.appendChild(row);
  });
  panel.appendChild(list);
}

function renderTrades(state) {
  const panel = el('trades-panel');
  panel.innerHTML = '<h3>Trading</h3>';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Propose Trade';
  btn.disabled = state.players.filter((p) => !p.bankrupt).length < 2 || !!state.pendingDebt;
  btn.onclick = () => openTradeModal(state);
  panel.appendChild(btn);

  state.trades.forEach((trade) => {
    const from = state.players.find((p) => p.id === trade.from);
    const to = state.players.find((p) => p.id === trade.to);
    const row = document.createElement('div');
    row.className = 'prop-item';
    row.innerHTML = `<strong>${from.name} → ${to.name}</strong><br/>Offers: ${summarizeTradeSide(trade.offer)}<br/>Requests: ${summarizeTradeSide(trade.request)}`;
    const actions = document.createElement('div');
    actions.className = 'prop-actions';
    if (trade.to === myId) {
      actions.appendChild(actionBtn('Accept', () => socket.emit('respond-trade', { tradeId: trade.id, accept: true })));
      actions.appendChild(actionBtn('Decline', () => socket.emit('respond-trade', { tradeId: trade.id, accept: false })));
    } else if (trade.from === myId) {
      actions.appendChild(actionBtn('Cancel', () => socket.emit('respond-trade', { tradeId: trade.id, accept: false })));
    }
    row.appendChild(actions);
    panel.appendChild(row);
  });
}

function summarizeTradeSide(side) {
  const parts = [];
  if (side.cash) parts.push(fmtGp(side.cash));
  if (side.properties.length) parts.push(side.properties.map((i) => BOARD[i].name).join(', '));
  if (side.jailCards) parts.push(`${side.jailCards} scroll(s)`);
  return parts.length ? parts.join(' + ') : 'nothing';
}

function renderLog(state) {
  const list = el('log-list');
  list.innerHTML = '';
  state.log.slice().reverse().forEach((entry) => {
    const d = document.createElement('div');
    d.textContent = entry.msg;
    list.appendChild(d);
  });
}

function renderChat() {
  const list = el('chat-list');
  list.innerHTML = '';
  chatLog.forEach((m) => {
    const d = document.createElement('div');
    d.innerHTML = `<span class="chat-name">${m.name}:</span> ${escapeHtml(m.text)}`;
    list.appendChild(d);
  });
  list.scrollTop = list.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

el('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = el('chat-input');
  if (!input.value.trim()) return;
  socket.emit('chat', { text: input.value });
  input.value = '';
});

// ---------------- Auto modal (buy/decline) ----------------

function renderAutoModal(state) {
  if (tradeModalOpen) return;
  const root = el('modal-root');
  const isMyTurn = state.currentPlayerId === myId;
  if (state.phase === 'awaiting-purchase' && isMyTurn) {
    const space = BOARD[state.pendingPurchase];
    const me = myPlayer(state);
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>${space.name}</h3>
          <p>Price: <strong>${fmtGp(space.price)}</strong></p>
          ${rentTableHtml(space)}
          <div class="action-row">
            <button class="btn btn-primary" id="buy-btn" ${me.cash < space.price ? 'disabled' : ''}>Buy</button>
            <button class="btn" id="decline-btn">Send to Auction</button>
          </div>
        </div>
      </div>`;
    el('buy-btn').onclick = () => socket.emit('buy-property');
    el('decline-btn').onclick = () => socket.emit('decline-property');
  } else if (state.phase !== 'auction') {
    root.innerHTML = '';
  } else {
    root.innerHTML = '';
  }
}

function rentTableHtml(space) {
  if (space.type === 'property') {
    return `<table style="width:100%;font-size:.85rem"><tbody>
      <tr><td>Base rent</td><td>${fmtGp(space.rent[0])}</td></tr>
      <tr><td>With monopoly</td><td>${fmtGp(space.rent[0] * 2)}</td></tr>
      <tr><td>1 hut</td><td>${fmtGp(space.rent[1])}</td></tr>
      <tr><td>2 huts</td><td>${fmtGp(space.rent[2])}</td></tr>
      <tr><td>3 huts</td><td>${fmtGp(space.rent[3])}</td></tr>
      <tr><td>4 huts</td><td>${fmtGp(space.rent[4])}</td></tr>
      <tr><td>Castle</td><td>${fmtGp(space.rent[5])}</td></tr>
    </tbody></table>`;
  }
  if (space.type === 'railroad') return `<p>Toll: 25/50/100/200gp depending on how many Spirit Tree stops you control.</p>`;
  if (space.type === 'utility') return `<p>Toll: 4x dice roll (1 owned) or 10x dice roll (both owned).</p>`;
  return '';
}

// ---------------- Trade modal ----------------

function openTradeModal(state) {
  const others = state.players.filter((p) => p.id !== myId && !p.bankrupt);
  if (!others.length) return;
  tradeModalOpen = true;
  const root = el('modal-root');

  function draw(targetId) {
    const target = state.players.find((p) => p.id === targetId);
    const me = myPlayer(state);
    const myProps = ownedProps(state, myId).filter((x) => x.prop.houses === 0);
    const theirProps = ownedProps(state, targetId).filter((x) => x.prop.houses === 0);

    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>Propose Trade</h3>
          <label>Trade with</label>
          <select id="trade-target">
            ${others.map((p) => `<option value="${p.id}" ${p.id === targetId ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>

          <div class="trade-side">
            <strong>You offer</strong>
            <label>Gold (max ${me.cash})</label>
            <input type="number" id="offer-cash" min="0" max="${me.cash}" value="0" />
            <label>Properties</label>
            ${myProps.map((x) => `<label class="checkbox-row"><input type="checkbox" class="offer-prop" value="${x.idx}" /> ${x.space.name}</label>`).join('') || '<p class="hint">None tradable.</p>'}
            <label>Get Out of Jail scrolls (max ${me.jailCards})</label>
            <input type="number" id="offer-jail" min="0" max="${me.jailCards}" value="0" />
          </div>

          <div class="trade-side">
            <strong>You request</strong>
            <label>Gold (max ${target.cash})</label>
            <input type="number" id="request-cash" min="0" max="${target.cash}" value="0" />
            <label>Properties</label>
            ${theirProps.map((x) => `<label class="checkbox-row"><input type="checkbox" class="request-prop" value="${x.idx}" /> ${x.space.name}</label>`).join('') || '<p class="hint">None tradable.</p>'}
            <label>Get Out of Jail scrolls (max ${target.jailCards})</label>
            <input type="number" id="request-jail" min="0" max="${target.jailCards}" value="0" />
          </div>

          <div class="action-row">
            <button class="btn btn-primary" id="send-trade-btn">Send Offer</button>
            <button class="btn" id="cancel-trade-btn">Cancel</button>
          </div>
        </div>
      </div>`;

    el('trade-target').onchange = (e) => draw(e.target.value);
    el('cancel-trade-btn').onclick = () => { tradeModalOpen = false; root.innerHTML = ''; };
    el('send-trade-btn').onclick = () => {
      const offer = {
        cash: Number(el('offer-cash').value) || 0,
        properties: Array.from(document.querySelectorAll('.offer-prop:checked')).map((c) => Number(c.value)),
        jailCards: Number(el('offer-jail').value) || 0
      };
      const request = {
        cash: Number(el('request-cash').value) || 0,
        properties: Array.from(document.querySelectorAll('.request-prop:checked')).map((c) => Number(c.value)),
        jailCards: Number(el('request-jail').value) || 0
      };
      socket.emit('propose-trade', { toId: el('trade-target').value, offer, request });
      tradeModalOpen = false;
      root.innerHTML = '';
    };
  }

  draw(others[0].id);
}
