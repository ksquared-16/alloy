---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — security defect register

Against promoted staging `4f21979e6bec`. Every entry was verified at the cited lines, not relayed.

**Two defects here are more severe than SEC-1 through SEC-3 and postdate the accepted Thread 3
discovery checkpoint** (`7da936754`). They are listed first because severity, not discovery order,
should drive triage.

None was repaired. See *Repair posture* at the end.

---

## SEC-0 · Unauthenticated cross-tenant read and write on `contacts` — **CRITICAL**

| | |
|---|---|
| **Affected** | `POST /api/leads/gutters` → `findContactByEmail` / `findContactByPhone` / `updateContact` (`web/lib/supabase.ts:50,83,181`) |
| **Exploit precondition** | **None.** No session, token, signature, org pin or rate limit. Internet-reachable. |
| **Impact** | Confirm an email or phone exists as a contact in *any* tenant; set that contact's `contact_type` to `lead`; overwrite its `metadata`; backfill blank name/email/phone; receive its real UUID in the response. |
| **Proof** | `route.ts:26` parses the body with no gate. `supabase.ts:50-59` issues `GET /contacts?email=ilike.<input>` with service-role headers and **no `org_id` filter**. `supabase.ts:195-198` issues `PATCH /contacts?id=eq.<id>`, also unfiltered. `route.ts:191-195` returns `contactId`. |
| **Blast radius** | **One route.** All four helpers have exactly one caller; `findContactByEmailOrPhone` has none. Verified repo-wide. |
| **Convergence** | Resolve the org at the top of the route — it already reads `ALLOY_PUBLIC_ORG_ID`, but only at `:169`, *after* the write — and pass it into all four helpers as a filter. |
| **Severity** | **P0-CRITICAL.** The only unauthenticated cross-tenant write found. |

**Material context:** the create path is *already broken* — `contacts.org_id` is `NOT NULL` with no
default and `createContact` never supplies it, so inserts throw. The only path that currently
succeeds is the cross-tenant update. The route was last touched **2026-05-02**, serves the *gutters*
vertical, and archived docs call it legacy compatibility.

## SEC-0b · Arbitrary-table write driven by org-editable configuration — **CRITICAL**

| | |
|---|---|
| **Affected** | `workflowRun.update_entity` — `web/lib/workflowRun.ts:2130` (`ENTITY_TABLES[entityType] ?? entityType`), write at `:2222-2228` |
| **Exploit precondition** | Reachable from **three unauthenticated token routes** (`/api/action/[token]/consume`, `/api/action-links/consume-reschedule`, `/api/action-links/consume-accept-job`), plus indirectly from public form intake via `emitStatusChangedEvent`. |
| **Impact** | Raw `UPDATE` against **any table with `id` and `org_id`** — enrollment agreements, placements, schedule assignments, opportunities, charges, bookings — bypassing every domain invariant: supersede lineage, effective-dating, transition validation, permission grants, event emission. |
| **Proof** | The `?? entityType` fallback uses an unmapped `entity_type` verbatim as a table name, and `entity_type` comes from org-editable workflow configuration. |
| **Blast radius** | Org scoping **is** retained (`.eq("org_id", orgIdResolved)`), so this is not cross-tenant. It is a total loss of domain invariants within a tenant. |
| **Convergence** | Remove the `?? entityType` fallback so only mapped entity types resolve; route writes through the owning domain service. |
| **Severity** | **P0.** |

Related: `web/app/api/action-links/consume-reschedule/route.ts:91-96` updates `schedules` with
**no `org_id` predicate** — the only production write to an authoritative table without a tenant
filter. Tenancy rests entirely on token integrity.

---

## SEC-1 · Analytics snapshot runner — request body overrides session org

