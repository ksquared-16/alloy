# Authority Path Inventory

**Mission** `msn_7782d3e37dfeebd871` v1 · phase *Authority Path Inventory* · assignment `asg_5af4b86b31f14c`
**contentHash** `071e9f20adea6aad83d37f69efd8fc69`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30

An *authority path* is any route from an inbound request to a privileged effect, together with the
check (if any) that decides whether the caller may cause that effect. This inventory enumerates
those paths, states what each one actually enforces, and separates authority that is **enforced**
from authority that is only **configured**.

---

## 1. Method, and why the obvious method fails

Every claim below is grounded in a file read in this worktree and cited as `path:line`. Counts come
from `grep` over `web/`; where a count is a *lower bound* it says so.

The naive approach — grep route files for the names of the gate helpers — **materially undercounts
enforcement**, and I verified four distinct ways it fails:

| Failure mode | Example | Consequence |
|---|---|---|
| Gate behind a feature wrapper | `web/app/api/admin/rbac/roles/route.ts:8` calls `requirePortalOrUsersRolesManageAuth`, which reaches the gate at `web/lib/admin/canManageUsersAndRoles.ts:26` | Looks ungated; is gated |
| Deprecated alias of a gate | `getAdminContext` is a re-export of `getAdminContextCached` (`web/lib/admin/getAdminContext.ts:73`) | ~20 routes look ungated |
| Gate behind a relative import | `web/app/api/admin/processing/cases/[caseId]/identity/execute/route.ts:23` → `resolveOperatorRoute` → `web/lib/pos/processingIdentity/operator/operatorRouteContext.ts:35` | 6 routes look ungated |
| Cross-route re-export | `web/app/api/admin/v2/view-models/drawer/person/[id]/route.ts:1` is a one-line `export { GET } from …` | 3 routes look ungated |

My first flat grep reported 83 apparently ungated routes, **51 of them under `/api/admin/*`. I read
all 51 and every one was in fact gated** — 23 behind wrappers (`canManageUsersAndRoles`,
`requireAnalyticsV2AdminContext`, `loadConfigLayoutAssistAdminContext`), 21 via the four mechanisms
in the table above, the rest via the `getAdminContext` alias. Publishing that 83 would have been a
false finding. Any authority audit of this codebase must be **transitive over the import graph**.

`web/scripts/auditAuthorityPaths.mjs` (added by this phase) does that walk and emits the per-route
tier census. It is read-only. See §8 — it needs one approval to run in this session, and the exact
tier census is the one number this inventory deliberately does not assert.

---

## 2. The authority surface

**There are no React Server Actions anywhere in the app** — `grep -rl "use server" web/app web/lib`
returns 0. So the entire privileged surface is:

| Class | Count | Authority mechanism |
|---|---|---|
| API route handlers (`web/app/api/**/route.ts`) | **539** | Per-handler, in-process. Nothing above them. |
| Page/shell surfaces (`/admin`, `/settings`, `/organization`, `/workspace`) | 1 gate | Middleware (session) + AdminV2 layout (role) |
| Direct browser→Postgres | 6 files import `web/lib/supabaseClient.ts` | RLS |

Two structural facts make the 539 route handlers the whole story:

1. **Middleware does not gate `/api/*`.** `web/middleware.ts:106` returns early unless
   `requiresOperatorSession(pathname)`, and that predicate covers only `/admin`, `/settings`,
   `/organization` and `/workspace` page paths (`web/lib/admin/operatorSessionGate.ts:16-22`,
   `web/lib/admin/canonicalAdminRoutes.ts:106-131`). No API path matches. Middleware also
   explicitly exempts the two provider webhooks (`web/middleware.ts:28-33`).
2. **RLS is not a backstop for API traffic.** 517 of 539 route files hold a service-role client
   (`web/lib/supabaseAdmin.ts:35-42`, documented as *"Uses service role key to bypass RLS"*). The
   240+ `enable row level security` statements in `supabase/migrations/` therefore govern only the
   6-file browser-client surface, not the API.

**Consequence:** for ~96% of the privileged surface, the check written inside the handler's own
module graph is the *only* authority that exists.

---

## 3. Where authority comes from

One resolution path, which is a genuine architectural strength — every gate below reads the same
bundle, so there is no competing source of truth.

