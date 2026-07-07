import React, { useState, useEffect } from "react";
import { api } from "../api.js";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Lobby({ state, action, leave }) {
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const enough = state.players.length >= state.minPlayers;
  const hiddenCount = state.setSize - state.inPlayCount;
  const anyScores = state.players.some((p) => p.score > 0);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  function copyCode() {
    navigator.clipboard?.writeText(state.code).catch(() => {});
  }

  return (
    <div className="screen lobby">
      <div className="room-code" onClick={copyCode} title="Tap to copy">
        <span className="room-code-label">Room code</span>
        <span className="room-code-value">{state.code}</span>
        <span className="room-code-hint">tap to copy</span>
      </div>

      {state.set && (
        <p className="set-line">
          Set: <strong>{state.set.title}</strong>
          {hiddenCount > 0 && <span className="muted"> · {state.inPlayCount} in play</span>}
        </p>
      )}

      <div className="card">
        <h2>Players ({state.players.length}/{state.maxPlayers})</h2>
        <ul className="player-list">
          {ranked.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className="dot" />
              <span className="pname">{p.name}</span>
              {p.isHost && <span className="tag">host</span>}
              {p.id === state.youId && <span className="tag tag-you">you</span>}
              {anyScores && <span className="lobby-score">{p.score}</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <HostControls state={state} action={action} enough={enough} anyScores={anyScores} />
      ) : (
        <>
          {hiddenCount > 0 && (
            <p className="waiting small">The host has hidden {hiddenCount} character{hiddenCount === 1 ? "" : "s"}.</p>
          )}
          <p className="waiting">Waiting for the host to start…</p>
        </>
      )}

      <button className="btn btn-ghost" onClick={leave}>
        Leave room
      </button>
    </div>
  );
}

function HostControls({ state, action, enough, anyScores }) {
  const [sets, setSets] = useState(null);
  const [changing, setChanging] = useState(false);
  const enoughChars = state.inPlayCount >= state.players.length;

  useEffect(() => {
    api.listSets({}).then((d) => setSets(d.sets)).catch(() => setSets([]));
  }, []);

  return (
    <div className="card stack">
      <label className="field">
        <span>Character set</span>
        {changing && sets ? (
          <select
            autoFocus
            value={state.set?.id || "classic"}
            onChange={(e) => {
              action("setSet", { setId: e.target.value });
              setChanging(false);
            }}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.item_count}){s.builtIn ? "" : ` · ${s.creator_name || "?"}`}
              </option>
            ))}
          </select>
        ) : (
          <div className="set-row">
            <strong>{state.set?.title}</strong>
            <button className="btn btn-ghost small" onClick={() => setChanging(true)}>Change</button>
          </div>
        )}
      </label>

      <label className="field">
        <span>Tries per player</span>
        <select
          value={state.settings.maxTries}
          onChange={(e) => action("setMaxTries", { maxTries: Number(e.target.value) })}
        >
          {[3, 5, 8, 10, 15, 20].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value={0}>∞ Unlimited</option>
        </select>
      </label>

      {state.roster && <RosterPanel roster={state.roster} inPlay={state.inPlayCount} action={action} />}

      <button
        className="btn btn-primary"
        disabled={!enough || !enoughChars}
        onClick={() => action("startGame")}
      >
        {!enough
          ? `Need ${state.minPlayers}+ players`
          : !enoughChars
          ? "Un-hide some characters"
          : "Start game"}
      </button>

      {anyScores && (
        <button className="btn btn-ghost small" onClick={() => action("resetScores")}>
          Reset scores
        </button>
      )}
    </div>
  );
}

function RosterPanel({ roster, inPlay, action }) {
  const hidden = roster.length - inPlay;
  return (
    <details className="roster-panel">
      <summary>
        Characters — {inPlay} in play{hidden > 0 ? `, ${hidden} hidden` : ""}
      </summary>
      <p className="muted small">Tap a character to hide it from this game.</p>
      <div className="roster-grid">
        {roster.map((c) => (
          <button
            key={c.name}
            className={`roster-chip ${c.excluded ? "excluded" : ""}`}
            onClick={() => action("toggleExclude", { name: c.name })}
            title={c.excluded ? "Hidden — tap to include" : "In play — tap to hide"}
          >
            <CharacterImage name={c.name} image={c.image} size="sm" />
            <span className="roster-name">{c.name}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
