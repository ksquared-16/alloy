# 01 — Existing-state inventory

> **This file has three parts.** **Part I (§§0–9)** is the existing-state inventory. **Part II (§§10–23)** is
> the **security threat & enforcement matrix** — required output #7. **Part III (§§24–36)** is the
> **gap analysis** — required output #8. Parts II and III were delivered by later Mission 2 phases and appended
> here per their assignment scopes; each reuses what precedes it rather than restating it. Read Part I first, or
> jump to [§10](#10-headline--the-unauthenticated-surface-is-the-best-defended-part-of-this-platform) or
> [§24](#24-headline--the-gap-is-no-longer-in-the-product-alone-it-is-between-the-corpus-and-its-plan).

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
