---
owner: engineering
status: release-notes
last_reviewed: 2026-07-24
supersedes: []
---

# Phase 5 — Release Notes (Configured Capability Runtime + Integrity)

Release candidate for promotion to `staging`. Rebased onto current `origin/staging` (0 behind),
certified, tree clean.

## New capabilities

- **What's Next runtime** — the operator's centered "what to do now" card is obligation‑first:
  one dominant action + helpful actions + Record outcome, with "Still needed" grouped by the
  capability that owns each requirement. Derived entirely from configured Business Process
  metadata.
- **Centered configured‑work experience** — `current_work` elevates into a centered Focus Card
  through the same elevation path the operational‑truth cards use; a compact hosted mode appears
  when a capability is active.
- **Generic capability hosting** — Message (real communications composer inline), Schedule tour
  (inline form), and Send form (generic form‑delivery surface) all render inside the centered
  card with pinned footers and Alloy visual language.
- **Transaction contract** — one generic execution pipeline every configured capability runs
  through: validate → persist → business process → activity → relationships → cache invalidation
  → recomposition → commit, or compensate in reverse. Atomic, or nothing changed.
- **Capability routing** — hosts and actions resolve from capability metadata (`interactionHost`,
  category), never from a label or a stage/name string. A newly configured Business Process
  exposes its actions with zero What's Next presentation code.
- **Warm‑open behavior** — every What's Next command opens instantly; one dispatcher warms each
  capability on render + hover/focus and renders warm data synchronously (Message ~90 ms, Tour
  ~82–208 ms, no loaders).
- **Form delivery** — a generic `form_delivery` host over configured forms → eligible recipients
  → related subjects → executable channels.
- **Outcome mode** — a dedicated decision surface; effect text normalized and de‑duplicated
  through one shared contract.
- **Grouped requirement ownership** — requirements group under the capability that owns them; the
  owner heading is the single handoff into that capability.
- **Stage referential integrity** — configured Business Process stages are the ONLY authoritative
  stage vocabulary at runtime; built‑in lists, templates, and legacy constants no longer grant
  validity.
- **Publish validation** — the Business Process builder rejects any config that references a stage
  outside its own inventory (HTTP 422, structured violations, no silent drops).

## Major defects resolved

- **Ghost transactions** — a durable write committed while the operator was shown a failure (or
  success reported after a real send failed). Fixed by the transaction contract with compensating
  rollback; tour booking + all five tour transitions + Record Outcome + comms/form honest
  reporting now run through it.
- **Partial transaction rollback** — Record Outcome closed the work item first, then applied rule
  targets with no rollback and counted failed targets as applied. Now atomic; a failure
  compensates to the pre‑click state, and a compensation that cannot run is reported as an
  integrity breach, never a clean‑looking abort.
- **Stale built‑in stages** — `LIFECYCLE_STAGE_ORDER` / `ENROLLMENT_TEMPLATE_STAGE_KEYS` still
  encoded a removed model (`qualification`, `enrollment`) and granted runtime validity. Now
  presentation/migration‑support only.
- **Qualification leakage** — the runtime served, moved into, and could display a `qualification`
  stage that is not in the configured process. Closed at validity, the writer, and publish; the
  operator‑facing add‑stage placeholder no longer offers "Qualification".
- **Invalid stage writes** — the canonical `move_to_stage` writer now verifies configured
  membership before any write; a non‑configured target is a configuration error with no write, no
  partial transaction, no activity, no next work. Every caller inherits it.
- **Duplicate initialization** — the What's Next init double‑invoke was measured as React
  Strict‑Mode dev double‑invoke (production renders once); init is warm‑served with no refetch.
- **Hosted capability model** — capabilities that opened in separate drawers/modals now render
  inside the centered card through one shared compact‑host contract.
- **Runtime recomposition** — capability success recomposes the inline VM via
  `adminv2:opportunity-updated`; no page reload anywhere.
- **Forms API shape** — Send Form read the wrong response shape and showed "No active forms" for
  tenants that had published forms; fixed to read `{ data: FormRow[] }`.
- **Missing correlation id** — a recorded outcome's activity row now carries the transaction
  correlation id (click → transaction → database → activity share one id).

## Operational impact (operators + administrators)

- **Invalid Business Process stage references now fail publish.** Saving a process whose rules,
  transitions, or outcome targets reference a stage that is not one of its own stages returns
  **HTTP 422 `dangling_stage_reference`** with the offending source stage, reference, invalid
  target, and the configured stage set. There are no silent drops.
- **Hidden runtime stages are no longer accepted.** A stage that is not in the current configured
  Business Process cannot be bootstrapped, written, navigated to, reported on, or displayed.
- **Stage membership is configuration‑driven.** Any stage name works when explicitly configured;
  none works when absent — the rule is membership, not vocabulary.
- **Stale tenant plans require remediation before publish.** A tenant whose stored config already
  contains a dangling stage reference cannot save its Business Process until the reference is
  removed or repaired.

## Deployment considerations

- **Migrations:** one new, tenant‑scoped —
  `supabase/migrations/20260724000000_firefly_remediate_dangling_stage_references.sql` (idempotent;
  removes Firefly's three dangling move targets, preserves `decision`). Apply in a controlled
  window.
- **Tenant remediation:** the publish guard is tenant‑wide. **Before/at deploy, audit staging
  tenants for dangling stage references** and remediate them (the Firefly migration is the
  template), or their next builder save will 422.
- **Publish implications:** administrators saving a Business Process with a dangling reference will
  now be blocked with a structured error rather than silently persisting a broken reference.
- **Configuration changes:** none required for tenants whose configs are already clean.
- **Post‑deploy for staging admins:** run the Firefly remediation migration; audit + remediate any
  other tenant flagged with dangling references; reset the Wenc QA record's inflated contact
  attempts + demo tour booking via a controlled service‑role cleanup (cosmetic, non‑blocking).

## Testing completed

- Project typecheck: **clean** (post‑rebase).
- Transaction contract (17), referential integrity + configured‑stage + remediation + provenance +
  visibility (70+), capability routing (`currentWorkActionProvenance`, `currentWorkCommandIntegrity`),
  warm‑loading — **green**.
- **Authenticated live cert** against the running Firefly tenant (pre‑rebase; the certified runtime
  files are byte‑identical post‑rebase): bootstrap `qualification` → 400 / `decision` → 200;
  publish dangling config → 422; invalid move on Wenc → 400, canonical truth byte‑identical
  before/after; What's Next shows no "Qualification"; remediation before/after + idempotent.
- Reconciliation regression check: the rebase introduced **zero** new failures — the adminV2
  runtime failures present are pre‑existing on `origin/staging` itself (verified by running the
  same suites on clean staging) or fail identically on the pre‑rebase branch.

## Remaining known limitations

- 3 pre‑existing What's Next unit tests assert stale `showOutcomeCompletion`/handoff expectations
  (fail identically pre‑rebase; the live cert proves outcome recording works end‑to‑end).
- Message and Send Form report canonical truth but are not yet moved onto the transaction contract.
- The out‑of‑brief swallowed‑error cluster (scheduled sends, family‑send, canonicalOutboundEnqueue).
- Comms live‑execution certification is blocked on a real‑recipient QA fixture; 1 of 8 capabilities
  is fully live‑certified (Record Outcome).
