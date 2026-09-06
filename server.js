'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Room, GameError } = require('./src/gameEngine');
const { BOARD, TOKENS } = require('./src/boardData');

const PORT = process.env.PORT || 3000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/board', (req, res) => res.json({ board: BOARD, tokens: TOKENS }));

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<string, string>} socket.id -> room code */
const socketRoom = new Map();

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.lastActivity = Date.now();
  io.to(code).emit('state', room.toJSON());
}

function withRoom(socket, code, fn) {
  const room = rooms.get(code);
  if (!room) {
    socket.emit('error-message', 'That room no longer exists.');
    return;
  }
  try {
    fn(room);
    broadcast(code);
  } catch (err) {
    if (err instanceof GameError) {
      socket.emit('error-message', err.message);
    } else {
      console.error(err);
      socket.emit('error-message', 'Something went wrong.');
    }
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name, tokenId }) => {
    try {
      const code = makeRoomCode();
      const room = new Room(code, socket.id);
      room.lastActivity = Date.now();
      room.addPlayer(socket.id, String(name || ''), tokenId);
      rooms.set(code, room);
      socketRoom.set(socket.id, code);
      socket.join(code);
      socket.emit('joined', { code, playerId: socket.id });
      broadcast(code);
    } catch (err) {
      socket.emit('error-message', err.message || 'Could not create room.');
    }
  });

  socket.on('join-room', ({ code, name, tokenId }) => {
    const roomCode = String(code || '').toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error-message', 'Room not found.');
      return;
    }
    try {
      room.addPlayer(socket.id, String(name || ''), tokenId);
      socketRoom.set(socket.id, roomCode);
      socket.join(roomCode);
      socket.emit('joined', { code: roomCode, playerId: socket.id });
      broadcast(roomCode);
    } catch (err) {
      socket.emit('error-message', err.message || 'Could not join room.');
    }
  });

  socket.on('chat', ({ text }) => {
    const code = socketRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room) return;
    const player = room.findPlayer(socket.id);
    const clean = String(text || '').slice(0, 300).trim();
    if (!clean || !player) return;
    io.to(code).emit('chat', { name: player.name, text: clean, t: Date.now() });
  });

  const action = (event, handler) => {
    socket.on(event, (payload = {}) => {
      const code = socketRoom.get(socket.id);
      if (!code) {
        socket.emit('error-message', 'You are not in a room.');
        return;
      }
      withRoom(socket, code, (room) => handler(room, payload));
    });
  };

  action('start-game', (room) => {
    if (room.hostId !== socket.id) throw new GameError('Only the host can start the game.');
    room.startGame();
  });
  action('roll-dice', (room) => room.rollDice(socket.id));
  action('buy-property', (room) => room.buyProperty(socket.id));
  action('decline-property', (room) => room.declineProperty(socket.id));
  action('place-bid', (room, { amount }) => room.placeBid(socket.id, Number(amount)));
  action('pass-bid', (room) => room.passBid(socket.id));
  action('end-turn', (room) => room.endTurn(socket.id));
  action('pay-jail-fine', (room) => room.payJailFine(socket.id));
  action('use-jail-card', (room) => room.useJailCard(socket.id));
  action('build-house', (room, { spaceIndex }) => room.buildHouse(socket.id, Number(spaceIndex)));
  action('sell-house', (room, { spaceIndex }) => room.sellHouse(socket.id, Number(spaceIndex)));
  action('mortgage-property', (room, { spaceIndex }) => room.mortgageProperty(socket.id, Number(spaceIndex)));
  action('unmortgage-property', (room, { spaceIndex }) => room.unmortgageProperty(socket.id, Number(spaceIndex)));
  action('declare-bankruptcy', (room) => room.declareBankruptcy(socket.id));
  action('propose-trade', (room, { toId, offer, request }) => room.proposeTrade(socket.id, toId, offer, request));
  action('respond-trade', (room, { tradeId, accept }) => room.respondTrade(tradeId, socket.id, !!accept));

  socket.on('disconnect', () => {
    const code = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.removePlayer(socket.id);
    if (!room.started && room.players.length === 0) {
      rooms.delete(code);
      return;
    }
    broadcast(code);
  });
});

// Sweep long-dead rooms so memory doesn't grow unbounded on a long-running instance.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - (room.lastActivity || 0);
    const allDisconnected = room.players.length > 0 && room.players.every((p) => !p.connected);
    if (idle > 6 * 60 * 60 * 1000 && (room.players.length === 0 || allDisconnected)) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`RuneScape Monopoly server listening on port ${PORT}`);
});
