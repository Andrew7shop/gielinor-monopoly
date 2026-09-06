'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
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
/** @type {Map<string, {code: string, playerId: string}>} socket.id -> current seat */
const socketToPlayer = new Map();

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
      const playerId = crypto.randomUUID();
      const room = new Room(code, playerId);
      room.lastActivity = Date.now();
      room.addPlayer(playerId, String(name || ''), tokenId);
      rooms.set(code, room);
      socketToPlayer.set(socket.id, { code, playerId });
      socket.join(code);
      socket.emit('joined', { code, playerId });
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
      const playerId = crypto.randomUUID();
      room.addPlayer(playerId, String(name || ''), tokenId);
      socketToPlayer.set(socket.id, { code: roomCode, playerId });
      socket.join(roomCode);
      socket.emit('joined', { code: roomCode, playerId });
      broadcast(roomCode);
    } catch (err) {
      socket.emit('error-message', err.message || 'Could not join room.');
    }
  });

  socket.on('rejoin-room', ({ code, playerId }) => {
    const roomCode = String(code || '').toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error-message', 'That room no longer exists.');
      return;
    }
    try {
      room.reconnectPlayer(String(playerId || ''));
      socketToPlayer.set(socket.id, { code: roomCode, playerId });
      socket.join(roomCode);
      socket.emit('joined', { code: roomCode, playerId });
      broadcast(roomCode);
    } catch (err) {
      socket.emit('error-message', err.message || 'Could not rejoin room.');
    }
  });

  socket.on('chat', ({ text }) => {
    const entry = socketToPlayer.get(socket.id);
    const room = entry && rooms.get(entry.code);
    if (!room) return;
    const player = room.findPlayer(entry.playerId);
    const clean = String(text || '').slice(0, 300).trim();
    if (!clean || !player) return;
    io.to(entry.code).emit('chat', { name: player.name, text: clean, t: Date.now() });
  });

  const action = (event, handler) => {
    socket.on(event, (payload = {}) => {
      const entry = socketToPlayer.get(socket.id);
      if (!entry) {
        socket.emit('error-message', 'You are not in a room.');
        return;
      }
      withRoom(socket, entry.code, (room) => handler(room, payload, entry.playerId));
    });
  };

  action('start-game', (room, payload, playerId) => {
    if (room.hostId !== playerId) throw new GameError('Only the host can start the game.');
    room.startGame();
  });
  action('roll-dice', (room, payload, playerId) => room.rollDice(playerId));
  action('buy-property', (room, payload, playerId) => room.buyProperty(playerId));
  action('decline-property', (room, payload, playerId) => room.declineProperty(playerId));
  action('place-bid', (room, { amount }, playerId) => room.placeBid(playerId, Number(amount)));
  action('pass-bid', (room, payload, playerId) => room.passBid(playerId));
  action('end-turn', (room, payload, playerId) => room.endTurn(playerId));
  action('pay-jail-fine', (room, payload, playerId) => room.payJailFine(playerId));
  action('use-jail-card', (room, payload, playerId) => room.useJailCard(playerId));
  action('build-house', (room, { spaceIndex }, playerId) => room.buildHouse(playerId, Number(spaceIndex)));
  action('sell-house', (room, { spaceIndex }, playerId) => room.sellHouse(playerId, Number(spaceIndex)));
  action('mortgage-property', (room, { spaceIndex }, playerId) => room.mortgageProperty(playerId, Number(spaceIndex)));
  action('unmortgage-property', (room, { spaceIndex }, playerId) => room.unmortgageProperty(playerId, Number(spaceIndex)));
  action('declare-bankruptcy', (room, payload, playerId) => room.declareBankruptcy(playerId));
  action('propose-trade', (room, { toId, offer, request }, playerId) => room.proposeTrade(playerId, toId, offer, request));
  action('respond-trade', (room, { tradeId, accept }, playerId) => room.respondTrade(tradeId, playerId, !!accept));
  action('vote-kick', (room, { targetId }, playerId) => room.voteKick(playerId, targetId));

  socket.on('disconnect', () => {
    const entry = socketToPlayer.get(socket.id);
    socketToPlayer.delete(socket.id);
    if (!entry) return;
    const room = rooms.get(entry.code);
    if (!room) return;
    room.removePlayer(entry.playerId);
    if (!room.started && room.players.length === 0) {
      rooms.delete(entry.code);
      return;
    }
    broadcast(entry.code);
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
