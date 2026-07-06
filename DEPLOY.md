# Deploying Who Am I? to Render (free tier)

One free Render web service builds the client and serves it alongside the
Socket.IO server. Supabase (which you've already set up) provides the database,
image storage, and Google/email auth.

Estimated time: ~15 minutes.

---

## 0. Prerequisites (already done)

- ✅ Supabase project created; `supabase/schema.sql` run (tables + `character-images` bucket).
- ✅ Google provider enabled in Supabase with your Web OAuth Client ID + Secret.
- You have these four values (they're in your local `.env`):
  - `SUPABASE_URL` — `https://dlogfdpoldipusddtowy.supabase.co`
  - `SUPABASE_SECRET_KEY` — `sb_secret_…` (keep private)
  - `VITE_SUPABASE_URL` — same as `SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_…`

---

## 1. Push the code to GitHub

The `.env` file is gitignored, so your secret key will **not** be committed —
that's intended; you'll set the values in Render instead.

```bash
git add -A
git commit -m "Add user sets, images, auth, and deploy config"
git push
```

If this is a brand-new repo:

```bash
git remote add origin https://github.com/<you>/who-am-i.git
git push -u origin main
```

---

## 2. Create the Render service from the blueprint

1. Go to the [Render dashboard](https://dashboard.render.com) → **New + → Blueprint**.
2. Connect your GitHub account and pick the `who-am-i` repo.
3. Render reads [`render.yaml`](render.yaml) and proposes one free web service.
4. It will prompt for the four environment variables (they're declared with
   `sync: false`). Paste the values from your `.env`:

   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | `https://dlogfdpoldipusddtowy.supabase.co` |
   | `SUPABASE_SECRET_KEY` | your `sb_secret_…` |
   | `VITE_SUPABASE_URL` | `https://dlogfdpoldipusddtowy.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` |

5. Click **Apply / Deploy**. First build takes a few minutes (installs deps,
   builds the client, starts the server).

> The `VITE_*` values are baked into the browser bundle **at build time** — Render
> makes blueprint env vars available during the build, so this works. The
> `SUPABASE_SECRET_KEY` stays server-side only.

When it's live you'll get a URL like `https://who-am-i-xxxx.onrender.com`. Copy it.

---

## 3. Tell Supabase about the production URL

So Google/email logins can redirect back to the deployed site:

**Supabase → Authentication → URL Configuration**
- **Site URL:** your Render URL (`https://who-am-i-xxxx.onrender.com`)
- **Redirect URLs:** add your Render URL (keep `http://localhost:5173` and
  `http://localhost:3001` for local dev).

No change is needed in Google Cloud Console — its authorized redirect URI stays
the Supabase callback (`…supabase.co/auth/v1/callback`), which doesn't change.

---

## 4. Verify

Open your Render URL and check:
- Home loads (first hit after idle takes ~30–60s — see cold starts below).
- **Browse character sets** lists Classic (+ any public sets).
- **Sign in** → Continue with Google completes and shows your name.
- **My sets → New set**, add characters with images, save.
- **Create a room**, pick your set, and play.

Tip: test multiplayer by opening the room on your phone (join with the code).

---

## Notes on the free tier

- **Cold starts:** the service sleeps after ~15 min idle; the next visitor waits
  ~30–60s while it wakes. Fine for casual play; upgrade to a paid instance
  (~$7/mo) for always-on.
- **In-memory rooms:** active game rooms live in the server's memory, so a
  redeploy or restart ends any in-progress games. User accounts, sets, and images
  are safe in Supabase.
- **Auto-deploy:** every push to the connected branch triggers a new deploy.
- **Custom domain (optional):** add one in Render's settings (~$10–15/yr from a
  registrar); then also add it to Supabase Redirect URLs.

---

## Troubleshooting

- **Login bounces / "redirect not allowed":** the Render URL isn't in Supabase
  Redirect URLs (step 3).
- **Auth works locally but 401 in prod:** a Supabase env var is missing/misspelled
  in Render → Environment. Redeploy after fixing.
- **Images don't upload:** confirm the `character-images` bucket exists and is
  public (re-run `supabase/schema.sql` if unsure).
- **Check server logs:** Render dashboard → your service → **Logs**. On boot it
  prints `Supabase: configured` when the keys are present.
