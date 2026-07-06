import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function CreateRoom({ action, showToast, initialSetId, onBack }) {
  const { displayName } = useAuth();
  const [name, setName] = useState(displayName || "");
  const [sets, setSets] = useState(null);
  const [setId, setSetId] = useState(initialSetId || "classic");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listSets({})
      .then((d) => setSets(d.sets))
      .catch((e) => {
        showToast?.(e.message);
        setSets([{ id: "classic", title: "Classic Pop Culture", item_count: 96 }]);
      });
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await action("createRoom", { name: name.trim(), setId });
    setBusy(false);
    if (!res.ok) return; // action already toasts
    // success → the socket 'state' event switches the app into the room
  }

  return (
    <div className="screen create-room">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>Create a room</h1>
      </header>

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

        <label className="field">
          <span>Character set</span>
          {sets === null ? (
            <p className="muted small">Loading sets…</p>
          ) : (
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.item_count} chars){s.builtIn ? "" : ` · by ${s.creator_name || "?"}`}
                </option>
              ))}
            </select>
          )}
        </label>

        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
          {busy ? "Creating…" : "Create room"}
        </button>
      </div>
    </div>
  );
}
