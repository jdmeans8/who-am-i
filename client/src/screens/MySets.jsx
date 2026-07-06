import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import CharacterImage from "../components/CharacterImage.jsx";

export default function MySets({ onBack, onEdit, onNew, onPlay, showToast }) {
  const { user } = useAuth();
  const [sets, setSets] = useState(null);

  function load() {
    api
      .mySets()
      .then((d) => setSets(d.sets))
      .catch((e) => {
        showToast?.(e.message);
        setSets([]);
      });
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  async function del(id, title) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await api.deleteSet(id);
      setSets((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      showToast?.(e.message);
    }
  }

  if (!user) return <p className="muted center screen">Please sign in to see your sets.</p>;

  return (
    <div className="screen mysets">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>My sets</h1>
      </header>

      <button className="btn btn-primary" onClick={onNew}>
        + New set
      </button>

      {sets === null ? (
        <p className="muted center">Loading…</p>
      ) : sets.length === 0 ? (
        <p className="muted center">You haven't made any sets yet.</p>
      ) : (
        <div className="stack">
          {sets.map((s) => (
            <div key={s.id} className="myset-row card">
              <CharacterImage name={s.title} image={s.cover_image} size="sm" />
              <div className="myset-info">
                <div className="set-title">{s.title}</div>
                <div className="set-meta">
                  {s.item_count} chars · {s.is_public ? "public" : "private"} · ▶ {s.play_count} · ♥ {s.like_count}
                </div>
              </div>
              <div className="myset-actions">
                <button className="btn btn-ghost small" onClick={() => onPlay(s.id)}>Play</button>
                <button className="btn btn-ghost small" onClick={() => onEdit(s.id)}>Edit</button>
                <button className="btn btn-ghost small" onClick={() => del(s.id, s.title)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
