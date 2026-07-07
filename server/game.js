// Core game logic: rooms, turn engine, scoring, and guess matching.
// The server holds authoritative state here; the socket layer (index.js) calls
// these methods and broadcasts a per-player redacted view via buildStateFor().

import { randomUUID } from "node:crypto";
import { CLASSIC_SET } from "./sets.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

export class GameError extends Error {}

// ---------- guess matching helpers ----------

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Lenient match: exact/alias, small typo tolerance, or a distinctive surname.
export function guessMatches(guess, character) {
  const g = normalize(guess);
  if (!g) return false;
  const targets = [character.name, ...(character.aliases || [])].map(normalize);

  for (const t of targets) {
    if (!t) continue;
    if (g === t) return true;
    const thr = t.length <= 6 ? 1 : 2;
    if (levenshtein(g, t) <= thr) return true;
  }

  // Distinctive surname (last token, length >= 5) — e.g. "Jackson", "Ronaldo".
  const tokens = normalize(character.name).split(" ");
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 2 && last.length >= 5 && g === last) return true;

  return false;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Room ----------

class Room {
  constructor(code, set = CLASSIC_SET) {
    this.code = code;
    this.hostId = null;
    this.players = new Map(); // playerId -> player (insertion order = seat order)
    this.set = { id: set.id, title: set.title };
    this.items = set.items; // [{ name, aliases, image }]
    this.settings = { maxTries: 10 }; // per-player turn cap; 0 = unlimited
    this.phase = "lobby"; // lobby | round (active game) | gameOver
    this.round = null; // active game's play state (null in lobby)
    this.gameNumber = 0; // games played this session (for display)
    this.excluded = new Set(); // character names the host has hidden from this set
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  touch() {
    this.lastActivity = Date.now();
  }

  playerList() {
    return [...this.players.values()];
  }

  connectedPlayers() {
    return this.playerList().filter((p) => p.connected);
  }

  addPlayer(name) {
    if (this.players.size >= MAX_PLAYERS) {
      throw new GameError("This room is full (8 players max).");
    }
    if (this.phase !== "lobby") {
      throw new GameError("This game has already started.");
    }
    const clean = String(name || "").trim().slice(0, 20);
    if (!clean) throw new GameError("Please enter a name.");
    const taken = this.playerList().some(
      (p) => p.name.toLowerCase() === clean.toLowerCase()
    );
    if (taken) throw new GameError("That name is already taken in this room.");

    const player = {
      id: randomUUID(),
      name: clean,
      connected: true,
      socketId: null,
      score: 0,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.touch();
    return player;
  }

  getPlayer(id) {
    return this.players.get(id) || null;
  }

  // ---------- game lifecycle ----------

  // Host swaps the character set between games (lobby only).
  applySet(byId, set) {
    if (byId !== this.hostId) throw new GameError("Only the host can change the set.");
    if (this.phase !== "lobby") throw new GameError("Change the set from the lobby.");
    this.set = { id: set.id, title: set.title };
    this.items = set.items;
    this.excluded = new Set(); // new set → fresh roster
    this.touch();
  }

  // Host hides/shows a character (by name) from the current set. Lobby only.
  toggleExclude(byId, name) {
    if (byId !== this.hostId) throw new GameError("Only the host can hide characters.");
    if (this.phase !== "lobby") throw new GameError("Hide characters from the lobby.");
    if (!this.items.some((it) => it.name === name)) throw new GameError("That character isn't in this set.");
    if (this.excluded.has(name)) this.excluded.delete(name);
    else this.excluded.add(name);
    this.touch();
  }

  startGame(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can start.");
    if (this.phase !== "lobby") throw new GameError("Can only start a game from the lobby.");
    const players = this.playerList();
    if (players.length < MIN_PLAYERS) {
      throw new GameError(`Need at least ${MIN_PLAYERS} players to start.`);
    }
    const available = this.items.filter((it) => !this.excluded.has(it.name));
    if (players.length > available.length) {
      throw new GameError(
        `Only ${available.length} character${available.length === 1 ? "" : "s"} in play — need at least ${players.length}. Un-hide some.`
      );
    }

    this.gameNumber += 1;
    const picks = shuffle(available).slice(0, players.length);
    const assignments = new Map(); // playerId -> item { name, aliases, image }
    players.forEach((p, i) => assignments.set(p.id, picks[i]));

    this.round = {
      number: this.gameNumber,
      assignments,
      turnOrder: players.map((p) => p.id),
      currentTurnIdx: 0,
      finishedOrder: [], // playerIds in order they guessed correctly
      gaveUp: new Set(), // playerIds who bowed out
      outOfTries: new Set(), // playerIds who used all their tries without solving
      triesUsed: new Map(players.map((p) => [p.id, 0])), // turns (ask or guess) spent
      pending: null, // { askerId, text, answers: Map<pid,'yes'|'no'>, revealed, yes, no }
      log: [], // { type:'question'|'guess', name, text, ... }
      results: null,
    };
    this.phase = "round";
    this._ensureValidTurn();
    this.touch();
  }

  isFinished(playerId) {
    return this.round?.finishedOrder.includes(playerId);
  }

  hasGivenUp(playerId) {
    return this.round?.gaveUp.has(playerId) || false;
  }

  isOutOfTries(playerId) {
    return this.round?.outOfTries.has(playerId) || false;
  }

  // Out of the guessing race (solved, gave up, or out of tries). Still answers.
  isOut(playerId) {
    return this.isFinished(playerId) || this.hasGivenUp(playerId) || this.isOutOfTries(playerId);
  }

  // Tries remaining for a player (Infinity when the cap is unlimited).
  triesLeft(playerId) {
    const max = this.settings.maxTries;
    if (!max) return Infinity; // 0 = unlimited
    return Math.max(max - (this.round.triesUsed.get(playerId) || 0), 0);
  }

  // Called when a player's turn action fully resolves: if they've exhausted
  // their tries without solving, they're out. Then advance the turn.
  _finishTurn(playerId) {
    if (!this.isFinished(playerId) && !this.isOut(playerId) && this.triesLeft(playerId) <= 0) {
      this.round.outOfTries.add(playerId);
    }
    this._advanceTurn();
  }

  _eligible(playerId) {
    const p = this.getPlayer(playerId);
    return !!p && p.connected && !this.isOut(playerId);
  }

  currentTurnId() {
    const r = this.round;
    if (!r || this.phase !== "round") return null;
    const id = r.turnOrder[r.currentTurnIdx];
    return id ?? null;
  }

  // Move the turn pointer to the next eligible player. If none, end the round
  // when everyone has finished; otherwise leave it parked (waiting on reconnect).
  _advanceTurn() {
    const r = this.round;
    const n = r.turnOrder.length;
    for (let step = 1; step <= n; step++) {
      const idx = (r.currentTurnIdx + step) % n;
      if (this._eligible(r.turnOrder[idx])) {
        r.currentTurnIdx = idx;
        return;
      }
    }
    // nobody eligible to take a turn
    const allOut = r.turnOrder.every((id) => this.isOut(id));
    if (allOut) this._endGame();
  }

  _ensureValidTurn() {
    const r = this.round;
    if (!this._eligible(r.turnOrder[r.currentTurnIdx])) this._advanceTurn();
  }

  askQuestion(playerId, text) {
    const r = this.round;
    if (this.phase !== "round") throw new GameError("No active game.");
    if (this.currentTurnId() !== playerId) throw new GameError("It's not your turn.");
    if (r.pending) throw new GameError("A question is already on the table.");
    const clean = String(text || "").trim().slice(0, 140);
    if (!clean) throw new GameError("Type a yes/no question first.");

    r.triesUsed.set(playerId, (r.triesUsed.get(playerId) || 0) + 1); // asking spends a try
    r.pending = { askerId: playerId, text: clean, answers: new Map(), revealed: false, yes: 0, no: 0 };
    this._maybeReveal();
    this.touch();
  }

  // Expected answerers = every connected player except the asker.
  _expectedAnswerers() {
    const r = this.round;
    if (!r.pending) return [];
    return this.connectedPlayers()
      .map((p) => p.id)
      .filter((id) => id !== r.pending.askerId);
  }

  answer(playerId, value) {
    const r = this.round;
    if (this.phase !== "round" || !r.pending) throw new GameError("No question to answer.");
    if (playerId === r.pending.askerId) throw new GameError("You can't answer your own question.");
    if (r.pending.revealed) throw new GameError("Answers are already in.");
    const v = value === "yes" ? "yes" : value === "no" ? "no" : null;
    if (!v) throw new GameError("Answer must be yes or no.");
    r.pending.answers.set(playerId, v);
    this._maybeReveal();
    this.touch();
  }

  _maybeReveal() {
    const r = this.round;
    if (!r.pending || r.pending.revealed) return;
    const expected = this._expectedAnswerers();
    const allIn = expected.length > 0 && expected.every((id) => r.pending.answers.has(id));
    // If there are no possible answerers, reveal immediately (edge case).
    if (allIn || expected.length === 0) {
      let yes = 0;
      let no = 0;
      for (const v of r.pending.answers.values()) v === "yes" ? yes++ : no++;
      r.pending.revealed = true;
      r.pending.yes = yes;
      r.pending.no = no;
    }
  }

  // A guess is its own turn action ("Am I X?") — an alternative to asking.
  // Spends a try; correct = solved, wrong = turn passes.
  guess(playerId, text) {
    const r = this.round;
    if (this.phase !== "round") throw new GameError("No active game.");
    if (this.currentTurnId() !== playerId) throw new GameError("It's not your turn.");
    if (r.pending) throw new GameError("Finish the current question first.");
    const clean = String(text || "").trim().slice(0, 60);
    if (!clean) throw new GameError("Type who you think you are.");

    r.triesUsed.set(playerId, (r.triesUsed.get(playerId) || 0) + 1); // guessing spends a try
    const item = r.assignments.get(playerId);
    const correct = item ? guessMatches(clean, item) : false;
    if (correct) r.finishedOrder.push(playerId);

    r.log.unshift({ type: "guess", name: this.getPlayer(playerId)?.name || "?", text: clean, correct });
    this._finishTurn(playerId);
    this.touch();
    return { correct, character: correct ? item.name : undefined };
  }

  // Ends the asker's turn after the tally is shown → log question, next turn.
  pass(playerId) {
    const r = this.round;
    if (this.phase !== "round" || !r.pending) throw new GameError("Nothing to pass right now.");
    if (playerId !== r.pending.askerId) throw new GameError("It's not your turn.");
    if (!r.pending.revealed) throw new GameError("Wait for answers before ending your turn.");
    this._closeQuestion();
    this._finishTurn(playerId);
    this.touch();
  }

  // Bow out of the game: 0 points, your character is revealed, you keep answering.
  giveUp(playerId) {
    const r = this.round;
    if (this.phase !== "round") throw new GameError("No active game.");
    if (!r.turnOrder.includes(playerId)) throw new GameError("You're not in this game.");
    if (this.isOut(playerId)) throw new GameError("You're already done this game.");
    r.gaveUp.add(playerId);

    if (r.pending && r.pending.askerId === playerId) {
      // Their own question is on the table: log it if answered, else discard it.
      if (r.pending.revealed) this._closeQuestion();
      else r.pending = null;
      this._advanceTurn();
    } else if (this.currentTurnId() === playerId) {
      this._advanceTurn();
    } else if (r.turnOrder.every((id) => this.isOut(id))) {
      this._endGame();
    }
    this.touch();
  }

  // Log the resolved question and clear it. Caller advances the turn.
  _closeQuestion() {
    const r = this.round;
    const asker = this.getPlayer(r.pending.askerId);
    r.log.unshift({
      type: "question",
      name: asker ? asker.name : "?",
      text: r.pending.text,
      yes: r.pending.yes,
      no: r.pending.no,
    });
    r.pending = null;
  }

  _endGame() {
    const r = this.round;
    const playerCount = r.turnOrder.length;
    const results = [];
    for (const id of r.turnOrder) {
      const p = this.getPlayer(id);
      const placement = r.finishedOrder.indexOf(id); // 0-based, -1 if never finished
      // First solver gets (players - 1) points, decrementing by finish order;
      // the last solver, give-ups, out-of-tries, and non-solvers get 0.
      const points = placement >= 0 ? Math.max(playerCount - 1 - placement, 0) : 0;
      if (p) p.score += points; // cumulative across games (reset only by the host)
      const item = r.assignments.get(id);
      results.push({
        playerId: id,
        name: p ? p.name : "?",
        placement: placement >= 0 ? placement + 1 : null,
        gaveUp: r.gaveUp.has(id),
        outOfTries: r.outOfTries.has(id),
        tries: r.triesUsed.get(id) || 0,
        character: item?.name || "?",
        image: item?.image || null,
        points,
        total: p ? p.score : 0,
      });
    }
    results.sort((a, b) => b.total - a.total);
    r.results = results;
    r.pending = null;
    this.phase = "gameOver";
    this.touch();
  }

  // Host ends the current game early (jumps to the summary).
  endGameEarly(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can end the game.");
    if (this.phase !== "round") throw new GameError("No game in progress.");
    this._endGame();
  }

  // From the game summary, return everyone to the lobby (scores persist).
  backToLobby(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can do that.");
    if (this.phase !== "gameOver") throw new GameError("The game isn't over yet.");
    this.phase = "lobby";
    this.round = null;
    this.touch();
  }

  resetScores(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can reset scores.");
    if (this.phase !== "lobby") throw new GameError("Reset scores from the lobby.");
    for (const p of this.players.values()) p.score = 0;
    this.touch();
  }

  setMaxTries(byId, n) {
    if (byId !== this.hostId) throw new GameError("Only the host can change settings.");
    if (this.phase !== "lobby") throw new GameError("Change the try limit from the lobby.");
    const parsed = parseInt(n, 10);
    // 0 = unlimited; otherwise clamp to a sane range.
    const val = parsed === 0 ? 0 : Number.isNaN(parsed) ? 10 : Math.max(1, Math.min(50, parsed));
    this.settings.maxTries = val;
    this.touch();
  }

  // ---------- disconnect / host handling ----------

  markConnected(playerId, socketId, connected) {
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.connected = connected;
    p.socketId = connected ? socketId : null;
    // If the disconnecting player held the turn, or was the asker, keep things moving.
    if (this.phase === "round") {
      const r = this.round;
      if (!connected && r.pending && r.pending.askerId === playerId) {
        // asker dropped mid-question: discard the pending question, don't count it
        r.pending = null;
        this._advanceTurn();
      } else if (!connected && this.currentTurnId() === playerId) {
        this._advanceTurn();
      } else if (r.pending && !r.pending.revealed) {
        // a would-be answerer dropped; maybe everyone left has now answered
        this._maybeReveal();
      }
    }
    this.touch();
  }

  removePlayer(playerId) {
    const wasHost = this.hostId === playerId;
    this.players.delete(playerId);
    if (this.round) {
      // keep turnOrder stable but they'll be skipped as ineligible
    }
    if (wasHost) {
      const next = this.connectedPlayers()[0] || this.playerList()[0];
      this.hostId = next ? next.id : null;
    }
    this.touch();
  }

  isEmpty() {
    return this.players.size === 0;
  }

  // ---------- per-player redacted view ----------

  buildStateFor(viewerId) {
    const state = {
      code: this.code,
      phase: this.phase,
      youId: viewerId,
      hostId: this.hostId,
      set: { ...this.set },
      settings: { ...this.settings },
      players: this.playerList().map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === this.hostId,
        score: p.score,
        finished: this.isFinished(p.id),
      })),
      round: null,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      setSize: this.items.length,
      inPlayCount: this.items.length - this.excluded.size,
    };

