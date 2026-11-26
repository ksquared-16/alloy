---
owner: runtime
status: frozen
last_reviewed: 2026-09-30
supersedes: []
---

# Routing doctrine

**Path:** `docs/system/routing-doctrine.md`  
**Status:** **Canonical** (June 2026 freeze). Single source of truth for product URLs, rewrites, redirects, and drawer URL behavior.  
**Code anchors:** `web/lib/admin/canonicalAdminRoutes.ts`, `web/lib/admin/canonicalOperatorRoutes.ts`, `web/middleware.ts`, `web/next.config.ts`, `web/lib/admin/operatorWorkUnitDrawerUrlSync.ts`

---

## Purpose

Operators and integrators must share one URL vocabulary. Internal filesystem paths (`app/adminV2/…`) are **implementation**; browser URLs below are **product contract**.

---

## Canonical operator URLs (Phase G — live)

| URL | Role |
|-----|------|
| `/workspace` | Operator landing — lifecycle command tiles, KPI strip |
| `/workspace/work-unit/:workUnitSlug` | Work-unit queue surface (slug from `work_units.key`, e.g. `new-leads`) |
| `/workspace/work-unit/:workUnitSlug/:recordId` | Same work-unit surface with **drawer URL state** (opportunity id, etc.) |

**Hierarchy (navigation):** Organization → **Lifecycle** → **Work Unit** → **Record**.  
Department UUID routes are **internal/compat** — not the operator home path.

---

## Canonical admin / config URLs

> **Corrected 2026-09-30.** This section is the single source of truth for product URLs, and it had
> gone stale on exactly that. It named `/admin` as the config landing and `/admin/settings/*` as the
> settings namespace, and stated that `/admin/settings` redirects to `/admin`. Measured against
> `web/next.config.ts` and `web/lib/admin/canonicalAdminRoutes.ts`: the landing is `/organization`,
> `/admin/settings/*` redirects to `/settings/*`, and `/admin/settings` redirects to `/organization`
> — not to `/admin`. The stale copy had also propagated into
> [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md), which was
> corrected in the same pass.

**Three canonical bases coexist.** This is the part most often got wrong: `/admin` is not retired —
it is no longer the *config landing*, while remaining canonical as a prefix for non-settings modules.

| URL | Role |
|-----|------|
| `/organization` | **Configuration landing** (`CANONICAL_ORGANIZATION_BASE`) |
| `/organization/{access,surfaces,processes,programs,locations,financials,data-model,staff,communications,integrations,commands,calculations,programs-locations,operational-intelligence}` | Organization domain surfaces |
| `/settings/*` | **Settings sub-surfaces** (`CANONICAL_SETTINGS_BASE`) — fields, layouts, actions, statuses, lifecycle |
| `/admin/forms` | Forms module |
| `/admin/workflows` | Automations hub |
| `/admin/ai-activity` | AI activity strip destination |
| `/admin/tasks`, `/admin/messages`, `/admin/finance`, … | Other canonical AdminV2 modules (see `CANONICAL_ADMIN_PATH_PREFIXES`) |

**Compatibility redirects** (all 307/302, `permanent: false`):

| From | To |
|-----|-----|
| `/admin`, `/admin/settings`, `/settings`, `/settings/organization` | `/organization` |
| `/admin/settings/:path*` | `/settings/:path*` |
| `/adminV2`, `/admin/v2`, `/adminv2` (bare) | `/organization` |
| `/settings/commercial`, `/settings/commercial/tuition` | `/organization/financials` |
| `/settings/surfaces`, `/settings/layouts` | `/organization/surfaces` |
| `/settings/users-roles`, `/settings/user-access` | `/organization/access` |

**Rewrites** then serve every canonical base from the implementation tree: `/organization` →
`/adminV2/settings/organization`, `/settings/:path*` → `/adminV2/settings/:path*`. So a browser URL
never matches its filesystem path, and `web/app/organization` does not exist.

---

## Transitional URLs (redirect — do not link in new UI)

| URL | Behavior |
|-----|----------|
| `/adminV2/*` | 302 → `/admin/*` (the **bare** `/adminV2` goes to `/organization`, not `/admin`) |
| `/admin/v2`, `/adminv2`, and `/*` variants | 302 → `/admin/*` |
| `/admin/workspace/*` | Rewrites to operator tree; prefer `/workspace` in product nav |

**Filesystem:** `app/adminV2/**` remains the Next.js implementation tree. Product hrefs must use **`canonicalAdminHref()`** / **`CANONICAL_ADMIN_BASE`**, not `/adminV2/…`.

---

## Legacy URLs (archived implementation)

