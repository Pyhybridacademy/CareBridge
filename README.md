# CareConnect

A mobile-first healthcare PWA where nurses and patients communicate by text, **voice notes** and **video notes**, with visit documentation, treatment plans, appointments and notifications. No live calls and no paid third-party APIs: everything runs on **Supabase** (free tier) and built-in browser features.

**Stack:** React + TypeScript + Vite + Tailwind CSS, Supabase (auth, Postgres, private storage, realtime), hand-written service worker.

---

## Part 1: Set up the backend (Supabase, free)

1. Go to https://supabase.com, sign up, and click **New project**. Pick a name, a strong database password, and the region closest to your users. Wait for it to finish creating.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**. It creates all tables, security rules, triggers, the private `care-media` storage bucket, and realtime.
3. Open **Project Settings → API** and copy two values:
   - **Project URL**
   - **anon public key** (the anon key is designed to be public; never use the `service_role` key in this app)
4. Open **Authentication → Providers → Email**. For quick testing you can turn **Confirm email** off, so new accounts can log in immediately. For real use leave it on.

## Part 2: Run it on your computer (optional)

```bash
npm install
cp .env.example .env      # then paste your two Supabase values into .env
npm run dev
```

## Part 3: Deploy for free

Pick **one** host. All three are free for a project like this and give you HTTPS (required for the camera and microphone).

First put the code on GitHub: create a new repository at github.com, then upload this folder's contents (you can drag and drop files in the GitHub website, or use `git push`). Do **not** upload `.env` or `node_modules` (the `.gitignore` already skips them).

### Option A: Vercel (simplest)
1. https://vercel.com → sign in with GitHub → **Add New → Project** → import your repo.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist`.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Click **Deploy**. You get `https://your-project.vercel.app`.

### Option B: Netlify
1. https://netlify.com → **Add new site → Import an existing project** → pick your repo.
2. Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).
3. **Site configuration → Environment variables**: add the same two variables, then deploy.

### Option C: Cloudflare Pages
1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset **Vite**, build command `npm run build`, output directory `dist`.
3. Add the same two environment variables, then **Save and Deploy**. (`public/_redirects` handles page refreshes.)

> Environment variables are baked in at build time. If you change them later, **redeploy**.

## Part 4: Tell Supabase your live address

In Supabase go to **Authentication → URL Configuration**:
- **Site URL**: your live address, e.g. `https://your-project.vercel.app`
- **Redirect URLs**: add `https://your-project.vercel.app/**`

Without this, email confirmation and password-reset links will point to the wrong place.

## Part 5: Test it properly (important)

1. Open the live site in two different browsers (or one normal + one private window).
2. Create **one nurse** account and **two patient** accounts.
3. As each patient: choose the nurse, send a text, a voice note and a video note.
4. As the nurse: reply, write a visit note, create a treatment plan, accept an appointment.
5. **Privacy check:** confirm patient A never sees patient B's messages, records, plans or media, and that a nurse only sees patients who chose them.
6. Test on a real **iPhone (Safari)** and an **Android phone (Chrome)**. Recording formats differ between them.
7. Install it: on Android Chrome tap **Install**; on iPhone tap **Share → Add to Home Screen**.

## How it works

- **Roles** live in a separate `user_roles` table. The sign-up trigger only accepts `patient` or `nurse`.
- **Assignment:** a patient picks a nurse, which creates the row that lets them message, book visits and receive records. Nurses only ever see patients who chose them.
- **Row-level security** is enforced in the database, not just the UI.
- **Voice/video notes** use the browser MediaRecorder API (webm on Chrome/Android, mp4 on Safari), upload to the **private** `care-media` bucket, and are played through short-lived signed URLs. Limits: 3 min voice, 2 min video (about 720p), 50 MB per file.
- **Offline:** the service worker caches only the app shell. It never caches messages, records or media.

## Known limits (be honest with yourself before real use)

- **Not a regulated medical system.** Before using it with real patients, get a legal and security review for your country's health-data rules (in Nigeria, the NDPA). Supabase's free plan has no formal compliance agreement and no guaranteed backups.
- **Free-tier limits (check the current numbers on supabase.com/pricing):** Supabase free projects pause after about a week of inactivity and have 1 GB of file storage. Video notes use storage quickly; consider shorter limits or deleting old media.
- **No push notifications.** Notifications appear inside the app (bell icon) in real time while it is open.
- **No avatar photo upload** yet (initials are shown instead).
- Appointments are request/confirm scheduling only; there are no automatic reminders.
