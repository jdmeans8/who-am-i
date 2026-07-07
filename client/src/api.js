import { supabase } from "./supabase.js";

async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req(path, { method = "GET", json, body } = {}) {
  const headers = await authHeaders();
  if (json) headers["content-type"] = "application/json";
  const res = await fetch(path, { method, headers, body: json ? JSON.stringify(json) : body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export const api = {
  listSets: (params = {}) => req(`/api/sets?${new URLSearchParams(params)}`),
  getSet: (id) => req(`/api/sets/${id}`),
  mySets: () => req(`/api/me/sets`),
  createSet: (payload) => req(`/api/sets`, { method: "POST", json: payload }),
  updateSet: (id, payload) => req(`/api/sets/${id}`, { method: "PUT", json: payload }),
  deleteSet: (id) => req(`/api/sets/${id}`, { method: "DELETE" }),
  like: (id) => req(`/api/sets/${id}/like`, { method: "POST", json: {} }),
  report: (id, reason) => req(`/api/sets/${id}/report`, { method: "POST", json: { reason } }),
  upload: (file) => {
    const fd = new FormData();
    fd.append("image", file);
    return req(`/api/upload`, { method: "POST", body: fd });
  },
  remixSet: (id) => req(`/api/sets/${id}/remix`, { method: "POST", json: {} }),
  imageSources: () => req(`/api/image-search/sources`),
  imageSearch: (q, source) => req(`/api/image-search?${new URLSearchParams({ q, source })}`),
  importImage: (url) => req(`/api/import-image`, { method: "POST", json: { url } }),
};
