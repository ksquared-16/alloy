---
owner: platform
status: sprint
last_reviewed: 2026-09-01
supersedes: []
---

# 01 — Existing-state inventory

> **This file has seven parts.** **Part I (§§0–9)** is the existing-state inventory. **Part II (§§10–23)** is
> the **security threat & enforcement matrix** — required output #7. **Part III (§§24–36)** is the
> **gap analysis** — required output #8. **Part IV (§§37–44)** is the **role-model depth and role-editor
> surface inventory**, added on operator reopen. **Part V (§§45–57)** reads that chain as a **threat model**.
> **Part VI (§§58–71)** is the **gap analysis, reopened**. **Part VII (§§72–85)** is the **Mission 3
> re-anchor** — the accepted register re-adjudicated against a tree that has since executed most of the plan.
> Parts II–VII were delivered by later mission phases and appended here per their assignment scopes; each
> reuses what precedes it rather than restating it. Read Part I
> first, or jump to [§10](#10-headline--the-unauthenticated-surface-is-the-best-defended-part-of-this-platform),
> [§24](#24-headline--the-gap-is-no-longer-in-the-product-alone-it-is-between-the-corpus-and-its-plan),
> [§37](#37-headline--there-is-no-role-hierarchy-to-flatten) or
> [§72](#72-headline--the-resolvers-findings-are-closed-the-door-is-not).
>
> **This header said "four parts" until 2026-09-01**, while carrying six. Parts V and VI were appended
> without amending it — the same standing follow-up Part VI records as its limit 11 for `README.md`. §85
> records the correction.

> **Mission 2 refresh.** The accepted corpus is reused as input, not re-derived. This pass re-anchors the
> inventory to the current worktree and records what has **changed since acceptance** — because remediation
> has since shipped against these very findings, the accepted artifact is now partly *historical*.
>
> Prior artifacts, unchanged and still authoritative for their own dates:
> [`authority-path-inventory.md`](./authority-path-inventory.md) (accepted) and the frozen certification copy at
> `docs/platform/planning/vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md`
> (mission `msn_e9133cdade883793d2`, 2026-07-30). That QA path is runtime certification evidence and is **not**
> modified by this pass (`PRODUCT-SOURCE.md`).

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Existing-state inventory* · assignment `asg_b433c59b3aacd6`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `7572bc65a` (contains `agent/claude/6-vacilando-os-product-def`, 0 behind / 4 ahead)
**Date** 2026-08-03
**Sources** `web/`, `docs/platform/`, `supabase/migrations/`
**Method** static, file-grounded. Every current-state claim cites `path:line` and was re-read in this pass.
Claims carried forward without re-derivation are marked **[carried]** and cite the accepted artifact (§7.1).

---

## 0. Headline — the ground moved under the accepted inventory

Between acceptance (2026-07-30) and this pass, three commits landed directly on the surfaces this inventory
documents:

| Commit | What it did |
|---|---|
| `41610954c` | `feat(access): Wave 1 fail-closed quick wins — W-1 analytics gates, W-2 self-elevation ban, W-3 grid repair` |
| `555fa056a` | `ops(migrations): vendor Access V2 Phase 0 SQL to match deployed staging` |
| `2ec3d322d` | `fix(access): drop stale book-v2 entries from W-4 principal allowlist` |

**An existing-state inventory that predates its own remediation is not existing state.** Status now:

| Finding | Accepted state (2026-07-30) | Current state | Evidence |
|---|---|---|---|
| **C3** triple catalog, dual FKs | open | **CLOSED** | Phase 0 §§3–4 |
| **C5** unsavable Workflows row | open | **CLOSED — by two disagreeing mechanisms** (new C12) | §2.3 |
| **G2** routes gating on `access.ok` alone | "6 of 88" | **RECLASSIFIED — 3 real (now closed), 3 were false positives** | §3.1 |
| **G3** self-elevation | open | **PARTIAL** — unconditional self-ban shipped; delegation ceiling still open | §3.2 |
| **C6** two personas cannot log in | open | **OPEN — unchanged** | §3.3 |
| **C10** RLS authorizes `owner`/`manager` | open | **OPEN — unchanged** | §3.3 |
| **C11** second resolver diverges | open | **OPEN — unchanged** | §3.4 |
| **G4** new membership gets no access profile | open | **OPEN — unchanged, still fail-open** | §3.5 |
| **G6** RLS is not a backstop | open | **OPEN — narrowed at the edges** | §3.6 |
| **C1/C2/C4/C7/C8/C9, G1, G5, §1 identity split** | open | **carried forward, not re-derived** | §7.1 |

Two findings are newly recorded by this pass: **C12** (Phase 0 and Wave 1 closed C5 incompatibly) and
**C13** (an orphaned capability that is catalogued, granted, and reachable from nowhere).

---

## 1. What did not change: the chain is still two chains **[carried]**

`persons` carries no principal link; the principal graph (`auth.users → user_roles → role_definitions →
role_permission_grants`) and the subject graph (`persons → customers / opportunities / work_units`) meet only at
query time in `web/lib/admin/accessScope.ts`. A person is a record; a user is a credential.

Carried forward in full from the accepted artifact §1. Not re-derived; no commit in this window touched
`persons` or the glossary. **"person → user" remains a leg to design, not a leg to audit** — and it is still the
first question the model phase must answer (§8 Q1).

The spine of §2 was spot-verified and is unchanged at the same lines:

| Claim | Line, verified this pass |
|---|---|
| `PORTAL_ROLES = {admin, ops}` | `web/lib/admin/resolveAdminAccessCore.ts:18` |
| `portalEligible` derived from it | `resolveAdminAccessCore.ts:142` |
| Legacy fallback → `user_profiles.role` | `:44` |
| Legacy fallback → `app_users.role` on two different columns | `:54`, `:62` |
| Second resolver exists | `:209`, recomputing `portalEligible` at `:233` |
| Department-scope bypass for portal admins | `web/lib/admin/accessScope.ts:51`, applied `:60` |

---

## 2. What Wave 1 and Phase 0 actually changed

### 2.1 W-1 — an analytics capability now exists

`web/lib/admin/canReadAnalytics.ts` introduces the first named capability for org-wide analytics:

```ts
export const ANALYTICS_READ_PERMISSION = "reports.read";      // canReadAnalytics.ts:11
export const ANALYTICS_MANAGE_PERMISSION = "reports.write";   // :12

export function canReadAnalytics(subject) {
    if (subject.portalEligible) return true;                                   // :32
    return subject.permissionKeys.includes(ANALYTICS_READ_PERMISSION)
        || subject.permissionKeys.includes(ANALYTICS_MANAGE_PERMISSION);       // :33-36
}
```

`requireAnalyticsReadAccess()` (`:48-66`) returns 401/403 or the access context with scope dimensions intact.
It is applied to exactly three routes — `web/app/api/admin/intelligence/operational/route.ts`,
`metrics/resolve/route.ts`, `metrics/trends/route.ts`.

This is the **first route-level gate in the codebase whose portal-role leg is explicitly marked as temporary**:
the docstring names W-13 as the workstream that replaces `portalEligible` with a `portal.access` capability
(`canReadAnalytics.ts:29-30`). Architecturally that is the shape §8 Q2 asks for, shipped at one route family.

### 2.2 W-2 — self-elevation is banned unconditionally

`web/lib/admin/selfAuthorityMutation.ts` bans any principal from mutating its own authority, comparing the
caller id from the resolved access context — never from the request body (`:20-25`). Applied at
`web/app/api/admin/users/[userId]/role/route.ts:21-22`, and to the `access-scope` and `remove` routes.

Its docstring is precise about what it is *not*: "deliberately *not* the D3-dependent delegation ceiling (the
subset rule, W-18)" (`selfAuthorityMutation.ts:6-9`). See §3.2.

### 2.3 W-3 / Phase 0 — C5 closed twice, incompatibly

**C12 (new) — the migration and the application code closed C5 by opposite means.**

Phase 0 §2 seeds the legacy keys into the canonical catalog and grants them to `admin` in every org, on an
explicitly stated premise:

```sql
-- The grid now writes `ops.workflows.*`; this migration guarantees those keys are present
-- and active in the canonical catalog.          -- 20260729120000_...phase0...sql:16-17
INSERT INTO public.permission_definitions (key, ...) VALUES
    ('ops.workflows.read', ...), ('ops.workflows.write', ...);   -- :106-113
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', p.key ...                                  -- :116-122
```

Wave 1 did the opposite — it **removed** the Workflows row from the grid entirely
(`web/lib/admin/permissionGrid.ts:23-34`), arguing the repoint was unworkable:

> "The plan's suggested repoint to the legacy `ops.workflows.*` keys does not work: those exist only in
> `permission_keys`, not in `permissions` or `permission_definitions` … and the grant would additionally
> violate `role_permission_grants_permissions_fkey`."

**That argument is falsified by the migration that shipped alongside it.** Phase 0 §2 puts `ops.workflows.*`
into `permission_definitions` (`:106-113`), and Phase 0 §3 deletes
`role_permission_grants_permissions_fkey` outright (`:134`), replacing both legacy FKs with a single
`role_permission_grants_permission_definitions_fkey` onto the canonical table (`:136-140`). Both stated
obstacles were removed.

The operator-facing defect is genuinely closed either way — no 400, no destroyed payload. But the two
remediations disagree about the target state, and the residue is:

**C13 (new) — an orphaned capability.** `ops.workflows.read` / `ops.workflows.write` are now catalogued
(`:106-113`), granted to `admin` in every org (`:116-122`), and:

- reachable from **no** UI — the grid row was removed (`permissionGrid.ts:23-34`);
- enforced by **no** route — unchanged from C4/C5's finding that nothing consults `workflows.*`.

A permission that is granted to everyone and checked by nobody is the same class of defect as C4, created by
the fix for C5. Wave 1 anticipates the repair path (W-10 regenerates the grid from the catalog; W-11 seeds an
enforced workflows capability, `permissionGrid.ts:33-34`) — this is recorded so that path is not lost.

### 2.4 Phase 0 — C3 is closed

The three-catalog defect is resolved, and the migration is candid that the prior state was actively dangerous:

| Change | Line |
|---|---|
| `permission_definitions` becomes the single canonical table | `:11` |
| Both legacy FKs dropped; one FK onto the canonical table, `ON DELETE RESTRICT` | `:131-140` |
| `permissions` and `permission_keys` dropped and recreated as `security_invoker` read-only views | `:147-164` |
| Apply-time preflight aborts on orphan grants before any `DROP` | `:37-63` |

The migration states the hazard the dual FKs carried: "the legacy pair disagreed: one RESTRICT, one CASCADE —
meaning deleting a catalog key could silently delete grants" (`:127-128`).

`role_definitions` is now seeded by the database on `orgs` insert — `seed_default_role_definitions()`
(`:170-185`), the `orgs_seed_default_role_definitions` trigger (`:199-202`), and a backfill over existing orgs
(`:210`) — closing a defect the accepted inventory had not recorded: orgs created after the one-time seed had
**no** role definitions, so the UI fabricated four roles at read time that the write APIs then rejected
(`:19-24`).

---

## 3. Findings as they stand today

### 3.1 G2 — reclassified: 3 real, 3 false positives

The accepted inventory reported "6 of 88 routes gate on `access.ok` alone." **Three of those six were already
gated.** `web/app/api/admin/analytics/metrics/[id]/{trend,preview,snapshot}/route.ts` gate at their **first
statement** via a bespoke local helper:

```ts
const gate = await requireAnalyticsV2AdminMutate();   // snapshot/route.ts:15
if (!gate.ok) return gate.response;                   // :16
```

`requireAnalyticsV2AdminMutate` resolves `getAdminContextCached()` and returns 403 unless the principal is
portal-eligible **and** `role === "admin"` (`web/lib/metrics/platform/adminApiHelpers.ts:14-23`). The
`access.ok` line the accepted inventory cited (`snapshot/route.ts:23-24`) is a *second* access resolution used
only for scope dimensions, **after** the gate.

The accepted artifact's own §7.3 limit predicted this precisely — "a route that gated inside a bespoke local
helper without those tokens would be missed." It was, and the miss ran in the safe direction (over-reporting
exposure). The wave-1 evidence file records the same correction independently
(`docs/platform/planning/vacilando-os/qa/access-identity-v2/wave1-execution-evidence.json:87-92`) and flags its
significance: this is "a C1-class false positive inside the plan that names C1," and "the same misreading would
recur across W-15's ~500-route sweep."

**Current state: the 3 genuinely exposed routes are gated (§2.1). G2 is closed.** The methodological warning it
carries is the durable output, not the count.

### 3.2 G3 — partially closed; the ceiling is the open half

Closed: no principal can mutate its own authority (§2.2). This removes the direct self-escalation path a
`settings.users_roles` holder had.

**Still open:** `PATCH /api/admin/users/[userId]/role` applies no ceiling on *other* users. It validates only
that the target role is an active `role_definitions` row for the org
(`web/app/api/admin/users/[userId]/role/route.ts:33`) after the `requireUsersRolesManageAuth` gate (`:3`). A
`settings.users_roles` holder can still set **another** user to `admin`, and — absent a ban on reciprocal
grants — two such holders can still elevate each other.

Whether that is delegation or escalation remains a product decision (decision **D3**, workstream **W-18**), and
`selfAuthorityMutation.ts:6-9` correctly declines to prejudge it. It is the same question as §8 Q2.

### 3.3 C6 and C10 — open, unchanged

Phase 0 seeds the same four system roles it always did — `admin`, `ops`, `regional_lead`, `school_director`
(`:175-181`) — and `PORTAL_ROLES` is still `{admin, ops}` (`resolveAdminAccessCore.ts:18`). **The platform still
ships two named personas it cannot admit to the portal**, and Phase 0 now seeds them into *every new org* on
insert, so the population of unusable role rows grows automatically.

C10 is likewise untouched: no migration seeds `owner` or `manager`, which RLS authorizes throughout. The two
vocabularies still intersect only on `{admin, ops}`. Phase 0 made role definitions *reliably present* without
making them *reachable* — it fixed supply, not admission.

### 3.4 C11 — open, unchanged

`resolveAdminAccessDimensionsForOrgMember` (`resolveAdminAccessCore.ts:209`) still recomputes the full access
result independently, including its own `portalEligible` (`:233`), without the legacy fallback and without the
department-scope bypass. The screen an operator uses to reason about access is still not driven by the code
that enforces it — and Wave 1 widened the gap slightly by adding `canReadAnalytics` to the enforcement path
with no corresponding change to the preview path.

### 3.5 G4 — open, unchanged, and now the highest-value open defect

`POST /api/admin/users` still inserts into `user_roles` only (`web/app/api/admin/users/route.ts:102-111`). The
file contains no reference to `user_access_profiles`, `user_department_access`, or `user_site_access`. An absent
profile row still means unrestricted scope on both dimensions.

**Every membership created through the product still gets unrestricted department and site scope by default.**
Wave 1 hardened the *authority* leg (who may change roles) while leaving the *scope* leg fail-open on create.
Site scope is the one dimension with real query-layer enforcement (28 helpers in `accessScope.ts`) — and it is
silently not applied to anyone the product creates.

### 3.6 G6 — open, narrowed at the edges

**534 of 559** route files hold a service-role client (~95.5%) — up in absolute terms from 517 of 539, and
essentially flat as a proportion. For that surface, the check inside the handler's own module graph is still the
only authority that exists.

`2ec3d322d` tightened the W-4 service-client principal allowlist, dropping stale `book-v2` entries — 3 files,
16 insertions against 106 deletions across `web/scripts/serviceClientPrincipal.allowlist.json`, its baseline
under the QA folder, and `web/tests/access/serviceClientPrincipalCheck.test.ts`. That is real narrowing of an
audited boundary, but it does not change the structural finding.

---

## 4. Census — refreshed

| Measure | Accepted (2026-07-30) | Current (2026-08-03) |
|---|---:|---:|
| `route.ts` files under `web/app/api` | 539 | **559** |
| …holding a service-role client | 517 | **534** |
| …resolving `getAdminAccessContext` | 88 | **89** |
| Files in `web/lib` mentioning `permissionKeys` | 11 | **13** |

The two new `permissionKeys` files are `canReadAnalytics.ts` and `selfAuthorityMutation.ts` — i.e. **the
enforced-permission surface grew for the first time in this window**, which is the direction the model phase
wants. The C1 ratio nonetheless stands: mentioning `permissionKeys` is still not enforcing it, and any audit
that greps for it still over-reports by roughly 30×.

---

## 5. Enforced vs configured — current

| Authority concept | Configured | Enforced |
|---|---|---|
| Authenticated session | yes | **yes** |
| Org membership / tenant isolation | yes | **yes** |
| Portal eligibility (`admin`/`ops`) | yes | **yes** — still the primary API gate |
| Analytics read (`reports.read`/`.write`) | yes | **yes** — 3 routes, W-1 (§2.1) |
| Self-authority mutation | n/a | **banned unconditionally** — W-2 (§2.2) |
| Delegation ceiling on other users | **no** | **no** — D3 / W-18 open (§3.2) |
| Permission catalog | **single canonical table** — Phase 0 (§2.4) | n/a |
| `ops.workflows.*` | seeded + granted to `admin` | **no UI, no route** — orphaned (C13) |
| Custom personas (`regional_lead`, `school_director`) | yes, now seeded per org on insert | **no** — cannot reach portal (C6) |
| RLS roles `owner` / `manager` | **no** — never seeded | policies exist, unreachable (C10) |
| Multi-role membership | yes (schema + resolver) | **no write path** (C7) |
| Department scope | yes | **no** for `admin`/`ops` (C8) |
| Site scope | yes | **yes** — but never restricted on create (G4) |
| Access profile on new membership | intended | **no** — still never created (G4) |
| Operator preview of effective access | yes | **diverges from runtime** (C11) |
| person → user identity | **no** | n/a — relation does not exist (§1) |

---

## 6. Reproduce

```bash
# Census (§4)
rg -l --glob 'route.ts' '' web/app/api | wc -l                                    # 559
rg -l 'supabaseAdmin|createServiceRoleClient|SERVICE_ROLE' --glob 'web/app/api/**/route.ts' | wc -l  # 534
rg -l 'getAdminAccessContext' -g 'route.ts' web/app/api | wc -l                   # 89
rg -l 'permissionKeys' web/lib | wc -l                                            # 13

# §0 — the three commits that moved the ground
git show --stat 41610954c 555fa056a 2ec3d322d

# §2.1 / §3.1 — W-1 gate, and the 3 routes that were already gated
rg -l 'requireAnalyticsReadAccess' web/app                                        # 3 files
rg -n 'requireAnalyticsV2AdminMutate|requireAnalyticsV2AdminContext' web/lib/metrics/platform/adminApiHelpers.ts

# §2.3 — C12/C13: migration seeds ops.workflows.*, grid removed the row
rg -n 'ops.workflows' supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql
rg -n 'workflows' web/lib/admin/permissionGrid.ts                                 # comment only; no row

# §2.4 — C3 closed: one FK, two compatibility views
rg -n 'role_permission_grants_permission|CREATE VIEW|DROP TABLE' \
  supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql

# §3.3 — same four roles, same two portal roles
rg -n "'admin'|'ops'|'regional_lead'|'school_director'" \
  supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql
rg -n 'PORTAL_ROLES' web/lib/admin/resolveAdminAccessCore.ts                      # :18, :142, :233

# §3.5 — G4 still open: user creation writes no access profile
rg -n 'user_access_profiles|user_roles|insert' web/app/api/admin/users/route.ts
```

---

## 7. Limits

1. **Carried claims were not re-derived.** §1 and findings C1, C2, C4, C7, C8, C9, G1, G5 are inherited from
   the accepted artifact and cited to it. The spine anchors in §1's table *were* re-verified at their stated
   lines; the surrounding analysis was not. This is deliberate — the assignment directs reuse of the accepted
   corpus over re-derivation — but a reader should not treat inherited line numbers as freshly confirmed.
2. **Static, not dynamic.** No request issued, no browser, no live database. No product UI claim is made.
3. **Migration state is repo state, not deployed state.** `20260729120000_...` was *vendored to match deployed
   staging* (`555fa056a`), so on staging it is applied. Whether it is applied to any other environment was not
   verified, and no `supabase migration list` was run.
4. **G1 still requires live verification** — unchanged. Absence of `CREATE TRIGGER` on `auth.users` in version
   control is not proof of absence in a deployed database.
5. **C12/C13 are consistency findings, not exploit claims.** No path was found by which the disagreement
   between Phase 0 and Wave 1 grants unintended authority; `ops.workflows.*` is enforced nowhere, so granting
   it confers nothing today. The risk is that it is *assumed* to confer something later.
6. **Wave 1's own test evidence is taken as reported, not re-run.** `wave1-execution-evidence.json:80-81`
   records pre-existing unrelated failures (96 failing files under `drawer/`, `person/`, `opportunity/`,
   `actions/`, `adminV2*`); this pass did not execute the suite (§9).
7. **Read-only.** No source file was modified. The only file written is this document; the frozen QA copy is
   untouched.

---

## 8. Handoff to the model phase

The four questions from the accepted artifact stand. Two have moved:

1. **Is a person ever a user?** *Unchanged and still first.* Nothing in this window touched the identity split.
   Everything downstream depends on it, and it is a product decision.

2. **What admits someone to the portal, and what bounds delegation?** *Half-answered in code.*
   `canReadAnalytics` demonstrates the target shape — a named capability with `portalEligible` as an explicitly
   temporary leg, marked for replacement by `portal.access` under W-13 (`canReadAnalytics.ts:29-30`). W-2
   settled the self-elevation half of G3 without needing the decision. **What remains is exactly D3: the
   delegation ceiling for mutations on other principals** (§3.2). Until it is decided, C6 also stays open —
   Phase 0 now seeds two unusable personas into every new org, so the cost of deferring compounds.

3. **One permission vocabulary, or none?** *Materially advanced.* Phase 0 closed C3 — there is now one canonical
   catalog table and one FK (§2.4). C4 is unchanged, and **C13 shows the failure mode is still live**: the fix
   for C5 produced a fresh key that is catalogued, granted, and enforced nowhere. The accepted
   recommendation — make the grid a *projection of what is enforced* rather than an independent list — is now
   both cheaper (one catalog to project from) and more clearly necessary. W-10 is that workstream.

4. **Which layer owns the role model — RLS or the resolver?** *Unchanged and now sharper.* Phase 0 made
   `role_definitions` reliably seeded without touching RLS's `{owner, manager}` vocabulary, so the divergence in
   C10 is now *more* durable: every new org gets four role rows, none of which RLS knows about. With 534 of 559
   routes bypassing RLS, RLS is still neither the enforcement layer nor a coherent backstop.

Three methodological warnings for whatever this phase hands forward:

- **Reachability of a permission set is not enforcement of it.** Unchanged, and still worth ~30× over-reporting
  (C1).
- **Grep-level gate detection under-reports gates as well as over-reporting permissions.** G2 claimed six
  exposed routes; three were gated by a bespoke helper the token list did not name (§3.1). W-15's ~500-route
  sweep will hit this at scale, in the direction that produces false alarm rather than false comfort — but it
  will also burn the sweep's credibility if uncorrected.
- **Check that a plan's premises still hold at execution time.** C12 exists because Wave 1 reasoned from
  catalog and FK facts that the migration shipping beside it had already changed. Both halves were individually
  careful; nothing reconciled them.

---

## 9. Validation performed

Static inspection only, consistent with the assignment's read-only scope. No test suite, typecheck, or build was
executed by this phase, and no dev server was started. Every current-state citation in §§0–6 was opened and read
in this worktree at `7572bc65a`; the four census figures in §4 were produced by the commands in §6.

---
---

# Part II — Security threat & enforcement matrix

> **Required output #7**, and the last of the brief's twelve to be delivered.
> `00-mission-intake-and-coverage.md:113` recorded it as **Partial** on the grounds that a threat model was
> *"an explicit non-goal of the brief"*; `02…:657` and `:1186` restate that non-goal in both of their limits
> sections. **Mission 2 re-scopes it in** — this phase is the operator exercising the option
> `00…:234` reserved (*"Decide whether output #7 stays a non-goal"*). It is answered affirmatively here.
>
> This part **reuses the accepted corpus as input and does not re-derive it.** Every finding already carried
> by `01…` Part I, `02…`, `04…` or `05…` is cited to its owner and marked **[carried]**. What is new is the
> *threat* frame: who the adversary is, which boundary they cross, which control is supposed to stop them,
> and what that control actually does today. Claims marked **[verified this pass]** were opened and read in
> this worktree at `a4b6e424f`.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Security threat and enforcement matrix* · assignment `asg_47e1c0dee2c5e0`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `a4b6e424f`
**Date** 2026-08-03
**Method** static, file-grounded. No request was issued, no browser used, no database queried. **Nothing below
is a demonstrated vulnerability** (§23).

---

## 10. Headline — the unauthenticated surface is the best-defended part of this platform

The corpus has spent four documents establishing that operator authority is weakly enforced. Putting a threat
frame over it produces one finding that none of them could state, because none of them looked at the
public edge:

> **Alloy's 16 unauthenticated route files implement, correctly, every control the 543 authenticated ones
> lack.** The public delegated-link surface uses 256-bit CSPRNG tokens hashed at rest
> (`formPublicLinkToken.ts:5`, `tokenHash.ts:5`), honours revocation and expiry on every resolve
> (`resolvePublicFormLink.ts:53-62`), scopes every subsequent query to the org the token itself names
> (`:67-68`, `:90`, `:105`), and verifies webhook signatures before acting (`resend/route.ts:69-76`;
> `twilioSmsStatusWebhook.ts:129-143`). **All [verified this pass].**
>
> The authenticated operator surface, by contrast, cannot revoke a credential at all (`04…` A2-1), serves a
> revoked principal for up to 120 seconds after telling the operator the revocation succeeded (`02…` M2-10),
> and admits any principal holding any non-empty role string to 131 of 132 admin pages
> (`adminV2/layout.tsx:23-31` **[verified this pass]**; `05…§3.2`).

**A public link can be switched off. An administrator cannot.** That inversion is the organising fact of this
matrix, and it is not a rhetorical device — it is the same control (`is_active`) implemented on both sides,
enforced on one and ignored on the other (`resolvePublicFormLink.ts:53` vs `02…` M2-3).

Three consequences for V2, stated once and not repeated per-threat:

1. **The controls are not missing from this codebase — they are missing from the authority path.** The
   platform demonstrably knows how to hash a secret, honour a revocation flag, bound a query by tenant, and
   verify a signature. V2 is not a greenfield security build; it is applying an existing internal standard to
   the surface that skipped it.
2. **The sharpest threats are post-authorization, not pre-authentication.** T-1 … T-4 all assume the attacker
   has, or recently had, a legitimate credential. That is the threat profile of an internal operations
   platform, and it is exactly the profile the current controls are weakest against.
3. **Severity here is structural, never demonstrated.** See §11 for what the ratings do and do not mean.

---

## 11. Method — what this matrix asserts, and what it cannot

A threat entry is `(actor, boundary, asset, intended control, actual control, residual)`. The *intended
control* is what the codebase or corpus says should stop the threat; the *actual control* is what was read in
this pass. A threat is recorded when those two differ, **or** when they agree and the control holds — §14
includes the controls that pass, because a matrix that only lists failures cannot be used to judge coverage.

**Severity scale.** Ratings describe the authority a successful actor would hold, not the ease of reaching
that position. No exploitation was attempted.

| | Meaning |
|---|---|
| **S1 — critical** | A principal acts with authority the platform has been told to remove, or a session-holder takes permanent ownership of an account. |
| **S2 — high** | Authority is broader than any operator can intend, and **no product control narrows it**. |
| **S3 — medium** | Bounded impact, or requires a privileged position / unusual write path. |
| **S4 — low** | Bounded disclosure, abuse-control gaps, hygiene. |
| **S? — undeterminable** | The repository does not contain the facts needed to rate it. Recorded as a must-verify, not a defect. |

**What this cannot assert.** Every limit in `05…§9` applies unchanged and is not restated per-row: counts are
file-level not handler-level, "ungated" was never established as a number, "inert" is an occurrence claim, and
grep cannot see intent. A threat rated S1 here is a statement about code structure, not a claim that any org
has been compromised.

---

## 12. Trust boundaries

Seven boundaries, ordered outermost-in. The **enforcement state** column is the finding; §14 hangs threats off it.

| # | Boundary | What is supposed to cross only under a check | Enforcement state |
|---|---|---|---|
| **B1** | Internet → **edge** | An unauthenticated request reaching a privileged handler | **Not enforced for `/api/*`.** `middleware.ts:123-125` returns the response ungated unless `requiresOperatorSession(pathname)`, which is true only for operator-admin and canonical-settings *page* paths (`operatorSessionGate.ts:16-22`) **[verified this pass]**. Enforced for operator page routes. |
| **B2** | Edge → **route handler** | An authenticated principal invoking a command they may not run | **Convention, not a layer.** ≥11 gate families, no default, no declaration mechanism (`05…§6.2`) **[carried]**. |
| **B3** | Handler → **database** | A query executing with more authority than the caller | **Bypassed by default.** 534 of 559 route files hold a service-role client (§3.6) **[carried]**. |
| **B4** | Database **RLS** | A row read or written outside policy | **Not a backstop, and its vocabulary has leaked outward.** Policies authorize `owner`/`manager`, which no migration seeds (C10); those literals now appear in application gates (`02…` M2-6) **[carried]**. |
| **B5** | **Tenant** (`org_id`) | Data or commands crossing orgs | **Structurally present, two known holes.** Everything carries `org_id` (I-6 **met**); org *selection* is a lexicographic `sort()[0]` (I-7 **open**, `resolveAdminAccessCore.ts:32`); one credential command takes an unbounded target (`04…` A2-3) **[carried]**. |
| **B6** | **Delegated link** (public token) | An unauthenticated party acting on tenant data | **Enforced.** Token entropy, hashing at rest, revocation, expiry, org derivation from the token row — all verified (§14 T-14) **[verified this pass]**. |
| **B7** | Server → **client bundle** | Authority state the client must not be trusted with | **Enforced by omission, accidentally.** `AdminV2RootAuthProvider` receives `role` and `roleKeys` but **no `permissionKeys`** (`adminV2/layout.tsx:41-44` **[verified this pass]**; `05…§3.2`). The client cannot leak a capability set it was never given — but for the same reason it cannot filter navigation on one (T-8). |

**B1 in detail.** The matcher (`middleware.ts:137-140`) matches essentially everything, and `getUser()` runs at
`:117` *before* the `requiresOperatorSession` branch at `:123`. So the edge **authenticates every request and
then enforces on almost none of them** — it establishes the fact and discards it for the entire API surface.
Two webhook paths short-circuit even earlier (`:40-45`), correctly and deliberately.

---

## 13. Assets

Ordered by what an attacker gains, not by data volume.

| # | Asset | Why it is the target |
|---|---|---|
| **A1** | **The authority graph itself** — `user_roles`, `role_definitions`, `role_permission_grants`, the three scope tables | Write access here converts a single compromise into durable, self-renewing authority. Mutating routes for all four are gated by `settings.users_roles` (`05…§2.1`), which the default seed grants to `ops` (`02…` D9). |
| **A2** | **Credentials** — `auth.users` | Cannot be disabled by any product code path (`04…` A2-1). Compromise is therefore not recoverable through the product. |
| **A3** | **Tenant operational data** — families, children, opportunities, documents, communications | The business asset. Protected by B3/B5 only, since B4 is bypassed on 95.5% of routes. |
| **A4** | **Money and pricing** — payments, tuition rates | `POST /api/admin/commercial/tuition-rates` is authorized by org membership alone, with the service-role client (`05…§5`) **[carried]** — the sharpest single command in the corpus. |
| **A5** | **The configuration substrate** — forms, field definitions, business processes, permission grants | Changing configuration changes what every later enforcement decision resolves to. |
| **A6** | **Operator trust in the product's own statements** | Non-obvious and load-bearing: three separate mechanisms tell an operator that access was removed when it was not (T-2, T-6, `06…` IA-6). An access product whose reports are wrong is a security defect, not a UX one. |

---

## 14. Threat register

Eighteen entries. **T-14 … T-16 are controls that hold** and are recorded as such.

> **The register continues in Part V.** `T-19 … T-26` (§47) and `H1 … H3` (§48) were added on operator
> reopen and extend this table; `S-8 … S-14` (§51) extend §17. Nothing in §§10–23 was revised — read this
> part first, then §§45–57 for the layer-depth and role-editor frame.

| # | Threat | Actor | Boundary | Asset | Sev | Intended control | Actual control | Evidence |
|---|---|---|---|---|:--:|---|---|---|
| **T-1** | **Act after revocation.** A removed or demoted principal keeps full authority for up to 120 s per process, after the operator is told removal succeeded | Ex-principal | B2 | A1, A3, A6 | **S1** | Revocation effective on next request | `adminShellContextCache` is read unconditionally, written only for portal-eligible principals, and `invalidateAdminShellContextCache` has **zero** production callers | `02…` M2-10 **[carried]** |
| **T-2** | **Session possession → permanent account ownership.** Any live session may re-key the credential with no current-password proof and no step-up; the platform cannot then disable the credential | Session thief, shared/lost device | B2 | A2 | **S1** | Step-up on credential change; revocation | `/reset-password` admits on *any* session (`:22-27`) and calls `updateUser({password})` (`:50`); no disable verb exists anywhere | `04…` A2-4, A2-1 **[carried]** |
| **T-3** | **Lateral privilege escalation via delegation.** A `settings.users_roles` holder sets another principal to `admin`; two such holders elevate each other | Insider operator | B2 | A1 | **S2** | Delegation ceiling (subset rule) | Self-elevation banned (W-2); **no ceiling on other principals** — only "is the target role an active row" | §3.2; `02…` D3/W-18 **[carried]** |
| **T-4** | **`ops` is `admin`.** In any default-seeded org, `ops` holds `settings.users_roles` and can invite, re-role, create roles and rewrite grants; the two keys the seed withholds are read nowhere | Insider operator | B2 | A1 | **S2** | Seed expresses a privilege gradient | `admin.users.write` / `admin.roles.write` have **zero** repo matches | `02…` M2-4 / D9 **[carried]** |
| **T-5** | **Fail-open scope on every membership the product creates.** No access-profile row is written on create; an absent profile means unrestricted department *and* site scope | Any new operator | B2 | A3 | **S2** | Absent scope denies (I-19) | `users/route.ts:102-111` writes `user_roles` only | §3.5 (G4) **[carried]** |
| **T-6** | **Revocation theatre.** An operator sets a capability to *None* and nothing changes: 11 of 18 grantable keys are inert, and **no** grant constrains any surface | — (control failure) | B2 | A6 | **S2** | Grant governs access | "Constrains the surface?" is *No* nine times out of nine; 4 of 9 grid rows inert in both columns | `05…§2.1`, `§4` **[carried]** |
| **T-7** | **Any role reaches every operator surface.** The whole admin tree admits on *authenticated + non-empty `role`* | Any principal with any membership | B2, B7 | A3, A5 | **S2** | Surface declares and enforces a capability | `adminV2/layout.tsx:23-31`; 1 of 132 pages gated finer, and that one is a display prop | **[verified this pass]**; `05…§3.2-3.3` |
| **T-8** | **Command authority is a property of transport, not of the command.** The action registry carries no authorization metadata; executor and eligibility contain zero authorization terms | Insider; misplacement bug | B2 | A3, A4 | **S2** | Every registered command verifies independently of UI placement (brief) | Two placements reaching different routes get different enforcement | `05…§6.3` **[carried]** |
| **T-9** | **Read failure widens scope to `all`.** The scope read is the only resolver read whose error is discarded; its failure default is maximal | Transient DB fault | B2 | A3 | **S2** | Every read error denies | `resolveAdminAccessCore.ts:145-161` does not destructure `error` | `02…` M2-12 **[carried]** |
| **T-10** | **Unauthenticated command execution.** The edge never gates `/api/*`; a handler is protected only if its author opted in, and coverage is not statically establishable | Internet | B1, B2 | A3, A4 | **S2** | Default-deny at one admission point | 11 gate families, no default; `05…§9` declines to state an ungated count | **[verified this pass]** + `05…§6.1` |
| **T-11** | **Role-literal forgery through unconstrained writers.** `user_roles.role` has no FK; four role vocabularies exist; enforcing and preview resolvers normalize differently | Seed / import / SQL writer | B2, B4 | A1 | **S3** | One role vocabulary (I-8) | Grants doubly constrained, membership unconstrained; `"admin "` resolves differently in the two paths | `02…` M2-2, M2-8, M2-11 **[carried]** |
| **T-12** | **Cross-tenant credential-mail primitive.** `POST /api/admin/send-password-reset` takes an arbitrary email with no membership lookup, gated on the legacy literal `ctx.role !== "admin"` | Insider operator | B5 | A2 | **S3** | Credential commands bounded by caller's org | Target is a raw body string; no tenancy bound | `04…` A2-3 **[carried]** |
| **T-13** | **Authority write is not atomic; failure locks the principal out.** Role reassignment is `delete` then `insert`, untransacted | Transient fault | B2 | A1 | **S3** | Authority writes are atomic | A failed insert leaves **zero** memberships | `02…` M2-14 **[carried]** |
| **T-14** | **Delegated-link brute force / replay** | Internet | B6 | A3, A5 | **S4** | Unguessable, hashed, revocable, expiring, tenant-bound token | **HOLDS** — see §14.1 | **[verified this pass]** |
| **T-15** | **Webhook forgery** (fake delivery status → wrong communication state) | Internet | B1, B6 | A3 | **S4** | Signature verification before side effects | **HOLDS** — Svix `verify` (Resend), Twilio signature → 403 | **[verified this pass]** |
| **T-16** | **Tenant confusion on the public surface** | Misconfiguration | B5, B6 | A5 | **S4** | Tenant derived from the request | **PARTIAL** — token routes derive org from the token row (holds); two config routes bind org to the deploy-wide env var `ALLOY_PUBLIC_ORG_ID` | **[verified this pass]** |
| **T-17** | **Abuse control is best-effort and unevenly applied.** Per-process rate limiting on the tour family only; **none** on the public forms family; and no authentication rate limit, attempt counter or lockout anywhere | Internet | B1, B6 | A2, A3 | **S3** | Abuse control is a security control | `tourPublicRateLimit.ts:7,14`; `04…` A2-1 finds zero auth rate-limiting | **[verified this pass]** + **[carried]** |
| **T-18** | **Identity-verification strength is not knowable from the repository.** Request identity may resolve from a JWT-claims fast path whose verification depends on unversioned hosted signing-key configuration | — | B1, B2 | A2 | **S?** | Verification mode is an asserted, tested property | `cachedAuthSession.ts:22-27` prefers claims; `supabase/config.toml` absent | `04…` A2-5 **[carried]** |

### 14.1 T-14 in detail — the control that holds, and why it matters most

This is the only end-to-end authorization path in the platform that this pass could not fault. Recorded in
full because **it is the internal standard V2 should be held to**, and because it closes **I-4**, which the
accepted register has carried as *"not re-verified"* since acceptance (`02…:448`).

| Property | Implementation | Line |
|---|---|---|
| Unguessable | `randomBytes(32).toString("base64url")` — 256 bits of CSPRNG | `formPublicLinkToken.ts:5` |
| Hashed at rest | `createHash("sha256")`; lookup is `.eq("token_hash", …)`, never a plaintext compare | `tokenHash.ts:5`; `resolvePublicFormLink.ts:29,35` |
| Constant-time compare available | `timingSafeEqualHex` | `tokenHash.ts:9-18` |
| **Revocable** | `if (!row.is_active) → INACTIVE` | `resolvePublicFormLink.ts:53-55` |
| **Expiring** | `expires_at` compared to now → `EXPIRED` | `:57-62` |
| Tenant-bound | org taken from the token's own row and applied to **every** subsequent query | `:67-68`, `:90`, `:105` |
| Fails closed on read error | `if (error || !link) → NOT_FOUND` | `:38-40` |
| Non-enumerating | one `NOT_FOUND` for unknown, malformed and absent | `:39` |

All **[verified this pass]**. Two residuals, both rated S4 and neither changing the conclusion:

- **The token is not *entirely* hashed at rest.** Each mint also stores `token_prefix` — the first 12
  characters of the plaintext (`admin/forms/[formId]/public-links/route.ts:287`, and identically in three
  other mint sites). That discloses ~72 bits to anyone who can already read the table, leaving ~184 bits
  unguessable. Not a practical weakness; it is recorded because a strict *"tokens are hashed at rest"*
  invariant would not permit it, and V2 should decide which statement it is making.
- **`timingSafeEqualHex` is defined and used nowhere on this path.** Correctly so — an indexed equality
  lookup on a hash has no comparison to time — but a reader may conclude a constant-time compare is in force
  when the actual defence is the lookup shape.

### 14.2 T-16 in detail — public tenancy is a deploy-time constant

`GET /api/public/field-definitions` and `GET /api/public/booking-config` run with the service-role client and
take their org from `process.env.ALLOY_PUBLIC_ORG_ID` (`field-definitions/route.ts:17,40`;
`booking-config/route.ts:25-26`) **[verified this pass]**. The org is therefore **not attacker-controllable**
— which is why this is S4 and not a cross-tenant read. It is recorded because:

1. **The public surface is single-tenant by environment variable.** Exactly one org can have one, and which
   one is a deploy decision invisible to every operator. This does not survive contact with multi-tenant
   hosting, and it is the only tenancy mechanism in the platform that is not a request property.
2. **The visibility predicate is applied asymmetrically.** `field_definitions` is filtered by
   `is_visible_in_public_booking = true` (`:57`); the `field_section_definitions` query beside it has **no
   such predicate** (`:44-48`), so every section label and description for that entity type is returned to
   an unauthenticated caller, including sections containing no public fields. Bounded configuration-vocabulary
   disclosure — S4, and a one-line fix.
3. **Raw exception messages reach unauthenticated callers** (`field-definitions/route.ts:133`;
   `booking-config/route.ts:129`). The same codebase deliberately suppresses provider errors on
   `send-password-reset` to prevent enumeration (`04…` A2-3). The discipline exists; it is unevenly applied
   — the same asymmetry `04…` I-33 records on the sign-in path.

### 14.3 T-17 in detail — the two in-memory maps

The platform holds exactly two security-relevant in-process `Map`s, and **both are per-process, and both fail
in the permissive direction**:

| Map | Purpose | Failure mode |
|---|---|---|
| `adminShellContextCache` | authority cache | a revoked principal stays authorized (T-1) |
| `tourPublicRateLimit` `hits` | abuse control | limits do not compose across instances — its own comment says *"serverless: not global across instances"* (`:7`) **[verified this pass]** |

A second, sharper property of the rate limiter: the bucket key is `kind:ip:hash(token)`
(`tourPublicRateLimit.ts:24-28`) **[verified this pass]**, so **each candidate token gets a fresh bucket**. It
does not rate-limit token guessing at all; it limits abuse of a token already known. Given T-14's 256-bit
tokens that is the right trade and no exposure follows — but the control does not do what its name implies,
and the public **forms** family has no limiter at all (`rg -ln takeTourPublicRateLimit web/app/api/public` →
the three tour routes `resolve`, `slots`, `book`, and nothing else) **[verified this pass]**.

---

## 15. The enforcement matrix

Controls × boundaries. **Y** enforced · **P** partial · **N** absent · **—** not applicable.

| Control | B1 edge | B2 handler | B3 db client | B4 RLS | B5 tenant | B6 public link | B7 client |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Authentication required | **P** — pages only | **P** — per handler | — | — | — | **—** by design | — |
| Default-deny for undeclared routes | **N** | **N** | — | — | — | **Y** | — |
| Authorization by capability | — | **P** — 7 of 32 keys, 13 of 559 routes | — | **N** | — | **—** | **N** |
| Surface gated on capability | — | **N** — 1 of 132 | — | — | — | — | **N** |
| Tenant isolation | — | **P** | **N** — service role bypasses | **N** in practice | **P** — I-6 met, I-7 open | **Y** | — |
| Scope (department / site) | — | **P** — site only, never set on create | — | **N** | — | — | — |
| Revocation effective | — | **N** — 120 s window, no verb | — | — | — | **Y** — `is_active` | — |
| Credential lifecycle (disable) | — | **N** — no such call exists | — | — | **N** — unbounded target | — | — |
| Step-up on credential change | — | **N** | — | — | — | — | — |
| Secret hashed at rest | — | — | — | — | — | **Y** — SHA-256 | — |
| Signature verification | **Y** — webhooks | — | — | — | — | **Y** | — |
| Abuse control / rate limit | **N** | **N** | — | — | — | **P** — tour only, per-process | — |
| Fail-closed on read error | — | **P** — 3 of 4 reads | — | — | — | **Y** | — |
| Atomic authority write | — | **N** | — | — | — | — | — |
| Audit of authority change | — | *not assessed* (§23) | — | — | — | — | — |

**Read the two columns against each other.** B6 — the boundary facing the open internet, with no session, no
role and no membership — is the only column without an **N**. B2, which every operator command crosses, has
seven.

---

## 16. Threat → invariant → workstream

Binds each threat to the invariant it violates and the `03-implementation-qa-sequence.md` workstream that
closes it. **Threats with no workstream are the gap this deliverable adds.**

| Threat | Invariant | Workstream | Decision gate |
|---|---|---|---|
| T-1 | I-25, I-29ᴬ, P4/P5 | **none** — post-dates the wave map | **D11** |
| T-2 | I-29ᴮ, I-30ᴮ | **none** | **D5–D8** (`04…§7`) |
| T-3 | I-11 | **W-18** | **D3** |
| T-4 | I-11, I-13 | **W-12** (partial) | **D9** |
| T-5 | I-18, I-19 | **W-5**, **W-6**, **W-7** | — |
| T-6 | I-13, I-14 | **W-10**, **W-11** | — |
| T-7 | I-16, I-17 | **W-13**, **W-14** | **D2** |
| T-8 | I-24 | **W-14**, **W-15** | — |
| T-9 | I-19, I-30ᴬ | **none** | — |
| T-10 | I-23 | **W-14**, **W-15** | — |
| T-11 | I-8, I-28ᴬ | **W-16** | — |
| T-12 | I-28ᴮ | **none** | — |
| T-13 | I-31ᴬ | **none** | — |
| T-14 | **I-4 — now verified met** | — | — |
| T-15 | — (**S-1**, new) | **none** | — |
| T-16 | I-6 | **none** | **D13** (new, §19) |
| T-17 | — (**S-2**, new) | **none** | **D14** (new, §19) |
| T-18 | I-31ᴮ | **none** | — |

ᴬ/ᴮ superscripts disambiguate the colliding invariant numbers — see §18.

**Nine of eighteen threats have no workstream**, including both S1 entries. That is expected rather than
alarming: `03…` was sequenced before Part II of `02…` and before `04…` existed, so its wave map cannot
contain what those documents found. It is recorded because **`03…` is currently the corpus's only delivery
plan, and a reader would reasonably assume it covers the register.** It does not, and the two most severe
threats in this matrix are outside it.

---

## 17. New security invariants

Numbered **S-n**, deliberately outside the `I-n` space — see §18 for why that space is currently unsafe to
extend. Each is mechanically checkable.

> **S-1.** Any endpoint that accepts a request from an unauthenticated party and produces a side effect MUST
> authenticate the *sender* before the side effect — by signature, by hashed token, or by an explicit,
> reviewed exemption. **Held today** by both webhook families and the delegated-link family; V2 must make it a
> property, not a pattern. *Check:* enumerate routes reachable without a session; assert each verifies a
> signature, resolves a hashed token, or appears in a reviewed exemption list.

> **S-2.** Abuse control MUST be a declared property of a route, not an ad-hoc helper, and MUST NOT rely on
> per-process state where the deployment runs more than one process. *Check:* assert every unauthenticated
> route declares a limit; assert no limiter's backing store is a module-level `Map`.

> **S-3.** A secret presented by a client MUST be stored only as a one-way hash. Any stored plaintext
> fragment (prefix, tail, label) MUST be declared, bounded, and justified against the remaining entropy.
> *Check:* static — no column receiving a mint-time plaintext slice may exist without a declaration.

> **S-4.** An unauthenticated response MUST NOT contain provider or exception strings. *Check:* static — no
> `catch` on a publicly reachable route may serialize `e.message`. Fails today at
> `field-definitions/route.ts:133` and `booking-config/route.ts:129`.

> **S-5.** A visibility predicate that governs one public projection MUST govern every projection in the same
> response. *Check:* the sections/fields asymmetry in `field-definitions/route.ts:44-48` vs `:57`.

> **S-6.** Tenancy MUST be a property of the request — derived from a session, a membership, or a token row —
> and MUST NOT be read from deploy-wide environment configuration. *Check:* static — no request handler reads
> an org identifier from `process.env`.

> **S-7.** Every control this matrix records as **holding** MUST have a regression lock before V2 ships. The
> public surface is currently the platform's best-implemented boundary **and its least-tested one**; nothing
> prevents it degrading to match the operator surface.

S-7 is the one most likely to be skipped and the one whose absence would be least visible.

---

## 18. X-1 — the invariant register has collided, and the corpus cannot currently be cited by number

**Recorded as a corpus-integrity defect, not a security threat.** `04-authentication-model.md:425` states it
is *"continuing the register in `02…:425-466` (I-1 … I-27)"* and defines **I-28 … I-34** (`:429-435`). That was
correct when written: at `HEAD`, `02…` defines only I-26 and I-27 **[verified this pass]**. But `02…` Part II
— present in the working tree — adds its own **I-28 … I-31** (`02…:472-475`).

| Number | `02…` Part II | `04…` §6.3 |
|---|---|---|
| **I-28** | One normalization, applied at the boundary | A credential command MUST be bounded by the caller's org |
| **I-29** | Revocation is effective on the next request | A password change MUST require step-up |
| **I-30** | Every resolver read error denies | Retiring a principal MUST revoke |
| **I-31** | Authority writes are atomic | Request-identity verification mode MUST be asserted |

**Four numbers, eight invariants.** This matters concretely: `03…` binds workstreams to invariant IDs and
§13 of that document defines regression locks the same way. A lock written against "I-29" is currently
ambiguous between *revocation latency* and *password step-up* — two different tests, in two different waves.

**The cause is the failure mode this corpus has already named twice.** C12 exists because Wave 1 reasoned from
catalog facts that a migration shipping beside it had changed; §8's third methodological warning is *"check
that a plan's premises still hold at execution time."* Here `04…` reasoned from a register that grew in an
uncommitted sibling edit. Both halves were individually careful; nothing reconciled them — **the same sentence
that closed §8 applies to the corpus's own numbering.**

This deliverable therefore uses `S-n`, and §16 disambiguates with ᴬ (`02…`) / ᴮ (`04…`). **Renumbering is a
Director decision, not a worker one** — the IDs are cited across four documents — so it is escalated rather
than performed.

---

## 19. Decisions this matrix raises

D1–D4 and D9–D12 carry forward unchanged; D5–D8 remain with `04…§7`. Two are new. Neither is worker-resolvable.

**D13 — Is the unauthenticated public surface inside the platform's tenancy model, or beside it?**
Token-gated public routes derive org from the token row and are correct under any tenancy model. Two config
routes bind org to `ALLOY_PUBLIC_ORG_ID`, a deploy-wide constant (§14.2). Either the public surface is
single-tenant by design — in which case the product should say so and the constraint should be visible to
operators — or it is multi-tenant, and those two routes need a request-derived org before a second tenant
gets a public booking surface.
*Recommendation:* **inside the model.** Derive the org from the request host, a public-surface token, or an
explicit path segment, and delete the environment coupling. The change is small **now** and becomes a
migration once a second tenant has a public surface. S-6 is the invariant form.

**D14 — Is abuse control a security control in this platform?**
Today: no authentication rate limit, no attempt counter, no lockout (`04…` A2-1); per-process best-effort
limiting on 2 of 16 public route files; nothing on the authenticated surface. The platform has no stated
position, so no one can be wrong.
*Recommendation:* **yes, for credential and unauthenticated surfaces; explicitly out of scope elsewhere,
in writing.** The asymmetry to fix first is that Alloy can mail a password-reset link to an arbitrary address
(T-12) with no rate limit and no membership check — a mail primitive with neither a tenancy bound nor a
volume bound. That combination, not either half, is what makes it worth deciding now.

---

## 20. Bearing on the brief's rejection conditions

Extends `05…§8` with the threat frame; the three rows there stand **[carried]**.

| Rejection condition | Status | Evidence |
|---|---|---|
| *"A permission exists but is not connected to a meaningful operator concept."* | **Triggered** | T-6 |
| *"A UI checkbox is added without enforcement evidence."* | **Triggered** | T-6, T-8 |
| *"Blocked from seeing the Billing workspace while still calling a billing API."* | **Triggered, in a stronger form** | T-7 + `05…§5` |
| *"Every registered command verifies authorization independently of UI placement."* | **Not met** | T-8 |
| *(implied by the brief's security ask)* **Revocation takes effect** | **Not met — twice** | T-1 (120 s window), T-2 (no credential disable) |

The last row is the one this deliverable adds, and it is the one an operator would judge the product on: **an
access-control product in which "remove this person" does not remove them fails at its stated purpose**,
independently of any attacker.

---

## 21. Reproduce

```bash
# §12 B1 — the edge authenticates every request and gates almost none
rg -n 'requiresOperatorSession|getUser\(\)|matcher' web/middleware.ts          # :117 before :123
rg -n 'isOperatorAdminPath|isCanonicalSettingsPath' web/lib/admin/operatorSessionGate.ts

# §12 B6 — the unauthenticated surface, enumerated (16 route files)
find web/app/api/public web/app/api/webhooks web/app/api/action-links web/app/api/marketing -name route.ts | sort

# §14.1 T-14 — delegated-link token properties (closes I-4)
rg -n 'randomBytes|base64url'            web/lib/admin/forms/formPublicLinkToken.ts
rg -n 'createHash|timingSafeEqual'       web/lib/public/forms/tokenHash.ts
rg -n 'is_active|expires_at|token_hash'  web/lib/public/forms/resolvePublicFormLink.ts
rg -n 'token_prefix'                     web/app/api/admin/forms/\[formId\]/public-links/route.ts

# §14 T-15 — webhook signature verification (both families)
rg -n 'svix-signature|Webhook|verify'    web/app/api/webhooks/resend/route.ts
rg -n 'verifyTwilioRequestSignature|403' web/lib/communications/twilioSmsStatusWebhook.ts

# §14.2 T-16 — public tenancy is an env constant; visibility predicate asymmetry; raw errors
rg -n 'ALLOY_PUBLIC_ORG_ID|createServiceRoleClient|e.message' \
  web/app/api/public/field-definitions/route.ts web/app/api/public/booking-config/route.ts
rg -n 'is_visible_in_public_booking' web/app/api/public/field-definitions/route.ts   # 1 hit — fields only

# §14.3 T-17 — per-process limiter, keyed per token, tour family only
rg -n 'new Map|not global across instances|ip.*tag' web/lib/tours/public/tourPublicRateLimit.ts
rg -ln 'takeTourPublicRateLimit' web/app/api/public                                  # 3 files, all tour-booking

# §14 T-7 — the whole admin tree admits on "has a role"
rg -n 'auth.role|redirect' web/app/adminV2/layout.tsx                                # :23-31
rg -n 'permissionKeys' web/app/adminV2/layout.tsx                                    # none passed to the client

# §18 X-1 — the invariant-number collision
rg -n '^\| \*\*I-(2[6-9]|3[0-4])\*\*' docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md
rg -n '^\| \*\*I-(2[6-9]|3[0-4])\*\*' docs/platform/planning/vacilando-os/qa/access-identity-v2/04-authentication-model.md
git show HEAD:docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md | rg -n 'I-2[6-9]|I-3[0-9]'
```

---

## 22. Limits — read before citing

1. **No threat here was demonstrated.** No request was issued, authenticated or otherwise; no browser, no
   database, no test suite, no typecheck, no build. Every severity is a structural rating (§11). **Nothing in
   §14 is a claim that any deployed environment has been compromised.**
2. **Carried findings are re-framed, not re-verified.** T-1 … T-6, T-8, T-9, T-11 … T-13 and T-18 are owned by
   `01…` Part I, `02…`, `04…` and `05…`; their line citations were **not** re-opened in this pass except where
   marked **[verified this pass]**. The threat framing is new; the underlying facts are theirs.
3. **The public surface was assessed at the route files listed in §21, not exhaustively.** `05…§9` records
   public routes as unassessed; this pass closes that for the **16 files** under `public/`, `webhooks/`,
   `action-links/` and `marketing/`. The three `action-links/*` handlers were **enumerated but not read** —
   their token discipline is **not** established here and must not be assumed to match T-14.
4. **T-14 verifies the *forms* delegated-link family.** Tour-booking links mint through the same helpers
   (`tours/public-booking-links/route.ts:45-47` **[verified this pass]**), so the token properties carry; their
   resolve path was **not** read. `04…`'s I-4 is closed for the forms family only.
5. **Audit was not assessed** (§15 row). Whether an authority change is durably recorded, and whether that
   record is tamper-evident, is a genuine threat-matrix column that this pass did not open. `06…§3.3` reports
   one store with three views; nothing here evaluates it as a security control.
6. **RLS policy text was not reviewed.** B4's rating is inherited from C10 and `02…` M2-6 **[carried]**. An
   actual policy-by-policy review remains undone and is the one boundary in §12 rated from secondary evidence.
7. **No cryptographic review.** SHA-256-on-256-bit-CSPRNG is judged adequate by construction; no primitive,
   library version, or provider configuration was audited. T-18 is the standing example of what this
   repository cannot answer about itself.
8. **The threat/workstream mapping in §16 reads `03…` as written.** Whether a workstream *would* close a
   threat is a judgment from its description, not from an implementation.
9. **Read-only.** No source, schema, migration, or UI was modified. The only file written by this phase is
   this document; the frozen QA copies are untouched (`PRODUCT-SOURCE.md`).

---

## 23. Provenance — Part II

- **Inputs (reused, not re-derived):** Part I of this file; `02-canonical-access-identity-model.md`
  (Parts I and II — invariants, M2-1 … M2-15, D1–D12); `04-authentication-model.md` (A2-1 … A2-7, I-28…I-34,
  D5–D8); `05-command-enforcement-census.md` (capability, surface and command catalogs, gate families,
  action registry); `06-product-ia-and-flows.md` (IA-6 for the operator-facing revocation claim);
  `00-mission-intake-and-coverage.md` §3 row 7 and §8 item 4 — the scope authority for this deliverable.
- **Read in full this pass:** `web/middleware.ts`, `web/lib/admin/operatorSessionGate.ts`,
  `web/lib/public/forms/resolvePublicFormLink.ts`, `web/lib/public/forms/resolvePublicFormEmbedContext.ts`,
  `web/lib/public/forms/tokenHash.ts`, `web/lib/admin/forms/formPublicLinkToken.ts`,
  `web/lib/tours/public/tourPublicRateLimit.ts`, `web/app/api/public/field-definitions/route.ts`,
  `web/app/api/webhooks/twilio/sms-status/route.ts`,
  `web/app/api/webhooks/twilio/sms-status/[binding_id]/route.ts`.
- **Read in part:** `web/app/adminV2/layout.tsx:18-47`, `web/app/api/webhooks/resend/route.ts` (signature
  region), `web/lib/communications/twilioSmsStatusWebhook.ts` (signature region),
  `web/app/api/public/booking-config/route.ts` (env/tenancy and error regions),
  `web/app/api/admin/forms/[formId]/public-links/route.ts` (mint region),
  `web/app/api/admin/tours/public-booking-links/route.ts` (mint region).
- **Enumerated, not read:** the three `web/app/api/action-links/*` handlers (limit 3).
- **Repository-wide searches:** public-surface route enumeration; `plaintextToken` /
  `generateSecureFormLinkPlaintext` mint sites; `timingSafeEqualHex` consumers; `takeTourPublicRateLimit`
  consumers; webhook signature terms.
- **Corpus searches:** invariant-number occupancy in `02…` and `04…`, at `HEAD` and in the working tree (§18).
- **Verified at** `a4b6e424f` in `wt6-vacilando-os-product-def`.
- **No source, schema, migration, or UI changed by this phase.**

---
---

# Part III — Gap analysis

> **Required output #8.** `00-mission-intake-and-coverage.md:114` recorded it as **Covered** by pointing at
> two sections of two other documents (`01…` §4 and `02…` §13). That was a fair reading of a three-document
> corpus. It is no longer one: the corpus is now seven documents and roughly seventy findings in six
> identifier spaces, and **no artifact reconciles them**. This phase delivers output #8 as its own artifact.
>
> **This part reuses the corpus as input and does not re-derive it.** Every constituent finding is cited to
> its owning document and marked **[carried]**. What is new is the *reconciliation*: one register, one
> coverage judgement against the brief's own asks, and the delta between what the corpus knows and what the
> delivery plan contains. Claims marked **[verified this pass]** were established mechanically in this
> worktree at `cd24874cb` by the commands in §34.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Gap analysis* · assignment `asg_04bcdd312f0dec`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `cd24874cb`
**Date** 2026-08-03
**Method** documentary and static. No request issued, no browser, no database, no test suite. **No new
product defect is asserted here** — every defect below is owned by an earlier document (§35).

---

## 24. Headline — the gap is no longer in the product alone; it is between the corpus and its plan

A gap analysis written at acceptance would have compared *the product* to *the model*. That comparison is
now done four times over, in four documents. The comparison nobody has made is the one this deliverable
found first, and it is mechanical:

> **`03-implementation-qa-sequence.md` — the corpus's only delivery plan — names 17 finding IDs: `C1`…`C11`
> and `G1`…`G6`. It names *none* of the 53 finding IDs created since it was sequenced**
> (`M2-1…M2-15`, `A2-1…A2-7`, `IA-1…IA-10`, `T-1…T-18`, `C12`, `C13`, `X-1`) — zero matches, not few
> **[verified this pass]**.

That is not a criticism of `03`. It was sequenced on 2026-07-31 from Part I of `01…` and Part I of `02…`,
and its own §13.1 is careful to state that *"all 21 rows of phase 2's divergence register are assigned
above."* It was complete against the corpus that existed. Four documents have landed since, and **the plan
has not moved.**

Consolidating the corpus into **fourteen gaps** (§26) makes the consequence measurable:

| Plan coverage | Gaps | Which |
|---|---:|---|
| **Covered by a workstream** — partly shipped (`W-1`…`W-4`; `W-9`'s outcome via Phase 0), the rest sequenced | 3 | GAP-4, GAP-5, GAP-9 |
| **Partially covered** — the workstream predates the finding and would not close it as scoped | 5 | GAP-3, GAP-6, GAP-7, GAP-8, GAP-11 |
| **No workstream at all** | **5** | **GAP-1, GAP-2, GAP-10, GAP-12, GAP-14** |
| Needs none, by design | 1 | GAP-13 |
| | **14** | |

The five uncovered gaps are not the residue. They are:

1. **GAP-1 — revocation.** Both of Part II's **S1** threats live here. The platform cannot disable a
   credential at all, and a removed principal keeps full authority for up to 120 seconds *after the
   operator is told the removal succeeded*.
2. **GAP-2 — authentication.** The brief's single largest ask. `00…:133` called it *"the single largest
   hole"* at intake; `04…` then modelled it in full. **`03` predates `04` entirely, so not one line of the
   authentication build is sequenced.**
3. **GAP-12 — the product misinforms the operator.** Eight distinct mechanisms across five documents
   (§31). No document counts them, because each owns only its own one or two.
4. **GAP-10 — atomicity and audit.** Authority writes are non-transactional, and whether an authority
   change is durably recorded has **never been assessed by any document in this corpus**.
5. **GAP-14 — the corpus's own integrity.** Its invariant numbers have collided, its decision numbers have
   collided, four of its seven documents are absent from the folder its README calls canonical, and the
   delivery plan in that folder is 455 lines staler than the one in the evidence folder (§32).

**The one-sentence finding:** *the corpus has converged on what Access & Identity V2 must be, and its plan
still describes the subset of that understanding which existed on 31 July.* Closing this gap is a Director
act — re-sequencing `03` — not a worker act, which is why §26 binds gaps to proposed workstreams but does
not write them.

---

## 25. Method — what counts as a gap

A **gap** here is a difference between an **asked-for property** and the **as-built state**, where the ask
is traceable to the operator's brief, to the canonical model in `02…`, or to an invariant the corpus has
already adopted. Three consequences:

- **A defect is not automatically a gap.** `C12` (Phase 0 and Wave 1 closed `C5` incompatibly) is a real
  finding that closed a real defect; it appears here only through its residue, `C13`.
- **A gap can exist with no defect underneath it.** GAP-2 is almost entirely absence: nine of the brief's
  eleven authentication capabilities are not implemented badly, they are not implemented.
- **A gap survives its findings.** GAP-1 would remain open if every one of its eight constituent findings
  were fixed individually, because the missing thing is a *capability* — revocation — not a set of bugs.

**Seven classes**, used in §26's `Class` column:

| Class | Meaning | Archetype |
|---|---|---|
| **absence** | The capability does not exist in the codebase | No credential-disable call anywhere (`A2-1`) |
| **enforcement** | The control exists and is not applied on the authority path | 534 of 559 routes bypass RLS (`G6`) |
| **coherence** | Two mechanisms exist and disagree | Three resolvers (`M2-5`, `M2-13`) |
| **truthfulness** | The product asserts to an operator something untrue | Revocation reports success before it is effective (`IA-6`) |
| **plan** | A known finding has no workstream | §29 |
| **register** | Corpus integrity — IDs, locations, staleness | `X-1`, §32 |
| **knowledge** | The repository cannot answer the question | Verification mode (`A2-5`) |

**Severity** reuses Part II's structural scale (§11) where a gap has a threat entry, and is left `—` where
it does not. **No severity here is a demonstrated vulnerability**, and nothing in this part re-rates
anything: ratings are carried from §14.

**What this part deliberately does not do.** It does not re-sequence `03`, invent workstream numbers, or
resolve a decision. `03` owns sequencing and the mission's document-authority rule reserves synthesis to
the Director; §26's `Proposed` column is a recommendation to that owner, marked as such.

---

## 26. The consolidated gap register

Fourteen gaps. Every constituent finding in the corpus maps to exactly one, and the mapping is stated so
that "nothing was dropped" is checkable rather than asserted. `W-n` in **bold** is an existing workstream
from `03…§§4–9`; *italic* text in that column is this deliverable's proposal, not a plan entry.

| # | Gap | Constituent findings **[carried]** | Class | Sev | Workstream | Blocked on |
|---|---|---|---|:--:|---|---|
| **GAP-1** | **Revocation is not a capability this platform has.** A credential cannot be disabled; a removed principal is served for up to 120 s; deactivating a role revokes nothing; a session can re-key its own credential | `T-1`, `T-2`, `M2-3`, `M2-10`, `A2-1`, `A2-2`, `A2-4`, `IA-6` | absence · enforcement · truthfulness | **S1** | **none** — *proposed: a revocation wave* | `D6`≡`D10`, `D11`ᴬ, `D12`ᴮ |
| **GAP-2** | **Authentication is one method, unversioned, with no policy object.** 9 of the brief's 11 named capabilities absent or test-only; no rate limit, lockout, or step-up; no `config.toml` in version control | `04…§6.1`, `A2-5`, `T-17`, `T-18`, `IA-R10` | absence · knowledge | S3 / **S?** | **none** — `03` predates `04` | `D7`, `D8`, `D13`ᴮ, `D14` |
| **GAP-3** | **Scope fails open at every layer that touches it.** No profile row on create; an absent profile means `all`; a *failed read* also means `all`; and the UI renders both as "All locations" | `G4`, `T-5`, `M2-12`, `IA-3`, `IA-5` | enforcement · truthfulness | **S2** | **W-5**, **W-6**, **W-7** — *do not cover the read-error leg (`M2-12`) or the render leg (`IA-3`)* | — |
| **GAP-4** | **Admission is a role check, and no surface gates on a capability.** 131 of 132 admin pages admit on "has a non-empty role" | `C6`, `T-7`, `A2-6`, `05…§1`, `05…§3.3` | enforcement | **S2** | **W-13**, **W-14**, **W-15** | `D2` |
| **GAP-5** | **The capability vocabulary is largely decorative.** 32 seeded keys, 18 grantable, 11 of those consulted by nothing; the grid is an independent list, not a projection | `C4`, `C13`, `T-6`, `M2-9`, `05…§2`, `06…§5.5` | coherence · truthfulness | **S2** | **W-10**, **W-11**, **W-12** (**W-9**'s outcome shipped as Phase 0 — `03` does not record it) | — |
| **GAP-6** | **Four role vocabularies, one leaked from RLS into live application gates.** `user_roles.role` is unconstrained `text`; ≥13 sites decide authority on a role literal; `owner`/`manager` are checked in code and seeded by nothing | `C2`, `C10`, `M2-2`, `M2-6`, `M2-7`, `M2-8`, `T-11` | coherence | S3 | **W-16**, **W-19**, **W-11** — *`W-16` constrains the column; nothing removes the 13+ literals or the `owner`/`manager` leak* | `D4` |
| **GAP-7** | **There is no single resolver, and no defined normal form for a role key.** Three resolvers plus a light path; the preview normalizes differently from the runtime | `C11`, `M2-5`, `M2-11`, `M2-13`, `IA-4` | coherence · truthfulness | S3 | **W-21** — *closes preview-vs-runtime only; silent on the third and light resolvers and on normalization* | `D12`ᴬ |
| **GAP-8** | **Delegation has no ceiling, and `ops` ≈ `admin` in every default-seeded org.** The two keys the seed withholds are read nowhere; the key that gates user and role management is granted to `ops` | `G3` (open half), `T-3`, `T-4`, `M2-4`, `A2-7` | enforcement | **S2** | **W-18** — *`D9`'s two-line repoint has no workstream and `02…§10` says it must not wait for `D3`* | `D3`, `D9`ᴬ |
| **GAP-9** | **Enforcement is a convention, not a layer.** No default-deny; ≥11 gate families; no declaration mechanism; 534 of 559 route files hold a service-role client | `C1`, `G6`, `T-8`, `T-10`, `05…§6.2` | enforcement | **S2** | **W-14**, **W-15** (**W-4** shipped) | — |
| **GAP-10** | **Authority writes are neither atomic nor audited.** Role reassignment is `delete`-then-`insert` untransacted; whether an authority change is durably recorded is **unassessed by every document in this corpus** | `M2-14`, `T-13`, `01…§22.5`, `06…§3.3` | absence | S3 · audit unrated | **none** — *proposed: atomicity with `W-17`; audit needs discovery before a workstream* | — |
| **GAP-11** | **Tenancy has three holes; two are unplanned.** Org selection is a lexicographic `sort()[0]`; one credential command takes an unbounded target; the public surface takes its org from a deploy-wide env var | `I-7`, `A2-3`, `T-12`, `T-16` | enforcement | S3 / S4 | **W-22** covers `I-7` only — *the other two have none* | `D11`ᴮ, `D13`ᴬ |
| **GAP-12** | **The product tells the operator things that are not true.** Eight distinct mechanisms, five owning documents, no single owner — §31 | `T-1`, `T-6`, `M2-11`, `M2-15`, `IA-1`, `IA-3`, `IA-4`, `IA-6` | truthfulness | **S1/S2** | **none** — *no `IA-R` requirement appears in `03`* | — |
| **GAP-13** | **The person ↔ user edge is undecided, not missing.** Its absence is the correct design; what is absent is the decision | `§1`, `I-5`, `D-IA2` | decision | — | **none needed** — `03…§13.1` states this deliberately | `D1` |
| **GAP-14** | **The corpus cannot be cited by number, and is not in one place.** Invariant numbers collided; decision numbers collided; 5 of 8 numbered documents are absent from the canonical folder; the plan there is 455 lines stale | `X-1`, `D-IA0`, **`X-2`–`X-5` (new, §32)** | register | — | **none** — Director-owned | — |

ᴬ/ᴮ superscripts disambiguate the colliding decision numbers, on the same convention §16 used for invariants:
ᴬ = the `02…` reading, ᴮ = the `04…` reading. See §30.

**Completeness of the mapping.** Every numbered finding in the corpus appears above exactly once, with two
stated exceptions: `C12` (a closed defect, present only through its residue `C13`, §2.3) and `T-14`/`T-15`
(controls that **hold**, recorded in §14 as passes rather than gaps). `C1`–`C11`, `G1`–`G6`, `C13`,
`M2-1`–`M2-15`, `A2-1`–`A2-7`, `IA-1`–`IA-10`, `T-1`–`T-13`, `T-16`–`T-18` and `X-1` are all bound.
`M2-1` is a specification clarification rather than a defect and is carried inside GAP-7's model context.

---

## 27. Required-output coverage, refreshed

`00…§3` assessed the brief's twelve outputs against a three-document corpus and concluded *"11 covered, 1
partial."* Re-assessed against the corpus as it stands, with the **Mission 2 artifact** column recording
what this mission actually produced:

| # | Required output | `00…` verdict | Mission 2 artifact | Now |
|---|---|---|---|---|
| 1 | Existing-state inventory | Covered | `01…` Part I (refreshed) | **Covered** |
| 2 | Surface & capability access catalog | Covered | `05…` §§1–5 (extended from a command census) | **Covered** |
| 3 | Person ↔ user ↔ role ↔ scope model | Covered | `02…` Part I (refreshed) | **Covered** |
| 4 | Authentication model | Covered | `04…` (refreshed) | **Covered as a model; unsequenced as work** — GAP-2 |
| 5 | Effective-access resolution model | Covered | `02…` Part II (**uncommitted** — `X-5`) | **Covered** |
| 6 | Product IA & principal flows | Covered | `06…` (refreshed) | **Covered** |
| 7 | Security threat & enforcement matrix | **Partial** — non-goal | `01…` Part II | **Covered** — re-scoped in by the operator |
| 8 | **Gap analysis** | Covered *(by pointer)* | **`01…` Part III — this part** | **Covered as an artifact** |
| 9 | Decisions requiring approval | Covered | `02…§10`/`§20`, `04…§7`, `06…§8`, `01…§19` | **Covered, but not citable by number** — `X-1`, `D-IA0`, §30 |
| 10 | Sequenced implementation plan | Covered | **none** | **Stale** — covers ~a third of the register (§29) |
| 11 | Director acceptance rubric | Covered | none | **Covered, at risk** — binds to colliding IDs (§30) |
| 12 | QA & evidence plan | Covered | none | **Stale with #10** — 4 of 15 regression locks live |

**11 covered · 1 stale · 2 at risk from the register defects.** The shape of the remaining work has
inverted since intake: at intake three outputs were *absent*; now every output exists and the binding
problem is that **#10 and #12 no longer describe the corpus that #1–#9 produced.**

`00…§3`'s own caveat is worth restating here because it now bites: *"§3 states presence, not sufficiency."*
Output #8 was marked Covered on the strength of two section pointers. That was defensible, and it is the
reason a reconciled register did not exist until this phase — **a coverage table that counts documents
cannot see a gap that lives between them.**

---

## 28. Coverage against the brief's own target capabilities

Outputs are one axis; the brief also names concrete product capabilities. Nothing in the corpus scores the
product against them in one place. Each row is **[carried]** from the document that established it.

### 28.1 The eleven authentication capabilities (`00…:128-131`)

| Capability | State at `cd24874cb` | Source |
|---|---|---|
| Email + password | **implemented** | `04…§6.1` |
| Passwordless email link | **test fixtures only** | `04…§6.1` |
| Email OTP | **test fixtures only** | `04…§6.1` |
| SMS OTP | absent — `signInWithOtp` = 0 occurrences | `04…§6.1` |
| Google | absent — `signInWithOAuth` = 0 occurrences | `04…§6.1` |
| Microsoft | absent | `04…§6.1` |
| Apple | absent | `04…§6.1` |
| Enterprise SSO / SAML | absent | `04…§6.1` |
| MFA policy by role/risk | absent — `mfa.` = 0 occurrences | `04…§6.1` |
| Session + trusted-device policy | provider defaults, **unversioned** | `04…§6.1`, `A2-5` |
| Forced reset / recovery | reset exists; **no force** | `04…§6.1` |

**1 implemented · 2 test-only · 1 partial · 1 default-only · 6 absent.** Plus the brief's stated
baseline — *"visible/hide-password control on every password field"*, which it calls *"a straightforward
required baseline"* — at **three password inputs and zero reveal toggles** (`04…§6.2`). `IA-R10` and
`04…§6.2` both call it the cheapest item in the corpus; it is in no wave.

### 28.2 The seven-section Access & Identity workspace (`00…:134-136`)

The accepted IA was specified against a product with one screen and two tabs. The workspace has since been
**built**, so this row set is a genuine re-score rather than a restatement — all **[carried]** from `06…§2`.

| Brief section | Built as | State |
|---|---|---|
| Overview | `/organization/access` landing | **shell** — exists with `summaryCards: []`; a chooser, not an overview (`IA-9`) |
| Users | Users chapter, member rail + 5 tabs | **built**, with `IA-1`, `IA-2`, `IA-3`, `IA-4` against it |
| Roles | Roles chapter, catalog rail + 5 tabs | **built**; 4 of 9 permission rows inert in both columns (`06…§5.5`) |
| Access Policies | Access Scopes chapter | **absent as a concept** — a launch point to Locations/Departments; no policy object exists (`D-IA3`) |
| Authentication | Security chapter card | **Planned** |
| Invitations | Invite rail + modal | **partial** — load-bearing steps marked Planned (`IA-5`); creates no access profile (`G4`) |
| Audit Log | Security card + two History tabs | **Planned** — three views, all Planned |

**2 built · 1 shell · 1 partial · 3 absent-or-planned.** The built two are the two the corpus has the most
findings against, which is not a coincidence: they are the only sections real enough to be wrong.

### 28.3 The states the brief requires be "visually clear"

**[carried]** from `06…§6`, unchanged: **Empty — not representable** (renders identically to org-wide);
**Inherited — no such concept**; **Restricted — partly**; **Conflicting — N/A**, resolved normatively by
`02…§15.3`; **Expired — no expiry attribute anywhere** (`D-IA4`). `06…` adds **Planned**, which is the one
state the product represents well.

**One of six required states is representable today.** `Empty` is the sharpest: `06…§6` upgrades it from a
design gap to a *verified impossibility* — the members route cannot emit the distinction, so no rendering
can show it. That is GAP-3's render leg, and it is why GAP-3 is not closed by `W-5`…`W-7` alone.

---

## 29. Plan coverage — the mechanical finding

§24's headline, with its working shown.

**What `03` names.** A search over `03-implementation-qa-sequence.md` for every finding-ID pattern in the
corpus returns `C1`…`C11` and `G1`…`G6`, and **nothing else** — no `M2-n`, no `A2-n`, no `IA-n`, no
`IA-R n`, no `T-n`, no `S-n`, no `D-IA n` **[verified this pass]**. Its 15 regression locks (`RL-1`…`RL-15`)
bind to the same 17 IDs plus invariant numbers.

**What has been created since.** Fifty-three new finding IDs across four documents:

| Register | IDs | Owner | Named in `03` |
|---|---:|---|:--:|
| `C12`, `C13` | 2 | `01…` Part I | **no** |
| `M2-1`…`M2-15` | 15 | `02…` Parts I & II | **no** |
| `A2-1`…`A2-7` | 7 | `04…` | **no** |
| `IA-1`…`IA-10` | 10 | `06…` | **no** |
| `T-1`…`T-18` | 18 | `01…` Part II | **no** |
| `X-1` | 1 | `01…` Part II | **no** |

Plus three requirement registers that did not exist when `03` was written: `IA-R1`…`IA-R10` (`06…§7`),
`S-1`…`S-7` (`01…§17`), and `I-26`…`I-34` (`02…` and `04…`, colliding — §30).

**Honest deflation of the number.** `T-1`…`T-13` and `T-18` are threat *re-framings* of findings owned
elsewhere, so 53 IDs is not 53 independent defects — Part II says so itself (§22.2). Netting those out
leaves roughly **34 distinct new findings**. The coverage conclusion does not move: 34 and 53 are both
"none of them."

**Two missing workstream families, not a long tail.** The uncovered findings are not scattered; they
cluster into exactly the two subject areas `03` could not have known about:

- **Revocation and credential lifecycle** (GAP-1, GAP-10) — `T-1`, `T-2`, `M2-3`, `M2-10`, `M2-14`,
  `A2-1`, `A2-2`, `A2-4`, `IA-6`, bound to `I-26`, `I-29`ᴬ, `I-29`ᴮ, `I-30`ᴮ, `I-31`ᴬ and `IA-R5`. This is
  a coherent wave with a single exit test — *revoke, then assert denial on the next request in a second
  process* — which `02…§19` and `06…` (IA-R5) independently arrived at.
- **The authentication build** (GAP-2) — the whole of `04…§6`, which has no workstream because `03`
  was sequenced before `04` existed.

**What this does not mean.** `03`'s existing waves are not invalidated. Waves 0 and 1 shipped and are
recorded as such; waves 2–5 address GAP-3 through GAP-9 and remain the right work. The finding is one of
*extent*: **`03` is a correct plan for two-thirds of the register and is currently the only document a
reader would consult to know what happens next.**

---

## 30. Decision coverage — and why the decision register cannot currently be cited

Every gap in §26 that is blocked is blocked on a decision, and **no decision in this corpus is
worker-resolvable**. Consolidated:

| Decision | Question | Blocks | Recorded status |
|---|---|---|---|
| `D1` | Does a person ever become a principal? | GAP-13 only | open — genuinely non-blocking (`03…§12`) |
| `D2` | What are `regional_lead` / `school_director` for? | GAP-4 (`W-13` value) | open, **cost compounding** — now seeded per org |
| `D3` | What is the delegation ceiling? | GAP-8 (`W-18`) | open, sharpest |
| `D4` | Is RLS an authority layer? | GAP-6 (`W-19` sizing) | open, **more durable** — vocabulary has leaked outward |
| `D5` | Per-org or per-account state? | GAP-1, GAP-2 | open |
| `D6` ≡ `D10` | Does deactivation revoke? | **GAP-1** | open — *and `04…§7` shows these are one question* |
| `D7` | MFA scope for the first wave? | GAP-2 | open |
| `D8` | Is SSO/SAML in V2? | GAP-2 | open |
| `D9`ᴬ | Is `ops` a user-and-role administrator? | **GAP-8** | open — fix is independent of `D3` and should not wait |
| `D11`ᴬ | Maximum acceptable revocation latency? | **GAP-1** | open |
| `D11`ᴮ | Is the admin reset trigger org-bounded? | GAP-11 | open |
| `D12`ᴬ | Is the light resolver an optimization or a resolver? | GAP-7 | open |
| `D12`ᴮ | What step-up does a password change require? | **GAP-1** | open |
| `D13`ᴬ | Is the public surface inside the tenancy model? | GAP-11 | open |
| `D13`ᴮ | Which identity-verification mode is the contract? | GAP-2 | open |
| `D14` | Is abuse control a security control? | GAP-2 | open |
| `D-IA1`…`D-IA4` | Status semantics · person-vs-account · policy object · time-boxing | GAP-2, GAP-12, GAP-13 | open |

**The collision is not cosmetic, and it is compounding.** `06…§8` recorded it as `D-IA0`: at `7df17b9b3`,
`D9`, `D11` and `D12` each denoted two different questions, and `06` declined to make it worse by
namespacing its own decisions `D-IA n`. **`D13` has since collided too** — `04…§7` defines it as the
identity-verification mode, and `01…§19` (Part II, `cd24874cb`) defines it as public-surface tenancy
**[verified this pass]**. Part II's own §19 opens *"D1–D4 and D9–D12 carry forward unchanged"* — a sentence
that is ambiguous for three of the numbers it cites.

**Two independent records of one defect.** `X-1` (§18) recorded the *invariant* collision; `D-IA0` recorded
the *decision* collision. Neither cites the other, and they were written one commit apart. That is itself
an instance of the failure both describe, and it is why GAP-14 is a gap rather than a housekeeping note:
**`07-director-acceptance-rubric.md` binds acceptance criteria to these IDs, and `03…§13` binds regression
locks to them.** A lock written against `I-29` today is ambiguous between *revocation latency* and
*password step-up* — two different tests, in two different waves, one of which does not exist.

**Recommendation, escalated not performed:** one renumbering pass, Director-owned, before any acceptance
criterion or regression lock is written against an `I-` or `D-` number. Per the mission's
document-authority rule and `01…§18`, renumbering across four documents is not a worker act.

---

## 31. The truthfulness class — GAP-12, stated once

The corpus contains eight distinct mechanisms by which an access-control product **reports something to an
operator that is not true**. Each is owned by a different document, none of which counts them, because each
sees one or two. Assembled:

| # | The product says… | …but | Owner |
|---|---|---|---|
| 1 | "This principal has been removed" | They keep full authority for up to 120 s, in every process holding a warm entry | `M2-10` / `T-1` |
| 2 | "This capability is set to *None*" | 11 of 18 grantable keys are consulted by nothing; no grant constrains any surface | `T-6` / `05…§2.1` |
| 3 | "This user's effective access is *X*" | The preview normalizes role keys differently from the runtime and can show capabilities every gate denies | `M2-11` |
| 4 | "Effective access" (the panel) | Is a placeholder, and the one preview that exists disagrees with runtime | `IA-4` |
| 5 | "Status: Active · Method: Password" | Rendered as literals, not read from data | `IA-1` |
| 6 | "All locations · All departments" | Indistinguishable from *no access profile was ever created* — the fail-open in GAP-3, rendered as a reassurance | `IA-3` |
| 7 | "Member removed" (toast) | Returned inside the window in which it has not taken effect | `IA-6` |
| 8 | `README_ADMIN_AUTH.md`: "single resolver" | There are three, and it misdescribes `requireAdminOrOps`; it cites an archived doc as canonical | `M2-15` |

Six of the eight are operator-facing; two (3 and 8) mislead the engineer who would fix the other six.

**Why this is a gap and not a UX concern.** Part II §13 already names it as asset **A6** — *"operator trust
in the product's own statements"* — and §20 draws the conclusion this register makes countable: *"an
access-control product in which 'remove this person' does not remove them fails at its stated purpose,
independently of any attacker."* Mechanisms 1, 6 and 7 are the same underlying defect surfacing at three
layers (cache, resolver, UI), which is precisely why fixing one layer will not close GAP-12.

**The requirements already exist; the plan does not contain them.** `IA-R1`, `IA-R3`, `IA-R4`, `IA-R5` and
`IA-R6` are written, testable, and each traceable to one of the rows above. `06…§7` calls `IA-R1`, `IA-R3`
and `IA-R6` *"the cheapest items in this document and the highest-value."* **None of the ten `IA-R`
requirements appears in `03`** **[verified this pass]** — so the cheapest high-value work in the corpus is
also the least likely to be scheduled.

---

## 32. Corpus-integrity gaps — X-2 … X-5

**Recorded as corpus-integrity defects, not product defects**, continuing the `X-n` series `01…§18` opened.
All four are **[verified this pass]** and none is worker-resolvable, because each concerns where the
Director's canonical artifacts live.

> **X-2 — the corpus is split across two folders with no rule, and the canonical folder holds 3 of its 8
> numbered documents.** `PRODUCT-SOURCE.md` states the rule: accepted deliverables are *copied* from the QA folder to
> `docs/platform/planning/access-identity-v2/`, and the QA path *"remains runtime certification evidence."*
> Mission 2's five delivered phases did not follow one direction: `01` and `02` were written to the
> **product-source** folder, while `04`, `05` and `06` were written **into the evidence folder** and never
> copied. The product-source folder therefore contains `01`, `02`, `03`, `authority-path-inventory` and a
> README — and **not** `00`, `04`, `05`, `06` or `07`. Consequence: `01` and `02` make **91** shorthand
> citations to `04…`, `05…`, `06…` and `07…` that have no resolvable target in the folder they live in
> (85 in `01…`, 6 in `02…`). Every true markdown link resolves; it is the shorthand that dangles — and the
> count is **rising**, since this part contributed 50 of the 91. The corpus is accumulating references to
> documents that are not where it says they are.

> **X-3 — the delivery plan in the canonical folder is 455 lines staler than the one in the evidence
> folder.** `access-identity-v2/03-…md` is **799** lines, last written at Runtime V1 closeout (`0e0804ba4`);
> `qa/access-identity-v2/03-…md` is **1254** lines and carries the Wave 0, Wave 1 and W-4 execution records
> (`f15f64377`, `c242da387`, `23b4c671d`). The canonical copy contains no occurrence of *"DONE 2026"* and
> its wave map does not record that waves 0 and 1 shipped. **A reader following the README to the canonical
> location gets a delivery plan that does not know four of its workstreams have already landed** — on top of
> §29's finding that neither copy knows about the last four documents.

> **X-4 — `04`'s own finding register is internally inconsistent three ways.** `04…:55` announces *"Five new
> findings"*; the table beneath it lists **six** (`A2-1`…`A2-6`); and `§3.5` defines a **seventh**, `A2-7`,
> which the table omits. `01…§23` cites *"A2-1 … A2-7"*, correctly reading the body rather than the table.
> Minor in isolation, and recorded for the same reason as `X-1`: `07` and `03` bind to these IDs.

> **X-5 — a document three others cite exists only as an uncommitted working-tree change.** Part II of
> `02-canonical-access-identity-model.md` — the **effective-access resolution model**, required output #5,
> 551 lines — is not committed. At `HEAD` (`cd24874cb`) the file contains **zero** occurrences of
> *"Part II"*. It is the sole owner of `M2-10`…`M2-15`, `I-28`…`I-31`ᴬ, `D11`ᴬ, `D12`ᴬ and the normative
> `§15.3` composition rule, and `01…` Part II, `06…` and this part all cite it. `01…§18` noted its
> working-tree status in passing; it is recorded here as a defect because **the corpus's most-cited
> unpublished document is one `git checkout` from deletion**, and output #5 is currently uncommitted work.

Together these are GAP-14. The pattern beneath all five `X` findings is the one `§8` named as this corpus's
recurring failure mode and `§18` then demonstrated against the corpus itself: *check that a plan's premises
still hold at execution time.* Each phase was individually careful; nothing reconciled them.

---

## 33. What the corpus still cannot answer

Distinct from §35's limits, which bound *this part*. These are questions **no document in the corpus has
established**, assembled so that "unknown" is a stated conclusion rather than an assumption. Each is a
must-verify, not a defect.

| # | Unanswered | Why it matters | Nearest owner |
|---|---|---|---|
| **U-1** | **Is any of this true of a deployed environment?** Every document is static; no live database, no request, no browser. Migration state is repo state | Sizing and severity both assume the repo describes production | `01…§7.3`, `03…§4` (`W-0` ran read-only) |
| **U-2** | **Is authority audited at all?** Never assessed as a security control by any document | GAP-10; an incident cannot be reconstructed without it | `01…§22.5`, `06…§3.3` |
| **U-3** | **What do the RLS policies actually say?** No policy-by-policy review has been done; `B4`'s rating is inherited from `C10` | GAP-6 and `D4` are being decided from secondary evidence | `01…§22.6`, `02…§22.7` |
| **U-4** | **What is the request-identity verification mode?** Depends on unversioned hosted configuration this repository does not contain | Rated `S?`; every session-security statement in `07` depends on it | `A2-5` / `T-18` / `D13`ᴮ |
| **U-5** | **How many routes are genuinely ungated?** `05…§9` declines to state a number; counts are file-level, not handler-level | `W-15` is the largest item in the plan and is currently unsized | `05…§9`, `T-10` |
| **U-6** | **Do the `action-links` handlers match the token discipline `T-14` verified?** Enumerated, not read | `I-4` is closed for the forms family only | `01…§22.3-22.4` |
| **U-7** | **Does the platform run more than one server process?** Governs how many warm cache entries one invalidation must reach | Decides whether `D11`ᴬ has a cheap answer or an architectural one | `02…§22.2` |
| **U-8** | **Is `I-21` (scope symmetric on reads and writes) actually met?** Carried unverified since acceptance through every pass | One of two invariants never re-derived | `02…§7`, `03…§13.1` |

**U-1 and U-7 gate the most.** `03…§1.2` already made this argument for its own wave 0 — *"evidence about
live data gates four changes, so it comes first"* — and `W-0` executed read-only on 2026-07-31. A second
read-only census, scoped to U-2, U-3, U-5 and U-7, is the cheapest thing that would move several gaps from
*reasoned* to *established*. It is proposed, not scheduled.

---

## 34. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ cd24874cb
P=docs/platform/planning/access-identity-v2
Q=docs/platform/planning/vacilando-os/qa/access-identity-v2

# §24 / §29 — the delivery plan names no post-acceptance finding ID (expect: no output)
rg -o 'M2-[0-9]+|A2-[0-9]+|IA-[0-9]+|T-[0-9]+|S-[0-9]+|D-IA[0-9]' $Q/03-implementation-qa-sequence.md

# §29 — what it does name (expect: C1..C11, G1..G6)
rg -o 'C1?[0-9]\b|G[1-6]\b' $Q/03-implementation-qa-sequence.md | sort -u

# §32 X-2 — which folder each Mission 2 phase wrote to
git show --stat --name-only --format='%h %s' bdcf55908 c667da4e2 7df17b9b3 a4b6e424f cd24874cb
ls $P                       # 01, 02, 03, README, authority-path-inventory — no 00/04/05/06/07
rg -o '`0[4567]…' $P/01-existing-state-inventory.md | wc -l          # 85
rg -o '`0[4567]…' $P/02-canonical-access-identity-model.md | wc -l   #  6

# §32 X-3 — the canonical delivery plan is the stale one
wc -l $P/03-implementation-qa-sequence.md $Q/03-implementation-qa-sequence.md   # 799 vs 1254
rg -c 'DONE 2026' $P/03-implementation-qa-sequence.md                           # 0
git log --oneline -1 -- $P/03-implementation-qa-sequence.md                     # 0e0804ba4 (Runtime V1 closeout)
git log --oneline -3 -- $Q/03-implementation-qa-sequence.md                     # wave-1 / W-4 execution records

# §32 X-4 — "Five new findings", six rows, seven defined
rg -n 'new findings' $Q/04-authentication-model.md
rg -n 'A2-[0-9]' $Q/04-authentication-model.md | head -20

# §32 X-5 — output #5 is uncommitted
git status --short $P/02-canonical-access-identity-model.md
git diff --stat $P/02-canonical-access-identity-model.md                        # 551 insertions
git show HEAD:$P/02-canonical-access-identity-model.md | rg -c 'Part II'        # 0

# §30 — the D13 collision
rg -n '^\*\*D13' $Q/04-authentication-model.md $P/01-existing-state-inventory.md
```

---

## 35. Limits — read before citing

1. **Nothing here is a new product defect.** Every finding in §26 is owned, evidenced and rated by an
   earlier document and is marked **[carried]**. This part asserts a *reconciliation*; if a constituent
   finding is wrong, this part inherits the error. The only original findings are `X-2`…`X-5` (§32), which
   are documentary and were verified mechanically (§34).
2. **No source, schema, migration, or UI was read in this pass.** Unlike Parts I and II, this part opened no
   application file. Every `path:line` citation is transitive, through the document that established it.
   **Do not treat a line number reached through this part as freshly confirmed** — several have already
   drifted once (`04…` records four such drifts).
3. **The gap consolidation is a judgement.** Fourteen is not a measured number. A different reader could
   split GAP-1 into credential-lifecycle and cache-invalidation, or merge GAP-9 into GAP-4. The mapping is
   stated finding-by-finding in §26 precisely so that a regrouping can be argued against the same evidence
   rather than starting over.
4. **"No workstream" means the plan does not name the finding.** It does not mean no planned work would
   incidentally touch it — `W-15`'s sweep would plausibly encounter several. The claim is about what is
   *scheduled and exit-tested*, which is the only sense in which a plan covers anything.
5. **The 53 / 34 ID counts are register arithmetic, not defect counts.** §29 states the deflation
   explicitly: threat entries mostly re-frame findings owned elsewhere. Neither number should be quoted as
   "defects found."
6. **Severities are carried verbatim from `01…§14` and re-rate nothing.** Gaps with no threat entry are left
   unrated rather than assigned a rating by analogy.
7. **Output coverage (§27) states presence, not sufficiency** — the same caveat `00…§6` attached to its own
   table, and the reason this artifact was needed. The Director may still judge a covered output inadequate.
8. **§28 is scored from the corpus, not from the running product.** No browser was opened. The "built"
   verdicts are `06…`'s, which were themselves established statically.
9. **The proposals in §26's workstream column and §29 are recommendations to the Director**, not plan
   entries. No workstream number was invented, no wave re-sequenced, and no decision resolved — per the
   mission's document-authority rule and `01…§18`'s precedent on renumbering.
10. **Read-only.** No source, schema, migration, or UI was modified. The only file written by this phase is
    this document, plus the README row recording Part III; the frozen QA copies are untouched.

---

## 36. Provenance — Part III

- **Inputs (reused, not re-derived):** Parts I and II of this file; `02-canonical-access-identity-model.md`
  Parts I and II (the latter uncommitted — `X-5`); `03-implementation-qa-sequence.md` (**both** copies —
  `X-3`); `04-authentication-model.md`; `05-command-enforcement-census.md`;
  `06-product-ia-and-flows.md`; `07-director-acceptance-rubric.md`;
  `00-mission-intake-and-coverage.md` §3 row 8 and §8 — the scope authority for this deliverable;
  `PRODUCT-SOURCE.md` (the copy rule `X-2` tests against).
- **Read in full this pass:** `00-mission-intake-and-coverage.md`; `PRODUCT-SOURCE.md`;
  `access-identity-v2/README.md`; §§7–10 and §§17.6–23 of `02…`; §§6–7 of `04…`; §§3, 12–13 of `03…`.
- **Read in part:** `04…§3.5` (`A2-7`), `§5.3`; `05…§1`, `§3.3`; `06…§§0–2`, `§6`, `§8`; `07…` section
  structure only.
- **Mechanical verifications (§34):** finding-ID occupancy in `03…`; Mission 2 commit path attribution;
  product-source folder contents and the 41 dangling shorthand citations; the two `03` copies' line counts,
  histories and `DONE 2026` occupancy; `A2-n` occupancy in `04…`; `02…`'s uncommitted diffstat and
  `Part II` occupancy at `HEAD`; the `D13` collision.
- **Not consulted:** any application source, schema, migration, or UI file (§35.2); the Director's live
  mission state; `wave0-authority-census.json` and `wave1-execution-evidence.json` beyond what Parts I and
  II already cite.
- **Verified at** `cd24874cb` in `wt6-vacilando-os-product-def`.
- **No source, schema, migration, or UI changed by this phase.**

---
---

# Part IV — Role-model depth and the role-editor surface

> **Added on operator reopen**, against two items of standing guidance recorded on this assignment:
> *"Role hierarchy is still too deep — reduce to four layers"* (revision request) and *"I want the role editor
> simplified without changing the access architecture"* (implementation guidance, recorded twice).
>
> Parts I–III inventory **authority**; none of them inventories **depth** or the **editor**. Neither term
> appears in §§0–36 — no section counts the layers between a credential and a decision, and no section reads
> `AccessRolesConfigurationPage.tsx`. This part supplies both, so that "four layers" and "simplified" have a
> measured baseline instead of an impression. The accepted corpus is reused as input and not re-derived;
> everything marked **[verified this pass]** was opened and read in this worktree at `a72caaff4`.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Existing-state inventory* (reopened) · assignment `asg_b433c59b3aacd6`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-director-experience-dx5-5-continuation` @ `a72caaff4`
**Date** 2026-08-06
**Method** static, file-grounded. No request issued, no browser, no database. **No source, schema or UI modified.**

---

## 37. Headline — there is no role hierarchy to flatten

The first thing an inventory owes this guidance is the fact that changes what the guidance means:

> **`role_definitions` is flat. There is no parent role, no role inheritance, and no hierarchy table —
> anywhere in the schema or the application.** A repository-wide search for `parent_role`, `parent_role_key`,
> `role_hierarchy` and `inherits` returns **zero** authority-related matches; every hit is the unrelated
> process-engine concept `inherits_context_stage` (`web/lib/process/participationConfig.ts:29`) or a
> `node_modules` package name **[verified this pass]**.

Roles are a **flat set of four seeded rows** — `admin`, `ops`, `regional_lead`, `school_director`, all
`is_system = true` (`20260729120000_…phase0…sql:177-180`) **[carried, §3.3]** — plus any custom role an
operator creates. Nothing nests. So *"role hierarchy is still too deep"* cannot be describing role-to-role
nesting, because none exists to reduce.

**What is deep is the resolution chain.** Between a credential and an allowed request the platform interposes
**eight layers** (§38). An operator can author **four** of them; the other four are invisible on every operator
surface, and one of those four *overrides* the operator's authoring entirely (§39).

That produces the reading this part recommends, and the reason it must be confirmed rather than assumed:

> **RM-1 — "reduce to four layers" is a coherent and achievable instruction, but it is an instruction about
> the authority resolution chain, not about role nesting; and executing it is by definition an
> access-architecture change.** It would delete or collapse layers L5, L6 and L8 — the compatibility views,
> the hand-maintained grid projection, and the portal-eligibility bypass. **That is in direct tension with the
> same guidance's instruction to simplify the role editor *"without changing the access architecture."***

The two directives are individually sensible and jointly ambiguous. §42 separates the editor work that is
genuinely architecture-free from the work that is not. **Which of the two constraints governs is a product
decision, and this part does not make it** — per the mission's prohibition on reinterpreting Compiled Mission
intent, it is escalated as **D-RM1** (§43).

---

## 38. RM-2 — the eight layers, counted

Each row is a distinct store or mapping a grant must traverse to become a decision. **[verified this pass]**
except where marked **[carried]**.

| # | Layer | Where it lives | What it contributes | Operator-authorable? |
|---:|---|---|---|:--:|
| **L1** | **Credential / session** | `auth.users`; session resolved before the gate | Identity of the caller | no |
| **L2** | **Membership** | `user_roles(user_id, org_id, role)` — read at `resolveAdminAccessCore.ts:111-114`; **plus three legacy fallback reads** — `user_profiles.role` (`:44`), `app_users.role` by `id` (`:54`) and by `auth_user_id` (`:62`) | Which org, which role strings | **yes** — assign role |
| **L3** | **Role catalog** | `role_definitions(org_id, role_key, role_label, is_system, is_active)`; seeded 4 per org on `orgs` insert (`…phase0…sql:177-180`, trigger `:199-202`) | Label, active flag, system flag | **yes** — create / rename / deactivate |
| **L4** | **Grants** | `role_permission_grants(org_id, role_key, permission_key, allowed)` — read at `resolveAdminAccessCore.ts:90-94` | Role → permission keys | **yes** — but only *through* L6 |
| **L5** | **Permission catalog** | `permission_definitions` (canonical) **plus two `security_invoker` compatibility views** `permissions` and `permission_keys` (`…phase0…sql:147-164`) **[carried, §2.4]** | Which keys legally exist | no |
| **L6** | **Operator grid projection** | `PERMISSION_GRID_ROWS` — **9 capability areas × 3 levels**, a hand-maintained TypeScript constant (`web/lib/admin/permissionGrid.ts:13-22`, levels `:1`) | Maps area+level ⇄ **18 grantable keys** | no — it *is* the authoring vocabulary, but it is source code |
| **L7** | **Scope overlay** | `user_access_profiles` → `user_department_access` / `user_site_access` (`20260504103000_user_access_scope_tables_v1.sql:18,69,150`); read at `resolveAdminAccessCore.ts:145-150,163-175` | Department / site narrowing | **yes** — set scope |
| **L8** | **Portal admission** | `PORTAL_ROLES = {admin, ops}` (`resolveAdminAccessCore.ts:18`), `portalEligible` (`:142`) | **Short-circuits L4–L6 for the primary API gate** | no |

**Depth is not the same as branching.** The model is one layer wide at every level and eight layers tall. That
is the opposite of the shape "hierarchy" implies, and it is why the complaint is real even though no hierarchy
exists: an operator sets a role, and the consequence is decided six layers away by a constant they cannot see.

---

## 39. RM-3 — the four layers an operator can author, and the four that decide

Splitting the table above by the *authorable* column is the finding:

| | Layers | Operator sees them? |
|---|---|---|
| **Authorable** | L2 membership · L3 role catalog · L4/L6 capability grid · L7 scope | yes — four surfaces in the Access workspace (`accessChapterRoutes.ts:10` — `users`, `roles`, `scopes`, `security`) **[verified this pass]** |
| **Interposed** | L1 credential · L5 catalog + 2 views · L6 as *source code* · L8 portal bypass | **no operator surface renders any of them** |

**The operator already authors exactly four layers.** So the most economical reading of *"reduce to four
layers"* is not *"remove four things I use"* — it is **"make the system be the four I can see."** That is a
statement about the four interposed layers, and three of them are load-bearing:

- **L8 is the sharpest.** `portalEligible` is still the primary API gate (§5), so for `admin` and `ops` the
  entire grid an operator just spent time authoring is **not consulted**. This is the mechanism behind `T-6`
  *revocation theatre* (§14) and `T-4` *`ops` is `admin`* — restated here only as *depth*: **two of the eight
  layers exist solely to be bypassed by the eighth.**
- **L6 is a hand-maintained duplicate of L5.** The grid is a TypeScript constant that must be kept in sync with
  a database catalog by hand. `C12`/`C13` (§2.3) are precisely what happens when it is not, and `W-10`
  — *regenerate the grid from the catalog* — is the corpus's own name for deleting this layer **[carried]**.
- **L5 carries two compatibility views** that exist only to keep pre-Phase-0 readers working (`…phase0…sql:147-164`).
  They are a migration artifact, not a model concept.

**L2's three legacy fallback reads are a fifth candidate**, and the cheapest: they are the residue of two
retired role stores (`user_profiles`, `app_users`) and they are the reason a role string can resolve from a
table no operator surface writes.

> **RM-4.** Four of the eight layers — **L5's two views, L6's hand-maintained projection, L8's bypass, and
> L2's three legacy reads** — are compatibility or migration residue rather than model concepts. **An
> eight-layer chain reduces to four without removing a single operator capability.** This is recorded as an
> observation about the existing state; sequencing it is `03…`'s job, not this document's.

---

## 40. RM-5 — the role editor, measured

`web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx`, **607 lines**, all
**[verified this pass]**:

| Measure | Count | Evidence |
|---|---:|---|
| Lines | **607** | whole file |
| `useState` hooks | **18** | `:50-70` |
| `fetch` call sites | **7** | `:76-78` (three, in one `Promise.all`), `:126`, `:181`, `:206`, `:228` |
| Distinct endpoints | **5** | `rbac/roles`, `rbac/roles/{key}`, `rbac/grants`, `rbac/permissions`, `settings/users-roles/members` |
| Independent save paths | **3** | `createRole` `:176`, `saveRoleMeta` `:200`, `saveGrants` `:222` |
| Tabs in the selected-role workspace | **5** | `:254-260` — Overview · Permissions · Users · Experience Access · History |
| …of which render a **placeholder** | **2** | `:535-537` and `:540-543`, both `data-capability="planned"` |
| Grid rows presented | **9** | `permissionGrid.ts:13-22` |
| Radio inputs rendered on the Permissions tab | **27** | 9 rows × 3 levels, `:484-497` |

Four properties of that surface are worth recording as existing state, because each is a candidate for
"simplified" and they are **not** equally architecture-free:

1. **Two of five tabs display nothing.** *Experience Access* renders the sentence *"Derived from permission
   grants. Planned projection."* and *History* renders *"A verified change history for this role is planned.
   No events are fabricated for display."* Both are honest — commendably so, and consistent with the
   truthfulness class in §31 — but they are **40% of the tab bar spent on zero information**.
2. **Three save buttons, no cross-validation.** Role label/active (`:409-416`), permissions (`:504-511`), and
   role creation (`:594-600`) each write independently. An operator who edits the label *and* the grid and
   presses one button silently discards the other edit. There is no dirty-state tracking among the 18 hooks.
3. **The Overview tab is a third rendering of data the other tabs own.** *Capability Summary* (`:418-434`)
   re-derives from `grantKeys` what the Permissions tab edits; *Assigned Users* (`:435-444`) renders a count
   of what the Users tab lists. Neither is editable. The tab exists to summarise two tabs adjacent to it.
4. **Role creation asks the operator for a `role_key`.** The modal collects a technical identifier
   (`:576-588`) and labels it *"Technical identifier only — operators see the label, not this key."* The
   product asks the operator to author a value it then tells them they will never see.

**Only item 4 touches the access model at all**, and only at its edge (whether `role_key` is operator-supplied
or derived from the label). Items 1–3 are presentation: removing placeholder tabs, unifying the save, and
folding the summary changes **no** grant, key, gate or table. §42 draws that line explicitly.

---

## 41. RM-6 — role editing is reachable from five surfaces, and 1,155 lines of it are legacy

**[verified this pass]**

| Surface | Lines | Status |
|---|---:|---|
| `/adminV2/settings/organization/access?section=roles` | 42 (page) → 607 (component) | canonical — `CANONICAL_ORGANIZATION_ACCESS_HREF` (`accessChapterRoutes.ts`) |
| `/adminV2/settings/users-roles?section=…` | 41 → 19 | second entry to the **same** chapter component (`users-roles/page.tsx:35-40`) |
| `/adminV2/settings/user-access` | 8 | third adminV2 entry |
| `/legacy-admin/system/roles` | **416** | legacy `RolesClient.tsx` |
| `/legacy-admin/system/access-control` | **369** | legacy `AccessControlClient.tsx` |
| `/legacy-admin/system/customer-person-roles` | **370** | legacy — *customer* person roles, a **different** concept sharing the word "role" |

**1,155 lines of legacy role-editing UI are still present in the tree.** Whether they are reachable by a live
operator was not established (no browser was opened — §44), and `alloy-operator-surfaces` doctrine already
holds that `/legacy-admin` is never the surface to judge operator behaviour. It is recorded because **"simplify
the role editor" has five plausible referents**, and an execution phase that simplifies the canonical one while
four others remain has not simplified what the operator sees.

The last row is a distinct hazard: `customer-person-roles` is the *family/household* relationship vocabulary,
not operator authority. It shares only the word.

---

## 42. What "simplify without changing the access architecture" can and cannot reach

The constraint is precise and worth honouring literally. Sorting §40's findings by whether they alter any
layer in §38:

| Candidate | Touches which layer? | Architecture-free? |
|---|---|:--:|
| Remove the 2 placeholder tabs (`:533-544`) | none | **yes** |
| Unify the 3 save paths into one submit | none — same endpoints, same payloads | **yes** |
| Fold Overview's two read-only cards into the tabs that own them | none | **yes** |
| Derive `role_key` from the label at creation | L3 write shape only; no gate, key or grant changes | **yes, at the edge** |
| Collapse 27 radios into 9 three-state controls | L6 presentation only | **yes** |
| Regenerate the grid from the catalog (`W-10`) | **deletes L6** | **no** |
| Retire the two compatibility views | **deletes L5's views** | **no** |
| Replace `portalEligible` with a `portal.access` capability (`W-13`) | **deletes L8** | **no** |
| Drop the three legacy fallback reads | **narrows L2** | **no** |

**The first five are available now and require no decision.** They would take the editor from 607 lines and 5
tabs to something materially smaller without moving a single authority boundary — which is exactly what the
guidance asks for.

**The last four are the "four layers" work**, and they are architecture changes by any reading. Three of them
already have workstream numbers in the plan of record (`W-10`, `W-13`, and `W-19`'s vicinity); none is
scheduled as a *depth-reduction* effort, because the plan was never sequenced against a depth finding.

> **RM-7 — the two directives are separable, and separating them is the recommendation.** The editor
> simplification is real, unblocked, and architecture-free at items 1–5. The layer reduction is real,
> valuable (§39 RM-4), and **cannot** be done under a no-architecture-change constraint. Attempting both under
> one instruction is how a phase ends up changing a gate while believing it changed a screen.

---

## 43. D-RM1 — the decision this part escalates rather than makes

Recorded in the `D-` space with an `RM` qualifier deliberately, because §18/§30 establish that the bare `D-n`
register has already collided three times and that renumbering is Director-owned.

> **D-RM1 — Does "reduce to four layers" govern the resolution chain (L1–L8), and does it override the
> "no access-architecture change" constraint attached to the role-editor work?**
>
> - **If yes** — the target is the four operator-authorable layers of §39, delivered by removing L5's views,
>   L6's hand-maintained projection, L8's bypass and L2's legacy reads (RM-4). This is architecture work,
>   needs `W-10`/`W-13` sequencing, and is not a role-editor task.
> - **If no, and the constraint governs** — the role-editor work is §42's first five items, the chain stays
>   eight layers deep, and *"too deep"* is answered by presentation only. The operator should know that the
>   depth they are reacting to would remain.
>
> **This part does not choose.** Reality diverges from the guidance's framing in a way the mission's
> prohibition reserves to the Director: *there is no role hierarchy* (§37), so the instruction cannot be
> executed literally, and the two available readings lead to two different phases in two different waves.

Secondary, and cheaper to settle: **which of the five surfaces in §41 is "the role editor."**

---

## 44. Limits and provenance — Part IV

1. **Static only.** No browser was opened, no request issued, no database queried. **No claim is made about
   how any of this renders or behaves for a live operator** — including whether the three legacy surfaces in
   §41 are reachable. Line counts are file facts, not screen facts.
2. **Nothing here is a new *security* finding.** RM-1 … RM-7 are model-shape and surface-complexity findings.
   Where they touch authority (L8's bypass, the grid/catalog divergence) they **restate** `T-4`, `T-6`, `C12`
   and `C13` in the depth frame and are marked **[carried]**; the severity ratings stay with §14.
3. **"Eight layers" is a counting judgement, not a measurement.** A different reader could merge L5 and L6
   (both are "what keys exist"), giving seven, or split L2's legacy fallbacks out, giving nine. The layers are
   enumerated individually in §38 precisely so a recount can be argued against the same evidence. **Do not
   quote the number without §38.**
4. **The four-vs-four split in §39 is derived from operator *surfaces*, not from a usability study.** It says
   which layers have an editing UI, not which layers an operator understands.
5. **`role_key` derivation (§42 row 4) was classed architecture-free on the L3 write path only.** `user_roles.role`
   has no FK to `role_definitions` (`M2-2` **[carried]**), so changing how keys are minted has a blast radius
   this pass did not trace. It is the one "yes" in that table a sceptic should re-check.
6. **No workstream was created, renumbered or re-sequenced**, and `D-RM1` is escalated, not resolved — per the
   mission's document-authority rule and §18's precedent.
7. **Scope discipline.** The assignment names exactly one output path. **Only that file was written.** Unlike
   Part III, this part did **not** update `README.md`; the README's document table therefore does not yet
   record Part IV. That is a deliberate scope choice, not an oversight, and is left as a follow-up.
8. **Read this pass:** `AccessRolesConfigurationPage.tsx` (full), `permissionGrid.ts` (full),
   `resolveAdminAccessCore.ts:1-175`, `accessChapterRoutes.ts`, `users-roles/page.tsx`,
   `…phase0…sql:64-125,170-210`; line counts for the three legacy clients and the four other access components.
   **Mechanical:** the inheritance search (§37), `useState`/`fetch` occupancy, and `RM-`/`R-` namespace
   vacancy across both corpus folders.
9. **Verified at** `a72caaff4` in `wt6-director-experience-dx5-5-continuation` — a **different worktree** from
   Parts I–III (`wt6-vacilando-os-product-def`). Carried line numbers were spot-checked, not re-derived.
10. **Read-only.** No source, schema, migration or UI was modified by this phase.

---
---

# Part V — The four-layer chain and the role editor, read as a threat model

> **Added on operator reopen of the *Security threat and enforcement matrix* phase** (assignment
> `asg_47e1c0dee2c5e0`). Part IV inventoried **depth** and the **editor** and closed by stating that
> *"nothing here is a new security finding"* (§44.2) — correctly, because inventorying a surface is not
> assessing it. **This part is the assessment Part IV deferred**, and it is what this assignment owes: the
> operator's two directives — *reduce to four layers*, *simplify the role editor without changing the access
> architecture* — both act directly on the authority path, and neither had been read through the threat frame.
>
> It extends Part II rather than revising it. `T-1 … T-18`, `S-1 … S-7` and §15's matrix stand unchanged.
> This part adds `T-19 … T-26`, three holding controls `H1 … H3`, invariants `S-8 … S-14`, and a second
> enforcement matrix cut by *layer* instead of by *boundary*. Everything marked **[verified this pass]** was
> opened and read in this worktree; carried findings are cited to their owner.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Security threat and enforcement matrix* (reopened) · assignment `asg_47e1c0dee2c5e0`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-director-experience-dx5-5-continuation` @ `207cd5322` (working tree)
**Date** 2026-08-06
**Method** static, file-grounded. No request issued, no browser, no database, no test run. **Nothing below is a
demonstrated vulnerability** — §11's severity scale and §22's limits apply unchanged.

---

## 45. Headline — eight layers, two decisions, one bypass

Part IV counted the chain and found it eight layers deep (§38). Reading the same eight layers for *what each
one denies at request time* produces the finding that decides the security half of the operator's instruction:

> **Of the eight layers between a credential and an allowed request, exactly two can deny anything when the
> request arrives — L4 grants and L7 scope — and both of them fail open. A third, L8, exists to bypass L4.
> The remaining five never participate in a request-time decision at all.** **[verified this pass]**

The consequence is the opposite of what "depth" usually implies. This is not defence in depth; there is no
depth in the defence. It is **five inert layers wrapped around two permissive checks and one bypass**, and
every one of the five is a place where an operator's intent is recorded but never consulted:

- **L3 (role catalog) is enforced at assignment and ignored at resolution.** Deactivating a role blocks new
  assignments and revokes nothing (T-20).
- **L6 (the permission grid) is a TypeScript constant that the API does not enforce.** It is the operator's
  entire authoring vocabulary and it governs 18 of the catalog's 32 keys (`05…§2.1-2.2` **[carried]**).
- **L5 (permission catalog) is real — but at *write* time only** (H3). It constrains what may be granted, never
  what a grant means.
- **L2's three legacy reads are not a fallback; they are a second admission path** that outranks the first
  when the first is empty, and can only produce `admin` or `ops` (T-19).
- **L1 authenticates and discards** — §12's B1 finding, restated per-layer.

**This is why "reduce to four layers" is safe.** RM-4 (§39) proposes removing L5's views, L6's projection,
L8's bypass and L2's legacy reads. **Five of those four removals touch nothing that denies a request, and the
sixth — L8 — is a bypass whose removal makes L4 load-bearing for the first time.** The reduction does not
weaken enforcement; it removes the layers that were never enforcing and the one that was actively defeating
enforcement. §51 states this as the security input to `D-RM1`.

Two consequences that the depth frame makes visible and the boundary frame did not:

1. **The three most severe findings in this pass are all *revocation* failures** (T-19, T-20, T-22) — and all
   three sit in layers Part II's boundary matrix rated as structure rather than control. Part II's §20 already
   concluded that *"remove this person" does not remove them*. **This part finds two further, independent
   mechanisms by which it does not**, one of which is permanent rather than time-bounded.
2. **The role editor is the platform's highest-value write surface and its least-constrained one.** It writes
   asset **A1** (§13) through four routes, two of which admit on a role *literal* (T-24), and it is the surface
   the operator has asked to simplify. §52 sorts the proposed simplifications by whether they touch a control.

---

## 46. RM-8 — the eight layers as enforcement points

Part IV's §38 table by *authorability*; this one by *enforcement*. **[verified this pass]**

| Layer | Runs on every request? | Can it deny? | On absence | On read error | Where |
|---|:--:|:--:|---|---|---|
| **L1** credential | yes | authenticates only | n/a | n/a | `middleware.ts:117` (§12 B1) |
| **L2** membership | yes | **admits**, never denies | **falls through to three legacy reads** → `admin`/`ops` | `return null` — **denies** | `resolveAdminAccessCore.ts:111-140` |
| **L3** role catalog | **no** | **not consulted at resolution** | — | — | `users/[userId]/role/route.ts:33` (assignment only) |
| **L4** grants | yes | **yes** | empty grant set | `return []` — **denies** | `resolveAdminAccessCore.ts:89-100` |
| **L5** permission catalog | **write time only** | yes, on grant writes | — | 500 | `grants/route.ts:60-68`; FK `…phase0…sql:136-140` |
| **L6** operator grid | **no** | **no — UI vocabulary only** | — | — | `permissionGrid.ts:12-47` |
| **L7** scope | yes | **yes** | **fails open — scope stays `all`** | **fails open** for the profile read | `resolveAdminAccessCore.ts:145-161` |
| **L8** portal admission | yes | **inverts denial — it admits** | — | — | `resolveAdminAccessCore.ts:18,142` |

**Read the "can it deny?" column.** Two yeses (L4, L7). One "not consulted." One "UI only." One "write time
only." One that admits rather than denies. One that authenticates and stops. **An operator authoring in the
Access workspace is editing L2, L3, L6 and L7 — and only two of those four reach a request-time decision.**

Three properties worth stating separately because each is a finding in §47:

- **L2's absence behaviour is the inverse of every other layer's.** Every other read in
  `resolveAdminAccessCore` fails *closed* on error (`:116-119`, `:95-98`) or degrades to a bounded value.
  L2 alone responds to *no rows* by consulting a different, older store that can only return the two most
  privileged role strings in the platform (`:136-140`, `:49`, `:58`, `:66`) **[verified this pass]**.
- **L7's fail-open is two distinct failures.** A missing `user_access_profiles` row leaves scope at `all`
  (`:155-161`, comment at `:161`) — that is G4/T-5 **[carried]**. A profile-read *error* is discarded entirely
  (no `error` destructured at `:145-150`) — that is T-9 **[carried]**. Both remain open.
- **L4 is the only layer that both runs on every request and fails closed** (`:95-98` returns `[]`). It is also
  the layer L8 bypasses.

---

## 47. Threat register extension — T-19 … T-26

Continues §14. Severity scale is §11's, unchanged. **All eight are new to the corpus**; none restates a
`T-1 … T-18` entry, and where one shares a *mechanism* with a carried finding that is stated in the row.

| # | Threat | Actor | Boundary | Asset | Sev | Intended control | Actual control | Evidence |
|---|---|---|---|---|:--:|---|---|---|
| **T-19** | **Removal restores administration.** Removing a principal from their only org deletes their sole `user_roles` row; resolution then falls through to two legacy tables no operator surface writes or displays, which can only yield `admin` or `ops` — with `portalEligible = true`, the primary API gate. The route returns `{ok:true}` | Ex-principal | B2 | A1, A2, A3, A6 | **S1** | Removal removes authority | `remove/route.ts:26-30` deletes `user_roles`; `resolveAdminAccessCore.ts:131-140` then calls `fetchLegacyAdminOpsOrgAndRole`; `:49,58,66` accept only `admin`/`ops`; `:142` sets `portalEligible` | **[verified this pass]** — §49 |
| **T-20** | **Deactivating a role revokes nothing.** `role_definitions.is_active=false` is enforced when *assigning* a role and never when *resolving* one; existing members keep every grant indefinitely. The toggle is the second control on the editor's Overview tab | — (control failure) | B2 | A1, A6 | **S2** | Deactivation denies | `resolveAdminAccessCore` never reads `role_definitions` (5 files do; it is not one); `fetchPermissionKeys:89-94` joins grants by `role_key` alone; assignment-side check at `users/[userId]/role/route.ts:33` | **[verified this pass]** — §50 |
| **T-21** | **Phantom roles are grantable and enforceable but not assignable.** The roles API fabricates the four system roles at read time when no row exists; grant writes validate `permission_key` but never `role_key`, and no FK constrains it; resolution reads grants by `role_key` alone. So capabilities can be authored for a role that does not exist — and are live for anyone whose membership row carries that string | Insider; seed / import writer | B2, B4 | A1, A5 | **S2** | One role vocabulary, defined once (I-8) | `defaultRoleDefinitions.ts:34-47` merges defaults; applied at `roles/route.ts:31`; `grants/route.ts:60-68` validates keys only; the sole Phase 0 FK is on `permission_key` (`…phase0…sql:136-140`) | **[verified this pass]** — §50 |
| **T-22** | **A failed read becomes a silent total revocation on the next save.** If the grants GET fails, the editor sets the grant set to empty **with no error shown**; the Permissions tab then renders as a legitimate all-*None* state, and Save writes that empty set, deleting every grant for the role | Transient DB / network fault | B2 | A1, A6 | **S3** | A read failure is visible and blocks writing | `AccessRolesConfigurationPage.tsx:128-135` — both the `!res.ok` and `catch` paths call `setGrantKeys(new Set())` and return without setting `error`; `:231` PUTs `[...grantKeys]`; `grants/route.ts:70-74` deletes all | **[verified this pass]** |
| **T-23** | **Grant replacement is not atomic.** `PUT /rbac/grants` deletes every grant for the role, then inserts; an insert failure leaves the role with **zero** grants and returns 500 | Transient fault | B2 | A1 | **S3** | Authority writes are atomic (I-31ᴬ) | `grants/route.ts:70-91` — untransacted delete-then-insert, no compensation. **Same defect class as T-13, on a second authority table** | **[verified this pass]** |
| **T-24** | **The authority graph's write gate is a role literal on an unconstrained column.** `canManageUsersAndRoles` returns true for any principal whose `roleKeys` contains `"admin"` *before* consulting any capability; `user_roles.role` has no FK. Reads of the whole authority graph additionally admit on `portalEligible` (L8) | Insider; seed / import writer | B2 | A1 | **S2** | Authority-graph writes gated on a capability | `canManageUsersAndRoles.ts:16` (literal), `:17` (capability, second); `:58` portal-or-manage for reads. No FK on `user_roles.role` (`02…` M2-2 **[carried]**) | **[verified this pass]** |
| **T-25** | **Phase 0 re-granted `anon` SELECT on two access-control objects**, six days before the platform-wide anon revocation. Closed today **by migration ordering alone**; the default-privilege change does not prevent a future explicit `GRANT` | Internet | B1, B4 | A5 | **S4** | `anon` holds no public-schema privilege (issue #318) | `…phase0…sql:163-164` grants SELECT on `permissions`/`permission_keys` to `anon`; revoked by `20260804180000_platform_anon_privilege_revocation.sql:105` (its `:100` comment counts views). RLS is the second control: base-table SELECT policy names `authenticated` (`remote_schema.sql:7852`) and the views are `security_invoker` (`…phase0…sql:150,154`) | **[verified this pass]** — §50 |
| **T-26** | **Authority writes land in an org the operator never chose.** The role editor writes to `access.orgId`, which is the lexicographically smallest org among the caller's `admin`/`ops` memberships — not an operator selection, and named on no surface | Insider (multi-org) | B5 | A1 | **S3** | The org a command acts on is explicit | `chooseOrgAndRoleKeysFromMembershipRows:30-32`; consumed as `auth.access.orgId` at `roles/route.ts:10`, `grants/route.ts:9,39`, `remove/route.ts:13`. **Sharpens I-7 (open) onto the authority-graph write path** | **[verified this pass]** |

**Severity distribution.** One S1, four S2, three S3, one S4 — and **three of the top five are revocation
failures**. Part II's §20 row *"revocation takes effect — not met, twice"* becomes **not met, four times**:
the 120 s cache (T-1), the absent credential-disable verb (T-2), the legacy re-admission (T-19), and role
deactivation (T-20).

---

## 48. Controls that hold on this surface — H1 … H3

§14 records passing controls because a matrix that lists only failures cannot be used to judge coverage. Three
hold here, and **each one is a constraint on the simplification work**, not merely reassurance.

> **H1 — Enforcement is at the route, not the screen.** All five role-editing surfaces of §41 — the canonical
> editor, its two adminV2 aliases, and both legacy clients — call the **same four** `/api/admin/rbac/*` routes
> (`AccessRolesConfigurationPage.tsx:76-78,126,181,206,228`; `RolesClient.tsx:52,64,76,142,151,179`;
> `AccessControlClient.tsx:56,76`) **[verified this pass]**. The 1,155 lines of legacy role UI are therefore a
> **surface-area and consistency** problem, not an enforcement gap — they hold no authority the canonical
> surface does not. *Consequence:* **deleting them is security-neutral and safe**, which is the one place in
> this corpus where authority is located correctly. It is also the direct counter-example to T-8: command
> authority here is *not* a property of transport.

> **H2 — The grid does not strip what it cannot display.** The editor seeds its grant set from the server's
> full response (`:132`) and `applyGridRowSelection` deletes only keys the edited row defines, preserving
> out-of-grid keys (`permissionGrid.ts:65,74-76`); Save PUTs the union (`:231`) **[verified this pass]**. This
> is load-bearing: the seed grants `admin` **every active key** (`…phase0…sql:292-296`), of which the grid
> represents 18 of 32 (`05…§2.1-2.2` **[carried]**). Without H2, opening the Permissions tab and pressing Save
> would silently delete the 14 keys the editor cannot show. **Any "collapse the 27 radios" change must carry a
> regression lock for H2** (S-11).

> **H3 — L5 is a real write-time enforcement layer.** Every submitted key is validated against
> `permission_definitions.is_active` *before* the destructive delete (`grants/route.ts:60-68`), and Phase 0
> added the single FK `role_permission_grants_permission_definitions_fkey` (`…phase0…sql:136-140`)
> **[verified this pass]**. A grant cannot name a key that does not exist. *Consequence:* the asymmetry in
> T-21 is sharper than it looks — the same handler that rigorously validates one column of the composite key
> does not validate the other.

**H2 and H3 are why §52 can classify some of Part IV's proposed simplifications as safe.** They are the
controls those changes must not break, and neither is currently protected by a test.

---

## 49. T-19 in detail — removal restores administration

The sharpest finding in this pass, and the one that most directly answers *"reduce to four layers."* It is a
five-step chain, each step individually reasonable **[verified this pass]**:

| # | Step | Evidence |
|---|---|---|
| 1 | The operator presses **Remove** on the canonical Users surface | `AccessUsersConfigurationPage.tsx:299` |
| 2 | The route deletes the principal's `user_roles` row for the caller's org — and nothing else. Its own comment: *"Does not delete auth.users"* | `remove/route.ts:6,26-30` |
| 3 | On the principal's next request, `chooseOrgAndRoleKeysFromMembershipRows` returns `null` — they now hold **no** membership row in any org | `resolveAdminAccessCore.ts:131-132` |
| 4 | Resolution does not deny. It calls `fetchLegacyAdminOpsOrgAndRole`, which reads `user_profiles.role`, then `app_users.role` by `id`, then by `auth_user_id` | `:136-140`, `:44`, `:54`, `:62` |
| 5 | Those reads accept **only** `"admin"` and `"ops"`. A match yields that role and sets `portalEligible = true` — the primary API gate | `:49`, `:58`, `:66`, `:142` |

**The failure mode is not "removal is slow" — it is "removal is inverted."** A principal with a stale legacy
row does not lose authority on removal; they lose whatever *narrower* role their `user_roles` row carried and
resolve to `admin` or `ops`. Removing a `school_director` who has an old `app_users.role = 'admin'` row
**promotes them**. The product reports success (`{ ok: true }`, `:34`) and no surface displays either legacy
table.

**Precondition, stated plainly.** This requires a legacy row to exist. **No database was queried** — whether
any live tenant holds such rows is **not established here** and is the first thing an execution phase must
check. What *is* established is structural and sufficient to act on:

- The current user-creation path writes **only** `user_roles` (`users/route.ts` — no `user_profiles` or
  `app_users` write; G4/§3.5 **[carried]**), so no *new* principal acquires a legacy row.
- Therefore the exposed population is exactly the **pre-migration** one — the longest-tenured accounts, which
  are also the ones most likely to have held `admin` before the `user_roles` model existed.
- The two legacy tables are the residue of retired role stores (Part IV §39 **[carried]**). **Nothing in the
  product writes them, displays them, or removes rows from them.**

**Relation to T-1.** T-1 is a 120-second cache window. **T-19 has no window** — it is the steady state after
the cache expires. They compound: the cache serves the old authority for 120 s, and the resolver then
reconstructs an equal-or-greater authority from a store the operator cannot see.

**This is the security case for dropping L2's legacy reads**, which Part IV listed as the cheapest of RM-4's
four removals. It is not cleanup. It is the removal of a second, invisible, privilege-only admission path that
defeats the platform's only membership-removal verb.

---

## 50. T-20, T-21 and T-25 in detail

**T-20 — the Active toggle.** `role_definitions.is_active` is checked in exactly one place on the authority
path: role *assignment* rejects an inactive role (`users/[userId]/role/route.ts:33-36`, *"Invalid or inactive
role for this org"*). Resolution never reads the table at all — only five application files reference
`role_definitions`, and `resolveAdminAccessCore.ts` is not among them; `fetchPermissionKeys` selects grants by
`(org_id, role_key)` with no join and no active predicate (`:89-94`) **[verified this pass]**.

So deactivating a role means: *no one new may be given it; everyone who has it keeps everything.* The editor
offers the toggle beside the role label (`:409-416` **[carried, §40]**) with no indication that it governs
future assignment only. **This is a distinct mechanism from T-6.** T-6 is *grants do not constrain surfaces*;
T-20 is *the role's own lifecycle flag does not constrain grants*. Both present as the same thing to an
operator: a control that reports success and changes nothing.

A second-order note: the PATCH route refuses to deactivate a **system** role (`roles/[role_key]/route.ts:45-47`)
but permits relabelling one unconditionally (`:41-43`). The one guard on that surface protects an operation
that is already inert.

**T-21 — phantom roles.** Phase 0's own section header reads *"Role definitions are seeded by the database,
never fabricated at read time"* (`…phase0…sql:167-168`). The API still fabricates them:
`mergeRoleDefinitionsWithDefaults` adds any missing member of a hard-coded four-role constant as
`is_system: true, is_active: true, created_at: null` (`defaultRoleDefinitions.ts:34-47`), and
`GET /api/admin/rbac/roles` applies it to every response (`roles/route.ts:31`) **[verified this pass]**.

That constant is a **fifth role vocabulary** on top of the four `02…` M2-8 already records **[carried]**, and
it produces a closed loop the corpus has not previously stated:

1. The editor lists `regional_lead` whether or not a row exists.
2. The operator authors permissions for it. `PUT /rbac/grants` validates every `permission_key` against the
   catalog (H3) but **never checks that `role_key` names a real role**, and no FK constrains that column.
3. The grants are written and are **live** — `fetchPermissionKeys` resolves by `role_key` alone.
4. But `PATCH /users/{id}/role` **refuses to assign** the role, because *that* path does check
   `role_definitions` (`:33`).

**Capabilities can therefore be authored, stored and enforced for a role the product will not let an operator
assign** — reachable only by a writer outside the product (seed, import, direct SQL), which `user_roles.role`'s
missing FK permits (T-11 **[carried]**). The Phase 0 migration closed this at the database and the API layer
re-opened it above.

**T-25 — the `anon` grant.** `…phase0…sql:163-164` executes
`GRANT SELECT ON public.permissions, public.permission_keys TO "anon"` — on the two compatibility views over
the permission catalog, i.e. on L5. Six days later, `20260804180000_platform_anon_privilege_revocation.sql:105`
runs `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`, and its own comment confirms the sweep covers views
(`:100`). **The grant is closed today, by ordering.** Two reasons to record it anyway:

1. **The revocation's forward protection is `ALTER DEFAULT PRIVILEGES`** (`:83-85`), which governs objects
   created *without* an explicit grant. It does not prevent a future migration from executing an explicit
   `GRANT … TO anon`, which is precisely what Phase 0 did. The pattern is live; only this instance is closed.
2. **The second control is RLS, and it is doing the real work.** The views are `security_invoker` (`:150,154`),
   so an `anon` read executes under `anon`'s own RLS; `permission_definitions`' SELECT policy is scoped
   `TO authenticated` (`remote_schema.sql:7852`) while the base table still carries `GRANT ALL … TO anon`
   (`:9449`). **Two controls disagreed and the stricter one held.** That is the correct outcome by luck of
   layering, not by design — and it is one of the four layers RM-4 proposes to delete, which would remove the
   object carrying the contradiction.

---

## 51. What the four-layer reduction does to the threat model

The security input to `D-RM1` (§43). Each RM-4 removal, against the register:

| RM-4 removal | Closes | Weakens | Net |
|---|---|---|---|
| **L2's three legacy reads** | **T-19 (S1)** entirely; narrows T-1's compounding | nothing — no operator surface writes or reads these tables | **Strongly positive** |
| **L8's `portalEligible` bypass** | Makes L4 load-bearing; is the mechanism behind **T-4** and **T-6** **[carried]**; removes the read-side admission in T-24 | **Requires L4 to be correct and seeded first** — removing the bypass before grants govern anything locks operators out | **Positive, strictly ordered** |
| **L6's hand-maintained projection** (`W-10`) | The grid/catalog divergence behind **C12/C13** **[carried]**; makes the 18-of-32 authoring gap visible | **Must preserve H2** — a regenerated grid that covers all 32 keys changes what Save writes | **Positive with a lock** |
| **L5's two compatibility views** | **T-25** at its source | **Removes one of the two controls** that currently disagree correctly (§50) — the base-table `anon` grant survives the views | **Positive, but audit the base grant first** |

**Two findings follow, and they are the ones the Director needs.**

> **RM-9 — the layer reduction closes one S1 and two S2 threats and weakens no control that this pass could
> find.** No layer proposed for removal appears in the "can it deny?" column of §46 except L8, whose denial
> value is *negative*. **The "no access-architecture change" constraint attached to the role-editor work is
> not protecting any enforcement control** — it is protecting compatibility surfaces and one bypass.

> **RM-10 — but the reduction is order-dependent, and one ordering is dangerous.** Removing L8 before L4 is
> seeded and enforced converts a fail-open platform into a fail-closed one with no grants — a total operator
> lockout, not a security improvement. `03…`'s `W-13` sequences the L8 replacement after the capability work;
> **that ordering must be preserved and is the one hard constraint on this instruction.** Similarly, L2's
> legacy reads must not be dropped until it is established that no live principal resolves *only* through
> them (§49's unverified precondition) — otherwise removal locks out real administrators.

**This does not resolve `D-RM1`.** It supplies the half a security assessment can supply: the reduction is
safe and valuable, the constraint it collides with defends nothing, and the sequencing is non-negotiable.
Whether the instruction *governs* remains the Director's call, per §43 and the mission's prohibition on
reinterpreting Compiled Mission intent.

---

## 52. Security review of the "architecture-free five"

Part IV §42 classified five editor simplifications as touching no layer. **Architecture-free is not the same as
control-free**, and two of the five are not security-neutral as written.

| §42 candidate | Touches a control? | Verdict |
|---|---|---|
| Remove the 2 placeholder tabs | **Yes, at the edge** — *History* is the only product statement of intent to have authority-change history, and §22's limit 5 records audit as the one matrix column never assessed | **Safe to remove the tab; record the debt.** Deleting the placeholder must not delete the requirement — S-14 |
| **Unify the 3 save paths into one submit** | **Yes — materially** | **Not safe as written.** It composes a PATCH with T-23's untransacted delete-then-insert into one operator action with **three failure points and no compensation**. A partial failure would leave the label changed and the grants empty. **Must land with S-12 (atomicity), not before it** |
| Fold Overview's read-only cards into the tabs | **Yes, at the edge** — *Capability Summary* derives from `PERMISSION_GRID_ROWS` only (`:156-161` **[verified this pass]**), so it structurally cannot show the 14 non-grid keys; on the `admin` role, which the seed grants all 32, it under-reports by design | **Safe, but do not promote it.** Folding a lossy summary into the tab that owns the truth makes the omission harder to notice. A6 (operator trust) is the asset |
| Derive `role_key` from the label | No new exposure — `POST /rbac/roles` **already** slugifies (`:50`) | **Safe.** §44.5's caveat stands: `user_roles.role` has no FK, so key-minting changes have an untraced blast radius |
| Collapse 27 radios into 9 three-state controls | **Yes — H2 depends on the current apply logic** | **Safe only with a regression lock.** `applyGridRowSelection` preserving out-of-grid keys is what prevents Save from stripping 14 grants from `admin`. Nothing tests it today |

**And one addition the editor work should carry, because it is cheaper here than anywhere else:** T-22 is a
seven-line fix in the same component — surface the grants read failure and disable Save while the grant set is
unknown. It is the only S3 in this pass that the simplification pass can close *incidentally*, and leaving it
in place while rewriting the surface around it would be the worst outcome.

> **RM-11 — the editor simplification is genuinely available, but three of the five items need a control
> attached, and none of the three is expensive.** Unify-save needs atomicity; radio-collapse needs an H2 lock;
> tab-removal needs the audit debt recorded. **"Architecture-free" was the right classification of the
> *layers* touched and the wrong one to read as "no security review needed."**

---

## 53. New security invariants — S-8 … S-14

Continues §17's `S-n` space, and deliberately not the colliding `I-n` space (§18). Each is mechanically
checkable.

> **S-8.** Authority MUST resolve from exactly one membership store. No resolver may consult a table that no
> operator surface writes and no operator surface displays. *Check:* `resolveAdminAccessCore` reads
> `user_roles` and nothing else; `rg 'user_profiles|app_users' web/lib/admin/resolveAdminAccessCore.ts` → no
> matches. **Fails today** at `:44,54,62` (T-19).

> **S-9.** A role's `is_active = false` MUST deny at resolution, not only at assignment. *Check:* the grants
> read joins `role_definitions` and filters `is_active`; a deactivated role resolves to zero permission keys.
> **Fails today** — resolution never reads the table (T-20).

> **S-10.** A grant MUST NOT exist for a role that has no definition row. `role_key` MUST be constrained as
> rigorously as `permission_key` already is. *Check:* an FK from `role_permission_grants.role_key` to
> `role_definitions`, and an existence check in `PUT /rbac/grants` beside the key validation at `:60-68`.
> **Fails today** (T-21).

> **S-11.** A read failure on an authority surface MUST be visible and MUST disable the write. No authority
> editor may render an unknown state as an empty one. *Check:* every catch/`!res.ok` path that clears an
> authority set also sets an error and a disabled-save flag. **Fails today** at
> `AccessRolesConfigurationPage.tsx:128-135` (T-22). *Corollary — the H2 lock:* a grant save MUST preserve every
> key the surface cannot display.

> **S-12.** Every authority replacement MUST be atomic. *Check:* no route performs an untransacted
> delete-then-insert on `user_roles`, `role_permission_grants`, or the scope tables. **Fails today** at
> `grants/route.ts:70-91` (T-23) and at role reassignment (T-13 **[carried]**). This is I-31ᴬ, extended to the
> second table and named as a precondition of the unify-save work.

> **S-13.** No migration may `GRANT` any privilege on an access-control object to `anon`. *Check:* static —
> `rg 'TO .*anon' supabase/migrations` returns no line naming `permissions`, `permission_keys`,
> `permission_definitions`, `role_definitions`, `role_permission_grants`, `user_roles`, or the scope tables
> (T-25).

> **S-14.** The org an authority write lands in MUST be operator-selected and displayed on the surface
> performing the write — never derived by sort order. *Check:* no authority-mutating route derives its
> `org_id` from `chooseOrgAndRoleKeysFromMembershipRows`. **Fails today** (T-26); this is I-7's write-path form.

**S-9, S-10 and S-12 are each a single migration or a single handler change.** S-8 is the one that requires a
data question answered first (§49), and it is the one that closes the S1.

---

## 54. The enforcement matrix, cut by layer

§15 cut controls by *boundary*. Depth requires the second cut. **Y** enforced · **P** partial · **N** absent ·
**—** not applicable.

| Control | L1 cred | L2 memb | L3 catalog | L4 grants | L5 perms | L6 grid | L7 scope | L8 portal |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Participates in a request-time decision | **Y** | **Y** | **N** | **Y** | **N** | **N** | **Y** | **Y** |
| Can deny | — | **N** | **N** | **Y** | **N** | **N** | **Y** | **N** — admits |
| Fails closed on read error | — | **Y** | — | **Y** | — | — | **N** | — |
| Fails closed on absence | — | **N** — legacy path | — | **Y** | — | — | **N** — scope `all` | — |
| Referentially constrained | — | **N** — no FK | — | **P** — key only | **Y** | **N** — source code | **P** | — |
| Lifecycle flag honoured | — | — | **N** — assignment only | **P** — `allowed` | **Y** — `is_active` | — | — | — |
| Operator can see it | **N** | **Y** | **Y** | **P** — via L6 | **N** | **N** | **Y** | **N** |
| Bypassed by another layer | — | — | — | **Y — by L8** | — | — | **N** | — |
| Regression-locked by a test | **N** | **N** | **N** | **N** | **N** | **N** | **N** | **N** |

**The bottom row is the finding.** Every control in this table — including H1, H2 and H3, the three that hold
— is currently unlocked. §17's S-7 said this of the public surface; it is equally true of the authority chain,
and the simplification work is exactly the kind of change that degrades unlocked controls silently.

**The `L4` column read downward is the four-layer instruction in one line:** the only layer that both runs on
every request and fails closed is also the only one another layer exists to bypass.

---

## 55. Decisions — input to D-RM1, and one new

**D-RM1 (§43) — the security half, answered.** §51 supplies evidence, not a decision: the layer reduction
closes T-19 (S1), T-20 and T-4/T-6's mechanism (S2), and weakens no control this pass could find. **A "no
access-architecture change" constraint applied to the whole instruction would preserve the three most severe
revocation defects in the corpus.** The recommendation implied by the evidence is Part IV's RM-7 —
*separate the two directives* — with §51's ordering (RM-10) attached as a hard constraint. **The choice
remains the Director's.**

**D-15 — new. Are the two legacy identity tables in the authority model, or out of it?**
`user_profiles.role` and `app_users.role` are read by the resolver, written by nothing, displayed by nothing,
and can only produce `admin` or `ops` (T-19). *Recommendation:* **out.** Establish whether any live principal
resolves solely through them; if none, delete the three reads (S-8) — that closes the S1 outright. If some do,
migrate those rows into `user_roles` first and then delete the reads. **This is the cheapest S1 closure in the
corpus and it needs one database question answered, not a design.**

*Numbering note.* `D-15` continues the `D-n` space and is **at risk from the collisions §18/§30 record**. It
is registered here as `D-15` because the highest-numbered decision in the corpus is `D-14` (§19); if the
Director renumbers, this moves with the rest. **This part created no workstream and re-sequenced nothing.**

---

## 56. Reproduce

```bash
# §46 / §49 T-19 — removal deletes the only membership row, then resolution consults two legacy stores
rg -n 'from\("user_roles"\)|delete\(\)'            web/app/api/admin/users/\[userId\]/remove/route.ts
rg -n 'fetchLegacyAdminOpsOrgAndRole|picked|return null' web/lib/admin/resolveAdminAccessCore.ts   # :131-140
rg -n 'user_profiles|app_users|"admin" \|\| |portalEligible' web/lib/admin/resolveAdminAccessCore.ts

# §46 / §50 T-20 — role_definitions is read at assignment, never at resolution
rg -ln 'role_definitions' web/lib web/app --glob '!*.test.*'        # 5 files; resolveAdminAccessCore NOT among them
rg -n 'role_definitions|is_active' web/app/api/admin/users/\[userId\]/role/route.ts   # :33 assignment-time check
rg -n 'role_permission_grants' -A4 web/lib/admin/resolveAdminAccessCore.ts           # :89-94, no join, no active filter

# §50 T-21 — roles are fabricated at read time; grants validate the key but not the role
rg -n 'DEFAULT_ORG_ROLE_DEFINITIONS|mergeRoleDefinitionsWithDefaults' web/lib/admin/defaultRoleDefinitions.ts
rg -n 'mergeRoleDefinitionsWithDefaults' web/app/api/admin/rbac/roles/route.ts        # :31
rg -n 'permission_definitions|role_key' web/app/api/admin/rbac/grants/route.ts        # :60-68 keys only
rg -n 'role_key' supabase/migrations/*.sql | rg -i 'references|fkey'                  # no role_key FK
rg -n 'never fabricated at read time' supabase/migrations/20260729120000_*.sql        # :167

# §47 T-22 / T-23 — read failure clears the set silently; the save is a delete-then-insert
rg -n 'setGrantKeys\(new Set\(\)\)' web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx
rg -n 'permission_keys: \[\.\.\.grantKeys\]' web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx
rg -n 'delete\(\)|insert\(inserts\)' web/app/api/admin/rbac/grants/route.ts           # :70-91

# §47 T-24 — the authority-graph gate is a role literal, capability second
rg -n 'roleKeys.includes\("admin"\)|permissionKeys.includes|portalEligible' web/lib/admin/canManageUsersAndRoles.ts

# §50 T-25 — Phase 0 grants anon SELECT on two access-control views; revoked 6 days later
rg -n 'TO "anon"|security_invoker' supabase/migrations/20260729120000_*.sql           # :150,154,163,164
rg -n 'REVOKE ALL ON ALL TABLES|ALTER DEFAULT PRIVILEGES|4 views' supabase/migrations/20260804180000_*.sql
rg -n 'permission_definitions_select|TO "anon"' supabase/migrations/20260329165048_remote_schema.sql

# §47 T-26 — the write org is a lexicographic pick, not a selection
rg -n 'sort\(\)\[0\]|PORTAL_ROLES' web/lib/admin/resolveAdminAccessCore.ts            # :30-32

# §48 H1 — five role-editing surfaces, four shared routes
rg -n 'fetch\("/api/admin/rbac|fetch\(`/api/admin/rbac' \
  web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx \
  web/app/legacy-admin/system/roles/RolesClient.tsx \
  web/app/legacy-admin/system/access-control/AccessControlClient.tsx

# §48 H2 — out-of-grid keys are preserved; the seed grants admin every active key
rg -n 'out-of-grid|next.delete|next.add' web/lib/admin/permissionGrid.ts              # :65,74-76
rg -n "Grants for admin: everything" -A4 supabase/migrations/20260729120000_*.sql     # :291-296
```

---

## 57. Limits and provenance — Part V

1. **Nothing here was demonstrated.** No request was issued, no browser opened, no database queried, no test,
   typecheck or build run. Every severity is structural per §11. **No claim is made that any deployed
   environment has been compromised**, and T-19 in particular rests on a precondition — the existence of
   legacy `admin`/`ops` rows — that **was not checked and cannot be checked from the repository** (§49).
2. **T-19 is the finding most likely to change on contact with data.** If no live principal holds a legacy
   role row, its severity is theoretical-until-a-row-appears rather than S1 — but the *structure* is
   unconditional, and the removal verb's behaviour does not depend on today's data. It is rated on the
   authority a successful actor would hold, which is §11's stated basis.
3. **Layer numbering is Part IV's** (§38) and inherits its counting caveat (§44.3). §46 re-cuts the same eight
   rows by enforcement; it does not re-derive them. **Do not quote "two of eight" without §46.**
4. **RLS was not reviewed**, again. T-25's conclusion depends on the SELECT policy at `remote_schema.sql:7852`
   being the operative one at `HEAD` — later policy migrations were **not** audited, and §22's limit 6 stands.
5. **Migration ordering was read, not executed.** T-25's "closed today" rests on file timestamps and applied
   order; no database was inspected to confirm the revocation took effect in any environment.
6. **H1 establishes shared *routes*, not equivalent *behaviour*.** The two legacy clients were read only for
   their fetch call sites; their payload shapes, error handling and any additional writes were **not**
   reviewed. "Deleting them is safe" is a claim about authority, not about what else they do.
7. **The action-registry and command surfaces were not re-opened.** T-8's finding is untouched by this part;
   nothing here re-assesses `05…`'s census.
8. **Carried findings were not re-verified** except where marked. T-1, T-4, T-6, T-9, T-11, T-13, C12/C13,
   M2-2, M2-8, G4 and the 18-of-32 key split are cited to their owners.
9. **No workstream was created or re-sequenced**, and `D-RM1` is **not** resolved — §51 supplies evidence for
   it and explicitly leaves the decision with the Director, per §43 and the mission's prohibition on
   reinterpreting Compiled Mission intent. `D-15` is raised, not decided.
10. **Read in full this pass:** `web/app/api/admin/rbac/roles/route.ts`,
    `web/app/api/admin/rbac/roles/[role_key]/route.ts`, `web/app/api/admin/rbac/grants/route.ts`,
    `web/app/api/admin/rbac/permissions/route.ts`, `web/app/api/admin/users/[userId]/remove/route.ts`,
    `web/lib/admin/canManageUsersAndRoles.ts`, `web/lib/admin/resolveAdminAccessCore.ts`,
    `web/lib/admin/defaultRoleDefinitions.ts`, `web/lib/admin/permissionGrid.ts`.
    **Read in part:** `AccessRolesConfigurationPage.tsx:110-240` (fetch/save region; §40's counts carried),
    `AccessUsersConfigurationPage.tsx` (remove and reset call sites), `RolesClient.tsx` /
    `AccessControlClient.tsx` (fetch call sites only), `users/[userId]/role/route.ts:29-37`,
    `…phase0…sql:126-170,285-306`, `20260804180000_platform_anon_privilege_revocation.sql:80-137`,
    `remote_schema.sql` (permission_definitions policy, grant and RLS regions).
11. **Scope discipline.** The assignment names one output path and **only that file was written.** As in
    Part IV, `README.md` was not updated; Parts IV and V are therefore still absent from its document table.
    Recorded as a standing follow-up, not an oversight.
12. **Read-only.** No source, schema, migration or UI was modified by this phase.

---

# Part VI — Gap analysis, reopened: the four-layer chain and the role editor

> **Added on operator reopen of the *Gap analysis* phase** (assignment `asg_04bcdd312f0dec`), against the
> standing guidance recorded on it: *"Role hierarchy is still too deep — reduce to four layers"* and *"I want
> the role editor simplified without changing the access architecture."*
>
> Part III reconciled the corpus against its plan on 2026-08-03 and found the plan two-thirds short. **That
> finding has since been closed and the ground has moved twice more.** `03…` was re-sequenced and now binds
> every register Part III named; five documents were then reopened on 2026-08-06 and created roughly sixty new
> identifiers. This part re-measures the same three axes — register, plan, decisions — against the corpus as
> it stands, and adds the one measurement the reopen made necessary and no document performs: **what number
> the chain is being reduced *from*.**
>
> **The corpus is reused as input and not re-derived.** Every constituent finding is cited to its owning
> document and marked **[carried]**. Claims marked **[verified this pass]** were established mechanically in
> this worktree at `03efba377` by the commands in §69.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Gap analysis* (reopened) · assignment `asg_04bcdd312f0dec`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-director-experience-dx5-5-continuation` @ `03efba377`
**Date** 2026-08-06
**Method** documentary and static. No request issued, no browser, no database, no test suite. **No new product
defect is asserted here** — every defect below is owned by an earlier document or part (§70).

---

## 58. Headline — the plan caught up, and was outrun again the same week

Part III's §24 said the corpus had converged and *"its plan still describes the subset of that understanding
which existed on 31 July."* **That is no longer true, and the correction is the first thing this part owes.**

> **`03-implementation-qa-sequence.md` was re-sequenced** (`0810bb566`, then `f5a19d0bc` for output #12).
> The plan of record is now 3,600+ lines, carries **waves 6–12**, and its §23 binds *every* register Part III
> found unnamed — `M2-n`, `A2-n`, `IA-n`, `IA-R n`, `T-1`…`T-18`, `C12`/`C13`, `X-1`…`X-9`, and the `AD-n`
> decision register across **133 citing lines** **[verified this pass]**. §29's mechanical finding is
> **closed**.

And then, on 2026-08-06, five documents were reopened against the operator's two directives — and the same
gap reopened beneath them:

> **The plan of record names *none* of the reopen's registers.** `RM-1`…`RM-11`, `T-19`…`T-26`, `S-8`…`S-14`,
> `H1`…`H3`, `D-RM1`, `D-15`, `AD-22`, `AD-23`, `M2-16`…`M2-19`, `A2-8`/`A2-9`, `I-35`ᴮ, `R6`…`R9`,
> `RA-1`…`RA-5`, `IA-11`…`IA-14`, `IA-R11`…`IA-R17` — **zero matches, not few** **[verified this pass]**.

**This is not the same finding twice; it is the finding's shape.** A corpus of eight documents, each reopened
independently against operator guidance, produces registers faster than a single sequencing pass can absorb
them — and each pass is individually careful. Part III named that pattern for the `X-n` series (*"each phase
was individually careful; nothing reconciled them"*). §61 records that it is now **structural**, and §63 raises
it to a gap in its own right rather than a recurring observation.

**The second finding is the one the operator's instruction actually turns on**, and it is new:

> **The corpus states four different counts of the same chain, and no document reconciles more than two of
> them** (§62). Part IV counts **eight layers**; `02…§1.3` states **four layers in two branches**; `04…§3.6`
> states **four in the schema and five at runtime**; `05…§5A.2` counts **fourteen rows — nine persisted stores
> and three in-code derivations**. `06…§14.1` reconciles `02`'s four against `05`'s four and **does not
> mention `01`'s eight or `04`'s five** **[verified this pass]**.

All four counts are defensible and none is wrong; they count different things. But *"reduce to four layers"*
is an instruction with a numeral in it, and **the corpus cannot presently tell the Director which number is
being reduced, by how much, or when it has been achieved.** Under `05…§5A.5`'s count the target is already
met in the role vocabulary; under Part IV's it is a four-layer deletion; under `04…`'s it is one bypass.

**The one-sentence finding:** *the corpus has now specified the four-layer reduction and the simplified role
editor five times over, in five documents, at four different counts, with no workstream, no acceptance
criterion and no agreed baseline* — which is Part III's finding, one level up. Closing it is a Director act
(§67), not a worker one.

---

## 59. Method — unchanged, with one addition

§25's definition of a gap, its seven classes and its severity discipline are **carried unchanged**. Three
notes specific to this pass:

- **A closed gap is reported as closed.** §61 records `03`'s re-sequence as closing §29 before it records what
  reopened. A gap analysis that only accumulates is not measuring.
- **The reopen delta is measured as a set, not re-litigated.** §60 counts what the five reopened documents
  created; it does not re-verify their findings. Their evidence stands with them.
- **This part mints no decision.** Parts IV and V minted `D-RM1` and `D-15`; `04…` minted `AD-22`/`AD-23`.
  §64 shows that three independent minting acts on one day is itself the defect being reported, so this part
  **records the conflict and escalates it, and adds no number to the space it is complaining about.**

---

## 60. The reopen delta — what 2026-08-06 created

Every identifier minted by the five reopen passes, by owning document. **[verified this pass]**

| Document | Registers created | Count |
|---|---|---:|
| `01…` **Part IV** (role-model depth, editor) | `RM-1`…`RM-7`, `D-RM1` | 8 |
| `01…` **Part V** (the same, as a threat model) | `RM-8`…`RM-11`, `T-19`…`T-26`, `H1`…`H3`, `S-8`…`S-14`, `D-15` | 23 |
| `02…` (model, reopen) | `M2-16`…`M2-19`, `RA-1`…`RA-5`, `I-32`…`I-34` **[carried citations]** | ~12 |
| `04…` (authentication, reopen) | `A2-8`, `A2-9`, `I-35`ᴮ, `R6`…`R9`, `AD-22`, `AD-23` | 9 |
| `05…` (census, reopen) | §5A — no numbered IDs; a 14-row depth table and the four-layer target | 0 |
| `06…` (IA, reopen) | `IA-11`…`IA-14`, `IA-R11`…`IA-R17` | 11 |
| | | **≈ 60** |

**Honest deflation, on §29's precedent.** Sixty identifiers are not sixty independent defects. `RM-1`…`RM-7`
are model-shape observations that Part IV itself declares are *not* security findings (§44.2); `T-19`…`T-26`
include two — `T-23`, `T-26` — explicitly recorded as a second instance of a carried defect (`T-13`, `I-7`);
`H1`…`H3` are controls that **hold**, and belong in a coverage count rather than a defect count. Netting
those out leaves roughly **thirty distinct new findings**, of which the corpus rates one **S1** (`T-19`) and
four **S2**. The plan-coverage conclusion does not move: thirty and sixty are both *none of them*.

**What is genuinely new, and not a re-framing** — the four items an execution phase would not have known:

1. **`T-19`** — removal restores administration through two legacy stores no surface writes. **The corpus's
   only new S1**, and per `01…§55` the cheapest S1 closure in it.
2. **`T-20`** — the role editor's Active toggle revokes nothing at resolution.
3. **`IA-12`** — a role under-reports its own membership, buildable today with no decision.
4. **`H1`** — all five role-editing surfaces call the same four routes, so deleting 1,155 lines of legacy UI
   is security-neutral. **The corpus's first positive structural finding about authority location.**

---

## 61. Plan coverage, re-measured — closed once, reopened once

§29's table, re-run against the plan of record as it stands at `03efba377`.

| Register | Owner | Named in `03` at `cd24874cb` (§29) | Named in `03` today |
|---|---|:--:|:--:|
| `C1`…`C11`, `G1`…`G6` | `01…` Part I (accepted) | yes | yes |
| `C12`, `C13`, `M2-1`…`M2-15`, `A2-1`…`A2-7`, `IA-1`…`IA-10`, `T-1`…`T-18`, `X-1` | Mission 2 | **no** | **yes** — §23 binds every ID, bound or declared unassigned |
| `IA-R1`…`IA-R10`, `S-1`…`S-7`, `I-26`…`I-34` | Mission 2 | **no** | **yes** — §25's `RL-16`…`RL-42` |
| `AD-1`…`AD-21` | `02…` Part III | n/a | **yes** — §24, across 133 citing lines |
| **`RM-1`…`RM-11`** | reopen | n/a | **no** |
| **`T-19`…`T-26`** | reopen | n/a | **no** |
| **`S-8`…`S-14`** | reopen | n/a | **no** |
| **`H1`…`H3`, `D-RM1`, `D-15`, `AD-22`, `AD-23`** | reopen | n/a | **no** |
| **`M2-16`…`M2-19`, `A2-8`/`A2-9`, `R6`…`R9`, `RA-1`…`RA-5`, `I-35`ᴮ** | reopen | n/a | **no** |
| **`IA-11`…`IA-14`, `IA-R11`…`IA-R17`** | reopen | n/a | **no** |

**Two conclusions, and they point opposite ways.**

**The plan is now a good plan.** `03`'s re-sequence did the work Part III escalated: it bound every register,
declared its unassigned IDs explicitly rather than silently, added waves 6–12 including the revocation and
authentication waves Part III said had none, closed `X-3` and `X-5`, and raised `X-9` against its own
numbering. GAP-2's *"not one line of the authentication build is sequenced"* is **closed** — wave 8 is the
authentication build. **Part III's §26 workstream column is stale in the plan's favour**, and §63 amends it.

**And it has been outrun again.** The reopen's ~60 identifiers include the corpus's only S1, and the plan
that would schedule it does not know it exists. The distance is smaller than Part III's was — one week rather
than one mission, thirty findings rather than thirty-four — but the **mechanism is identical**, and it has now
happened twice with a careful pass on each side of it.

> **The structural reading.** `03` can only ever be current as of its last sequencing pass, and the corpus
> reopens per-document on operator guidance. **Nothing in the mission's process makes a reopen trigger a
> re-sequence.** Until something does, every reopen produces exactly this gap, and the gap analysis discovers
> it one phase later. This is recorded as **GAP-17** rather than as an observation, because a defect that has
> recurred once at scale is a property of the system, not an incident.

---

## 62. GAP-15 — the corpus states four counts of one chain

The measurement the operator's instruction requires and no document performs. All four are **[carried]** from
their owners and were re-read this pass; the divergence is **[verified this pass]**.

| Count | Source | What it counts | Number |
|---|---|---|:--:|
| **Eight layers** `L1`…`L8` | `01…§38` (`RM-2`) | Distinct stores or mappings a grant traverses to become a decision | **8** |
| **Four layers, two branches** | `02…§1.3` | Layers of *derivation* in the canonical model — one trunk, capability and scope branches composed at the gate | **4** (+2 branches) |
| **Four in schema, five at runtime** | `04…§3.6`, `§12.1` | The schema chain, plus `portalEligible` as a runtime fifth that satisfies a capability check on its own | **4 / 5** |
| **Fourteen rows — 9 stores + 3 derivations** | `05…§5A.2` | Everything `resolveAdminAccessCore` consults, in order, counting each legacy read separately | **14** |
| **Four nouns** | `05…§5A.5`, presented in `06…§15` | The operator's authoring layers: Person · Role · Capability · Scope | **4** |

**None of these is wrong.** They count derivation layers, persisted stores, runtime gates and operator nouns
respectively, and each document is explicit about its unit — Part IV even attaches a counting caveat (§44.3:
*"do not quote the number without §38"*). **The gap is that no artifact holds them side by side**, so the
instruction *"reduce to four layers"* has no defined starting number and therefore no defined completion.

**One reconciliation exists and it covers half the problem.** `06…§14.1` is exactly the right work: it shows
that `02`'s chain-four and `05`'s operator-four *"coincide in count by construction, not by identity"*, maps
one to the other, and raises `IA-11` — that presenting the operator's four as an ordered list re-encodes the
five-link chain the model abolished. **It does not mention `01`'s eight or `04`'s five** **[verified this
pass]**. So the corpus reconciles two of four counts, and the two it leaves out are the two that carry the
*security* argument (`RM-9`: the reduction closes an S1 and two S2s; `04…§3.6`: the runtime fifth layer is
the thing `W-13` must remove).

**Why this is a gap and not a pedantic complaint.** Three consequences, each concrete:

1. **The acceptance criterion cannot be written.** `07…` binds acceptance to IDs. *"The chain is four layers"*
   is satisfied today under `05…§5A.5`'s count and fails under all three others. No grader can mark it.
2. **The directives read as contradictory only under one count.** `RM-1` finds *"reduce to four layers"* in
   direct tension with *"without changing the access architecture"* — true under Part IV's eight-layer
   reading, where the reduction deletes L5, L6, L8 and L2's legacy reads. Under `05…§5A.5`'s reading, four of
   the six named reductions are **presentation-only** and the tension largely dissolves. `D-RM1` is therefore
   partly an artifact of which count the reader is holding.
3. **The two halves are already being scheduled against different baselines.** `04…§12.1` answers the
   directive with `W-13` and `AD-22`; `05…§5A.6` answers it with a presentation-only list; `01…§51` answers it
   with an ordering constraint over four deletions. **All three are the same instruction.**

> **GAP-15 — the depth reduction has no agreed baseline, and therefore no definition of done.** Class:
> **knowledge · register**. Constituents: `RM-2`, `02…§1.3`, `04…§3.6`, `05…§5A.2`, `05…§5A.5`, `IA-11`.
> Severity `—` (no threat entry; it is a measurement gap). Workstream: **none**. Blocked on: `D-RM1`.
> **Proposed, not written:** one reconciliation table, in `02…` where the canonical model lives, stating the
> unit of each count and which one the instruction governs. It is a page of work and it unblocks an
> acceptance criterion.

---

## 63. The gap register — amended and extended

§26's fourteen gaps stand. This section records what the re-sequence closed, what the reopen added to
existing rows, and three new gaps. **`W-n` in bold is an existing workstream; *italic* is a proposal.**

### 63.1 Amendments to the fourteen

| # | Change | Effect |
|---|---|---|
| **GAP-1** revocation | **+`T-19` (S1), +`T-20`, +`S-8`, +`S-9`, +`D-15`.** Workstream **no longer none** — `03…§16` wave 6 is the revocation wave | **Widened and now covered.** But wave 6 was sequenced before `T-19`; it addresses the cache, the missing disable verb and role deactivation, **not** the legacy re-admission path. **Still partially covered** |
| **GAP-2** authentication | Workstream **no longer none** — `03…§18` wave 8 | **Closed as a plan gap.** `AD-22`/`AD-23` are new inputs to it |
| **GAP-4** admission | **+`T-24`** — the authority-graph write gate is a role literal, capability second | `W-13`…`W-15` cover the pattern; `T-24` names a specific unlisted site |
| **GAP-5** capability vocabulary | **+`T-21`**, **+`IA-13`** — grants are unconstrained on `role_key`; the grid is a lens promoted to a layer | `W-10` covers the grid; **`S-10`'s FK has no workstream** |
| **GAP-6** role vocabularies | **+`T-21`** (phantom roles are grantable and enforceable) | Sharpens `M2-2`'s missing FK into an exploitable asymmetry |
| **GAP-7** resolvers | **+`M2-18`** — the roster is an eighth resolution site reading authority tables directly | `W-21` predates it |
| **GAP-9** enforcement as convention | **+`H1`** — a control that **holds**: five surfaces, four shared routes | **First positive.** Legacy UI deletion is security-neutral |
| **GAP-10** atomicity and audit | **+`T-23`, +`S-12`.** Workstream **no longer none** — `03…§22` wave 12 is audit | Atomicity now has a second table; **unify-save depends on it** (`RM-11`) |
| **GAP-11** tenancy | **+`T-26`, +`S-14`** — authority writes land in a lexicographically-picked org | `I-7`'s write-path form; `W-22` covers the read path only |
| **GAP-12** truthfulness | **+`IA-12`, +`IA-14`, +`T-22`, +`IA-R13`…`IA-R17`, +`R6`.** Workstream **no longer none** — `03…§21` wave 11 | **Eight mechanisms became eleven.** Wave 11 predates all three additions |
| **GAP-14** corpus integrity | **+`X-6`, `X-7`, `X-8`, `X-9`**, **+`X-10`, `X-11` (new, §65–66)** | `X-3`, `X-5` **closed**; `X-2` open and changed shape; four new |

**Net:** three of Part III's five uncovered gaps (GAP-1 partially, GAP-2, GAP-10, GAP-12) now have
workstreams. **Every one of those workstreams predates the findings this section adds to its gap.**

### 63.2 Three new gaps

| # | Gap | Constituents **[carried]** | Class | Sev | Workstream | Blocked on |
|---|---|---|---|:--:|---|---|
| **GAP-15** | **The depth reduction has no agreed baseline** — four counts of one chain, two reconciled (§62) | `RM-2`, `02…§1.3`, `04…§3.6`, `05…§5A.2`, `IA-11` | knowledge · register | — | **none** — *proposed: one reconciliation table in `02…`* | `D-RM1` |
| **GAP-16** | **The role editor is the corpus's most-specified unbuilt change.** Five documents now specify it — `01…§40-42`/`§52`, `02…§4.6` (`RA-1`…`RA-5`), `04…§3.7`/`§6.4` (`R6`…`R9`), `05…§5A.4-5A.6`, `06…§15` — and **no workstream builds it.** Five surfaces are candidates for "the role editor" and which one is meant is undecided | `RM-5`, `RM-6`, `RM-11`, `RA-1`…`RA-5`, `R6`…`R9`, `IA-R12`, `IA-R15`, `05…§5A.6` | plan | — | **none** | `D-RM1`; *"which of five surfaces"* (`01…§43`) |
| **GAP-17** | **The plan of record is outrun by every reopen.** `03` bound every Mission 2 register; the 2026-08-06 reopen created ~60 more and **nothing in the process triggers a re-sequence** (§61) | the reopen delta (§60) | plan · register | — | **none** — Director-owned | — |

**GAP-16 is the one to read twice.** It is not that the editor work is unclear — it is *over*-specified. Four
documents independently produced compatible specifications of the same screen, each bounded by its own
discipline, and the corpus contains **no artifact that merges them into one buildable description**. `01…§52`
sorts five changes by whether they touch a control; `05…§5A.6` sorts four by whether they need architecture;
`06…§15` gives the IA; `02…§4.6` and `04…§6.4` give the MUST/MUST-NOT constraints. **An execution phase
handed this assignment today would have to perform that merge itself, unreviewed**, which is precisely the
condition under which `RM-11`'s warning — *"a phase ends up changing a gate while believing it changed a
screen"* — comes true.

---

## 64. Decision coverage — the canonical register was superseded on the day it was ratified

Part III §30 found the decision register uncitable. **`02…` Part III fixed it**: 21 open decisions, the
canonical `AD-n` register, a three-clause renumbering rule, and `X-7`'s observation that nothing downstream
had bound to a colliding number yet — *"a window, and it is open today."*

**The window closed by use, not by ratification, and three documents minted into the register on the same
day.** **[verified this pass]**

| Act | Where | Into what | Status of the register it minted into |
|---|---|---|---|
| `AD-1`…`AD-21` proposed as canonical | `02…§25` | new `AD-n` space | **proposed, unratified** (`02…§26.2`) |
| `03…§24` binds **all twenty-one** | `03…` | the same space | **bound by use** — `X-7` superseded (`03…§26`) |
| `07…`'s audit criteria already used `AD-1`…`AD-5` | `07…:136-140` | **the same prefix, four days earlier** | **collision** — `X-9` |
| `AD-22`, `AD-23` minted | `04…§7.1` | the same space, past its stated end | register is no longer 21; `02…§25` and `03…§24` both say 21 |
| `D-15` minted | `01…§55` | **the legacy `D-n` space**, which `02…§26.2` proposed to retire | unregistered in `AD-n`; `02…§25`'s highest legacy is `D-14`/`D-IA4` |
| `D-RM1` minted | `01…§43` | a **third** convention (`D-` with an `RM` qualifier), deliberately | outside both spaces |

**So the corpus now holds twenty-one canonical decisions, two minted above them, one minted beside them in a
space being retired, and one minted in a namespace of its own — against a rubric that uses the same prefix
for something else entirely.** Every act is individually defensible and each document says why it chose as it
did. `01…§55` even flags its own risk: *"`D-15` is at risk from the collisions §18/§30 record."*

**The measurable state:**

- **Open decisions: 25** — `AD-1`…`AD-21`, `AD-22`, `AD-23`, `D-15`, `D-RM1`. No single document lists them.
- `03…§24` gates its waves on 21 of the 25 **[verified this pass]**.
- `D-RM1` is the decision that **governs both operator directives** (§62, §63.2) and it is gated by nothing.
- `02…§31`'s conformance check **`CR-2`** — *every cited decision resolves to exactly one defining site* —
  **would now fail**, and `CR-1` would fail on `AD-1`…`AD-5` against `07…`.

> **The recommendation, escalated not performed** (per the mission's document-authority rule and `01…§18`'s
> precedent): **ratify or reject `02…§26.2` before the next reopen, and adopt `03…§26.1`'s option (a)** —
> rename `07…`'s audit block to `AX-1`…`AX-5`, five IDs in one document that nothing cites by criterion ID.
> Then fold `D-15` and `D-RM1` into `AD-24`/`AD-25`. **This is now the cheapest it will ever be**, and it
> gets more expensive at each reopen — which is the same sentence `02…§24` wrote three days ago, one register
> earlier.

---

## 65. `X-10` — three requirement namespaces, one a substring of another

**Recorded as a corpus-integrity defect, not a product defect**, continuing the `X-n` series.

> **`X-10` — the corpus now carries `R n` (`04…§6.4`), `IA-R n` (`06…§7`, `§17`) and `RA-n` (`02…§4.6`) as
> three distinct requirement registers, and `R n` is a substring of `IA-R n`.** A word-boundary search for
> `R6`…`R9` in the plan of record returns **21 matching lines, every one of them inside `IA-R6`…`IA-R9`**
> — and `03` names `04`'s bare
> `R6`…`R9` **nowhere** **[verified this pass]**. The two registers are mutually invisible to the search that
> would find either.

This is `X-9`'s shape arriving from a third direction, and `03…§26.1` predicted the class of it when it
flagged the `AI-`/`IA-` transposition hazard and asked `RL-42`'s lint to catch it. **`R6` vs `IA-R6` is worse
than a transposition**, because a reader who greps is told confidently that the requirement is covered.

All three registers are well-formed in isolation: `RA-n` are role-*assignment* surface constraints, `R n` are
what an Access surface owes the *authentication* model, `IA-R n` are IA requirements. **Nothing reconciled
them.** *Recommendation, escalated not performed:* namespace `04`'s block as `AR-1`…`AR-4` at the next
Director pass — four IDs, cited today only by `06…§17`'s `IA-R17` row and `04`'s own §12.

---

## 66. `X-11` — required output #2's reopen material is uncommitted

> **`X-11` — `05-command-enforcement-census.md` §5A exists only as an uncommitted working-tree change**:
> **+274 / −8 lines** at `03efba377` **[verified this pass]**. It carries the corpus's most detailed depth
> measurement (the 14-row resolution table, §5A.2), the four-layer target (§5A.5) and the
> presentation-vs-architecture split (§5A.6) — and **three committed documents cite it**: `06…§14.1` maps its
> four nouns against the canonical chain, `06…§16.2` carries its capability-has-no-chapter finding, and
> `01…§45` (Part V) cites `05…§2.1-2.2`.

**This is `X-5` recurring**, four days after `03…§26` recorded `X-5` as **CLOSED**. The failure mode is
identical — a required output's substance living in a working tree while other documents bind to it — and it
is now the second instance, which makes it a process property rather than an oversight. `04…§12.3` already
recorded the hazard from the other side: its citations into `05…` and `01…` are *"working-tree line numbers
and will drift when that work is committed."*

**Consequence, stated plainly:** at `03efba377` the corpus's four-layer specification is **partly
uncommitted**, and a reader who checks out `HEAD` gets `06`'s reconciliation of a section that is not there.
Committing it is not a worker decision about content — but the *state* is recorded here because a gap
analysis that did not notice its most-cited new input was uncommitted would have missed the same thing `X-5`
missed.

> **`X-11` — CLOSED at `687048eb6` (2026-08-06).** That commit lands `05…` §5A together with the rest of the
> reopen corpus (`01…`, `02…`, `03…` §4, `07…`, `wave0-authority-census.json`), so every citation into `05…`
> now resolves against a commit rather than a working tree. **Two things this does not close.** (1) The
> *process property* stands: two instances in four days of a required output's substance living uncommitted
> while other documents bind to it. `X-11` is closed as a state, not as a lesson — a corpus convention that
> a document is bindable only once committed is still unwritten. (2) **Line numbers cited into `05…` and
> `01…` from `04…§12.3` and from §69 below were taken against the working tree and have not been
> re-derived** against `687048eb6`; the *content* is identical, but any citation of the form `05…:NNN`
> should be re-checked before it is relied on.

---

## 67. What the two directives now cost, and what still blocks them

The operator asked for two things. Neither is blocked on discovery any longer — **both are blocked on one
decision and one merge.**

| | *Reduce to four layers* | *Simplify the role editor without changing the access architecture* |
|---|---|---|
| **Specified?** | **Over-specified** — four counts, two reconciled (§62) | **Over-specified** — five documents, one screen (GAP-16) |
| **Assessed for security?** | **Yes** — `01…§51`: closes one S1 and two S2s, weakens no control found | **Yes** — `01…§52`: three of five items need a control attached |
| **Sequenced?** | **Partly** — `W-10`, `W-13` exist and were sequenced for other reasons; **no depth-reduction workstream** | **No** — no workstream builds the editor |
| **Buildable today, no decision?** | `S-8`'s legacy-read removal, *after* one database question (§49) | `IA-R13`/`IA-R14` (`IA-12`), `T-22`'s seven-line fix, the two placeholder tabs |
| **Hard constraint** | **`RM-10`'s ordering** — L8 must not be removed before L4 is seeded and enforced, or the platform fails closed with no grants | **`H2`'s lock** — a grant save must preserve the 14 keys the grid cannot display |
| **Blocked on** | `D-RM1`, and `GAP-15`'s missing baseline | `D-RM1`, and *which of five surfaces* (`01…§43`) |

**Three things are true at once, and the Director needs all three:**

1. **The instruction is safe.** `RM-9` — the layer reduction weakens no enforcement control this corpus could
   find, because five of the eight layers never deny anything. The *"no access-architecture change"*
   constraint, read against the eight-layer count, **protects compatibility surfaces and one bypass**.
2. **The cheap work is real and unblocked.** `T-22`, `IA-12`, the placeholder tabs and the legacy-UI deletion
   (`H1`) need no decision, no migration and no resolver change. **None is scheduled.**
3. **The expensive work is one decision away, not one discovery away.** Nothing further needs to be
   inventoried. `D-RM1` chooses a reading; `GAP-15` supplies the baseline; `GAP-16`'s merge produces the
   buildable description. **Discovery on this subject should stop.**

> **Recorded for the Director, not decided here:** the corpus has now spent five reopen passes on two
> directives and produced ~60 identifiers, four counts and zero scheduled work. Per the mission's prohibition
> on reinterpreting Compiled Mission intent, **this part does not choose the reading** — but it records that
> a sixth documentary pass would produce a seventh register rather than a built screen.

---

## 68. What the corpus still cannot answer

§33's list, re-run. **Closed:** *"which findings are in the plan"* (`03…§23`), *"what the authentication build
is"* (wave 8), *"how decisions are numbered"* (`AD-n`, proposed). **Still open, and three are new:**

1. **Does any live principal hold a legacy `admin`/`ops` row?** (`T-19`, `S-8`, `D-15`.) One query. It decides
   whether the corpus's only S1 is live or structural, and it is the precondition of the cheapest S1 closure.
2. **Is any authority change durably recorded anywhere?** Still unassessed by every document — wave 12 exists,
   but `01…§54`'s bottom row shows **no control in the authority chain is regression-locked by a test**.
3. **Which of the five role-editing surfaces do operators actually reach?** No browser has been opened in any
   pass (`01…§44.1`, `§57.1`, `04…§12.3`). `H1` establishes shared routes, **not** equivalent behaviour.
4. **Which layer count governs?** (New — GAP-15.)
5. **What is the one buildable description of the simplified editor?** (New — GAP-16.)
6. **What triggers a re-sequence of `03` after a reopen?** (New — GAP-17.) Today: nothing.

---

## 69. Reproduce

```bash
# §58 / §61 — the plan of record names NONE of the reopen's registers (expect: no output)
rg -n 'RM-[0-9]|\bT-(19|2[0-6])\b|\bS-(8|9|1[0-4])\b|\bAD-2[23]\b|\bD-15\b|\bD-RM1\b' \
   docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
rg -n '\bIA-1[1-4]\b|\bIA-R1[1-7]\b|\bM2-1[6-9]\b|\bA2-[89]\b|\bRA-[1-5]\b|\bI-35\b' \
   docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md

# §58 / §61 — but §29's finding IS closed: the AD-n register is bound 133 times
rg -c '\bAD-[0-9]+\b' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md   # 133
git log --oneline -3 -- docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md

# §62 GAP-15 — four counts of one chain, and the reconciliation that covers two
rg -n 'eight layers'          docs/platform/planning/access-identity-v2/01-existing-state-inventory.md
rg -n 'One chain'             docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md
rg -n 'fifth layer'           docs/platform/planning/vacilando-os/qa/access-identity-v2/04-authentication-model.md
rg -n 'Nine persisted stores' docs/platform/planning/vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md
rg -n 'eight layers|§38'      docs/platform/planning/vacilando-os/qa/access-identity-v2/06-product-ia-and-flows.md
#   → 06 §14.1 reconciles 02's four against 05's four; no match for 01's eight

# §64 — the decision register was superseded on the day it was bound
rg -n '\bAD-2[23]\b' docs/platform/planning/vacilando-os/qa/access-identity-v2/04-authentication-model.md   # §7.1
rg -n 'twenty-one'   docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md            # §24
rg -n '\*\*D-15'     docs/platform/planning/access-identity-v2/01-existing-state-inventory.md              # §55

# §65 X-10 — R n is a substring of IA-R n
rg -c '\bR[6-9]\b' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md   # 21 lines, ALL inside IA-R6..IA-R9
rg -n '^\| \*\*R[6-9]\*\*' docs/platform/planning/vacilando-os/qa/access-identity-v2/04-authentication-model.md

# §66 X-11 — output #2's reopen material is uncommitted
git diff --stat -- docs/platform/planning/vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md
```

---

## 70. Limits — read before citing

1. **Documentary and static.** No request issued, no browser, no database, no test, typecheck or build. This
   part asserts **no new product defect**; every defect cited is owned by an earlier document or part, and
   every severity is carried from `§14`/`§47` unchanged.
2. **The reopen's findings were not re-verified.** §60 counts identifiers and §63 binds them to gaps; it does
   **not** re-derive `T-19`…`T-26`, `RM-1`…`RM-11`, `M2-16`…`M2-19`, `A2-8`/`A2-9` or `IA-11`…`IA-14`. Their
   evidence, and their limits, stay with their owners — including `T-19`'s unchecked precondition.
3. **"≈60 identifiers" is a count of minted IDs, not of defects**, and §60 states the deflation to ~30
   explicitly. **Do not quote the larger number as a defect count.**
4. **§62's four counts are a reading of four documents, not a recount of the code.** This part did **not**
   re-traverse `resolveAdminAccessCore` to adjudicate between eight, fourteen and five. It asserts only that
   the corpus states four numbers and reconciles two — which is a documentary fact, and is the gap.
   **Nothing here rules that any count is wrong.**
5. **§63.1's workstream amendments are read from `03`'s wave titles and coverage table, not from a line-level
   audit of each wave.** "Wave 6 does not address `T-19`" rests on `T-19` being absent from the document
   (**[verified]**) and on wave 6's stated scope — **not** on a reading of every task in it. A wave could
   incidentally close a finding it does not name.
6. **The plan-coverage measurement is a name search.** As §29 noted for its own version: a workstream can
   address a finding without citing its ID. The claim is *the plan does not name these*, which is what a
   coverage table and a regression lock actually bind to.
7. **GAP-15, GAP-16 and GAP-17 are gap numbers minted by this part** in `01…§26`'s space, which `03…§23`
   binds. They will need binding at the next re-sequence, and they are the first three IDs to test GAP-17
   against.
8. **This part deliberately mints no decision** (§59), so the four-layer question remains `D-RM1`. It also
   **creates, renumbers and re-sequences no workstream** — §63's `Workstream` column reports `03`'s content
   and proposes in italics, exactly as §26 did.
9. **`X-10` and `X-11` are corpus-integrity findings in the `X-n` space** and inherit `X-9`'s numbering risk:
   if the Director renumbers, they travel with the rest.
10. **Citations into `05…` are against the working tree**, not `03efba377` — that is `X-11` itself, and every
    `05…§5A n` reference in this part will drift when that work is committed. **Update:** it was committed, at
    `687048eb6`. Section references (`05…§5A.2`, `§5A.5`, `§5A.6`) are stable and carry over unchanged; **line
    references do not** and have not been re-derived. See `X-11`'s closure note in §66.
11. **Scope discipline.** The assignment names one output path and **only that file was written.** As in Parts
    IV and V, `README.md` was not updated; Parts IV, V and VI are absent from its document table. Recorded as
    a standing follow-up.
12. **Read-only.** No source, schema, migration or UI was modified by this phase.

---

## 71. Provenance — Part VI

- **Verified at `03efba377`** in `wt6-director-experience-dx5-5-continuation`, with `05…` read from the
  working tree (`X-11`).
- **Read this pass:** `01…` §§24–36 (Part III, in full) and §§37–57 (Parts IV and V, in full);
  `02…` §§24–32 (Part III — the decision register, collision map and `X-6`…`X-8`) and its §11 reopen block;
  `03…` §§0–41 by heading, with §§23–27 read in full; `04…` §§6.4, 7.1, 12.1–12.4;
  `05…` §5A.1–5A.6 (working tree); `06…` §§14.1–14.3, 15, 16.1–16.3, 17, 18.1.
- **Mechanical checks:** every command in §69, each re-run at `03efba377`.
- **Corrected this pass:** Part III §24/§29's headline — *"the plan has not moved"* — is **no longer true**
  and is superseded by §61. Part III's text is left unedited, per the corpus's convention that a part records
  its state at its date; §61 is the correction of record.
- **Not re-verified:** all carried findings, all severities, all line numbers cited from earlier parts.

---

# Part VII — Mission 3 re-anchor: the accepted register, re-adjudicated

> **Mission** `msn_65f073b2e01cec4cbc` v1 · phase *Existing-state inventory* · assignment `asg_96b19f5fa19a50`
> **contentHash** `282eace8ea5a991546ba9e8b1c19fc7e`
> **Worktree** `wt5-vacilando` @ `2a8d332a6` (branch `agent/cursor/5-governed-approval-complete`,
> **30 ahead / 1 behind** `origin/staging`)
> **Date** 2026-09-01
> **Sources** `web/`, `supabase/migrations/`, `docs/platform/planning/access-identity-v2/`
> **Method** static and file-grounded, as Parts II–VI. Every current-state claim cites `path:line` and was
> read in this pass. Claims carried without re-derivation are marked **[carried]**.
>
> **Reuse, not re-derivation.** The accepted corpus is this part's input. It does not restate Part I's chain,
> Part II's threat register, Part III's gap register, Part IV's layer count or Part V's controls. It does one
> thing those parts cannot do for themselves: **it asks whether they are still true.**

---

## 72. Headline — the resolver's findings are closed; the door is not

Part VI's headline was *"the plan caught up, and was outrun again the same week."* One month later the
relationship has inverted. **The plan has been executed. This document's own findings about the resolver are,
with one exception, closed in code** — and what remains open is not a defect the inventory found. It is the
one thing the inventory never called a defect: **the front door.**

Three facts, each verified in this pass, carry the whole part:

1. **The four-layer model exists as a declared enumeration.** `web/lib/admin/authorityLayers.ts:55` declares
   `AUTHORITY_LAYERS = ["membership", "role", "capability", "scope"]`, `:83-121` maps every store the resolver
   reads onto one of them, and `compatibilitySources()` at `:129-131` **returns an empty list** — the legacy
   fallback that §1 and §2 built their case on is gone from the enumeration because it is gone from the code.
2. **The legacy fallback, the UUID sort, the read-failure fail-open and the scope bypass are all deleted.**
   `resolveAdminAccessCore.ts` is now 539 lines of which the majority is the argument for each deletion:
   `W-20` (`:240-271`), `W-22` (`:178-238`), `W-43` (`:118-161`, `:273-301`), `W-42` (`:20-42`), and `W-8`
   recorded at `accessScope.ts:46-51` — *"Both are deleted rather than neutered."*
3. **Admission is still `roleKeys ∋ {admin, ops}`, evaluated against a literal set in application code.**
   `resolveAdminAccessCore.ts:18` is byte-identical to what §1 recorded on 2026-08-03. **485 of 602 route
   files** under `web/app/api` name one of the three helpers that turn it into a 403
   (`getAdminContext.ts:38-39`, `adminRouteGate.ts:45-47`). The capability that `W-13`'s own docstring says
   replaces it — `portal.access` — **is seeded by no migration and enforced at no site** (§79).

**So the shape of the current state is the inverse of the accepted artifact's.** In July the platform had a
rich door and no rooms: a strong admission check and a capability vocabulary that decided almost nothing. It
now has rooms — 59 catalog keys, a declared route-capability table, health as its own grantable area, surface
declarations joined to the routes behind them — **and the same July door.** Two of the four roles the product
ships and can assign still cannot open it.

This part mints three new findings, in the `M3-n` space: `M3-1` (§79), `M3-2` (§80), `M3-3` (§81). It closes
nothing on its own authority and creates no workstream.

---

## 73. Method — what this pass re-derived, and what it did not

**Re-derived from the tree, this pass:** every claim in §§75–81. Each was read at the line cited, at
`2a8d332a6`, in this worktree.

**Carried without re-derivation:** every severity, every threat ID, every finding whose disposition §75 marks
**[carried]**, and all of Parts I–VI's line numbers. Where a carried claim's line number has moved, this part
says so rather than silently re-citing — `resolveAdminAccessCore.ts` grew from ~250 lines to 539, so **every
line reference into that file from Parts I–VI is stale**, and §84 states the rule for reading them.

**What "closed" means here, and it is deliberately weak.** A finding is marked **closed** when the code
construct it named is absent from the tree and something in the tree asserts its absence — a test, a foreign
key, a database constraint. It is **not** a statement that the remediation was correct, that it was applied to
the shared database, or that a regression lock passes. **This pass executed no test** (§82), so every
"closed" here is a *static* closure. That is the same standard Parts II–VI used, stated once more because
this part closes more findings than any before it.

---

## 74. Provenance of the delta — the base moved by 1,622 commits

Part VI verified at `03efba377`. This pass verifies at `2a8d332a6`, and `git rev-list --count 03efba377..HEAD`
is **1,622**. That is not an access initiative running for a month; it is the whole platform's staging line,
merged into a worktree whose own branch is about the Vacilando runtime, not about access.

**That is the right base for an existing-state reading, and it is worth saying why.** Every prior part read a
tree in which the access work was the branch's own work-in-progress. This one reads access surfaces it
*inherited* — they arrived through `origin/staging` from other programs' merges. What it measures is
therefore what the platform actually carries, not what one branch was mid-way through proving.

The commits that moved these surfaces, by their own subject lines:

| Commit | What it did |
|---|---|
| `1025d65e2` | `docs(access): give the D2/I-10 decision its governed frontmatter` — last commit into this folder |
| `a61f989e0` | `chore(access): the promotion set is ten required, proven A&I migrations` |
| `cfa6f6485` | `docs(access): Q15 answered on the deployed tenant — and C1 alone would have been wrong` |
| `95a76983e` | `feat(health): D-H6 — a health access boundary enforced server-side` |
| `cfda30e61` / `db95621c6` | `feat(safeguarding): a canonical owner for what is currently forbidden` / `do not widen another program's frozen permission catalog` |
| `33cae6715` | `fix(identity): person owns a person-backed child's identity, at the shared seam` |

The last of these is the one an inventory must not over-read. **It does not close §1.** No migration adds a
principal column to `persons` (`rg 'ALTER TABLE .*persons ADD COLUMN.*(user_id|auth)' supabase/migrations` →
no match), and `web/lib/access/memberIdentityProjection.ts` — the module that projects a *member's* identity —
names no person. The identity split §1 recorded is **open and structurally unchanged**.

---

## 75. The accepted register, re-adjudicated

Every finding this document has opened, against the tree at `2a8d332a6`. **Disposition is static** (§73).

| Finding | State at §0 (2026-08-03) | **State now** | Evidence |
|---|---|---|---|
| **§1** identity split — `persons` carries no principal link | open | **OPEN — unchanged** | §74 |
| **C1** mentioning `permissionKeys` ≠ enforcing it | open | **NARROWED — materially** | §77 |
| **C3** triple catalog, dual FKs | closed | **closed, and the views are gone** | `20260818240000_w60_m20_drop_catalog_compatibility_views.sql` |
| **C5** unsavable Workflows row | closed | closed **[carried]** | §2.3 |
| **C6** two personas cannot log in | open | **OPEN — verified, and now the load-bearing one** | §79 |
| **C7** multi-role schema, single-role write path | open | **OPEN at the write path, guarded twice** | §78 |
| **C8** role widens a scope dimension | open | **CLOSED** — `W-8` | `accessScope.ts:46-51` |
| **C10** RLS authorizes `owner`/`manager` | open | **SPLIT: application half CLOSED, SQL half OPEN** | §78 |
| **C11** second resolver diverges | open | **NARROWED, not closed** | §78 |
| **C12** Phase 0 and Wave 1 closed C5 incompatibly | new | **resolved by measurement** | `catalogVocabularyReconciliation.test.ts:157-167` |
| **C13** orphaned `ops.workflows.*` capability | new | **RECORDED, not closed** — both keys on the 35-key deletion list; deletion is `OD-3` | `unenforcedPermissionKeys.json` |
| **G2** routes gating on `access.ok` alone | closed | closed **[carried]** | §3.1 |
| **G3** self-elevation | partial | **still partial — the ceiling is still absent** | §78 |
| **G4** new membership gets no access profile | open | **CLOSED at the write path** — `W-5` | `web/app/api/admin/users/route.ts:175-181` |
| **G6** RLS is not a backstop | open | **OPEN — narrowed by 1.3 points** | §77 |
| **C2, C4, C9, G1, G5** | carried | **carried, not re-derived** | §7.1 |

**Twelve of the nineteen rows now read closed, carried-closed, or resolved.** That is the single largest
movement this document has recorded, and it is the reason §72 says the inventory is now mostly historical.

One row deserves emphasis because it is the plan's own hardest case. **G4 is closed by construction, not by
convention.** `POST /api/admin/users` no longer touches `user_roles`; it calls
`createMembershipWithAccessProfile` (`route.ts:177`), and the comment above it at `:175-176` states the rule
the closure rests on — *"membership + access profile are one transaction. Never insert into `user_roles`
directly here."*

---

## 76. The workstream census — 51 of 62 named, and naming is not shipping

`03…` defines `W-1`…`W-62`. Counting distinct workstream identifiers that appear on any line under `web/` or
`supabase/migrations/`:

| | Count |
|---|---:|
| Plan workstreams `W-1`…`W-62` | 62 |
| …named somewhere in the tree | **51** |
| …**not** named anywhere | **11** — `W-19`, `W-21`, `W-23`, `W-24`, `W-25`, `W-27`, `W-29`, `W-34`, `W-37`, `W-48`, `W-53` |
| `W-0` (the census) | named |

**This is a name search, and §29's limit applies to it verbatim: a workstream can be executed without citing
its ID, and a workstream can be cited in a docstring without being executed.** It is reported because the
corpus made its workstream IDs load-bearing — the docstrings in `resolveAdminAccessCore.ts`,
`authorityLayers.ts`, `canManageUsersAndRoles.ts` and `canReadAnalytics.ts` all open by naming theirs — so
absence from the tree is meaningful evidence about a program that habitually leaves that trace. **It is not
proof.**

The absences are also not random. `W-23`, `W-24`, `W-25`, `W-27` and `W-53` are the **lifecycle and audit**
band — the credential half of revocation, and the authority audit store `03…§27.3` says must not be sized
before `W-23`'s Q7. `03…§33` already tiers `W-53` as the widest error bar in the plan. **The band the plan
called its most dangerous is the band with no trace in the tree.**

---

## 77. The census, refreshed

| Measure | Accepted (2026-07-30) | Part I (2026-08-03) | **Now (2026-09-01)** |
|---|---:|---:|---:|
| `route.ts` files under `web/app/api` | 539 | 559 | **602** |
| …holding a service-role client | 517 | 534 | **567** (94.2%) |
| …resolving `getAdminAccessContext` | 88 | 89 | **103** |
| …naming an admission helper | — | — | **485** |
| Files in `web/lib` mentioning `permissionKeys` | 11 | 13 | **21** |
| Test files under `web/tests/access` | — | — | **49** |
| Migrations under `supabase/migrations` | — | — | **362** |
| Catalog permission keys | 57 | 57 | **59** (§81) |
| Catalog keys with **no** enforcement site | — | — | **35** |

**C1 is materially narrowed, and this is the first pass that can say so with the ratio rather than the
count.** In August the two new `permissionKeys` files were `canReadAnalytics.ts` and
`selfAuthorityMutation.ts`, and §4 correctly refused to call that enforcement. The 21 files now include
`web/lib/health/healthAccess.ts`, `web/lib/communications/communicationPermissions.ts`,
`web/lib/documents/assertDocumentAccess.ts`, `web/lib/ai/aiEnrichmentPermissions.ts`,
`web/lib/agent/configLayoutAssist/configurationProposalAccess.ts`,
`web/lib/operationalExpectations/*/…ServerContext.ts` and `web/lib/access/surfaceCapabilities.ts` — **modules
whose entire purpose is to decide a capability question**. The over-report ratio §4 put at roughly 30× is no
longer the right instrument; the honest instrument is §77's last row, and it says **35 of 59 catalog keys
still decide nothing**.

**G6 is narrowed by 1.3 percentage points and unchanged in kind.** 567 of 602 route files hold a service-role
client. For that surface, the check inside the handler's own module graph is still the only authority that
exists.

---

## 78. Enforced vs configured — current

Part I §5's table, re-read line by line. Changed rows in bold.

| Authority concept | Configured | Enforced |
|---|---|---|
| Authenticated session | yes | yes |
| Org membership / tenant isolation | yes | yes |
| Portal eligibility (`admin`/`ops`) | yes | **yes — still the primary API gate, at 485 route files** |
| **Ambiguous multi-org membership** | n/a | **refused** — `W-22`, `resolveAdminAccessCore.ts:233` |
| **Legacy role fallback** (`user_profiles.role`, `app_users.role`) | **deleted** | **n/a** — `W-20`, `:240-271` |
| **Failed grant read** | n/a | **denies** — `W-43`, `:281-301`, `:344` |
| **Failed scope-profile read** | n/a | **denies** — `W-43`, `:136-138`, `:358-360` |
| **Absent scope profile** | representable as `unset` — `W-47` | **`legacy-all` — still fail-open**, `:60` |
| Analytics read (`reports.read`/`.write`) | yes | **yes, and admission no longer satisfies it** — `W-13`, `canReadAnalytics.ts:45-49` |
| Users & Roles manage | yes | **yes, capability only** — `W-13`, `canManageUsersAndRoles.ts:35` |
| Users & Roles catalog read | yes | **yes, on a weaker key** — `settings.users_roles.read`, `:72-79` |
| **Health view / manage** | **yes — `health.view`, `health.manage`** | **yes** — `healthAccess.ts`, `admin/health/card/route.ts` |
| Self-authority mutation | n/a | banned unconditionally — `W-2` |
| Delegation ceiling on other users | **no** | **no — D3 / W-18 still open** (`users/[userId]/role/route.ts:45` validates only that the target role is an active `role_definitions` row) |
| `ops.workflows.*` | seeded, granted to `admin` | **no** — on the deletion list (C13) |
| Custom personas (`regional_lead`, `school_director`) | **yes — assignable, FK-constrained, grantable** | **no — cannot pass the admission gate** (C6, §79) |
| RLS roles `owner` / `manager` | **never seeded, and now structurally unassignable** — `W-16` FK | **application half gone (`W-44`); 30 `CREATE POLICY` statements still name `'owner'` — `AD-4`, open** |
| Multi-role membership | yes (schema + resolver union) | **read yes; write still replaces** — `W-54` refuses a partial-view replacement, `M2-17` itemizes the loss, `W-17` outstanding |
| Department scope | yes | **yes — the portal bypass is deleted** (`W-8`) |
| Site scope | yes | **yes, and now created with the membership** (`W-5`) |
| Access profile on new membership | intended | **yes — one transaction** (`W-5`, G4 closed) |
| Operator preview of effective access | yes | **narrowed: same constant, same normal form, same denial** — `:441-445`, `:456-458`, `:467-470`; **still a second implementation** |
| person → user identity | **no** | n/a — relation does not exist (§74) |

**C11 is the row to read carefully.** `resolveAdminAccessDimensionsForOrgMember` still exists at `:420` and
still recomputes the whole answer. What changed is that its three divergence *mechanisms* were removed by
name: it calls the same `normalizeRoleKey`, reads the same `ABSENT_PROFILE_ENFORCEMENT` constant, and denies
on the same failed grant read, each with a comment saying why a local copy was the defect. **A second
implementation that has been forced to agree is a smaller finding than a second implementation that
disagrees. It is not the same finding as closed**, and `IA-R4`'s *"MUST NOT have a second implementation"* is
unsatisfied.

---

## 79. `M3-1` — the admission door is still a role literal, and it is what keeps C6 open

**Finding.** The platform can now express, grant, scope and enforce a capability. It cannot express
*admission* as one. Admission is `PORTAL_ROLES = new Set(["admin", "ops"])`
(`resolveAdminAccessCore.ts:18`), consulted through three helpers that all resolve to the same 403:

```ts
if (!bundle.portalEligible) return { ok: false, status: 403 };   // getAdminContext.ts:38-39
if (!bundle.portalEligible) return { ok: false, status: 403 };   // adminRouteGate.ts:45-47
```

**485 of 602** route files under `web/app/api` name `loadAdminRouteGate`, `requireAdminOrOps` or
`getAdminContextCached`.

**Why this is a Mission 3 finding and not a restatement of C6.** C6 said *the platform ships two named
personas it cannot admit to the portal*. That was a supply observation — Phase 0 seeded roles nothing could
reach. It is now a **demand** observation, because everything downstream of the door was built:

- `regional_lead` and `school_director` are **assignable by construction** —
  `20260818190000_w16_user_roles_role_foreign_key.sql` foreign-keys `user_roles.role` to `role_definitions`,
  and `neverSeededRoleVocabulary.test.ts:29` enumerates all four as `ASSIGNABLE`;
- they can hold capabilities — `role_permission_grants` is keyed by `role_key`, and the role editor writes
  it (`20260820140000_w58_save_role_definition_and_grants.sql`);
- the operator can see and compose them — `d2-i10-role-composition-decision.md` (2026-08-21) recommends
  composable roles *because the platform already implements them*;
- and every one of those grants is unreachable, because the request 403s at the door.

**The replacement was named and has not shipped.** `W-13`'s migration comment states it in the product's own
words: *"The `portalEligible` leg is what W-13 replaces with a `portal.access` capability"*
(`20260819120000_w13_i35b_analytics_read_preservation.sql:14`). `portal.access` appears in the corpus, in
`README_ADMIN_AUTH.md`, and in one reviewed `reason` string in `routeCapabilities.declared.json:313`. **It is
inserted into `permission_definitions` by no migration and read by no gate.** `W-13` removed the three sites
where admission *authorized*; `W-14`/`W-15`, which would make admission itself a capability, are the open half.

**Measured, that half is 91% unstarted.** `web/scripts/routeCapabilities.declared.json` — `W-14`'s
mechanism, reviewed 2026-08-27 — enumerates every exported handler at method grain:

| Status | Count | Meaning (from the file's own `note`) |
|---|---:|---|
| `declared` | **28** | requires a catalog capability key |
| `none` | **43** | reviewed assertion that the handler legitimately requires none |
| `pending` | **714** | `W-15`'s burndown backlog |
| **total** | **785** | |

The ratchet is `max_pending: 693`, and 21 handlers are listed as `inherited` from other programs, so the
committed assertion `pending − inherited ≤ max_pending` holds exactly at the ceiling. **The mechanism is
real, tightly locked and honest about its own incompleteness.** `28 / 785 = 3.6%`.

**Severity: this is the highest-value open item in the corpus, and it is not a security defect.** Nothing
here admits anyone who should be refused — the door is if anything too narrow. It is a **product** finding:
the access model the operator is now shown, and can now configure in detail, stops at a boundary the operator
cannot configure at all. `03…§21` owns it as `W-14`/`W-15`; this part adds only the measurement.

---

## 80. `M3-2` — "the one uncatalogued key is still the only one" is a claim about three directories

**Finding — confirmed statically.** `web/tests/access/catalogVocabularyReconciliation.test.ts` states, in its
module docstring at `:32-35` and again in its test name at `:169`:

> *"The one uncatalogued permission key is still the only one."* … `communications.send.emergency` … *"has no
> catalog row and nothing binds it to the resolved permission set."*

**That claim is false of the tree.** Two more permission keys are declared in product source and neither has
a catalog row:

```
web/lib/safeguarding/safeguardingRestriction.ts:93   view:   "crm.customers.safeguarding.view"
web/lib/safeguarding/safeguardingRestriction.ts:94   manage: "crm.customers.safeguarding.manage"
web/lib/pos/processingIdentity/commands/handlers.ts:934   requiredPermission: "crm.customers.safeguarding.manage"
```

The third is not a declaration. It is the `requiredPermission` on a live command handler — **an enforcement
site for a key the catalog does not contain**, which is the precise shape the test's own title claims is
unique to `communications.send.emergency`.

**Why the test nevertheless passes, and why that is the finding.** The assertion filters the scan's own
results by path before comparing:

```ts
const declared = [...scan.uncatalogued.entries()]
    .filter(([, sites]) => sites.some((s) => /communications|admin\/rbac|access/.test(s)))   // :170-171
    .map(([key]) => key)
expect(declared).toEqual(["communications.send.emergency"]);                                 // :174
```

`web/lib/safeguarding/…` and `web/lib/pos/…` match none of `communications`, `admin/rbac`, `access`. The scan
**does** reach them — `permissionCatalogDiscovery.ts:142` walks `web/app`, `web/lib`, `web/components`,
`web/scripts` — so the keys are in `scan.uncatalogued` and are filtered out one line before the comparison.

**This is `W-11`'s original defect, recurring one level up.** `W-11` existed because *"a parser pinned to one
`INSERT` shape saw 35 of 57 keys"* (`:28`). The discovery was fixed; **the assertion built on it was then
scoped to three directories and stated without scope.** A lock whose name is broader than its predicate does
not fail when the world changes — it silently narrows to the part of the world it still covers. `T-6`'s class
(a control that changes nothing) applied to the control that polices `T-6`.

**Disposition.** Corpus-integrity and lock-fidelity, not a product defect: no principal gains anything.
Nothing here says the safeguarding keys *should* be catalogued — §81 shows that was a considered decision.
The finding is that **the corpus asserts a uniqueness that has not held since 2026-08-25 and cannot detect
its own falsification.** Owner: the workstream that owns `RL-35`/`W-50`, since this is the same register.

---

## 81. `M3-3` — the catalog "freeze" is a named-decision gate, and one program read it as a freeze

**Finding.** Two programs met the same catalog lock one day apart and drew opposite conclusions.

**2026-08-25 — safeguarding declined to seed.** `20260825140000_child_safeguarding_restrictions_v1.sql`
states its reasoning in full:

> *"`crm.customers.safeguarding.view` / `.manage` are the right key names… Seeding them here would widen a
> catalog that another program has frozen — `w11-catalog-reconciliation.json` pins the width at 57 keys
> measured against the shared database, and its own tests say a worker may not append to it."*

It therefore shipped its access boundary through RLS policies, a propose-only command type, and a `CHECK`
constraint — and left the two right-named keys declared in code with nothing behind them, which is `M3-2`'s
second and third lines.

**2026-08-26 — health appended.** `20260826122000_dh6_health_visibility_permission.sql` inserts
`health.view` and `health.manage` into `permission_definitions` and grants both to every org's `admin`.

**Both are correct, because the lock is not a freeze.**
`catalogVocabularyReconciliation.test.ts:53-63` carries an `APPROVED_ADDITIONS` map whose docstring is
explicit: *"The lock's purpose is that nothing widens the catalog SILENTLY, not that the catalog can never
widen. Each entry names the decision that authorized it."* Health entered under `D-H6`. The lock then holds
the widened width by construction — `:74-75` asserts `catalog.size === 57 + added.length` — and `:139-147`
additionally requires every added key to have an enforcement site, so a seeded-but-inert health key would
fail.

**The finding is the misreading, and its cost.** Safeguarding was not wrong to be careful; it was wrong about
what the gate required, and the difference is a Director decision it did not ask for. The consequences are
concrete and both are live today:

1. **The catalog is 59, and `w11-catalog-reconciliation.json`'s `catalog_width: 57` is now a floor with an
   allowlist beside it** rather than a measured width. Any reader citing "57 keys" — including the D-H6
   migration's own comment at `:7` — is citing a number that stopped being the catalog's width the day after
   it was written.
2. **A real access boundary is enforced outside the capability vocabulary.** Safeguarding reads are
   authorized by `has_org_role(org_id, ARRAY['owner','admin','ops'])` and writes by
   `ARRAY['owner','admin']` (`:123-131`) — **role literals in SQL, including the never-seeded `owner`**. That
   is `C10`/`AD-4`'s open half acquiring a new instance a month after `W-44` closed the application half. The
   operator cannot grant safeguarding access to a role, cannot see it in the role editor, and cannot withhold
   it from `ops` the way `D-H6` withholds health.

**Disposition.** `M3-3` is a governance finding with a product consequence. It is not a request to seed the
keys — `IA-R6` forbids registering `.view` with no enforcement site, and the safeguarding migration says so
correctly at its close. It is the observation that **the corpus's catalog gate is legible enough to obey and
not legible enough to obey correctly**, and that the price was paid in the one domain where the platform
least wants an ungovernable boundary.

---

## 82. What this pass could not verify

Stated before the limits, because two of these are the reason §73 defines "closed" as weakly as it does.

1. **No test was executed. `npm ci` was attempted and not authorized in this session, and neither
   `node_modules/` nor `web/node_modules/` exists in this worktree** — `npx vitest run tests/access` fails at
   `Cannot find module 'vitest/config'`. **All 49 files under `web/tests/access` are unexecuted here.**
   Everything in §§75–81 is a reading of source, including `M3-2`, which is a claim about what a test's
   predicate covers and is therefore fully decidable statically — but *"`RL-35` passes"* is not asserted
   anywhere in this part.
2. **No database was consulted.** In particular: whether
   `20260807140000_backfill_membership_access_profiles.sql` has been **applied** on the shared target is
   unknown to this pass, and that is the precondition `resolveAdminAccessCore.ts:51-54` names for flipping
   `ABSENT_PROFILE_ENFORCEMENT` to `deny`. **The most consequential remaining switch in the resolver is
   blocked on a fact this part cannot establish.** `od2-staging-promotion-plan.md` and
   `q15-census-findings.md` are the artifacts that can; neither was re-run.
3. **`Q15` and `Q18`'s zeros are carried, not re-measured.** `W-20`'s and `W-22`'s deletions are safe
   *because* those censuses returned zero on the deployed tenant on 2026-08-19. This pass verified that the
   deletions happened and that the code records the evidence. It did not re-run the census, and a tenant
   onboarded since then could change the answer for `W-22` — a principal in two orgs is now **denied**, which
   is visible and safe, but it is a lockout, and `L1` is the class the plan treats most carefully.
4. **No claim is made about `origin/staging`.** This worktree is 1 commit behind it. Everything measured is
   measured at `2a8d332a6`.

---

## 83. Reproduce

```bash
# §74 — the size of the delta since Part VI's anchor
git rev-list --count 03efba377..HEAD                                        # 1622
git rev-parse --short HEAD                                                  # 2a8d332a6

# §72 / §79 — admission is unchanged, and its replacement is nowhere
sed -n '18p' web/lib/admin/resolveAdminAccessCore.ts                        # PORTAL_ROLES = {admin, ops}
rg -c "portal\.access" supabase/migrations                                  # no INSERT; comment only
rg -l "loadAdminRouteGate|requireAdminOrOps|getAdminContextCached" \
   --glob 'web/app/api/**/route.ts' | wc -l                                 # 485

# §79 — W-14's declaration table
python3 - <<'PY'
import json,collections
d=json.load(open('web/scripts/routeCapabilities.declared.json'))
print(d['reviewed'], d['ratchet']['max_pending'], len(d['inherited']['handlers']))
PY
rg -o '"status": "[a-z-]*"' web/scripts/routeCapabilities.declared.json | sort | uniq -c
#   28 declared · 43 none · 714 pending   (785 total)

# §75 — the deletions, each at the line that argues for it
rg -n "W-20|W-22|W-42|W-43" web/lib/admin/resolveAdminAccessCore.ts | head
rg -n "compatibilitySources" web/lib/admin/authorityLayers.ts               # returns []
rg -n "createMembershipWithAccessProfile" web/app/api/admin/users/route.ts  # :177  (G4)

# §77 — the census
rg -l --glob 'web/app/api/**/route.ts' '' | wc -l                           # 602
rg -l 'supabaseAdmin|createServiceRoleClient|SERVICE_ROLE' \
   --glob 'web/app/api/**/route.ts' | wc -l                                 # 567
rg -l 'permissionKeys' web/lib | wc -l                                      # 21
python3 -c "import json;print(len(json.load(open('web/lib/admin/unenforcedPermissionKeys.json'))['keys']))"   # 35

# §80 M3-2 — the uncatalogued keys the assertion filters out
rg -n "crm\.customers\.safeguarding" web/lib
sed -n '169,176p' web/tests/access/catalogVocabularyReconciliation.test.ts  # the path filter
sed -n '142p'   web/tests/access/permissionCatalogDiscovery.ts              # the scan DOES reach them

# §81 M3-3 — the same gate, read two ways, one day apart
rg -n "frozen|may not append" supabase/migrations/20260825140000_child_safeguarding_restrictions_v1.sql
rg -n "INSERT INTO public.permission_definitions" supabase/migrations/20260826122000_dh6_health_visibility_permission.sql
sed -n '53,63p' web/tests/access/catalogVocabularyReconciliation.test.ts    # APPROVED_ADDITIONS

# §78 — C10's SQL half, still open
rg -n "CREATE POLICY" supabase/migrations | rg -c "'owner'"                 # 30
```

---

## 84. Limits — read before citing

1. **Documentary and static.** No request issued, no browser, no database, no test, typecheck or build (§82).
   Every "closed" in §75 is a static closure and none of them is evidence that a lock passes.
2. **This part asserts no new *security* defect.** `M3-1` is a product finding, `M3-2` a lock-fidelity
   finding, `M3-3` a governance finding with a product consequence. No principal gains authority under any of
   the three. Severities for every carried finding stay with their owners, unchanged.
3. **Every line number Parts I–VI cite into `resolveAdminAccessCore.ts` is stale.** The file went from ~250
   lines to 539. `:18` survives by coincidence and was re-verified; `:44`, `:54`, `:62`, `:142`, `:209`,
   `:233` from §1's table do **not** mean what they meant, and §1's spine table must be read as a claim about
   *constructs*, not lines. This part re-derived only the constructs it cites.
4. **§76 is a name search**, with §29's limit in force: naming is not shipping and shipping need not name.
   The eleven absent IDs are evidence, not proof, and specifically **not** a claim that `W-53` was skipped.
5. **§79's `485` counts files that NAME an admission helper**, not files proven to gate on it at every
   exported method. `routeCapabilities.declared.json`'s 785 method-grain rows are the finer instrument, and
   where the two disagree the JSON is right.
6. **§77's "59 catalog keys" is derived from the migration tree, not from the shared database.** It is
   `57 + 2` where 57 is `w11-catalog-reconciliation.json`'s recorded width and 2 is `D-H6`'s approved
   addition. If a key was seeded outside `INSERT INTO public.permission_definitions`, this pass did not see it.
7. **`M3-1`…`M3-3` are minted in a new namespace and inherit `X-9`'s numbering risk.** They are deliberately
   not `C-n`, `G-n` or `GAP-n`: `03…§23` binds those spaces, and minting into a bound register from an
   unbound phase is what produced `X-9`. If the Director renumbers, they travel with the rest.
8. **This part mints no decision and creates, renumbers and re-sequences no workstream.** `M3-1` names
   `W-14`/`W-15` as its owners because the plan already assigns them; that is a report of `03`'s content, not
   a proposal.
9. **Scope discipline, with one deliberate exception.** The assignment names one output path and only that
   file was written — **including** this pass's correction of the file's own "four parts" header, which is
   inside that path. `README.md` was **not** updated and still omits Parts IV–VII; that is Part VI's standing
   follow-up, carried forward unresolved for the second time.
10. **Read-only.** No source, schema, migration, test or UI was modified by this phase.

---

## 85. Provenance — Part VII

- **Verified at `2a8d332a6`** in `wt5-vacilando`, branch `agent/cursor/5-governed-approval-complete`
  (30 ahead / 1 behind `origin/staging`).
- **Read in full this pass:** `web/lib/admin/resolveAdminAccessCore.ts` (539 lines),
  `web/lib/admin/authorityLayers.ts`, `web/lib/admin/canManageUsersAndRoles.ts`,
  `web/lib/admin/adminRouteGate.ts`, `web/lib/admin/adminPortalRolePick.ts`,
  `web/lib/admin/canReadAnalytics.ts` §§1–60, `web/lib/admin/unenforcedPermissionKeys.json`,
  `web/lib/access/capabilityTaxonomy.ts` §§1–90, `web/lib/access/surfaceCapabilities.ts` §§1–60,
  `web/lib/access/memberRoleAssignment.ts` §§1–45, `web/lib/access/memberIdentityProjection.ts` §§1–30,
  `web/tests/access/catalogVocabularyReconciliation.test.ts` §§25–185,
  `web/tests/access/neverSeededRoleVocabulary.test.ts` §§1–70,
  `20260826122000_dh6_health_visibility_permission.sql`,
  `20260825140000_child_safeguarding_restrictions_v1.sql` §§100–150,
  `web/app/api/admin/users/[userId]/role/route.ts` §§1–60,
  `d2-i10-role-composition-decision.md` §§1–55.
- **Read by heading:** `01…` §§0–71 (this file, all six prior parts); `03…` §§18–52 by heading, with the
  wave-13/14 tables read in full.
- **Mechanical checks:** every command in §83, each run at `2a8d332a6`.
- **Corrected this pass:** the file's own header block said **"This file has four parts"** while carrying
  six. Corrected to seven, with the omission recorded in the header itself rather than silently repaired.
  Parts V and VI's text is left unedited, per the corpus convention that a part records its state at its date.
- **Superseded by measurement, not by edit:** Part I §4's *"any audit that greps for `permissionKeys`
  over-reports by roughly 30×"* is no longer the right instrument (§77). Part I §3.5's *"G4 is the
  highest-value open defect"* is superseded — G4 is closed, and §79 names its successor.
- **Not re-verified:** all carried findings, all severities, `Q15`/`Q18`'s census zeros, the applied state of
  every migration, and every line number cited from Parts I–VI.
