---
owner: platform
status: canonical
last_reviewed: 2026-09-11
supersedes: []
---

# 12 — Slice B.6: blocked on the required environment

**Status: BLOCKED.** The slice mandates a slotted lane with live certification.
Three of the five required conditions are absent, and both "lane is not slotted"
and "live Attendance suite cannot run" are named stop conditions.

## The environment gate, measured

| Requirement | Observed |
|---|---|
| `ALLOY_WORKTREE_SLOT` present | **UNSET** |
| Managed development port | **unset** |
| Certification database available | **port 54322 CLOSED** |
| Live Attendance tests runnable | **No** — 5 suites present, none executable |
| Mounted browser automation | **No** — follows from the above |

The instruction: *"If any of those are unavailable, stop before production
rewiring or UI implementation and report PARTIAL/BLOCKED."*

So none of the following was attempted: the ingestion rewire, producer
conversion, legacy-table retirement, admin APIs, or any UI. Doing the ingestion
rewire here would repeat exactly what B.5 correctly refused — changing production
attendance authority while the suite that guards it cannot run.

## What was done, because it is neither rewiring nor UI

### 1. The operator's correction: Organization, not Settings

The run opened with *"Ensure we're not using settings but using organization."*
That is correct, and my earlier documents were wrong.

| Evidence | Says |
|---|---|
| `web/app/adminV2/components/Sidebar.tsx:269` | `title="Organization"`, `aria-label="Organization"` |
| `web/app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx:26` | breadcrumb root is `"Organization"` |
| Configuration doctrine | *"Organization is the sole canonical Catalog Runtime."* |

`/adminV2/settings/*` is the **route path and shell**. The word an operator
actually reads is **Organization**. I named the product surface after its URL —
in Slice A and again in B.4 — and that has been corrected: the journey now reads
**Organization → Integrations**, and the ratified IA says "one configuration
domain named Integrations, reached from the Organization catalog".

The correction is recorded in place rather than silently rewritten, because the
mistake is instructive: naming a surface after its path is how a route becomes a
product noun nobody chose.

### 2. Legacy consumer analysis — a Gate 1 fact worth having early

Static analysis of production code (`web/lib`, `web/app`, excluding tests and
migrations):

| Legacy table | Production consumers |
|---|---|
| `attendance_integration_producers` | `producerAuthority.ts` only |
| `attendance_integration_producer_sites` | `producerAuthority.ts` only |
| `attendance_integration_mappings` | `externalMapping.ts` → `ingestExternalAttendance.ts` |

**And `ingestExternalAttendanceEvent` has no production route.** Nothing under
`web/app` reaches it; its only callers are the live tests.

This materially de-risks the slotted run: **the rewire has no production traffic
to break.** The legacy path is library code with no request-reachable entry
point, so Gate 1's "zero production credential resolution from the legacy
producer table" is already structurally true in the only sense that matters to a
running system — a request cannot get there.

It does not make the rewire safe to do blind. The live suites exist precisely
because the ingestion's *domain* behaviour — idempotency, corrections, provenance
— is what must not regress, and that is proven against a database or not at all.

`attendanceAuthorityAdapter.ts` was checked and does **not** read the legacy
table; its only mention is a header comment explaining the divergence.

## G-14 status — unchanged from B.5

Still **reduced, not closed**. The model is converged and certified at unit
level; the legacy tables remain bridges with their removal triggers recorded in
schema comments. Closure requires the rewire and the conversion, both of which
need the certification database.

## Exactly what the slotted run should do

1. `ingestExternalAttendanceEvent(authority, event)` — accept resolved authority,
   stop resolving credentials, sites and mappings inside the domain. The seam is
   specified in [`11-slice-b5-convergence.md`](11-slice-b5-convergence.md).
2. Run the five live Attendance suites as the gate. Not unit tests.
3. Convert producers to installations on `producer_key`; leave any ambiguous
   producer explicitly unresolved rather than synthesizing identity.
4. Retire the three bridges against their recorded triggers.
5. **Then** Gate 2 — the Integrations product, entered from **Organization**.

## Remaining gaps and blockers — unchanged

G-14 reduced · G-15 closed · G-16 no deletion feed · G-17 `attendance.write` in
the catalog with no route.

Mutation blockers: **SEC-0c · SEC-0 (D-3) · generic idempotency runtime ·
approved first mutation contract.** No public mutation added.

**Classroom Coach:** untouched. No adapter, no seeded Application, no claimed
capability. **D-1 remains unanswered.**
