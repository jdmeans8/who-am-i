import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import CharacterImage from "../components/CharacterImage.jsx";

const blank = () => ({ name: "", aliases: "", image_path: null, image_url: null, uploading: false });

export default function SetBuilder({ editId, onBack, onSaved, showToast }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [items, setItems] = useState([blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  useEffect(() => {
    if (!editId) return;
    api
      .getSet(editId)
      .then((d) => {
        const s = d.set;
        setTitle(s.title);
        setDescription(s.description || "");
        setIsPublic(!!s.is_public);
        setItems(
          s.items.map((it) => ({
            name: it.name,
            aliases: (it.aliases || []).join(", "),
            image_path: it.image_path || null,
            image_url: it.image || null,
            uploading: false,
          }))
        );
        setLoading(false);
      })
      .catch((e) => {
        showToast?.(e.message);
        setLoading(false);
      });
  }, [editId]);

  const patch = (idx, upd) => setItems((its) => its.map((it, i) => (i === idx ? { ...it, ...upd } : it)));

  async function pickImage(idx, file) {
    if (!file) return;
    patch(idx, { uploading: true });
    try {
      const { path, url } = await api.upload(file);
      patch(idx, { image_path: path, image_url: url, uploading: false });
    } catch (e) {
      showToast?.(e.message);
      patch(idx, { uploading: false });
    }
  }

  async function save() {
    const clean = items
      .map((it) => ({
        name: it.name.trim(),
        aliases: it.aliases.split(",").map((a) => a.trim()).filter(Boolean),
        image_path: it.image_path,
      }))
      .filter((it) => it.name);
    if (!title.trim()) return showToast?.("Give your set a title.");
    if (clean.length < 2) return showToast?.("Add at least 2 named characters.");

    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), isPublic, items: clean };
      if (editId) await api.updateSet(editId, payload);
      else await api.createSet(payload);
      showToast?.(editId ? "Set updated!" : "Set created!");
      onSaved?.();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <p className="muted center screen">Please sign in to build a set.</p>;
  if (loading) return <p className="muted center screen">Loading…</p>;

  return (
    <div className="screen builder">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>{editId ? "Edit set" : "New set"}</h1>
      </header>

      <div className="card stack">
        <label className="field">
          <span>Title</span>
          <input maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 90s Cartoon Legends" />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this set about?" />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>Public — others can find and play it</span>
        </label>
      </div>

      <div className="stack">
        {items.map((it, idx) => (
          <div key={idx} className="builder-row card">
            <label className="thumb-pick" title="Add image">
              {it.uploading ? (
                <div className="char-img char-img-md char-img-hidden">…</div>
              ) : (
                <CharacterImage name={it.name || "?"} image={it.image_url} size="md" />
              )}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => pickImage(idx, e.target.files?.[0])}
              />
              <span className="thumb-hint">{it.image_url ? "change" : "add photo"}</span>
            </label>
            <div className="builder-fields">
              <input
                maxLength={60}
                value={it.name}
                onChange={(e) => patch(idx, { name: e.target.value })}
                placeholder="Character name"
              />
              <input
                className="small-input"
                maxLength={120}
                value={it.aliases}
                onChange={(e) => patch(idx, { aliases: e.target.value })}
                placeholder="Also accept (comma-separated, optional)"
              />
            </div>
            <button
              className="btn btn-ghost small remove"
              onClick={() => setItems((its) => (its.length > 1 ? its.filter((_, i) => i !== idx) : its))}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => setItems((its) => [...its, blank()])}>
          + Add character
        </button>
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={save}>
        {saving ? "Saving…" : editId ? "Save changes" : "Create set"}
      </button>
    </div>
  );
}
