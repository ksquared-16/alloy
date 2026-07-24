---
owner: engineering
status: closeout
last_reviewed: 2026-07-24
supersedes: []
---

# Phase 5 — Engineering Closeout

Sprint objective delivered: the **configured operational runtime for What's Next**, and the
elimination of the remaining architectural integrity issues (transaction truth + stage
referential integrity). Product Office, interaction model, transaction model, and configured‑stage
integrity are complete. This is the promotion closeout — no further implementation.

Branch `agent/claude/1-alloy-phase-5-product-realization`, **72 commits ahead of origin/staging**,
clean tree. Not pushed, not merged.

---

## 1. Architecture delivered

| Capability | What shipped | Anchors |
|---|---|---|
| **What's Next summary** | Obligation‑first card: one dominant action + helpful actions + Record outcome; "Still needed" grouped by owning capability | `CurrentWorkCard.tsx`; commits `dcf0956c1`, `1e78729e3` |
| **Centered configured‑work host** | `current_work` elevates as a centered Focus Card; compact hosted‑capability mode when a capability is active | `CurrentWorkFocusedSurface.tsx`, `focusPanelCoordinationModel.ts`; `65e722d8b`, `65096d20f`, `f2ed8eb89` |
| **Capability runtime** | Host resolved from capability metadata (`interactionHost`), never a label/stage/process string; unresolvable → `unsupported` | `resolveCurrentWorkActionSurface.ts`; `345fc53f8` |
| **Capability registry** | Capabilities declare category + `interactionHost` + `runtimeWired`; the host knows only the descriptor | `actionDefinitionRegistry.ts`; `345fc53f8`, `2e5c3a957` |
| **Transaction contract** | One generic pipeline every configured capability runs through: validate → persist → business_process → activity → relationships → cache → recomposition → commit, or compensate in reverse | `lib/platform/transaction/platformTransaction.ts`; `b60b13f6c` |
| **Recomposition** | Capability success dispatches `adminv2:opportunity-updated` → inline VM reload; no page reload anywhere | `useRecordWorkRuntime.ts`; `9f5924428`, `cb6921312` |
| **Stage integrity** | A stage move commits atomically or leaves canonical truth unchanged (guard + compensation) | `stageOutcomeRuleTargetExecutor.ts`, `completeStageWorkWithOutcome.ts`; `08ac68cd6` |
| **Referential integrity** | Configured Business Process stages are the ONLY authoritative stage vocabulary — validity, the canonical writer, and publish all gate on configured membership | `configuredStageInventory.ts`, `validateConfiguredStageReferences.ts`; `d3d45aa80`, `0b8941ea3` |
| **Configuration‑driven routing** | What's Next actions, hosts, outcomes, transitions, and requirement ownership derive from configured metadata, proven by cross‑process parity tests | `resolveCurrentWorkActionButtons.ts`, `resolveOutgoingProcessTransitions.ts`; `ca3b61703`, `43ebd68b9`, `e93d95981` |
| **Hosted capability model** | Message (real comms composer inline), Schedule tour (inline_form), Send form (generic form_delivery), all warm‑opened; pinned footers; Alloy visual language | `CurrentWorkActionPanel.tsx`, `FormDeliverySurface.tsx`, `OpportunityTourSchedule*`; `125fc3430`, `6ff2dbf34`, `29e81cf43` |

---

## 2. Major defects resolved

### D1 — Ghost transactions (false success / false failure) *(CRITICAL)*
- **Root cause:** capabilities committed a durable write, then ran follow‑up steps unguarded; a
  follow‑up failure returned an error to the operator next to a booking/outcome that had already
  committed (or reported success after a real send failed). Each capability decided independently
  what "success" meant.
- **Fix:** the Platform Transaction Contract — one pipeline with compensating rollback; every
  capability runs through it. Tour booking (`f0c99413e`), all five other tour transitions
  (`b703af5d5`), Record Outcome (`08ac68cd6`), comms send + form delivery honest reporting
  (`e320cbb91`).
- **Commit:** `b60b13f6c` (contract) + the four above.
- **Tests:** `tests/platform/platformTransaction.test.ts` (17); `tourLifecycleTransactionIntegrity`
  (7); `recordOutcomeTransactionIntegrity` (10).
- **Authenticated evidence:** capability certification suite `bed769bbc` — Record Outcome executed
  live 3× (one POST, one activity row, no reload, no duplicate, canonical state moved exactly as
  configured).

### D2 — Transaction compensation absent *(CRITICAL)*
- **Root cause:** Record Outcome closed the work item first, then applied Business Process rule
  targets with collect‑and‑continue and **no rollback**; failed targets were counted as applied.
- **Fix:** work‑state + rule targets + activity are steps in one transaction; each target captures
  its inverse; a failure compensates back to the pre‑click state, and a compensation that cannot
  run is reported as an `integrity_breach` (HTTP 500), never a clean‑looking abort.
