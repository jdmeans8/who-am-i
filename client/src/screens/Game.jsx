import React, { useState } from "react";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Game({ state, action, leave }) {
  const r = state.round;
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const youFinished = r.board.find((b) => b.playerId === state.youId)?.finished;

  const currentName = r.board.find((b) => b.playerId === r.currentTurnId)?.name;
  const pending = r.pending;
  const youAreAsker = pending && pending.askerId === state.youId;

  return (
    <div className="screen game">
      <header className="game-header">
        <div className="round-pill">Round {r.number}/{r.totalRounds}</div>
        <TurnBanner yourTurn={r.yourTurn} currentName={currentName} youFinished={youFinished} pending={pending} youAreAsker={youAreAsker} />
      </header>

      <Board board={board(r)} youId={state.youId} />

      <ActionArea
        state={state}
        r={r}
        action={action}
        youAreAsker={youAreAsker}
        youFinished={youFinished}
      />

      <QuestionLog log={r.log} />

      <div className="game-foot">
        {isHost && (
          <button className="btn btn-ghost small" onClick={() => action("endRound")}>
            End round
          </button>
        )}
        <button className="btn btn-ghost small" onClick={leave}>
          Leave
        </button>
      </div>
    </div>
  );
}

function board(r) {
  return r.board;
}

function TurnBanner({ yourTurn, currentName, youFinished, pending, youAreAsker }) {
  if (pending) {
    if (youAreAsker) {
      return <div className="turn-banner me">Your question is out — {pending.revealed ? "here are the answers" : "waiting for answers"}</div>;
    }
    return <div className="turn-banner">{pending.askerName} asked a question</div>;
  }
  if (yourTurn) return <div className="turn-banner me">Your turn — ask a question</div>;
  if (youFinished) return <div className="turn-banner done">You solved it! Keep answering for others.</div>;
  return <div className="turn-banner">{currentName ? `${currentName}'s turn` : "Waiting…"}</div>;
}

function Board({ board, youId }) {
  return (
    <div className="board">
      {board.map((b) => {
        const isYou = b.playerId === youId;
        const hidden = b.character === null;
        return (
          <div
            key={b.playerId}
            className={[
              "char-card",
              isYou ? "you" : "",
              b.isCurrentTurn ? "current" : "",
              b.finished ? "finished" : "",
              b.connected ? "" : "offline",
            ].join(" ")}
          >
            <CharacterImage name={b.character} image={b.image} hidden={hidden} />
            <div className="char-name">
              {hidden ? (isYou ? "You" : "❓") : b.character}
            </div>
            <div className="char-owner">
              {b.name}
              {isYou && " (you)"}
              {b.finished && " ✓"}
              {b.isCurrentTurn && !b.finished && <span className="turn-dot" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionArea({ state, r, action, youAreAsker, youFinished }) {
  const [question, setQuestion] = useState("");
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = r.pending;

  // 1) Your turn, no question on the table yet → ask.
  if (r.yourTurn && !pending) {
    async function ask() {
      if (!question.trim()) return;
      setBusy(true);
      const res = await action("ask", { text: question.trim() });
      setBusy(false);
      if (res.ok) setQuestion("");
    }
    return (
      <div className="card action">
        <label className="field">
          <span>Ask a yes/no question</span>
          <input
            autoFocus
            maxLength={140}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Am I a musician?"
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !question.trim()} onClick={ask}>
          Ask the group
        </button>
      </div>
    );
  }

  // 2) You are the asker, question is out.
  if (youAreAsker) {
    if (!pending.revealed) {
      return (
        <div className="card action">
          <p className="q-echo">“{pending.text}”</p>
          <p className="muted">
            Waiting for answers… {pending.answeredCount}/{pending.expectedCount}
          </p>
        </div>
      );
    }
    async function submitGuess() {
      if (!guess.trim()) return;
      setBusy(true);
      const res = await action("guess", { text: guess.trim() });
      setBusy(false);
      if (res.ok) {
        setGuess("");
        // correctness surfaced via state change; give quick feedback too
      }
    }
    return (
      <div className="card action">
        <p className="q-echo">“{pending.text}”</p>
        <Tally yes={pending.yes} no={pending.no} />
        <label className="field">
          <span>Guess who you are (optional)</span>
          <input
            maxLength={40}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type a name…"
            onKeyDown={(e) => e.key === "Enter" && submitGuess()}
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" disabled={busy || !guess.trim()} onClick={submitGuess}>
            Guess
          </button>
          <button className="btn" disabled={busy} onClick={() => action("pass")}>
            Pass turn
          </button>
        </div>
      </div>
    );
  }

  // 3) Someone else asked — you answer (everyone except the asker answers).
  if (pending) {
    if (pending.revealed) {
      return (
        <div className="card action">
          <p className="q-echo">
            <strong>{pending.askerName}</strong>: “{pending.text}”
          </p>
          <Tally yes={pending.yes} no={pending.no} />
        </div>
      );
    }
    if (pending.youAnswered) {
      return (
        <div className="card action">
          <p className="q-echo">
            <strong>{pending.askerName}</strong>: “{pending.text}”
          </p>
          <p className="muted">Answer locked in ✓ — waiting for others…</p>
        </div>
      );
    }
    return (
      <div className="card action">
        <p className="q-echo">
          <strong>{pending.askerName}</strong> asks: “{pending.text}”
        </p>
        <p className="muted small">You can see their character — answer truthfully!</p>
        <div className="row answer-row">
          <button className="btn btn-yes" onClick={() => action("answer", { value: "yes" })}>
            Yes
          </button>
          <button className="btn btn-no" onClick={() => action("answer", { value: "no" })}>
            No
          </button>
        </div>
      </div>
    );
  }

  // 4) Not your turn, nothing pending.
  return (
    <div className="card action idle">
      <p className="muted">
        {youFinished ? "You're done — sit tight and answer questions." : "Waiting for the current player…"}
      </p>
    </div>
  );
}

function Tally({ yes, no }) {
  return (
    <div className="tally">
      <span className="tally-yes">{yes} Yes</span>
      <span className="tally-no">{no} No</span>
    </div>
  );
}

function QuestionLog({ log }) {
  if (!log || log.length === 0) return null;
  return (
    <details className="card log">
      <summary>Question history ({log.length})</summary>
      <ul>
        {log.map((q, i) => (
          <li key={i}>
            <span className="log-asker">{q.askerName}</span>
            <span className="log-q">“{q.text}”</span>
            <span className="log-res">{q.yes}✓ / {q.no}✗</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
