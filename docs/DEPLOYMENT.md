# Deployment

How deployments work today and how to validate them. No application or schema changes in this doc.

---

## How deployments work today

- **Web app:** Next.js is typically deployed on **Vercel** (or compatible). Build command: `npm run build` (from `web/`). Output: static + server-rendered routes; API routes run as serverless.
- **Environment:** All secrets and env vars are set in the host (e.g. Vercel project settings). The app reads them at build/runtime (e.g. `NEXT_PUBLIC_*` for client, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` for server).
- **Staging vs prod:** Use separate Vercel projects and/or Supabase projects. Point each deployment to the correct Supabase (and Stripe, etc.) via env. Branch strategy (e.g. `staging` → staging deploy, `main` → prod): **TBD** (confirm in your project).
- **Database:** Supabase migrations are applied outside the app (Supabase CLI `db push`, or run SQL in order in dashboard). Migrations live in **`supabase/migrations/`**; do not reorder or edit applied migrations.

---

## Environment variables (reference)

Set these where the app runs (e.g. Vercel):

| Variable | Used by | Purpose |
|----------|---------|--------|
| NEXT_PUBLIC_SUPABASE_URL | Web (client + server) | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Web (client) | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Web (server) | Server-side Supabase access (confirm, admin, workflows) |
| (Others) | TBD | Stripe, Twilio, ALLOY_PUBLIC_ORG_ID, etc. – confirm in codebase |

Do not commit secrets. Use `.env.local` for local dev (gitignored).

---

## Gotchas

- **Schema cache:** After applying migrations (especially new tables/columns), Supabase may need a moment to refresh schema cache. If the app returns “column/table not found,” re-run migrations and/or refresh the project.
- **Migration order:** Migrations are applied by filename timestamp. Do not rename or reorder; add new migrations with a new timestamp prefix.
- **Build-time env:** Some pages (e.g. admin dashboard) fetch data at build time. If `SUPABASE_*` is not set in the build environment, those requests can fail (e.g. “SUPABASE_URL not set” in logs). Ensure env is set for the build in Vercel.
- **Admin auth:** Admin routes and UI depend on Supabase Auth and server-side checks (`lib/adminAuth`). Ensure correct redirect and role checks for your deploy domain.

---

## How to validate a deploy

1. **Build:** From repo root, `cd web && npm run build`. Must complete with exit code 0.
2. **Key pages (post-deploy):**
   - Public: `/`, `/book-v2`, quote flow if enabled.
   - Admin: `/admin`, `/admin/dashboard`, `/admin/jobs`, `/admin/schedules`, `/admin/vendors` (after login).
3. **API (smoke):** e.g. `POST /api/book-v2/quote-start` with minimal body (if public) or admin endpoints with auth; confirm expected status and no 500 from missing env/schema.
4. **DB:** After migration changes, run a few admin list/detail pages and confirm no “column/relation not found” errors.

---

## Notes / TBD

- Document exact Vercel project(s) and branch → environment mapping.
- List all required env vars for book-v2 (payment, messaging) and admin.
- Confirm whether backend (Python) or sync is deployed separately and where.
