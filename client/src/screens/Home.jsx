import React, { useState } from "react";
import { saveSession } from "../socket.js";

export default function Home({ action }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await action("createRoom", { name: name.trim() });
    setBusy(false);
    if (res.ok) saveSession(res.code, res.playerId);
  }

  async function join() {
    if (!name.trim() || code.trim().length < 4) return;
    setBusy(true);
    const res = await action("joinRoom", { code: code.trim().toUpperCase(), name: name.trim() });
    setBusy(false);
    if (res.ok) saveSession(res.code, res.playerId);
  }

  return (
    <div className="screen home">
      <div className="brand">
        <h1>Who Am I?</h1>
        <p className="tagline">
          Everyone gets a secret character. Ask yes/no questions to figure out who you are.
        </p>
      </div>

      {!mode && (
        <div className="stack">
          <button className="btn btn-primary" onClick={() => setMode("create")}>
            Create a room
          </button>
          <button className="btn" onClick={() => setMode("join")}>
            Join a room
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="card stack">
          <label className="field">
            <span>Your name</span>
            <input
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </label>
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
            {busy ? "Creating…" : "Create room"}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode(null)}>
            Back
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="card stack">
          <label className="field">
            <span>Room code</span>
            <input
              autoFocus
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="ABCD"
              className="code-input"
            />
          </label>
          <label className="field">
            <span>Your name</span>
            <input
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim() || code.trim().length < 4}
            onClick={join}
          >
            {busy ? "Joining…" : "Join room"}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode(null)}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
