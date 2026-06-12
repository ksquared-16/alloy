# Operating doctrine

## Purpose

Normative rules for **documentation**, **GPT/Cursor source-pack usage**, **deployment/tenancy**, and **operational performance** so `docs/` and runtime context stay aligned with code. **This file is the documentation doctrine** (the former standalone `documentation-doctrine.md` was consolidated here).

## Current state — documentation and source pack

- **Active markdown:** **18** `.md` files total (`docs/README.md` plus **17** topic files under `docs/core`, `docs/system`, `docs/product`, `docs/execution` — **no** `docs/strategy/` in the active pack). The stack is intentionally compact; **expand only when a topic cannot fit an existing file** — then update **`docs/README.md`** load order and keep total stack ≤ **25** files (markdown + Supabase CSVs) unless there is explicit approval to exceed it. That count **includes** `docs/README.md` and **excludes** `docs/sprints/**` and `docs/archive/**`. **June 2026:** **`docs/system/adminv2-runtime-performance-doctrine.md`** added as locked AdminV2 runtime infrastructure (approved exception). **May 2026 consolidation:** Settings control plane, needs-attention count semantics, CRM go-live, and forms long-range vision were folded into existing system/product topic files (see `docs/README.md`).
- **Supabase reference CSVs (generated):** **8** files under `docs/supabase/reference/` (`supabase_*.csv`) — do not hand-edit; regenerate via `npm run export:supabase-schema` with a live `DATABASE_URL`.
- **GPT/Cursor source pack:** Target **25 or fewer** total files in the stack. **Current stack: 18 active markdown + 8 Supabase CSVs = 26 files** (June 2026: **`docs/system/adminv2-runtime-performance-doctrine.md`** added as locked AdminV2 infrastructure — one over prior cap). **May 2026-05-31 hygiene:** orphan **`docs/system/forms-intake-*`** and **`adminv2-runtime-contract.md`** moved to **`docs/sprints/`** (not counted in cap). Historical narrative docs live under **`docs/archive/2026-05-02-docs-reset/`**. **`docs/sprints/`** is exempt from archive passes; index at **`docs/sprints/README.md`**.

## How documentation works

1. Engineers treat active docs as **contracts** that describe today’s behavior.
2. When behavior changes, update docs **in the same PR/commit** as the code (preferred).
3. If reality diverged before docs caught up, either **fix code** or **update docs first** in the same commit — do not leave them contradictory across merges.

- Entity **fields** define structure; **layout field placements** define operator-surface behavior (Required / editability on record surfaces such as the opportunity drawer overview). See **`docs/system/configuration-system.md`** and **`docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`**.

## Mandatory update rule

**Any code change** that alters:

- entity behavior (schema or lifecycle),
- workflow / action behavior,
- config steering (`queue_definition`, layouts, status definitions, etc.),
- API contracts consumed by admin/public clients,
- workspace / department / queue behavior,
- permissions / RLS assumptions surfaced to app code,
- AI behavior or agent tool surface,
- billing / payments logic,
- communications send/enqueue behavior,
- documents / forms handling,
- scheduling lifecycle,
- deployment / tenancy / env contracts,

must update the **matching topic file** in `docs/core`, `docs/system`, `docs/product`, or `docs/execution` in the **same PR/commit**.

## Source-pack rules (AI / GPT / Cursor)

- Load files in the order given in **`docs/README.md`**. Prefer **`docs/platform/foundation/system-overview.md`** and **`docs/platform/modules/actions-and-workflows.md`** before guessing.
- For merges that change behavior, include **`docs/platform/governance/design-and-operational-doctrine.md`** in context.
- Prefer **active platform docs + `docs/supabase/reference/*.csv`** over archived markdown for schema truth; CSVs reflect whatever database was used when `export:supabase-schema` last ran.

## Anti-patterns

- Creating a new markdown file for every feature (**forbidden** unless the topic cannot fit any existing file — then update `docs/README.md` load order and reassess the **≤25** source-pack budget).
- Writing aspirational architecture that is not reflected in `web/` or `supabase/`.
- Duplicating long specifications that belong in archived materials — link to archive path if historical context helps.

## Contradiction handling

If implementation must change doctrine, **update docs with the code** and record the reason briefly under **Known gaps / risks** (e.g. in `execution/roadmap-and-gaps.md`) until follow-up completes.

## Deployment and tenancy

### Current state

