import { createClient } from "@supabase/supabase-js";

// Browser client — used for authentication (Google / email magic link) with the
// public publishable key. All set data goes through our own Node API, not here.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isAuthConfigured = Boolean(url && key);

export const supabase = isAuthConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
