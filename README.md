# Alloy

Alloy is a **configurable business operations platform** for service businesses. Childcare enrollment is the primary reference implementation, but platform documentation and architecture are industry-agnostic. The system of record is **Supabase**; the main application is the **Next.js web app** in `web/`, which provides the operator workspace, admin surfaces, API routes, and customer-facing flows.

**Canonical documentation:** Start at [`docs/README.md`](docs/README.md) for platform doctrine, load order, and governance.

**Platform status (July 2026):** Foundational runtime architecture is certified complete and frozen. See `docs/platform/foundation/platform-freeze-july-2026.md`.

---

## Repository structure

```
.
├── web/                    # Next.js app (main app + admin + API routes)
│   ├── app/                # App Router: pages + API routes
│   ├── components/         # React components (admin, cleaning, UI)
│   ├── lib/                # Supabase clients, workflowRun, bookingResolver, etc.
│   └── ...
├── supabase/
│   └── migrations/         # SQL migrations (apply via Supabase CLI or dashboard)
├── sync/                   # Python: GHL → Supabase sync (contacts, opportunities, jobs)
├── backend/                # Python: GHL/Twilio dispatcher (optional; see below)
└── docs/                   # Active source pack + audits (see docs/README.md)
```

- **web**: Primary app. Next.js runs both the public/marketing/booking frontend and the admin; API routes live under `web/app/api/`.
- **supabase/migrations**: Source of truth for schema. Apply in order by timestamp prefix.
- **sync**: Idempotent workers that pull from GoHighLevel and upsert into Supabase (see **`sync/README.md`**).
- **backend**: Optional Python service for GHL webhooks, Twilio, and message dispatch; not required for the core booking → job → schedule → assignment flow handled in the web app.

---

## Local setup

### Prerequisites

- **Node.js 18+** (for web)
- **Supabase** project (local or hosted)
- **Python 3.8+** (only if running sync or backend)

### 1. Web app

```bash
cd web
cp .env.local.example .env.local   # if present; otherwise create .env.local
npm install
npm run dev
```

App runs at **http://localhost:3000**. Admin at **http://localhost:3000/admin** (requires Supabase Auth; see **`web/lib/adminAuth`** and the login flow).

**Required env (see `web/.env.local`):**

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon key  
- `SUPABASE_SERVICE_ROLE_KEY` – Server-side (confirm, admin, workflows); never expose to client  

Other keys (Stripe, Twilio, communications worker URLs, etc.) as needed per environment.

### 2. Database and migrations

Migrations live in **`supabase/migrations/`** (repo root). Apply via Supabase CLI:

```bash
# If using Supabase CLI linked to your project
supabase db push
```

Or run the SQL files in order (by filename timestamp) in the Supabase SQL editor or your migration runner. **Do not change migration order**; they depend on each other.

### 3. Sync (optional)

For GHL → Supabase sync:

```bash
cd sync
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: GHL_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Run e.g. sync_contacts.py, sync_opportunities.py, sync_jobs.py
```

See **`sync/README.md`** for details.

### 4. Backend (optional)

Python dispatcher for GHL/Twilio; not required for booking/admin core paths:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Configure .env per backend needs; run e.g. uvicorn
```

---

## Staging / production workflow

- **Branches:** `staging` is the main branch referenced for this doc. Production branch and strategy: confirm in your Vercel/project settings.
- **Web deploy:** Typically **Vercel** (Next.js). Set env vars in Vercel (Supabase, Stripe, etc.).
- **Supabase:** Separate projects for staging vs prod recommended. Point each deploy to the correct Supabase project via env.
- **Migrations:** Apply to each environment (staging, prod) in the same order; avoid schema drift.

---

## Docs (active source pack)

**Start here:** **[docs/README.md](docs/README.md)** — load order for onboarding and AI context, platform doctrine index, **`docs/supabase/reference/*.csv`** (generated schema reference), archive layout, and sprint notes.

**Stale paths:** Top-level **`docs/architecture/`** and **`docs/implementation/`** were removed in the **2026-05-02** documentation reset. Comparable material lives under **`docs/archive/2026-05-02-docs-reset/`** — use only when you intentionally need historical context.

**Supplementary audits** (not part of the default source pack): **`docs/audits/`** — point-in-time investigations and planning artifacts, not current doctrine.

---

## Notes / TBD

- Confirm production branch and Vercel project(s).
- Confirm env vars required per vertical for book-v2 payment (Stripe) and messaging worker URLs.
- Backend and sync are optional; align communications docs with what each deployment actually runs.
