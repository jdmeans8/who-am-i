// HTTP + Socket.IO server. Holds authoritative game state and pushes a
// per-player redacted view to each connected client.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import { Server } from "socket.io";
import { createRoomManager, GameError } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

const manager = createRoomManager();

// Serve the built client in production (single Render service serves both).
const clientDist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) =>
    res.send("Who Am I? server running. Start the client with `npm run dev:client`.")
  );
}

// ---------- socket helpers ----------

function broadcastRoom(room) {
  if (!room) return;
  for (const p of room.playerList()) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit("state", room.buildStateFor(p.id));
    }
  }
}

function bindSocketToPlayer(socket, room, playerId) {
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
}

// Wrap an action handler: resolve the caller's room+player, run fn, broadcast,
// and translate GameError into a clean ack/emit.
function handle(socket, ack, fn) {
  try {
    const { code, playerId } = socket.data;
    const room = manager.getRoom(code);
    if (!room) throw new GameError("Room not found — it may have closed.");
    const player = room.getPlayer(playerId);
    if (!player) throw new GameError("You're no longer in this room.");
    const result = fn(room, player) || {};
    broadcastRoom(room);
    if (typeof ack === "function") ack({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof GameError ? err.message : "Something went wrong.";
    if (!(err instanceof GameError)) console.error(err);
    if (typeof ack === "function") ack({ ok: false, error: message });
    else socket.emit("errorMsg", message);
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name } = {}, ack) => {
    try {
      const room = manager.createRoom();
      const player = room.addPlayer(name);
      player.socketId = socket.id;
      bindSocketToPlayer(socket, room, player.id);
      ack?.({ ok: true, code: room.code, playerId: player.id });
      broadcastRoom(room);
    } catch (err) {
      ack?.({ ok: false, error: err instanceof GameError ? err.message : "Could not create room." });
    }
  });

  socket.on("joinRoom", ({ code, name } = {}, ack) => {
    try {
      const room = manager.getRoom(code);
      if (!room) throw new GameError("No room with that code.");
      const player = room.addPlayer(name);
      player.socketId = socket.id;
      bindSocketToPlayer(socket, room, player.id);
      ack?.({ ok: true, code: room.code, playerId: player.id });
      broadcastRoom(room);
    } catch (err) {
      ack?.({ ok: false, error: err instanceof GameError ? err.message : "Could not join room." });
    }
  });

  // Rejoin an existing seat after a reload/disconnect.
  socket.on("resume", ({ code, playerId } = {}, ack) => {
    try {
      const room = manager.getRoom(code);
      if (!room) throw new GameError("That game has ended.");
      const player = room.getPlayer(playerId);
      if (!player) throw new GameError("Your seat is no longer available.");
      room.markConnected(playerId, socket.id, true);
      bindSocketToPlayer(socket, room, playerId);
      ack?.({ ok: true, code: room.code, playerId });
      broadcastRoom(room);
    } catch (err) {
      ack?.({ ok: false, error: err instanceof GameError ? err.message : "Could not rejoin." });
    }
  });

  socket.on("startRound", (_p, ack) => handle(socket, ack, (room, player) => room.startRound(player.id)));
  socket.on("nextRound", (_p, ack) => handle(socket, ack, (room, player) => room.startRound(player.id)));
  socket.on("setRounds", ({ rounds } = {}, ack) => handle(socket, ack, (room, player) => room.setRounds(player.id, rounds)));
  socket.on("ask", ({ text } = {}, ack) => handle(socket, ack, (room, player) => room.askQuestion(player.id, text)));
  socket.on("answer", ({ value } = {}, ack) => handle(socket, ack, (room, player) => room.answer(player.id, value)));
  socket.on("guess", ({ text } = {}, ack) => handle(socket, ack, (room, player) => room.guess(player.id, text)));
  socket.on("pass", (_p, ack) => handle(socket, ack, (room, player) => room.pass(player.id)));
  socket.on("endRound", (_p, ack) => handle(socket, ack, (room, player) => room.endRoundEarly(player.id)));
  socket.on("backToLobby", (_p, ack) => handle(socket, ack, (room, player) => room.backToLobby(player.id)));

  socket.on("leave", (_p, ack) => {
    const { code, playerId } = socket.data;
    const room = manager.getRoom(code);
    if (room) {
      room.removePlayer(playerId);
      socket.leave(code);
      if (room.isEmpty()) manager.deleteRoom(code);
      else broadcastRoom(room);
    }
    socket.data.code = null;
    socket.data.playerId = null;
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const { code, playerId } = socket.data;
    const room = manager.getRoom(code);
    if (!room) return;
    room.markConnected(playerId, null, false);
    broadcastRoom(room);
  });
});

// Periodic cleanup of stale/empty rooms.
setInterval(() => manager.sweep(), 1000 * 60 * 5).unref();

server.listen(PORT, () => {
  console.log(`Who Am I? server listening on http://localhost:${PORT}`);
});
