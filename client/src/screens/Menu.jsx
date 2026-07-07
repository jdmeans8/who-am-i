import React, { useState } from "react";
import { useAuth } from "../auth.jsx";
import AuthBar from "../components/AuthBar.jsx";
import Browse from "./Browse.jsx";
import SetDetail from "./SetDetail.jsx";
import SetBuilder from "./SetBuilder.jsx";
import MySets from "./MySets.jsx";
import CreateRoom from "./CreateRoom.jsx";
import Legal from "./Legal.jsx";

export default function Menu({ action, showToast }) {
  const { user } = useAuth();
  const [view, setView] = useState({ tab: "home" });
  const go = (tab, extra = {}) => setView({ tab, ...extra });
  const home = () => go("home");

  switch (view.tab) {
    case "create":
      return <CreateRoom action={action} showToast={showToast} initialSetId={view.setId} onBack={home} />;
    case "join":
      return <JoinRoom action={action} onBack={home} />;
    case "browse":
      return <Browse onOpen={(id) => go("detail", { id })} onBack={home} showToast={showToast} />;
    case "detail":
      return (
        <SetDetail
          id={view.id}
          onBack={() => go("browse")}
          onPlay={(setId) => go("create", { setId })}
          onEdit={(id) => go("builder", { editId: id })}
          onRemixed={(newId) => go("builder", { editId: newId })}
          showToast={showToast}
        />
      );
    case "builder":
      return (
        <SetBuilder
          editId={view.editId}
          onBack={() => go(view.editId ? "mysets" : "home")}
          onSaved={() => go("mysets")}
          showToast={showToast}
        />
      );
    case "mysets":
      return (
        <MySets
          onBack={home}
          onNew={() => go("builder")}
          onEdit={(id) => go("builder", { editId: id })}
          onPlay={(setId) => go("create", { setId })}
          showToast={showToast}
        />
      );
    case "terms":
      return <Legal kind="terms" onBack={home} />;
    case "privacy":
      return <Legal kind="privacy" onBack={home} />;
    default:
      return <Hub user={user} go={go} />;
  }
}

function Hub({ user, go }) {
  return (
    <div className="screen home">
      <div className="hub-top">
        <AuthBar />
      </div>
      <div className="brand">
        <h1>Who Am I?</h1>
        <p className="tagline">
          Everyone gets a secret character. Ask yes/no questions to figure out who you are.
        </p>
      </div>

      <div className="stack">
        <button className="btn btn-primary" onClick={() => go("create")}>
          Create a room
        </button>
        <button className="btn" onClick={() => go("join")}>
          Join a room
        </button>
        <button className="btn" onClick={() => go("browse")}>
          Browse character sets
        </button>
        {user && (
          <button className="btn btn-ghost" onClick={() => go("mysets")}>
            My sets
          </button>
        )}
      </div>

      <nav className="legal-links">
        <button className="linklike" onClick={() => go("terms")}>
          Terms
        </button>
        <span aria-hidden="true">·</span>
        <button className="linklike" onClick={() => go("privacy")}>
          Privacy
        </button>
      </nav>
    </div>
  );
}

function JoinRoom({ action, onBack }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!name.trim() || code.trim().length < 4) return;
    setBusy(true);
    await action("joinRoom", { code: code.trim().toUpperCase(), name: name.trim() });
    setBusy(false);
  }

  return (
    <div className="screen">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>Join a room</h1>
      </header>
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
        <button className="btn btn-primary" disabled={busy || !name.trim() || code.trim().length < 4} onClick={join}>
          {busy ? "Joining…" : "Join room"}
        </button>
      </div>
    </div>
  );
}
