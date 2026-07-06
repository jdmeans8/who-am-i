import React from "react";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Summary({ state, action, leave }) {
  const r = state.round;
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const gameOver = state.phase === "gameOver";
  const results = r?.results || [];
  const winner = gameOver ? results[0] : null;

  return (
    <div className="screen summary">
      <header className="summary-header">
        {gameOver ? (
          <>
            <h1>🏆 Final results</h1>
            {winner && <p className="winner-line">{winner.name} wins with {winner.total} points!</p>}
          </>
        ) : (
          <>
            <h1>Round {r.number} complete</h1>
            <p className="muted">Standings after round {r.number} of {r.totalRounds}</p>
          </>
        )}
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
                {res.placement ? ` · solved #${res.placement}` : " · didn't solve"}
                {` · ${res.questions}Q`}
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
        <div className="stack">
          {gameOver ? (
            <button className="btn btn-primary" onClick={() => action("backToLobby")}>
              Play again
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => action("nextRound")}>
              Start round {r.number + 1}
            </button>
          )}
        </div>
      ) : (
        <p className="waiting">
          {gameOver ? "Waiting for the host…" : "Waiting for the host to start the next round…"}
        </p>
      )}

      <button className="btn btn-ghost small" onClick={leave}>
        Leave game
      </button>
    </div>
  );
}
