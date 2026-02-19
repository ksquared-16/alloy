# Alloy

Alloy is a **platform connecting homeowners with local service professionals**. The system of record is **Supabase**; the main application is the **Next.js web app** in `web/`, which handles marketing, quoting, booking, and a full admin for opportunities, jobs, schedules, vendors, and operations. The current production vertical is **home cleaning** (e.g. Bend, Oregon).

**What’s working today:** A customer gets a quote (quote-start → quote-refine), selects a time (availability), and confirms (book-v2/confirm). That creates or reuses **Opportunity → Job → Schedule** and optionally **Customer/Contact** and **discount redemptions**. Admins manage **vendors** (approve/suspend), set a **job default vendor** (`assigned_vendor_id`), **apply it to upcoming schedules** (creates assignments with status “offered”), and handle **assignments** (accept/decline), **reschedule**, and **cancel**. **Subscriptions** can generate the next occurrence (generate-next). **Workflows** (e.g. `booking_confirmed`) run on confirm and can enqueue **messages_outbox** (Twilio/send integration TBD). A separate **sync** (Python) can pull contacts/opportunities/jobs from GoHighLevel into Supabase; a **backend** (Python) exists for GHL/Twilio flows and is optional relative to the web app.

---

## Repository structure

```
.
├── web/                    # Next.js 16 app (main app + admin + API routes)
│   ├── app/                # App Router: pages + API routes
│   │   ├── admin/          # Admin UI (dashboard, jobs, schedules, vendors, etc.)
│   │   ├── api/            # API: book-v2, admin/*, action links, etc.
│   │   ├── book-v2/        # Booking flow UI
│   │   └── ...
│   ├── components/         # React components (admin, cleaning, UI)
│   ├── lib/                # Supabase clients, workflowRun, bookingResolver, etc.
│   └── ...
├── supabase/
│   └── migrations/         # SQL migrations (apply via Supabase CLI or dashboard)
├── sync/                  # Python: GHL → Supabase sync (contacts, opportunities, jobs)
├── backend/                # Python: GHL/Twilio dispatcher (optional; see below)
└── docs/                   # Architecture, domain model, deployment, operations
```

- **web**: Primary app. Next.js runs both the public/marketing/booking frontend and the admin; API routes live under `web/app/api/`.
- **supabase/migrations**: Source of truth for schema. Apply in order by timestamp prefix.
- **sync**: Idempotent workers that pull from GoHighLevel and upsert into Supabase (see `sync/README.md`).
- **backend**: Legacy/optional Python service for GHL webhooks and Twilio; not required for the core booking → job → schedule → assignment flow, which is handled in the web app.

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

App runs at **http://localhost:3000**. Admin at **http://localhost:3000/admin** (requires Supabase Auth; see `web/lib/adminAuth` and login flow).

**Required env (see `web/.env.local`):**

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon key  
- `SUPABASE_SERVICE_ROLE_KEY` – Server-side (confirm, admin, workflows); never expose to client  

Other keys (Stripe, Twilio, etc.) as needed for payment and messaging (TBD in codebase).

### 2. Database and migrations

Migrations live in **`supabase/migrations/`** (root of repo). Apply via Supabase CLI:

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

Python dispatcher for GHL/Twilio; not required for booking/admin:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Configure .env per backend needs; run e.g. uvicorn
```

---

## Staging / production workflow

- **Branches:** `staging` is the main branch referenced for this doc. Production branch and strategy: **TBD** (confirm in your Vercel/project settings).
- **Web deploy:** Typically **Vercel** (Next.js). Set env vars in Vercel (Supabase, Stripe, etc.); no application code changes in this doc.
- **Supabase:** Separate projects for staging vs prod recommended. Point each deploy to the correct Supabase project via env.
- **Migrations:** Apply to each environment (staging, prod) in the same order; avoid schema drift.

---

## Next up (from current codebase)

- **Messaging / workflows:** Harden workflow execution and messages_outbox processing (e.g. Twilio sender); RLS and audit where needed.
- **RLS:** Row Level Security is not fully applied; admin currently uses service role / server-side auth.
- **Job statuses:** Optional `job_statuses` table for human-readable labels; fallback in admin for known keys (scheduled, assigned, completed).
- **Subscription cadence:** generate-next uses subscription `cadence`/`interval`; confirm schema source (table vs `pricing_frequencies`) if needed.

---

## Docs

| Doc | Purpose |
|-----|--------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, data flows, idempotency, where to add features |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | Entities, relationships, assignment statuses, default vendor vs assignment |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy process, env, validation |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | How admins run the business; checklists for demo/QA |
| [docs/EVENTS.md](docs/EVENTS.md) | System events implied by code (workflows, action links); optional |

---

## Notes / TBD

- Confirm production branch and Vercel project(s).
- Confirm which env vars are required for book-v2 payment (Stripe) and messaging (Twilio).
- Backend and sync are optional; document which flows still depend on them, if any.
