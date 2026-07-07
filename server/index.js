// HTTP + Socket.IO server. Holds authoritative game state and pushes a
// per-player redacted view to each connected client.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import { Server } from "socket.io";

// Load .env for local dev (no-op in production, where Render injects env vars).
// Resolve relative to this file, not the CWD, so it works no matter where the
// process is launched from.
try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  process.loadEnvFile(path.resolve(here, "../.env"));
} catch {
  /* no .env file — rely on real environment variables */
}

import { createRoomManager, GameError } from "./game.js";
import { isSupabaseConfigured, getUserFromToken } from "./supabase.js";
import {
  resolveSet,
  listSets,
  getSetDetail,
  incrementPlayCount,
  createSetWithItems,
  updateSetWithItems,
  deleteSet,
  listMySets,
  toggleLike,
  reportSet,
  uploadImageBuffer,
} from "./setsRepo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

const manager = createRoomManager();

// ---------- API helpers ----------

// Verify the caller's Supabase access token and attach the user.
async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ error: "Please sign in to do that." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Please sign in to do that." });
  }
}

function displayName(user) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split("@")[0] : "Anonymous")
  );
}

function sendErr(res, err) {
  const status = err.status || (err instanceof GameError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status < 500 ? err.message : "Something went wrong." });
}

// Validate/sanitize a set payload from the client.
function cleanSetInput(body = {}) {
  const title = String(body.title || "").trim().slice(0, 60);
  if (!title) throw new GameError("A title is required.");
  const description = body.description ? String(body.description).trim().slice(0, 300) : null;
  const isPublic = !!body.isPublic;

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 2) throw new GameError("Add at least 2 characters.");
  if (rawItems.length > 200) throw new GameError("That's too many characters (200 max).");

  const items = rawItems.map((it) => {
    const name = String(it?.name || "").trim().slice(0, 60);
    if (!name) throw new GameError("Every character needs a name.");
    const aliases = Array.isArray(it?.aliases)
      ? it.aliases.map((a) => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 10)
      : [];
    const image_path = it?.image_path ? String(it.image_path).slice(0, 300) : null;
    return { name, aliases, image_path };
  });
  return { title, description, isPublic, items };
}

// ---------- JSON API ----------

app.get("/api/sets", async (req, res) => {
  try {
    const { sort, q } = req.query;
    res.json({ sets: await listSets({ sort, q }) });
  } catch (err) {
    console.error("GET /api/sets:", err);
    res.status(500).json({ error: "Could not load sets." });
  }
});

app.get("/api/sets/:id", async (req, res) => {
  try {
    const set = await getSetDetail(req.params.id);
    if (!set) return res.status(404).json({ error: "Set not found." });
    res.json({ set });
  } catch (err) {
    console.error("GET /api/sets/:id:", err);
    res.status(500).json({ error: "Could not load set." });
  }
});

// The signed-in user's own sets.
app.get("/api/me/sets", requireUser, async (req, res) => {
  try {
    res.json({ sets: await listMySets(req.user.id) });
  } catch (err) {
    sendErr(res, err);
  }
});

// Upload one image → resize to webp → store → return its path + public URL.
app.post("/api/upload", requireUser, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image was uploaded." });
    const webp = await sharp(req.file.buffer)
      .rotate() // honor EXIF orientation
      .resize(600, 600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const result = await uploadImageBuffer(req.user.id, webp);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && /unsupported image|Input buffer/.test(err.message)) {
      return res.status(400).json({ error: "That file doesn't look like an image." });
    }
    sendErr(res, err);
  }
});

app.post("/api/sets", requireUser, async (req, res) => {
  try {
    const input = cleanSetInput(req.body);
    const id = await createSetWithItems({
      ...input,
      creatorId: req.user.id,
      creatorName: displayName(req.user),
    });
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

app.put("/api/sets/:id", requireUser, async (req, res) => {
  try {
    const input = cleanSetInput(req.body);
    await updateSetWithItems({ setId: req.params.id, userId: req.user.id, ...input });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

app.delete("/api/sets/:id", requireUser, async (req, res) => {
  try {
    await deleteSet(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

app.post("/api/sets/:id/like", requireUser, async (req, res) => {
  try {
    res.json(await toggleLike(req.params.id, req.user.id));
  } catch (err) {
    sendErr(res, err);
  }
});

app.post("/api/sets/:id/report", requireUser, async (req, res) => {
  try {
    await reportSet(req.params.id, req.user.id, req.body?.reason);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// Serve the built client in production (single Render service serves both).
const clientDist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!socket\.io|api\/).*/, (_req, res) => {
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
  socket.on("createRoom", async ({ name, setId } = {}, ack) => {
    try {
      const set = await resolveSet(setId);
      if (!set) throw new GameError("That character set couldn't be found.");
      if (!set.items || set.items.length < 2) {
        throw new GameError("That set needs at least 2 characters to play.");
      }
      const room = manager.createRoom(set);
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

  socket.on("startGame", (_p, ack) =>
    handle(socket, ack, (room, player) => {
      room.startGame(player.id);
      incrementPlayCount(room.set.id); // fire-and-forget (per game played)
    })
  );
  socket.on("setMaxTries", ({ maxTries } = {}, ack) => handle(socket, ack, (room, player) => room.setMaxTries(player.id, maxTries)));
  socket.on("setSet", async ({ setId } = {}, ack) => {
    try {
      const { code, playerId } = socket.data;
      const room = manager.getRoom(code);
      if (!room) throw new GameError("Room not found — it may have closed.");
      if (!room.getPlayer(playerId)) throw new GameError("You're no longer in this room.");
      const set = await resolveSet(setId);
      if (!set || !set.items || set.items.length < 2) throw new GameError("That set needs at least 2 characters.");
      room.applySet(playerId, set);
      broadcastRoom(room);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof GameError ? err.message : "Could not change the set." });
    }
  });
  socket.on("resetScores", (_p, ack) => handle(socket, ack, (room, player) => room.resetScores(player.id)));
  socket.on("toggleExclude", ({ name } = {}, ack) => handle(socket, ack, (room, player) => room.toggleExclude(player.id, name)));
  socket.on("ask", ({ text } = {}, ack) => handle(socket, ack, (room, player) => room.askQuestion(player.id, text)));
  socket.on("answer", ({ value } = {}, ack) => handle(socket, ack, (room, player) => room.answer(player.id, value)));
  socket.on("guess", ({ text } = {}, ack) => handle(socket, ack, (room, player) => room.guess(player.id, text)));
  socket.on("pass", (_p, ack) => handle(socket, ack, (room, player) => room.pass(player.id)));
  socket.on("giveUp", (_p, ack) => handle(socket, ack, (room, player) => room.giveUp(player.id)));
  socket.on("endGame", (_p, ack) => handle(socket, ack, (room, player) => room.endGameEarly(player.id)));
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
  console.log(`Supabase: ${isSupabaseConfigured() ? "configured" : "not configured (set features disabled)"}`);
});