- **Commit:** `08ac68cd6`.
- **Tests:** `recordOutcomeTransactionIntegrity.test.ts` (10) — reproduces each failure shape.
- **Authenticated evidence:** live Record Outcome cert (`bed769bbc`); live invalid‑move rollback
  in the configured‑stage cert (`683efdbfa`, A3 — before == after).

### D3 — Qualification leakage *(CRITICAL — platform integrity)*
- **Root cause:** `qualification` is not in Firefly's configured process and is not in the fresh
  template (removed in "Part 9"), yet the runtime served it because `isValidBootstrapBuilderStage`
  short‑circuited on the hardcoded `LIFECYCLE_STAGE_ORDER`, and the stage‑move writer had no
  membership check. An operator‑authored dangling lead rule (`Reached/Qualified → qualification`)
  was the trigger.
- **Fix:** stage validity = configured membership only; canonical move‑writer guard; publish‑time
  referential integrity; stale `reached_to_qualification` default removed; add‑stage placeholder
  no longer offers "Qualification".
- **Commit:** `f4a0de53a` (investigation), `d3d45aa80` (fix), `72fef6427` (presentation).
- **Tests:** `configuredStageReferentialIntegrity` (12), `fireflyStageProvenance` (12),
  `qualificationVisibility` (9).
- **Authenticated evidence:** `683efdbfa` — A1 bootstrap `qualification` → **400**; A3 invalid move
  → **400, changed:false, no activity/next work**; A4 What's Next shows **no "Qualification"**.

### D4 — Stale built‑in stages *(HIGH)*
- **Root cause:** `LIFECYCLE_STAGE_ORDER` + `ENROLLMENT_TEMPLATE_STAGE_KEYS` + a code‑default rule
  still encoded the pre‑Part‑9 model (`qualification`, `enrollment`) and granted runtime validity.
- **Fix:** these constants are now presentation/migration‑support only; the first‑run bootstrap
  fallback draws from `CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS` (which excludes qualification); the
  stale default move was removed.
- **Commit:** `d3d45aa80`.
- **Tests:** `configuredStageReferentialIntegrity` — "fresh tenants contain no hidden qualification
  stage"; `fireflyStageProvenance` — built‑in list no longer grants validity.
- **Authenticated evidence:** A1 (`683efdbfa`).

### D5 — Stage referential integrity (no publish‑time check) *(HIGH)*
- **Root cause:** the builder accepted a config referencing stages outside its own inventory; the
  dangling reference persisted and executed silently.
- **Fix:** `validateConfiguredStageReferences` walks every stage target (move_to_stage, transitions,
  transition_ref resolution, nested targets) and rejects the publish (422, structured violations,
  no silent drops).
- **Commit:** `0b8941ea3` (remediation function + migration), publish check in `d3d45aa80`.
- **Tests:** `configuredStageReferentialIntegrity` (publish rejects dangling outcome/transition/
  automation targets); `remediateDanglingStageReferences` (6).
- **Authenticated evidence:** A2 (`683efdbfa`) — live publish → **422 `dangling_stage_reference`**
  naming qualification/enrollment/closed_withdrawn; B — remediation vs live config, idempotent.

### D6 — Capability routing by label/name shims *(HIGH)*
- **Root cause:** early What's Next resolved hosts/actions from labels and stage/name strings.
- **Fix:** metadata‑driven capability + host resolution; configuration‑provenance certified — a
  newly configured Business Process exposes actions with zero What's Next presentation code.
- **Commit:** `345fc53f8`, `2e5c3a957`.
- **Tests:** `currentWorkActionProvenance.test.ts` (7 provenance proofs + cross‑process parity),
  `currentWorkCommandIntegrity.test.ts`.
- **Authenticated evidence:** capability‑hosts cert (`bed769bbc`) — Message/Schedule tour/Send form
  hosts mount from configuration, 63–77 ms, no duplicate requests, no writes on open.

### D7 — Runtime warm‑open (cold loaders) *(MEDIUM)*
- **Root cause:** each capability cold‑started with a blocking "Loading…" gate; a duplicate init
  refetched the entry.
- **Fix:** one warm‑open dispatcher keyed on the capability HOST warms on render + hover/focus;
  hosts render warm data synchronously; in‑flight de‑dup of the entry fetch.
- **Commit:** `29e81cf43`, `e5de7534b`, `cb6921312`.
- **Tests:** warm‑cache TTL + in‑flight de‑dup suites; `whats-next-review-verify.spec.ts`.
- **Authenticated evidence:** measured Message 90 ms / Tour ~82–208 ms with no loader
  (`bed769bbc`).

### D8 — Hosted capability model incomplete *(MEDIUM)*
- **Root cause:** capabilities opened in separate drawers/modals, not inside the centered card.
- **Fix:** one shared hosted‑capability compact‑host contract; Message renders the real comms
  composer inline, Send form is a generic form_delivery host, Schedule tour is host‑shell‑first.
- **Commit:** `f2ed8eb89`, `125fc3430`, `6ff2dbf34`.
- **Tests:** `resolveCurrentWorkActionSurface.test.ts`, focused‑surface parity tests.
- **Authenticated evidence:** capability‑hosts cert (`bed769bbc`).