```
auth cookie ──▶ loadAdminAccessBundleCached ──▶ resolveAdminAccessCore
                                                  │
   user_roles (user_id, org_id, role) ────────────┤──▶ roleKeys[]
   role_permission_grants (org_id, role_key) ─────┤──▶ permissionKeys[]      ← the RBAC grid
   user_access_profiles (department/site scope) ──┤──▶ departmentScope, siteScope
                                                  └──▶ portalEligible: bool
```

- `roleKeys` — membership rows for the primary org (`web/lib/admin/resolveAdminAccessCore.ts:138-140`).
- `permissionKeys` — union of grants for those role keys
  (`web/lib/admin/resolveAdminAccessCore.ts:90-99,143`).
- `portalEligible` — **`roleKeys ∩ {admin, ops} ≠ ∅`** (`web/lib/admin/resolveAdminAccessCore.ts:18,142`).
- Scope dimensions — from `user_access_profiles` (`:145-150`).

---

## 4. Enforcement points, by tier

| Tier | Meaning | Primitive | Direct route references |
|---|---|---|---|
| 3 | permission grant consulted | `permissionKeys.includes(…)` | 3 routes textually; ~6 feature families transitively |
| 2 | portal role / membership | `portalEligible`, `role !== "admin"` | dominant tier |
| 1 | authenticated session only | `getCachedAuthUserId` | rare in isolation |
| 0 | none | — | public/token/webhook families |

Gate-helper reference counts across the 539 route files (`grep -rhoE … | uniq -c`):

```
541  getAdminContextCached(       ← incl. the getAdminContext alias
143  requireAdminOrOps(
106  getAdminAccessContextCached(
 31  loadAdminRouteGate(
 18  getAdminAuthCached(
 16  requireAdmin(                ← the ONLY admin-vs-ops distinction on the API
```

456 of 539 route files reference at least one of these directly; the remaining 83 were resolved by
hand in §1.

**Every tier-2 gate reduces to the same boolean.** `getAdminContext` → 403 unless `portalEligible`
(`web/lib/admin/getAdminContext.ts:38-40`). `getAdminAuth` → null unless `portalEligible`
(`web/lib/adminAuth.ts:43-45`). `loadAdminRouteGate` → 403 unless `portalEligible`
(`web/lib/admin/adminRouteGate.ts:43-45`). `requireAdminOrOps` → delegates to the light org context
(`web/lib/adminAuth.ts:113-119`).

Note `loadAdminRouteGate` **resolves `permissionKeys` into its result and then does not check them**
(`web/lib/admin/adminRouteGate.ts:46-56`). The data is placed in the caller's hand; consulting it is
optional and usually skipped.

### Page surfaces (sound)

`web/middleware.ts:110-114` redirects unauthenticated requests to `/login`; `/admin/*` and
`/settings/*` rewrite into `/adminV2/*` (`web/next.config.ts:257`), whose layout enforces role via
`getAdminAuth()` and redirects to `/unauthorized` (`web/app/adminV2/layout.tsx:23-30`). Page
authority is tier 2 and consistent.

### Tier 0 — 32 routes, by design

Authorized by capability token, provider callback, or nothing, not by session:

| Family | Count | Model |
|---|---|---|
| `api/public/forms/[token]/*`, `api/public/tour-booking/[token]/*` | 7 | URL capability token |
| `api/book-v2/*` | 9 | public booking funnel |
| `api/action-links/*`, `api/action/[token]/*` | 5 | URL capability token |
| `api/webhooks/{twilio,resend}` | 3 | provider callback |
| `api/public/{booking-config,field-definitions}`, `marketing/demo-request`, `vendor-application`, `verticals`, `leads/gutters`, `build-info`, `runtime-info` | 8 | public/unauthenticated |

Classified by path family; the token-validation strength of each family is **not** audited here (§7).

---

## 5. Findings

### F1 — Authority collapses to one boolean at the API boundary — `portalEligible`

Roughly 500 admin routes gate on `roleKeys ∩ {admin, ops} ≠ ∅` and nothing further. Only **16**
routes (`requireAdmin`) distinguish admin from ops. So any `ops` user reaches essentially the entire
admin API regardless of which permissions their role was granted.

Grounding: `resolveAdminAccessCore.ts:18,142` · `getAdminContext.ts:38-40` · `adminRouteGate.ts:43-45` · `adminAuth.ts:43-45,103-106`

### F2 — Custom roles cannot reach the portal at all

A role created through Settings → Users & Roles (`role_definitions`, seeded by
`supabase/migrations/20260505153000_backfill_default_role_definitions.sql`) has a key that is not
`admin` or `ops`. It is therefore not `portalEligible`, so its holder is redirected to
`/unauthorized` by `web/app/adminV2/layout.tsx:29-30` and receives 403 from ~500 API routes —
**no matter which permissions were granted to it.**

