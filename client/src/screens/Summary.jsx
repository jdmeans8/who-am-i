import React from "react";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Summary({ state, action, leave }) {
  const r = state.round;
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const results = r?.results || [];
  const winner = results[0];

  const statusLabel = (res) =>
    res.placement
      ? ` · solved #${res.placement}`
      : res.gaveUp
      ? " · gave up 🏳️"
      : res.outOfTries
      ? " · out of tries ⌛"
      : " · didn't solve";

  return (
    <div className="screen summary">
      <header className="summary-header">
        <h1>Game {r.gameNumber} complete</h1>
        {winner && <p className="winner-line">{winner.name} leads with {winner.total} points!</p>}
      </header>

      <div className="card">
        <ol className="scoreboard">
          {results.map((res, i) => (
            <li key={res.playerId} className={res.playerId === state.youId ? "you" : ""}>
              <span className="rank">{i + 1}</span>
              <span className="sb-name">
                {res.name}
                {res.playerId === state.youId && <span className="tag tag-you">you</span>}
              </span>
              <span className="sb-detail">
                <CharacterImage name={res.character} image={res.image} size="sm" />
                was <strong>{res.character}</strong>
                {statusLabel(res)}
                {` · ${res.tries} ${res.tries === 1 ? "try" : "tries"}`}
              </span>
              <span className="sb-points">
                +{res.points}
                <span className="sb-total">{res.total}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {isHost ? (
        <button className="btn btn-primary" onClick={() => action("backToLobby")}>
          Back to lobby
        </button>
      ) : (
        <p className="waiting">Waiting for the host to return to the lobby…</p>
      )}

      <button className="btn btn-ghost small" onClick={leave}>
        Leave game
      </button>
    </div>
  );
}
