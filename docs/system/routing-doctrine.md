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

| URL | Role |
|-----|------|
| `/admin` | Admin / settings / config landing (not operator home) |
| `/admin/settings/*` | Settings sub-surfaces (lifecycle hub, fields, layouts, actions, …) |
| `/admin/forms` | Forms module |
| `/admin/workflows` | Automations hub |
| `/admin/ai-activity` | AI activity strip destination |
| `/admin/tasks`, `/admin/messages`, … | Other canonical AdminV2 modules (see `CANONICAL_ADMIN_PATH_PREFIXES`) |

Exact `/admin/settings` redirects to `/admin` (settings index is the admin landing).

---

## Transitional URLs (redirect — do not link in new UI)

| URL | Behavior |
|-----|----------|
| `/adminV2`, `/adminV2/*` | 302 → `/admin`, `/admin/*` |
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

---

## Related docs

- **`navigation-doctrine.md`** — left nav, lifecycle tiles, entry flows
- **`drawer-doctrine.md`** — drawer runtime and warm open
- **`platform-performance-doctrine.md`** — reveal and prefetch
- **`legacy-architecture-inventory.md`** — legacy-admin classification

---

## When this doc must be updated

Public URL additions, middleware redirect rule changes, rewrite map changes, or drawer URL contract changes.
