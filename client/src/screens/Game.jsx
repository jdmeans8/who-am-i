import React, { useState, useEffect } from "react";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Game({ state, action, leave }) {
  const r = state.round;
  const you = state.players.find((p) => p.id === state.youId);
  const isHost = you?.isHost;
  const yourCard = r.board.find((b) => b.playerId === state.youId);
  const youFinished = yourCard?.finished;
  const youGaveUp = yourCard?.gaveUp;
  const youOutOfTries = yourCard?.outOfTries;
  const youOut = youFinished || youGaveUp || youOutOfTries;

  const currentName = r.board.find((b) => b.playerId === r.currentTurnId)?.name;
  const pending = r.pending;
  const youAreAsker = pending && pending.askerId === state.youId;

  return (
    <div className="screen game">
      <header className="game-header">
        <div className="round-pill">
          Game {r.gameNumber}
          {r.maxTries ? ` · ${r.yourTriesLeft} ${r.yourTriesLeft === 1 ? "try" : "tries"} left` : ""}
        </div>
        <TurnBanner yourTurn={r.yourTurn} currentName={currentName} youFinished={youFinished} youGaveUp={youGaveUp} youOutOfTries={youOutOfTries} pending={pending} youAreAsker={youAreAsker} />
      </header>

      <Board board={board(r)} youId={state.youId} />

      {state.mode === "party" ? (
        <PartyActionArea r={r} action={action} youOut={youOut} currentName={currentName} />
      ) : (
        <ActionArea state={state} r={r} action={action} youAreAsker={youAreAsker} youOut={youOut} />
      )}

      <Notepad code={state.code} gameNumber={r.gameNumber} />

      <QuestionLog log={r.log} />

      <div className="game-foot">
        {isHost && (
          <button className="btn btn-ghost small" onClick={() => action("endGame")}>
            End game
          </button>
        )}
        {!youOut && (
          <button
            className="btn btn-ghost small"
            onClick={() => {
              if (confirm("Give up this round? You'll score 0 points and your character will be revealed.")) {
                action("giveUp");
              }
            }}
          >
            Give up
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

function TurnBanner({ yourTurn, currentName, youFinished, youGaveUp, youOutOfTries, pending, youAreAsker }) {
  if (pending) {
    if (youAreAsker) {
      return <div className="turn-banner me">Your question is out — {pending.revealed ? "here are the answers" : "waiting for answers"}</div>;
    }
    return <div className="turn-banner">{pending.askerName} asked a question</div>;
  }
  if (yourTurn) return <div className="turn-banner me">Your turn — ask or guess</div>;
  if (youFinished) return <div className="turn-banner done">You solved it! Keep answering for others.</div>;
  if (youGaveUp) return <div className="turn-banner">You gave up — keep answering for the others.</div>;
  if (youOutOfTries) return <div className="turn-banner">Out of tries — keep answering for the others.</div>;
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
              (b.gaveUp || b.outOfTries) ? "gaveup" : "",
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
              {b.gaveUp && " 🏳️"}
              {b.outOfTries && " ⌛"}
              {b.isCurrentTurn && !b.finished && <span className="turn-dot" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionArea({ state, r, action, youAreAsker, youOut }) {
  const [question, setQuestion] = useState("");
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = r.pending;

  // 1) Your turn, nothing pending → ask a question OR make a guess (one or the other).
  if (r.yourTurn && !pending) {
    async function ask() {
      if (!question.trim()) return;
      setBusy(true);
      const res = await action("ask", { text: question.trim() });
      setBusy(false);
      if (res.ok) setQuestion("");
    }
    async function submitGuess() {
      if (!guess.trim()) return;
      setBusy(true);
      const res = await action("guess", { text: guess.trim() });
      setBusy(false);
      if (res.ok) setGuess("");
    }
    return (
      <div className="card action">
        <p className="muted small">Your turn — do one: ask a question, or guess who you are.</p>
        <label className="field">
          <span>Ask a yes/no question</span>
          <div className="row">
            <input
              autoFocus
              maxLength={140}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Am I a musician?"
              onKeyDown={(e) => e.key === "Enter" && ask()}
            />
            <button className="btn btn-primary narrow" disabled={busy || !question.trim()} onClick={ask}>
              Ask
            </button>
          </div>
        </label>
        <div className="or">or</div>
        <label className="field">
          <span>Guess who you are</span>
          <div className="row">
            <input
              maxLength={40}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type a name…"
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
            />
            <button className="btn btn-yes narrow" disabled={busy || !guess.trim()} onClick={submitGuess}>
              Guess
            </button>
          </div>
        </label>
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
    return (
      <div className="card action">
        <p className="q-echo">“{pending.text}”</p>
        <Tally yes={pending.yes} no={pending.no} />
        <button className="btn btn-primary" disabled={busy} onClick={() => action("pass")}>
          End turn
        </button>
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
        {youOut ? "You're done this game — sit tight and answer questions." : "Waiting for the current player…"}
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

// Party mode: questions are spoken aloud. On your turn you pass (after asking
// out loud) or guess — no typing questions, no in-app answers.
function PartyActionArea({ r, action, youOut, currentName }) {
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);

  if (r.yourTurn && !youOut) {
    async function submitGuess() {
      if (!guess.trim()) return;
      setBusy(true);
      const res = await action("guess", { text: guess.trim() });
      setBusy(false);
      if (res.ok) setGuess("");
    }
    return (
      <div className="card action">
        <p className="muted small">Your turn — ask your question out loud, then pass. Or make a guess.</p>
        <button className="btn btn-primary" disabled={busy} onClick={() => action("passTurn")}>
          I asked — pass turn
        </button>
        <div className="or">or</div>
        <label className="field">
          <span>Guess who you are</span>
          <div className="row">
            <input
              maxLength={40}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type a name…"
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
            />
            <button className="btn btn-yes narrow" disabled={busy || !guess.trim()} onClick={submitGuess}>
              Guess
            </button>
          </div>
        </label>
      </div>
    );
  }
  return (
    <div className="card action idle">
      <p className="muted">
        {youOut ? "You're done this game — enjoy the rest!" : `${currentName || "Someone"} is up — listen for their question.`}
      </p>
    </div>
  );
}

// Private, per-game scratchpad kept only in this browser (never sent to the server).
function Notepad({ code, gameNumber }) {
  const key = `whoami.notepad.${code}.${gameNumber}`;
  const [notes, setNotes] = useState("");

  useEffect(() => {
    try {
      setNotes(localStorage.getItem(key) || "");
    } catch {
      setNotes("");
    }
  }, [key]);

  function update(v) {
    setNotes(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  }

  return (
    <details className="card notepad">
      <summary>📝 My notes (private)</summary>
      <textarea
        className="notepad-text"
        value={notes}
        onChange={(e) => update(e.target.value)}
        placeholder="Jot down what you've asked and the answers…"
        rows={5}
      />
    </details>
  );
}

function QuestionLog({ log }) {
  if (!log || log.length === 0) return null;
  return (
    <details className="card log">
      <summary>History ({log.length})</summary>
      <ul>
        {log.map((e, i) => (
          <li key={i}>
            <span className="log-asker">{e.name}</span>
            {e.type === "guess" ? (
              <>
                <span className="log-q">guessed “{e.text}”</span>
                <span className="log-res">{e.correct ? "✓" : "✗"}</span>
              </>
            ) : (
              <>
                <span className="log-q">“{e.text}”</span>
                <span className="log-res">{e.yes}✓ / {e.no}✗</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