### D9 — Forms API shape hid valid configuration *(MEDIUM — platform)*
- **Root cause:** `/api/admin/forms` returns `{ data: FormRow[] }`, but Send Form read
  `j.forms ?? j.data?.forms` — never matched an array, so a tenant with 5 published forms saw
  "No active forms are configured."
- **Fix:** both read sites accept the array‑under‑`data` shape.
- **Commit:** `52ba4e634`.
- **Tests:** covered by the host‑mount cert (Send Form now lists forms).
- **Authenticated evidence:** live host cert — Send Form lists all five published forms.

### D10 — Activity row missing correlation id *(MEDIUM)*
- **Root cause:** a recorded outcome's `workflow_events` row carried no correlation id, so an
  activity record could not be traced to its transaction.
- **Fix:** `recordStageWorkContactOutcomeTrace` stamps the transaction's correlation id.
- **Commit:** `28e677481`.
- **Tests:** outcome suites (30).
- **Authenticated evidence:** re‑executed live — correlation appears in both the HTTP response and
  the `workflow_events` payload.

---

## 3. Remaining work

### Platform
- The out‑of‑brief swallowed‑error cluster still open: `communicationScheduledSendsService.ts`
  (claimed row + enqueued message), `family-send/route.ts` (post‑send throw after per‑recipient
  commits), `canonicalOutboundEnqueue.ts` (swallowed workflow‑event + dispatch failures),
  `associateOutboundCommunicationToContactAttempt.ts` (unchecked link‑back).
- Message and Send Form are honest‑reporting but **not yet moved onto the transaction contract**.
- One legacy code‑default move (`waitlist → enrollment`, `defaultEnrollmentStageOperatingPlans.ts:458`)
  is internally consistent within the legacy default set and neutralized by the guard; a clean‑up
  is optional.

### Runtime
- No open runtime defects. Duplicate init was measured as React Strict‑Mode dev double‑invoke
  (production renders once); warm‑served, no refetch.

### Configuration (tenant, not platform)
- Firefly remediation migration authored (`20260724000000_…`) but **not applied** to the shared
  tenant; apply in a controlled window.
- Firefly operating‑config gaps (all tenant configuration, engine faithful): `left_message` never
  escalates; tour outcomes without rules; booking a tour advances nothing (no `{tour_booking,
  scheduled}` rule); qualification move is now blocked (was the leak). Detail:
  `firefly-config-certification-report.md`.
- Published tenant plans shadow code defaults with no re‑publish/reset path; a seed migration
  clobbers another's rule.

### UX polish
- BOS assistant panel overlaps the right edge of the centered card in some QA screenshots.
- Legacy `CurrentWorkWorkspace.tsx` retirement not started (no longer mounted in the focused path).
- Legacy (non‑comms‑v2) composer footer pinning unverified.

### Operational Acceptance (next sprint)
- Comms capabilities never **live‑executed** — the QA fixture holds a real email/phone; needs an
  operator‑owned recipient or a disabled‑binding confirmation.
- Capability certification: 1 of 8 certified (Record Outcome); the rest need live execution.
- Wenc QA artifacts (attempt_count 3, one demo tour) need a controlled service‑role reset.

---

## 4. Branch summary

| | |
|---|---|
| **Worktree** | `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1) |
| **Branch** | `agent/claude/1-alloy-phase-5-product-realization` |
| **Commits ahead** | **72** ahead of `origin/staging` |
| **Behind** | **96** behind `origin/staging` — a non‑trivial rebase is required before promotion |
| **Clean tree** | **yes** (0 changes) |
| **Server state** | slot 1 **stopped/paused** (restored the environment; siblings 2/3/4 running) |
| **Push state** | **not pushed** |
| **Merge state** | **not merged** |
| **Verification** | project typecheck clean; 90 referential‑integrity/provenance/transaction tests green; **live authenticated cert passed** (A1–A4 + B on the Firefly tenant) |

---

## 5. Release recommendation

> **Promote to staging?**

# YES

The sprint's code — transaction contract, stage integrity, referential integrity, the forms
reader fix — is tested and **live‑certified against the running Firefly tenant**. It is additive
(guards + validation) and introduces zero net‑new test failures.

Two promotion prerequisites (not blockers, but must be handled during promotion):
1. **Rebase onto current `origin/staging` (96 behind) and re‑validate.** The rebase will not be
   trivial.
2. **The publish‑integrity guard will reject any existing tenant whose stored config has dangling
   stage references (HTTP 422) until remediated.** Firefly's remediation migration is authored;
   other staging tenants may need the same treatment. This is correct behaviour, but it changes
   what a previously‑saveable config does, so it must be communicated with the deploy.

No genuine code blocker prevents promotion.

---

*Handoff for the next sprint (Firefly Operational Acceptance):
`docs/sprints/active/firefly-operational-acceptance-handoff.md`.*
