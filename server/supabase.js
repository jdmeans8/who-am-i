import { createClient } from "@supabase/supabase-js";

// Server-side client using the SECRET key. It bypasses row-level security, so
// it's used for all privileged work: writing sets, uploading images, bumping
// play counts. Never expose this key or client to the browser.
//
// The app degrades gracefully when Supabase isn't configured (e.g. local dev
// without a secret key) — set features are simply unavailable, and the core
// game keeps working on the built-in Classic set.
//
// Env is read lazily (inside functions) so it works regardless of when the
// .env file is loaded relative to ES module import hoisting.

let client = null;

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Verify a user's access token (from the client's Supabase session) and return
// the user, or null if invalid. Used to authenticate API requests.
export async function getUserFromToken(accessToken) {
  const sb = getSupabase();
  if (!sb || !accessToken) return null;
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}