    // In the lobby, the host gets the full roster with hide/show flags so they
    // can curate which characters are dealt. Other players never see it.
    if (this.phase === "lobby" && viewerId === this.hostId) {
      state.roster = this.items.map((it) => ({
        name: it.name,
        image: it.image,
        excluded: this.excluded.has(it.name),
      }));
    }

    if (this.round && (this.phase === "round" || this.phase === "gameOver")) {
      const r = this.round;
      const revealAll = this.phase === "gameOver";
      const currentTurnId = this.currentTurnId();

      const board = r.turnOrder
        .filter((id) => this.players.has(id))
        .map((id) => {
          const p = this.getPlayer(id);
          const finished = this.isFinished(id);
          const gaveUp = this.hasGivenUp(id);
          const outOfTries = this.isOutOfTries(id);
          // A viewer sees a character if: it's not their own, OR that player is
          // out (solved / gave up / out of tries), OR the game is over.
          const canSee = revealAll || finished || gaveUp || outOfTries || id !== viewerId;
          const item = r.assignments.get(id);
          return {
            playerId: id,
            name: p.name,
            connected: p.connected,
            finished,
            gaveUp,
            outOfTries,
            isCurrentTurn: id === currentTurnId,
            character: canSee ? item?.name || null : null,
            image: canSee ? item?.image || null : null,
          };
        });

      let pending = null;
      if (r.pending) {
        const asker = this.getPlayer(r.pending.askerId);
        const expected = this._expectedAnswerers();
        pending = {
          askerId: r.pending.askerId,
          askerName: asker ? asker.name : "?",
          text: r.pending.text,
          revealed: r.pending.revealed,
          youAnswered: r.pending.answers.has(viewerId),
          answeredCount: r.pending.answers.size,
          expectedCount: expected.length,
          yes: r.pending.revealed ? r.pending.yes : null,
          no: r.pending.revealed ? r.pending.no : null,
        };
      }

      state.round = {
        gameNumber: r.number,
        maxTries: this.settings.maxTries,
        yourTriesLeft: this.settings.maxTries ? this.triesLeft(viewerId) : null,
        currentTurnId,
        yourTurn: currentTurnId === viewerId,
        board,
        pending,
        log: r.log,
        finishedCount: r.finishedOrder.length,
        results: r.results,
      };
    }

    return state;
  }
}

// ---------- Room manager ----------

export function createRoomManager() {
  const rooms = new Map(); // code -> Room

  function genCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () =>
        CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join("");
    } while (rooms.has(code));
    return code;
  }

  function createRoom(set) {
    const room = new Room(genCode(), set);
    rooms.set(room.code, room);
    return room;
  }

  function getRoom(code) {
    return rooms.get(String(code || "").toUpperCase()) || null;
  }

  function deleteRoom(code) {
    rooms.delete(code);
  }

  // Sweep out empty/stale rooms periodically.
  function sweep(maxIdleMs = 1000 * 60 * 60 * 3) {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.isEmpty() && now - room.lastActivity > 1000 * 60 * 5) rooms.delete(code);
      else if (now - room.lastActivity > maxIdleMs) rooms.delete(code);
    }
  }

  return { rooms, createRoom, getRoom, deleteRoom, sweep, MAX_PLAYERS, MIN_PLAYERS };
}
