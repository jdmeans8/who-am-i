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
    this.settings = { totalRounds: 3 };
    this.phase = "lobby"; // lobby | round | roundSummary | gameOver
    this.round = null;
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

  // ---------- round lifecycle ----------

  startRound(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can start.");
    if (this.phase !== "lobby" && this.phase !== "roundSummary") {
      throw new GameError("Can't start a round right now.");
    }
    const players = this.playerList();
    if (players.length < MIN_PLAYERS) {
      throw new GameError(`Need at least ${MIN_PLAYERS} players to start.`);
    }
    if (players.length > this.items.length) {
      throw new GameError("This set doesn't have enough characters for that many players.");
    }

    const number = this.round ? this.round.number + 1 : 1;
    const picks = shuffle(this.items).slice(0, players.length);
    const assignments = new Map(); // playerId -> item { name, aliases, image }
    players.forEach((p, i) => assignments.set(p.id, picks[i]));

    this.round = {
      number,
      assignments,
      turnOrder: players.map((p) => p.id),
      currentTurnIdx: 0,
      finishedOrder: [], // playerIds in order they guessed correctly
      questionsAsked: new Map(players.map((p) => [p.id, 0])),
      pending: null, // { askerId, text, answers: Map<pid,'yes'|'no'>, revealed, yes, no }
      log: [], // { askerName, text, yes, no }
      results: null,
    };
    this.phase = "round";
    this._ensureValidTurn();
    this.touch();
  }

  isFinished(playerId) {
    return this.round?.finishedOrder.includes(playerId);
  }

  _eligible(playerId) {
    const p = this.getPlayer(playerId);
    return !!p && p.connected && !this.isFinished(playerId);
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
    const allFinished = r.turnOrder.every((id) => this.isFinished(id));
    if (allFinished) this._endRound();
  }

  _ensureValidTurn() {
    const r = this.round;
    if (!this._eligible(r.turnOrder[r.currentTurnIdx])) this._advanceTurn();
  }

  askQuestion(playerId, text) {
    const r = this.round;
    if (this.phase !== "round") throw new GameError("No active round.");
    if (this.currentTurnId() !== playerId) throw new GameError("It's not your turn.");
    if (r.pending) throw new GameError("A question is already on the table.");
    const clean = String(text || "").trim().slice(0, 140);
    if (!clean) throw new GameError("Type a yes/no question first.");

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
      r.questionsAsked.set(r.pending.askerId, (r.questionsAsked.get(r.pending.askerId) || 0) + 1);
    }
  }

  // Asker submits an optional guess after the tally is revealed, then the turn passes.
  guess(playerId, text) {
    const r = this.round;
    if (this.phase !== "round" || !r.pending) throw new GameError("You can only guess on your turn, after asking.");
    if (playerId !== r.pending.askerId) throw new GameError("Only the asker can guess now.");
    if (!r.pending.revealed) throw new GameError("Wait for everyone to answer first.");

    const item = r.assignments.get(playerId);
    const correct = item ? guessMatches(text, item) : false;
    let result;
    if (correct) {
      r.finishedOrder.push(playerId);
      result = { correct: true, character: item.name };
    } else {
      result = { correct: false }; // no penalty
    }
    this._closeQuestionAndPass();
    return result;
  }

  // Asker passes without guessing (or after a wrong guess) → log question, next turn.
  pass(playerId) {
    const r = this.round;
    if (this.phase !== "round" || !r.pending) throw new GameError("Nothing to pass right now.");
    if (playerId !== r.pending.askerId) throw new GameError("It's not your turn.");
    if (!r.pending.revealed) throw new GameError("Wait for answers before passing.");
    this._closeQuestionAndPass();
  }

  _closeQuestionAndPass() {
    const r = this.round;
    const asker = this.getPlayer(r.pending.askerId);
    r.log.unshift({
      askerName: asker ? asker.name : "?",
      text: r.pending.text,
      yes: r.pending.yes,
      no: r.pending.no,
    });
    r.pending = null;
    this._advanceTurn();
    this.touch();
  }

  _endRound() {
    const r = this.round;
    const playerCount = r.turnOrder.length;
    const results = [];
    for (const id of r.turnOrder) {
      const p = this.getPlayer(id);
      const placement = r.finishedOrder.indexOf(id); // 0-based, -1 if never finished
      let points = 0;
      if (placement >= 0) {
        const orderPts = playerCount - placement; // 1st = playerCount, etc.
        const q = r.questionsAsked.get(id) || 0;
        const bonus = q <= 3 ? 3 : q <= 6 ? 1 : 0;
        points = orderPts + bonus;
      }
      if (p) p.score += points;
      const item = r.assignments.get(id);
      results.push({
        playerId: id,
        name: p ? p.name : "?",
        placement: placement >= 0 ? placement + 1 : null,
        questions: r.questionsAsked.get(id) || 0,
        character: item?.name || "?",
        image: item?.image || null,
        points,
        total: p ? p.score : 0,
      });
    }
    results.sort((a, b) => b.total - a.total);
    r.results = results;
    r.pending = null;
    this.phase = r.number >= this.settings.totalRounds ? "gameOver" : "roundSummary";
    this.touch();
  }

  endRoundEarly(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can end the round.");
    if (this.phase !== "round") throw new GameError("No round in progress.");
    this._endRound();
  }

  backToLobby(byId) {
    if (byId !== this.hostId) throw new GameError("Only the host can do that.");
    this.phase = "lobby";
    this.round = null;
    for (const p of this.players.values()) p.score = 0;
    this.touch();
  }

  setRounds(byId, n) {
    if (byId !== this.hostId) throw new GameError("Only the host can change settings.");
    if (this.phase !== "lobby") throw new GameError("Change rounds before starting.");
    const val = Math.max(1, Math.min(10, parseInt(n, 10) || 3));
    this.settings.totalRounds = val;
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
    };

    if (this.round && (this.phase === "round" || this.phase === "roundSummary" || this.phase === "gameOver")) {
      const r = this.round;
      const revealAll = this.phase === "roundSummary" || this.phase === "gameOver";
      const currentTurnId = this.currentTurnId();

      const board = r.turnOrder
        .filter((id) => this.players.has(id))
        .map((id) => {
          const p = this.getPlayer(id);
          const finished = this.isFinished(id);
          // A viewer sees a character if: it's not their own, OR they've finished, OR round is over.
          const canSee = revealAll || finished || id !== viewerId;
          const item = r.assignments.get(id);
          return {
            playerId: id,
            name: p.name,
            connected: p.connected,
            finished,
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
        number: r.number,
        totalRounds: this.settings.totalRounds,
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