- **Tenancy:** Production data is segregated by **`org_id`**; admin flows call **`getAdminContextCached`** for org + portal eligibility. **CRM data visibility** (department + site) resolves via **`getAdminAccessContextCached`** and **`web/lib/admin/accessScope.ts`** on scoped routes — same request bundle under the hood (`loadAdminAccessBundleCached`).
- **Supabase:** Server uses service role clients only on the server (`createAdminClient`, `serverServiceClient` patterns); browser uses anon/authenticated clients where applicable.
- **Envs:** Booking/public flows may use `ALLOY_PUBLIC_ORG_ID` in action-link consume paths when org id missing — understand before changing.
- Archived **`implementation/DEPLOYMENT.md`** and **`OPERATIONS.md`** were moved to `docs/archive/2026-05-02-docs-reset/` — treat as historical unless refreshed.

### How it works

1. Deploy `web` as Next.js app with secrets for Supabase + Stripe + communications providers.
2. Migrations applied in Supabase project; RLS policies must match server access patterns.
3. Operational changes follow this doctrine — update this file when deploy topology changes.

### Source of truth / key files

| Concern | Location (current code) |
|---------|-------------------------|
| Admin client | `web/lib/supabaseAdmin.ts` |
| Server service client | `web/lib/supabase/serverServiceClient.ts` |
| Admin context | `web/lib/admin/getAdminContext.ts` |
| CRM access scope | `docs/system/roles-and-permissions.md`; `web/lib/admin/getAdminAccessContext.ts`, `web/lib/admin/resolveAdminAccessCore.ts`, `web/lib/admin/accessScope.ts` |
| Perf overlay | `web/components/admin/AdminV2PerfOverlay.tsx`, `web/lib/perf/alloyPerfGlobal.ts` |
| Queue hot path | `web/lib/queues/QueueService.ts` |

### Performance (workspace / admin)

- **AdminV2PerfOverlay** is mounted in **`AdminV2Shell`** for client-side timing markers via **`window.__alloyPerf`**.
- **`web/lib/perf/alloyPerfGlobal.ts`** documents global hook; use when profiling drawer or workspace interactions.
- **QueueService** can be heavy on large orgs — rely on allowlists, indexes, and scope (work unit) to limit queries; profile changes with realistic `queue_definition` sizes.

## Production-readiness guardrails

- **Do not** run migrations that bypass RLS assumptions without coordinated policy updates.
- **Do not** log PII-heavy payloads in perf hooks.
- Treat archived DEPLOYMENT/OPERATIONS as **non-authoritative** until reconciled with production.
- **Do not** expose service-role Supabase to the browser (see `system/api-contracts.md`).
- Before **`staging`** deploys with `web/` changes: **`npm run verify:module-imports`** and **`npm run build`** (see **Frontend TypeScript before deploy**).

### Frontend TypeScript before deploy

Vercel runs **`next build` → TypeScript** (`tsc`), which is stricter than Vitest-only checks. Before pushing `web/` changes:

1. Run **`cd web && npx tsc --noEmit`**.
2. Ensure every type used in props/interfaces is **imported** — prefer `import type { Foo } from "…"` when `Foo` is type-only.

**Recurring failure:** `Cannot find name 'X'` when a refactor drops a type import but leaves `X` in a props interface (e.g. `SystemFieldRegistryEntry` in `FormFieldAuthoringCard.tsx`, OI-4B May 2026). Cursor rule: `.cursor/rules/alloy-development-guardrails.mdc` § TypeScript.

**Recurring failure (May 2026 — staging deploy `41910a1`):** Turbopack **`Module not found: Can't resolve '@/lib/...'`** when tracked files import **new modules that were never `git add`ed**. Local dev and Vitest can pass because the files exist on disk; Vercel only sees committed paths.

1. After adding imports to new files under `web/lib/**`, run **`cd web && npm run verify:module-imports`** (fails if tracked code imports missing or untracked modules).
2. Run **`cd web && npm run build`** before merging to **`staging`**.
3. In the same commit as import changes, include the **new module files and their tests**.

Example missing modules from that incident: `filterPlacementCandidateBundlesForQueueDisplay.ts`, `placementBucketLabels.ts`, `resolvePlacementCandidateChildDisplayName.ts`.

## Known gaps / risks

- **Needs verification:** Current hosting topology (Vercel vs other), CDN, and edge configuration.
- **Needs verification:** Server APM / log aggregation stack.
- Verification debt inventory: **`execution/roadmap-and-gaps.md`**; deep-dive route/event lists may also live under **`docs/audits/`**.

## When this doc must be updated

Process or source-pack limits change; hosting/tenancy/secrets change; meaningful perf instrumentation change; or intentional expansion beyond **17** active `.md` files or **25** source-pack files.
