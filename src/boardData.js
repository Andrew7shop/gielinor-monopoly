'use strict';

// 40-space board, laid out exactly like classic Monopoly (same prices/rents,
// same group sizes) but reskinned with original RuneScape-inspired place
// names and flavor text. No Jagex artwork or copy is used anywhere here.

const GROUP_COLORS = {
  brown: '#6b3f22',
  lightBlue: '#a9ddf3',
  pink: '#d63384',
  orange: '#e8791b',
  red: '#c0392b',
  yellow: '#f1c40f',
  green: '#2e7d32',
  darkBlue: '#1a3c8f'
};

function property(name, group, price, rent, houseCost, mortgage) {
  return {
    type: 'property',
    name,
    group,
    price,
    rent, // [base, 1house, 2house, 3house, 4house, hotel]
    houseCost,
    mortgage
  };
}

function railroad(name, price = 200, mortgage = 100) {
  return { type: 'railroad', name, group: 'railroad', price, mortgage };
}

function utility(name, price = 150, mortgage = 75) {
  return { type: 'utility', name, group: 'utility', price, mortgage };
}

const BOARD = [
  /* 0 */ { type: 'go', name: 'Lumbridge' },
  /* 1 */ property('Draynor Village', 'brown', 60, [2, 10, 30, 90, 160, 250], 50, 30),
  /* 2 */ { type: 'community', name: 'Random Event' },
  /* 3 */ property('Lumbridge Swamp', 'brown', 60, [4, 20, 60, 180, 320, 450], 50, 30),
  /* 4 */ { type: 'tax', name: 'Grand Exchange Tax', amount: 200 },
  /* 5 */ railroad('Spirit Tree: Tree Gnome Stronghold'),
  /* 6 */ property('Al Kharid', 'lightBlue', 100, [6, 30, 90, 270, 400, 550], 50, 50),
  /* 7 */ { type: 'chance', name: 'Treasure Trail' },
  /* 8 */ property('Varrock', 'lightBlue', 100, [6, 30, 90, 270, 400, 550], 50, 50),
  /* 9 */ property('Edgeville', 'lightBlue', 120, [8, 40, 100, 300, 450, 600], 50, 60),
  /* 10 */ { type: 'jail', name: 'Draynor Jail' },
  /* 11 */ property('Falador', 'pink', 140, [10, 50, 150, 450, 625, 750], 100, 70),
  /* 12 */ utility('Rune Essence Mine'),
  /* 13 */ property('Port Sarim', 'pink', 140, [10, 50, 150, 450, 625, 750], 100, 70),
  /* 14 */ property('Rimmington', 'pink', 160, [12, 60, 180, 500, 700, 900], 100, 80),
  /* 15 */ railroad('Spirit Tree: Feldip Hills'),
  /* 16 */ property('Catherby', 'orange', 180, [14, 70, 200, 550, 750, 950], 100, 90),
  /* 17 */ { type: 'community', name: 'Random Event' },
  /* 18 */ property("Seers' Village", 'orange', 180, [14, 70, 200, 550, 750, 950], 100, 90),
  /* 19 */ property('Ardougne', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100, 100),
  /* 20 */ { type: 'free-parking', name: 'Drop Party @ The Party Room!' },
  /* 21 */ property('Yanille', 'red', 220, [18, 90, 250, 700, 875, 1050], 150, 110),
  /* 22 */ { type: 'chance', name: 'Treasure Trail' },
  /* 23 */ property('Canifis', 'red', 220, [18, 90, 250, 700, 875, 1050], 150, 110),
  /* 24 */ property('Burthorpe', 'red', 240, [20, 100, 300, 750, 925, 1100], 150, 120),
  /* 25 */ railroad('Spirit Tree: Etceteria'),
  /* 26 */ property('Karamja', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150, 130),
  /* 27 */ property('Nardah', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150, 130),
  /* 28 */ utility('Fishing Guild'),
  /* 29 */ property('Shilo Village', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150, 140),
  /* 30 */ { type: 'go-to-jail', name: 'Wilderness Ditch' },
  /* 31 */ property('Taverley', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200, 150),
  /* 32 */ property('Burgh de Rott', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200, 150),
  /* 33 */ { type: 'community', name: 'Random Event' },
  /* 34 */ property('Prifddinas', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200, 160),
  /* 35 */ railroad('Spirit Tree: Miscellania'),
  /* 36 */ { type: 'chance', name: 'Treasure Trail' },
  /* 37 */ property('Zanaris', 'darkBlue', 350, [35, 175, 500, 1100, 1300, 1500], 200, 175),
  /* 38 */ { type: 'tax', name: 'Donation to the Wise Old Man', amount: 75 },
  /* 39 */ property('Menaphos', 'darkBlue', 400, [50, 200, 600, 1400, 1700, 2000], 200, 200)
];

const GO_SALARY = 200;
const JAIL_POSITION = 10;
const GO_TO_JAIL_POSITION = 30;
const JAIL_FINE = 50;
const STARTING_CASH = 1500;

const TOKENS = [
  { id: 'attack', label: 'Attack', icon: '⚔️' },
  { id: 'strength', label: 'Strength', icon: '💪' },
  { id: 'defence', label: 'Defence', icon: '🛡️' },
  { id: 'woodcutting', label: 'Woodcutting', icon: '🪓' },
  { id: 'fishing', label: 'Fishing', icon: '🎣' },
  { id: 'mining', label: 'Mining', icon: '⛏️' },
  { id: 'cooking', label: 'Cooking', icon: '🍳' },
  { id: 'prayer', label: 'Prayer', icon: '✨' }
];

function groupProperties(spaceType_ignored) {
  const groups = {};
  BOARD.forEach((space, idx) => {
    if (space.type === 'property') {
      groups[space.group] = groups[space.group] || [];
      groups[space.group].push(idx);
    }
  });
  return groups;
}

const PROPERTY_GROUPS = groupProperties();

module.exports = {
  BOARD,
  GROUP_COLORS,
  GO_SALARY,
  JAIL_POSITION,
  GO_TO_JAIL_POSITION,
  JAIL_FINE,
  STARTING_CASH,
  TOKENS,
  PROPERTY_GROUPS
};
