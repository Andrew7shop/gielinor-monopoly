'use strict';

// Card effects are resolved by gameEngine.js. Each card has a `type` the
// engine switches on, plus whatever data that type needs. Text is original
// flavor; mechanics mirror the classic 16-card Chance/Community Chest decks
// 1:1 so game balance matches standard Monopoly.

const TREASURE_TRAIL = [
  { type: 'advance-to', dest: 0, text: 'You dig up a master clue near Lumbridge. Advance to GO and collect 200gp.' },
  { type: 'advance-to', dest: 37, text: 'Your clue leads to Zanaris. Advance there (collect 200gp if you pass Lumbridge).' },
  { type: 'advance-to', dest: 11, text: 'Your clue leads to Falador. Advance there (collect 200gp if you pass Lumbridge).' },
  { type: 'advance-to-nearest-utility', text: 'The trail leads to the nearest resource site. If unowned you may buy it; if owned, pay the owner 10x your last dice roll.' },
  { type: 'advance-to-nearest-railroad', text: 'Advance to the nearest Spirit Tree stop. If unowned you may buy it; if owned, pay double the usual toll.' },
  { type: 'advance-to-nearest-railroad', text: 'Advance to the nearest Spirit Tree stop. If unowned you may buy it; if owned, pay double the usual toll.' },
  { type: 'collect', amount: 50, text: 'The Grand Exchange pays you a dividend of 50gp.' },
  { type: 'get-out-of-jail', text: 'You find a Get Out of Jail Free scroll. Keep it until needed.' },
  { type: 'go-back', spaces: 3, text: 'A trapdoor drops you back 3 spaces.' },
  { type: 'go-to-jail', text: "You've been caught skulling in the Wilderness. Go directly to Draynor Jail." },
  { type: 'repairs', perHouse: 25, perHotel: 100, text: 'Wizards\' Tower repairs are due: pay 25gp per hut and 100gp per castle you own.' },
  { type: 'pay', amount: 15, text: 'Pay 15gp toll to the Duke of Lumbridge.' },
  { type: 'advance-to', dest: 5, text: 'Take a Spirit Tree ride to Tree Gnome Stronghold (collect 200gp if you pass Lumbridge).' },
  { type: 'pay-each-player', amount: 50, text: "You've been elected Mayor of Varrock. Pay each player 50gp." },
  { type: 'collect', amount: 150, text: 'Your Grand Exchange offer clears. Collect 150gp.' },
  { type: 'collect', amount: 100, text: 'You win the Lumbridge crossword competition. Collect 100gp.' }
];

const RANDOM_EVENT = [
  { type: 'advance-to', dest: 0, text: 'Advance to GO and collect 200gp.' },
  { type: 'collect', amount: 200, text: 'Grand Exchange error in your favor. Collect 200gp.' },
  { type: 'pay', amount: 50, text: 'A Superheat Item spell backfires. Pay 50gp in healer fees.' },
  { type: 'collect', amount: 50, text: 'You sell spare bars on the Grand Exchange. Collect 50gp.' },
  { type: 'get-out-of-jail', text: 'You find a Get Out of Jail Free scroll. Keep it until needed.' },
  { type: 'go-to-jail', text: "You've been caught skulling in the Wilderness. Go directly to Draynor Jail." },
  { type: 'collect-from-each-player', amount: 50, text: "It's Party Pete's Grand Opera Night. Collect 50gp from every player." },
  { type: 'collect', amount: 100, text: 'Your bond matures. Collect 100gp.' },
  { type: 'collect', amount: 20, text: 'Tax refund from the Duke of Lumbridge. Collect 20gp.' },
  { type: 'collect-from-each-player', amount: 10, text: "It's your Recruitment Drive anniversary. Collect 10gp from every player." },
  { type: 'collect', amount: 100, text: 'Your Castle Wars insurance matures. Collect 100gp.' },
  { type: 'pay', amount: 100, text: 'Pay 100gp in Falador Party Room hospital fees.' },
  { type: 'pay', amount: 150, text: 'Pay 150gp in Wizards\' Tower tuition fees.' },
  { type: 'collect', amount: 25, text: 'You finish a slayer task for a passing mage. Collect a 25gp consultancy fee.' },
  { type: 'repairs', perHouse: 40, perHotel: 115, text: 'Street repairs in Varrock: pay 40gp per hut and 115gp per castle you own.' },
  { type: 'collect', amount: 10, text: 'You place second in the Fishing Trawler raffle. Collect 10gp.' }
];

function shuffledDeck(cards) {
  const indices = cards.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

module.exports = {
  TREASURE_TRAIL,
  RANDOM_EVENT,
  shuffledDeck
};
