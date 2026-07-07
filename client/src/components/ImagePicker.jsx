import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Modal for finding a character image: search Wikipedia / Giphy, or paste a URL.
// onPick(url) imports the chosen image (async) and should resolve when done;
// the picker shows an importing state and closes on success.
export default function ImagePicker({ initialQuery = "", onPick, onClose, showToast }) {
  const [sources, setSources] = useState(["wikipedia"]);
  const [tab, setTab] = useState("wikipedia");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importingUrl, setImportingUrl] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const searchedFor = useRef(null);

  useEffect(() => {
    api
      .imageSources()
      .then((d) => d.sources?.length && setSources(d.sources))
      .catch(() => {});
  }, []);

  async function runSearch(q = query, source = tab) {
    const term = q.trim();
    if (!term || source === "url") return;
    searchedFor.current = `${source}:${term}`;
    setSearching(true);
    setResults([]);
    try {
      const { results } = await api.imageSearch(term, source);
      // Ignore if the user changed tab/term while this was in flight.
      if (searchedFor.current === `${source}:${term}`) setResults(results || []);
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setSearching(false);
    }
  }

  // Auto-search when a search tab opens with a query and no results yet.
  useEffect(() => {
    if (tab !== "url" && query.trim() && searchedFor.current !== `${tab}:${query.trim()}`) {
      runSearch(query, tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function choose(url) {
    if (importingUrl) return;
    setImportingUrl(url);
    try {
      await onPick(url);
      onClose();
    } catch (e) {
      showToast?.(e.message);
      setImportingUrl(null);
    }
  }

  const tabs = [...sources, "url"];
  const label = { wikipedia: "🌐 Wikipedia", giphy: "🎬 Giphy", url: "🔗 Paste URL" };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-picker" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Find an image{initialQuery ? ` for “${initialQuery}”` : ""}</h3>
          <button className="btn btn-ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="tabs picker-tabs">
          {tabs.map((t) => (
            <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
              {label[t] || t}
            </button>
          ))}
        </div>

        {tab === "url" ? (
          <div className="stack">
            <p className="muted small">Paste a direct link to an image (jpg, png, gif, webp).</p>
            <div className="row">
              <input
                autoFocus
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/picture.jpg"
                onKeyDown={(e) => e.key === "Enter" && urlInput.trim() && choose(urlInput.trim())}
              />
              <button
                className="btn btn-primary narrow"
                disabled={!urlInput.trim() || !!importingUrl}
                onClick={() => choose(urlInput.trim())}
              >
                {importingUrl ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a name…"
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button className="btn btn-primary narrow" disabled={!query.trim() || searching} onClick={() => runSearch()}>
                {searching ? "…" : "Search"}
              </button>
            </div>

            <div className="picker-grid">
              {searching && <p className="muted small center">Searching…</p>}
              {!searching && results.length === 0 && searchedFor.current && (
                <p className="muted small center">No results — try another search.</p>
              )}
              {results.map((r, i) => (
                <button
                  key={i}
                  className={`picker-thumb ${importingUrl === r.full ? "importing" : ""}`}
                  title={r.title}
                  disabled={!!importingUrl}
                  onClick={() => choose(r.full)}
                >
                  <img src={r.thumb} alt={r.title} loading="lazy" />
                  {importingUrl === r.full && <span className="picker-thumb-spin">Adding…</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
