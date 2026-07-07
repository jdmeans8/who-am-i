import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import CharacterImage from "../components/CharacterImage.jsx";

export default function SetDetail({ id, onBack, onPlay, onEdit, onRemixed, showToast }) {
  const { user } = useAuth();
  const [set, setSet] = useState(null);
  const [liked, setLiked] = useState(false);
  const [remixing, setRemixing] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getSet(id)
      .then((d) => alive && setSet(d.set))
      .catch((e) => showToast?.(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  async function toggleLike() {
    if (!user) return showToast?.("Sign in to like sets.");
    try {
      const r = await api.like(id);
      setLiked(r.liked);
      setSet((s) => ({ ...s, like_count: r.likeCount }));
    } catch (e) {
      showToast?.(e.message);
    }
  }

  async function remix() {
    if (!user) return showToast?.("Sign in to remix sets.");
    setRemixing(true);
    try {
      const { id: newId } = await api.remixSet(id);
      showToast?.("Copied to your sets — customize away!");
      onRemixed?.(newId);
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setRemixing(false);
    }
  }

  async function report() {
    if (!user) return showToast?.("Sign in to report a set.");
    const reason = prompt("What's wrong with this set?");
    if (reason == null) return;
    try {
      await api.report(id, reason);
      showToast?.("Thanks — this set has been reported.");
    } catch (e) {
      showToast?.(e.message);
    }
  }

  if (!set) return <p className="muted center screen">Loading…</p>;
  const isOwner = user && set.creator_id === user.id;

  return (
    <div className="screen set-detail">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
      </header>

      <div className="detail-hero">
        <h1>{set.title}</h1>
        {set.creator_name && <p className="muted">by {set.creator_name}</p>}
        {set.description && <p className="detail-desc">{set.description}</p>}
        <p className="muted small">{set.item_count} characters</p>
      </div>

      <div className="stack">
        <button className="btn btn-primary" onClick={() => onPlay(set.id)}>
          Play this set
        </button>
        <div className="row">
          {!set.builtIn && (
            <button className="btn" onClick={toggleLike}>
              {liked ? "♥ Liked" : "♡ Like"} {set.like_count ? `(${set.like_count})` : ""}
            </button>
          )}
          {isOwner ? (
            <button className="btn" onClick={() => onEdit(set.id)}>
              Edit
            </button>
          ) : (
            <button className="btn" disabled={remixing} onClick={remix}>
              {remixing ? "Copying…" : "⎘ Remix"}
            </button>
          )}
        </div>
      </div>

      <div className="preview-grid">
        {set.items.map((it, i) => (
          <div key={i} className="preview-item">
            <CharacterImage name={it.name} image={it.image} size="md" />
            <span>{it.name}</span>
          </div>
        ))}
      </div>

      {!set.builtIn && (
        <button className="btn btn-ghost small" onClick={report}>
          Report this set
        </button>
      )}
    </div>
  );
}
