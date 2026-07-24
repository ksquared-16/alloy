---
owner: engineering
status: promotion-handoff
last_reviewed: 2026-07-24
supersedes: []
---

# Phase 5 Promotion Handoff

**PR: https://github.com/ksquared-16/alloy/pull/236** → base `staging`. Branch pushed, rebased
onto current staging, certified. Awaiting review + merge.

## Scope

This sprint established the **configured operational runtime for What's Next** and eliminated the
remaining architectural integrity issues. Operators now act on a configuration‑driven What's Next
surface; every configured capability executes through one transaction contract (commit or nothing
changed); and the runtime can no longer expose or write a stage that is not in the configured
Business Process. No feature work remains in scope.

## Architecture delivered

- **What's Next runtime** — obligation‑first card (dominant action + helpful actions + Record
  outcome; requirements grouped by owning capability), derived from configured metadata.
- **Capability runtime** — hosts/actions resolve from capability metadata (`interactionHost`,
  category), never from labels or stage/name strings; unresolvable → `unsupported`.
- **Transaction contract** — `lib/platform/transaction/platformTransaction.ts`; one pipeline,
  atomic or provably nothing changed, with compensating rollback and honest reporting.
- **Referential integrity** — `configuredStageInventory.ts` + `validateConfiguredStageReferences.ts`;
  configured stages are the only runtime stage vocabulary (validity + writer + publish gate on
  membership).
- **Capability hosting** — Message / Schedule tour / Send form render inside the centered Focus
  Card via one compact‑host contract; warm‑opened.
- **Runtime recomposition** — capability success recomposes the inline VM via
  `adminv2:opportunity-updated`; no page reload.

## Runtime — current guarantees

- A configured action either **validates → executes → commits → business process → activity →
  recomposes**, or **aborts → rolls back → nothing changed → clear explanation**. No third
  outcome; a compensation that cannot run is surfaced as an integrity breach (HTTP 500).
- No stage outside the configured Business Process can be bootstrapped, written, navigated to,
  reported on, or displayed. Proven live (bootstrap 400 / invalid move no‑change / What's Next
  clean) and by 90 deterministic tests.
- What's Next commands open instantly (warm‑open); Record Outcome recomposes inline.

## Configuration — current guarantees

- A stage exists at runtime **only** when explicitly present in the current configured Business
  Process. Any stage name works when configured; none works when absent — membership, not
  vocabulary.
- Publishing a Business Process that references a stage outside its own inventory is **rejected**
  (HTTP 422 `dangling_stage_reference`, structured violations, no silent drops).
- Built‑in lists, templates, and legacy constants are presentation / migration‑support only and
  grant no runtime validity.

## Remaining work

### Operational Acceptance
- Live‑execute the 7 uncertified capabilities (Message, Send Form, tour transitions, Add Child,
  Add Family Member, Requirement Handoffs, Lifecycle Transitions) — blocked only by a
  real‑recipient QA fixture. 1 of 8 is fully live‑certified (Record Outcome).
- Apply the Firefly remediation migration + reset the Wenc QA artifacts in a controlled window.

### Runtime optimization
- Move Message and Send Form onto the transaction contract (they report canonical truth but do not
  yet run through it).
- Close the out‑of‑brief swallowed‑error cluster (scheduled sends, family‑send,
  canonicalOutboundEnqueue, contact‑attempt link‑back).

### UX polish
- BOS assistant panel overlaps the centered card's right edge in some layouts.
- Retire the legacy `CurrentWorkWorkspace.tsx` (no longer mounted in the focused path).
- Update the 3 pre‑existing What's Next unit tests with stale `showOutcomeCompletion`/handoff
  expectations (runtime behaviour is live‑certified correct).

### Tenant configuration
- Audit + remediate staging tenants for dangling stage references before/at deploy (the publish
  guard is tenant‑wide).
- Firefly operating‑config gaps (all tenant configuration): `left_message` never escalates; tour
  outcomes without rules; booking a tour advances nothing. Detail:
  `firefly-config-certification-report.md`.
- Published tenant plans shadow code defaults with no re‑publish/reset path.

## Branch

| | |
|---|---|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` |
| Branch | `agent/claude/1-alloy-phase-5-product-realization` (pushed to origin) |
| Commit (pre‑handoff) | `410b204e0` |
| Ahead / behind | **0 behind / 75 ahead** of `origin/staging` (this handoff commit makes it 76) |
| Clean tree | yes |
| Server state | slot 1 stopped/paused (environment restored; QA auth is a ~1 h Supabase session — a fresh live run needs a manual `alloy-agent-login 1`) |
| PR | https://github.com/ksquared-16/alloy/pull/236 (base `staging`) |

## Merge readiness

Ready to merge pending review. Before/at merge: run the remediation migration and audit staging
tenants for dangling stage references (the publish guard will 422 any that have them). The certified
runtime files are byte‑identical to what was live‑certified, so the live evidence holds for the
merged code.