The operator-visible consequence is the product defect: the only way to grant someone working
access is to make them `ops`, which is F1's blanket grant. The permission grid cannot narrow it.

### F3 — 13 of 32 seeded permission keys are read by no enforcement path

32 keys are seeded across five migrations. These 13 appear **only** in
`web/lib/admin/permissionGrid.ts:13-19`, the catalog that renders the Settings permission grid:

`crm.opportunities.read/write` · `crm.customers.read/write` · `scheduling.read/write` ·
`billing.read/write` · `documents.read/write` · `reports.read/write` · `communications.read`

They are grantable, persisted to `role_permission_grants`, and displayed with read/write columns —
and consulted by nothing. Toggling them changes no behaviour. This is the literal decorative set,
and it covers the six core operational domains.

The `communications` row is the instructive case: its write key `communications.send` **is**
enforced (F4) while its read key is not — so within a single grid row, one column is real and the
other is ornamental.

*(The counterpart keys `settings.read` / `settings.manage` are genuinely enforced, at
`web/app/api/admin/configuration/programs/route.ts:54-65`.)*

*(An earlier note recorded this as "only 3 of 548 routes enforce permissions." That framing is too
harsh on authentication and too soft on this: authentication coverage on the admin API is in fact
complete — I found no unauthenticated `/api/admin/*` route — while the 12 keys above are enforced
nowhere at all.)*

### F4 — Real permission enforcement exists, confined to six feature families

Not decorative; each consults `permissionKeys` transitively:

| Family | Keys | Gate |
|---|---|---|
| Config Layout Assist | `config_assist.generate/review/apply` | `web/lib/agent/configLayoutAssist/configurationProposalAccess.ts:34-39` |
| Users & Roles | `settings.users_roles` | `web/lib/admin/canManageUsersAndRoles.ts:15-17` |
| AI enrichment | `ai.enrichment.use` | `web/lib/ai/aiEnrichmentPermissions.ts` |
| Communications | `communications.send` | `web/lib/communications/communicationPermissions.ts` |
| Operational Expectations | `operational_expectations.author` | `web/lib/operationalExpectations/intake/authoringServerContext.ts` |
| Configuration (fields/sections/layouts/option sets) | `fields.manage`, `sections.manage`, `layouts.manage`, `option_sets.manage`, `fields.editability.manage`, `fields.requirements.manage` | `web/app/api/admin/configuration/programs/route.ts` |

These are the working model of what F3's domains should look like.

### F5 — Scope restriction is bypassed by exactly the roles that can log in

`user_access_profiles.department_scope = "restricted"` is overridden to `"all"` for any `admin`/`ops`
user (`web/lib/admin/accessScope.ts:45,51-66`). Combined with F2 — only `admin`/`ops` can reach the
portal — **every user who can use the product bypasses department scope.** Site scope is not
bypassed and remains effective.

### F6 — `logAdminAudit` is imported by 5 of the tier-0-looking routes but is not a gate

Worth stating because auditing is easily mistaken for authorization in a grep-driven review: it
records, it does not decide (`web/lib/adminAuth.ts:121`).

### F7 — Three parallel permission catalogs, and the one that validates is not one of the two that constrain

| Table | Role |
|---|---|
| `public.permissions` | FK target of `role_permission_grants.permission_key` (`supabase/migrations/20260329165048_remote_schema.sql:6508`) |
| `public.permission_keys` | **second** FK target of the same column (`…:6503`) |
| `public.permission_definitions` | what the grant-write API validates against (`web/app/api/admin/rbac/grants/route.ts:61-64`) |

A key must therefore exist in all three to be grantable — two by referential integrity, one by
application check. `20260505164000_permission_grid_keys.sql` knows this and seeds all three
(`:7`, `:38`, `:70`), noting the dual FK in its own header comment at `:4-5`. Nothing enforces that
invariant: it is upheld by migration authors remembering it. This is a latent trap for every future
permission — miss `permission_definitions` and the key is silently unusable; miss either FK target
and the insert throws.

### F8 — The "Workflows / Automation" row of the permission grid cannot be saved