| URL | Role |
|-----|------|
| `/legacy-admin/*` | Old admin pages (financials, unmigrated lists, classic opportunities registry) |

**Middleware:** Any `/admin/*` path **not** in `CANONICAL_ADMIN_PATH_PREFIXES` **redirects** to matching `/legacy-admin/*` (`legacyAdminRedirectTarget` in `middleware.ts`).

**Operator workspace:** Do **not** prefetch or link legacy-admin hrefs from canonical `/workspace` entry (see **`legacy-architecture-inventory.md`**).

---

## Rewrites vs redirects

| Mechanism | When | Example |
|-----------|------|---------|
| **Redirect** (302) | Bookmark migration, kill transitional paths | `/adminV2/workspace` → `/admin/workspace` |
| **Rewrite** (internal) | Serve AdminV2 tree at public URL | `/workspace` → `/adminV2/workspace` |
| **Middleware redirect** | Non-canonical `/admin/foo` → `/legacy-admin/foo` | Old financial routes |

Config: `web/next.config.ts` `redirects()` and `rewrites()`.

---

## Drawer URL behavior

Drawers on operator work-unit routes use **shallow URL sync** — no full Next.js route transition when opening/closing records.

| Concern | Contract |
|---------|----------|
| Open drawer | `history.replaceState` adds `/:recordId` segment under current work-unit slug |
| Close drawer | Remove `recordId` segment via replaceState |
| Queue pill / filter tabs | replaceState on query string only; pathname unchanged |
| Route remount | **Must not** remount work-unit page on drawer open/close (`WorkUnitSlugRouteHost`, `operatorWorkUnitDrawerUrlSync.ts`) |
| Refresh | Full URL including `recordId` restores work unit + drawer state after auth |
| Deep link | `/workspace/work-unit/new-leads/<uuid>` opens queue + drawer for that record |

**Implementation:** `syncOperatorWorkUnitUrlInBrowser`, `isOperatorWorkUnitRecordIdOnlyPathChange`, `AdminDrawerContext` drawer host on canonical paths only (`isCanonicalDrawerHostPath`).

---

## Internal compat routes (still mounted — not product nav)

These exist for bootstrap, tests, and migration; **do not** treat as operator canonical:

- `/adminV2/workspace/dept/[departmentId]`
- `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]`

Slug routes (`/workspace/work-unit/:slug`) are the **operator** entry. Dept/uuid pages may still receive bootstrap data and lifecycle sibling hydration internally.

---

## Auth boundary

`middleware.ts` requires Supabase session for paths matching `isOperatorAdminPath` (includes `/workspace`, `/admin/*`, `/legacy-admin/*`, transitional aliases). Public webhooks are excluded.

---

## Guardrails

- New product links: **`CANONICAL_OPERATOR_BASE`**, **`buildOperatorWorkUnitHref`**, **`adminProductHref`**, **`canonicalAdminHref`**.
- Never add `/adminV2/…` to customer-facing nav.
- Never assume department-first URLs in operator UX copy or docs.
- Drawer URL changes must preserve warm navigation and slug-route shell (see **`platform-performance-doctrine.md`**).

### Runtime mode is not audience

`NODE_ENV` says which build is running. It never says who is looking.

Alloy's certification and Human-QA hosts run development servers **on purpose**, and real operators
view them over the tailnet — so `NODE_ENV !== "production"` is true on exactly the machines where
operators are invited to look. "Dev-only" and "developer-only" are different sets.

- **`NODE_ENV` alone must never determine the visibility of rendered developer or debug UI on an
  operator surface.**
- Developer UI requires either an explicit opt-in —
  `process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_<AREA>_DEBUG === "1"` — or a
  surface under **`/dev/*`**, which refuses to exist in production.
- Enforced by the prebuild gate `check:runtime-mode-audience`
  (`web/scripts/checkRuntimeModeAudienceGating.mjs`), whose invariant is **zero**, not a ceiling.
  Non-rendered uses — logging, timeouts, safety refusals, tests — are untouched.

Two surfaces reached an operator before this rule existed: a sign-in diagnostic that named an
internal loopback address as the auth endpoint, and a Processing control offering to delete the
fixture a Human-QA walkthrough was walking. Both were added inside commits about something else.

---

## Related docs

- **`navigation-doctrine.md`** — left nav, lifecycle tiles, entry flows
- **`drawer-doctrine.md`** — drawer runtime and warm open
- **`platform-performance-doctrine.md`** — reveal and prefetch
- **`legacy-architecture-inventory.md`** — legacy-admin classification

---

## When this doc must be updated

Public URL additions, middleware redirect rule changes, rewrite map changes, drawer URL contract
changes, or a new class of surface that operators may or may not see.