| | |
|---|---|
| **Affected** | `web/app/api/admin/analytics/snapshots/run/route.ts:39` |
| **Exploit precondition** | An authenticated principal with `role === "admin"` in **any** org. |
| **Impact** | Cross-tenant read *and* write: runs snapshots against another org, reading its metric definitions, evaluating against its tenant data, writing snapshot rows into it, and returning its definition keys in `errors[]`. |
| **Proof** | `:26` pins `orgId = ctx.orgId` for the session branch; `:39` then reads `body.org_id` **unconditionally**, not confined to the cron branch. `createAdminClient()` at `:41` bypasses RLS. |
| **Blast radius** | One route. |
| **Convergence** | **The correct pattern already exists two directories away** — `web/app/api/admin/metrics/snapshots/write/route.ts:40-50` reads `body.org_id` only on the cron branch. |
| **Severity** | **P0.** |

## SEC-2 · Pricing PATCH — service-role update by id with no org predicate

| | |
|---|---|
| **Affected** | `pricing/matrix/[id]`, `pricing-modes/[id]`, `pricing-dimensions/[id]`, `pricing-dimension-values/[id]` |
| **Exploit precondition** | Any **portal-eligible** user of any org, plus knowledge of a row id. Not even admin-only. |
| **Impact** | Rewrite another tenant's pricing rows. |
| **Proof** | `pricing/matrix/[id]/route.ts:37-43` — `.update(updates).eq("id", id)` on `createAdminClient()`, no org predicate, gate is `getAdminContextCached()` at `:10`. `pricing_matrix.org_id` is `NOT NULL`. |
| **Blast radius** | Four routes; DELETE variants share the shape. |
| **Convergence** | `web/lib/admin/assertRowOrg.ts` — the canonical helper for exactly this, already used by 66 route files. |
| **Severity** | **P0.** |

## SEC-3 · Financial command authorization

| | |
|---|---|
| **Affected** | `charge.add`, `charge.post`, `charge.reverse`, `payment.record`, `payment.refund`, `payment.collect_card` |
| **Exploit precondition** | Any **portal-eligible** member of an org. |
| **Impact** | Post, reverse and refund money without any permission grant. |
| **Proof** | `financialChargeActions.ts` and `financialPaymentActions.ts` contain **zero** permission references; `tuitionGenerationActions.ts` has five and requires `fin.write`. The route gate `requireAdminOrOps` (`web/lib/adminAuth.ts:124-130`) **checks no role** — it resolves the light org context and returns on portal eligibility alone. |
| **Blast radius** | Two definition files; the misleading gate helper is used far more widely. |
| **Convergence** | Declare a permission on the capability and enforce it centrally in the command runtime. |
| **Severity** | **P0.** |

**The structural half of SEC-3:** `commandRuntimeTypes.ts:165-166` types
`authorizationEvaluated: false` and `authorizationGranted: null` as **literals**, and the invariant
checker fails any snapshot claiming otherwise. The runtime cannot record that authorization was
asked. Per-action checks exist in 7 of 27 definition files.

`billing.generate_tuition` requires `fin.write` to *create* a draft charge, while `charge.post` —
which makes that charge **owed** — requires nothing.

---

## The pattern underneath all five

Two guards exist forbidding update-in-place on placements and schedule assignments
(`childPlacementService.ts:356`, `scheduleAssignmentService.ts:354`). **Neither has a single
caller**, while `applyChildParticipationEdit.ts:177,196` does exactly what they forbid.

Attendance carries the same never-called guard and does not need it, because its append-only rule
is a **Postgres trigger**. **Attendance is protected by the database; everything else by a
comment** — and that single difference is why attendance is the only domain with a defensible
external mutation contract.

**Design lesson for anything externalized: put the invariant in the database.** A guard that lives
only in TypeScript protects the one caller that remembers to invoke it.

## Repair posture

None repaired in this thread. SEC-0's repair is now **proven bounded** (one route, four helpers,
one caller each) and no longer blocked by the stop condition on that ground — but the choice
between scoping the route and retiring it is a product decision, because a live component still
POSTs to it and the gutters vertical's status cannot be determined from the repository.

SEC-0b, SEC-1 and SEC-2 are each small edits with a nearby correct pattern. SEC-3 is architectural:
it needs the runtime's authorization seam opened, which is Thread 4 work.

All five want tests that lock the legitimate callers — including the cron branch that crosses
tenants **by design** — before any edit lands.
