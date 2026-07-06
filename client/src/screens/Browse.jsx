import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import CharacterImage from "../components/CharacterImage.jsx";

export default function Browse({ onOpen, onBack, showToast }) {
  const [sort, setSort] = useState("popular");
  const [q, setQ] = useState("");
  const [sets, setSets] = useState(null);

  useEffect(() => {
    let alive = true;
    setSets(null);
    const params = { sort };
    if (q.trim()) params.q = q.trim();
    api
      .listSets(params)
      .then((d) => alive && setSets(d.sets))
      .catch((e) => {
        showToast?.(e.message);
        alive && setSets([]);
      });
    return () => {
      alive = false;
    };
  }, [sort, q]);

  return (
    <div className="screen browse">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>Browse sets</h1>
      </header>

      <div className="browse-controls">
        <div className="tabs">
          <button className={sort === "popular" ? "active" : ""} onClick={() => setSort("popular")}>
            Popular
          </button>
          <button className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")}>
            Recent
          </button>
        </div>
        <input
          className="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {sets === null ? (
        <p className="muted center">Loading…</p>
      ) : sets.length === 0 ? (
        <p className="muted center">No sets found.</p>
      ) : (
        <div className="set-grid">
          {sets.map((s) => (
            <button key={s.id} className="set-card" onClick={() => onOpen(s.id)}>
              <div className="set-cover">
                <CharacterImage name={s.title} image={s.cover_image} size="md" />
              </div>
              <div className="set-card-body">
                <div className="set-title">{s.title}</div>
                <div className="set-meta">
                  {s.item_count} chars · by {s.creator_name || "Anonymous"}
                </div>
                {!s.builtIn && (
                  <div className="set-stats">
                    ▶ {s.play_count ?? 0} · ♥ {s.like_count ?? 0}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
