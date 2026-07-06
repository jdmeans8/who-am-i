import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, isAuthConfigured } from "./supabase.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!isAuthConfigured);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    ready,
    isAuthConfigured,
    displayName: user ? nameOf(user) : null,
    signInGoogle: () =>
      supabase?.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      }),
    signInEmail: (email) =>
      supabase?.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      }),
    signOut: () => supabase?.auth.signOut(),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

export function nameOf(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email ? user.email.split("@")[0] : "You")
  );
}
