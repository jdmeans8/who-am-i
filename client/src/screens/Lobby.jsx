import React from "react";

export default function Lobby({ state, action, leave }) {
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const enough = state.players.length >= state.minPlayers;

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

      <div className="card">
        <h2>Players ({state.players.length}/{state.maxPlayers})</h2>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className="dot" />
              <span className="pname">{p.name}</span>
              {p.isHost && <span className="tag">host</span>}
              {p.id === state.youId && <span className="tag tag-you">you</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div className="card stack">
          <label className="field">
            <span>Number of rounds</span>
            <select
              value={state.settings.totalRounds}
              onChange={(e) => action("setRounds", { rounds: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={!enough}
            onClick={() => action("startRound")}
          >
            {enough ? "Start game" : `Need ${state.minPlayers}+ players`}
          </button>
        </div>
      ) : (
        <p className="waiting">Waiting for the host to start…</p>
      )}

      <button className="btn btn-ghost" onClick={leave}>
        Leave room
      </button>
    </div>
  );
}
