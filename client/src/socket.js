import { io } from "socket.io-client";

// Same-origin connection: dev proxies /socket.io to the server, prod serves both.
export const socket = io({ autoConnect: true });

// Promise wrapper around Socket.IO acks.
export function emit(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res || { ok: false, error: "No response." }));
  });
}

const SESSION_KEY = "whoami.session";

export function saveSession(code, playerId) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
  } catch {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}