`web/lib/admin/permissionGrid.ts:23` offers the keys `workflows.read` / `workflows.write`. **Neither
is seeded into any of the three catalogs by any migration** — `grep -rn "'workflows.read'\|'workflows.write'" supabase/migrations`
returns nothing. The only workflow keys that exist are namespaced differently:
`ops.workflows.read` / `ops.workflows.write` (`20260329165048_remote_schema.sql:731-732`), and those
are in `permission_keys` only.

Static trace of the consequence: setting Workflows to Read or Write puts an unknown key in the PUT
body → validation at `web/app/api/admin/rbac/grants/route.ts:65-68` rejects with
`400 Invalid or inactive permission keys: workflows.read`. Because `PUT` replaces *all* grants for
the role, **the operator's entire permission save for that role fails**, not just the Workflows row.

Mitigating detail: validation precedes the `DELETE` at `:70`, so the existing grants are not lost —
the save is rejected atomically. The defect is a hard failure, not corruption.

**Not runtime-confirmed** — proven by reading the grid, the migrations and the handler; no request
was issued. First thing to verify live in the next phase.

---

## 6. Summary: enforced vs configured

| Authority concept | Configured | Enforced |
|---|---|---|
| Authenticated session | yes | **yes** — pages + all admin API |
| Org membership / tenant isolation | yes | **yes** — every gate carries `orgId` |
| Portal eligibility (admin/ops) | yes | **yes** — the primary gate |
| admin vs ops | yes | partial — 16 routes |
| Custom roles | yes (`role_definitions`) | **no** — cannot reach the portal (F2) |
| Permission grants, 6 feature families | yes | **yes** (F4) |
| Permission grants, 6 core domains | yes (grid + DB) | **no** (F3) |
| Permission grants, Workflows row | grid only — key in no catalog | **not even grantable** (F8) |
| Department scope | yes | **no** for admin/ops (F5) |
| Site scope | yes | yes |
| RLS | yes (240+ statements) | not on API traffic (§2.2) |

The gap is **not** authentication. It is that a rich, per-org, per-role, read/write permission model
is resolved on every request and then consulted by ~6 feature families, while the routes covering
opportunities, customers, scheduling, billing, documents and reports gate on a single
`admin`-or-`ops` boolean.

---

## 7. Limits of this inventory

Stated plainly so the next phase does not treat these as settled:

1. **Exact tier census not asserted** — §8. Tier *floors* in §4 are grounded; the per-route
   distribution is the script's output.
2. **Token strength unaudited** — the 21 token/public routes are classified by family. Whether
   each token is unguessable, expiring, single-use, or scope-bound is not assessed.
3. **Webhook verification unaudited** — the two provider webhooks bypass middleware by design;
   signature verification was not checked.
4. **Static, not dynamic** — reachability of a gate is proven by imports, not by execution. A route
   that *imports* a gate and forgets to `return` its failure response would read as gated here.
   This is a plausible defect class and the natural first probe for the model phase.
5. **RLS policy content unread** — 240+ statements counted, none evaluated.
6. **Read-only** — no request was issued against a running server; nothing was verified in a browser.

---

## 8. Reproduce

```bash
# Transitive per-route tier census (read-only; needs one approval in this session)
npm run audit:authority-paths --prefix web
npm run audit:authority-paths --prefix web -- --json   # machine-readable

# Spot checks used above
grep -rl "use server" web/app web/lib | wc -l                                    # → 0
find web/app/api -name route.ts | wc -l                                          # → 539
grep -rlE "supabaseAdmin|serverServiceClient" web/app/api --include=route.ts | wc -l   # → 517
grep -n "portalEligible" web/lib/admin/resolveAdminAccessCore.ts                 # → :18,:142
grep -n "readKeys" web/lib/admin/permissionGrid.ts                               # → F3 catalog
grep -rn "'workflows.read'\|'workflows.write'" supabase/migrations               # → empty (F8)
grep -rn "role_permission_grants" supabase/migrations/*.sql | grep -i references # → dual FK (F7)
```

---

## 9. Handoff to the model phase

F8 is an independent bug and should be fixed on its own, not folded into the model work — pick one
spelling (`workflows.*` or `ops.workflows.*`) and seed all three catalogs (F7).

F1 and F2 are one defect seen from two ends: the enforcement vocabulary is `{admin, ops}` while the
configuration vocabulary is `role_definitions × permission_keys`. A canonical authority model has to
either make `portalEligible` derive from a granted permission, or introduce a portal-access
permission that custom roles can hold. F4 already demonstrates the working shape at feature scale;
the question the model phase must answer is how to apply it to F3's six domains **without** a
flag-day migration of ~500 route handlers.
