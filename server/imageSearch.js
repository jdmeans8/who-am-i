// Image search + import for the set builder. Two sources:
//   - Wikipedia (no API key) — great for real people, characters, landmarks.
//   - Giphy (needs GIPHY_API_KEY) — memes & reaction GIFs.
// Picking a result (or pasting a URL) funnels through importImageFromUrl, which
// fetches the remote image server-side, runs the same sharp→webp pipeline as
// uploads, and stores it in our own bucket so we never hotlink.

import dns from "node:dns/promises";
import net from "node:net";
import sharp from "sharp";
import { uploadImageBuffer } from "./setsRepo.js";

const UA = "WhoAmIGame/1.0 (character set builder; contact via app)";
const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB before processing

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function giphyConfigured() {
  return !!process.env.GIPHY_API_KEY;
}

// ---------- search ----------

// Returns [{ title, thumb, full }] — `full` is the URL we'll import if picked.
export async function searchImages({ q, source = "wikipedia" }) {
  const query = String(q || "").trim();
  if (!query) return [];
  if (source === "giphy") return searchGiphy(query);
  return searchWikipedia(query);
}

async function fetchJson(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, ...headers }, signal: ctrl.signal });
    if (!res.ok) throw httpError("The image search is unavailable right now.", 502);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function searchWikipedia(query) {
  // One call: full-text search + lead image thumbnail for each hit.
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "12",
    gsrnamespace: "0",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "600",
    pilimit: "12",
  });
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
  const pages = Object.values(data?.query?.pages || {});
  // Keep the search ranking (index) and only pages that actually have an image.
  return pages
    .filter((p) => p.thumbnail?.source)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ title: p.title, thumb: p.thumbnail.source, full: p.thumbnail.source }));
}

async function searchGiphy(query) {
  if (!giphyConfigured()) throw httpError("GIF search isn't set up yet.", 503);
  const params = new URLSearchParams({
    api_key: process.env.GIPHY_API_KEY,
    q: query,
    limit: "18",
    rating: "pg-13",
  });
  const data = await fetchJson(`https://api.giphy.com/v1/gifs/search?${params}`);
  return (data?.data || [])
    .map((g) => ({
      title: g.title || "GIF",
      // Animated small GIF makes the picker grid lively…
      thumb: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
      // …but import a still frame for a light, consistent board image.
      full: g.images?.original_still?.url || g.images?.fixed_height_still?.url || g.images?.fixed_height?.url,
    }))
    .filter((r) => r.thumb && r.full);
}

// ---------- import (URL → our storage) ----------

// Block requests to private / loopback / link-local hosts (SSRF guard) for
// user-supplied URLs. Search-result URLs come from trusted CDNs but pass
// through the same guard for consistency.
function isBlockedAddress(addr) {
  if (net.isIP(addr) === 0) return true;
  // Normalize IPv4-mapped IPv6 (::ffff:a.b.c.d).
  const v4 = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  if (net.isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = addr.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") || // unique-local
    lower.startsWith("fe80") // link-local
  );
}

async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw httpError("Image URLs must start with http(s).");
  }
  let resolved;
  try {
    resolved = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw httpError("Couldn't reach that address.");
  }
  if (!resolved.length || resolved.some((r) => isBlockedAddress(r.address))) {
    throw httpError("That address isn't allowed.");
  }
  return url;
}

// Fetch a remote image, re-encode to a bounded webp, and store it for `userId`.
// Returns { path, url }.
export async function importImageFromUrl(userId, rawUrl) {
  await assertSafeUrl(rawUrl);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(rawUrl, { headers: { "user-agent": UA, accept: "image/*" }, signal: ctrl.signal });
    if (!res.ok) throw httpError("Couldn't fetch that image.", 502);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type && !type.startsWith("image/")) throw httpError("That link isn't an image.");
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_IMAGE_BYTES) throw httpError("That image is too large (15 MB max).");
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) throw httpError("That image is too large (15 MB max).");
    buf = Buffer.from(ab);
  } catch (err) {
    if (err?.name === "AbortError") throw httpError("That image took too long to load.", 504);
    throw err;
  } finally {
    clearTimeout(t);
  }

  let webp;
  try {
    webp = await sharp(buf)
      .rotate()
      .resize(600, 600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw httpError("That file doesn't look like an image.");
  }
  return uploadImageBuffer(userId, webp);
}
