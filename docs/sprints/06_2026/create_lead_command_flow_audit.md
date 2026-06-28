# Create Lead — First Visible Operational Command Flow (Audit + Model)

**Status:** Operational Command Runtime **V4** (June 2026). Create Lead becomes the first
operator-visible command flow built on the V2/V3 runtime. **No new intake system, no BOS
fork, no duplicate execution, no modal rewrite.**

**Code anchors:**
- `web/lib/adminV2/actions/createLead/createLeadRequiredInputs.ts` — shared read-only derivation
- `web/lib/adminV2/actions/createLead/createLeadCommandModel.ts` — operator command view-model
- `web/lib/adminV2/actions/createLead/createLeadSuccess.ts` — standardized success contract
- `web/lib/adminV2/actions/definitions/createLeadAction.ts` — registered capability (unchanged behavior)
- `web/app/api/admin/actions/execute/route.ts` — the one execute route

---

## Phase 1 — Audit of current Create Lead paths

All operator paths converge on **`POST /api/admin/actions/execute`** with
`action_key: "create_lead"` → `runRegisteredAction` → `createLeadAction.execute` →
`executeAdminAction` → `executeCreateLeadAction`. There is **one** mutation implementation.

| Entry point | Known context | Known inputs | Payload | Executor path | Success / refresh |
|---|---|---|---|---|---|
| **BOS paste-assist** (inside `CreateLeadModal` via `ActionWorkspaceBosShell`) | `departmentId`, optional `workUnitId`, `surface` | Pasted text parsed → field map + suggestions + optional household commit | canonical field map (+ `household_commit_v1`) | `executeCreateLeadFromModal` → execute route → registered action | success screen → `queueActionWorkspaceLeadHandoff` → drawer |
| **Manual modal** (`CreateLeadModal`, "Enter manually") | same | typed `values` map | same | same | same |
| **Work Unit rail** (`registry_right_rail:create_lead`) | `departmentId`, `workUnitId`, `surface: right_rail` | none — **opens modal** (`applyRegistryResolvedActionClient` `openCreateLead`) | (after modal confirm) | same | `invalidate` + `openDrawer` |
| **Department / Workspace rail** | `departmentId`/default dept | opens modal (or `adminv2:open-create-lead` event) | same | same | `openDrawer` + `router.refresh` |
| **Direct API / future BOS command** | any `context` incl. `origin: "bos"` | JSON body | full execute body | registered action path | standard execute envelope |

Key facts:
- `CREATE_LEAD_ACTION_ENTITY_ID = "__create_lead__"` sentinel (capture-first; no subject).
- `createLeadAction` is registered (`bosProposalSupport: true`); execute route routes it through
  `runRegisteredAction` because it is registered, then re-delegates to `executeAdminAction`.
- `applyRegistryResolvedActionClient` **never POSTs create_lead directly** — it always opens the
  modal (`open_form`). No client-side mutation path exists.
- `/api/admin/actions/eligibility` exists but the modal does not call it (client validates pre-submit).

### Gaps against the Operational Command Runtime (pre-V4)
1. No shared **command view-model**: BOS and manual each derived readiness/copy ad hoc.
2. No operator **flow/stage** or **command-state** surfacing for Create Lead.
3. Success/refresh behavior was re-implemented per surface.
4. Required-input derivation was inlined in the registered action (not reusable by UI).

---

## Phase 2 — Intent + Flow mapping

| Layer | Value |
|---|---|
| Operator intent | **Create Lead** (`operationalIntent.ts` → `create_lead`) |
| Registered capability | `create_lead` |
| Required subject | **none** (capture-first) |
| Context resolution | `open` |
| Flow stages | `resolve_context` → ~~`resolve_subject`~~ (skipped) → `resolve_required_inputs` → `preview` → `confirm` → `execute` → `success` |

Because the required subject is `none`, `buildCommandFlow` already marks `resolve_subject` as
`skipped` — **no model change was required** (validated in `commandFlow.test.ts` and
`createLeadCommandModel.test.ts`). This satisfies the V3 rule: subject = none skips subject
resolution.

---

## Phase 3 — Shared command view-model

`deriveCreateLeadCommandState(input)` is a **read-only view-model over the runtime** (not a
mutation layer). Given a payload field map + entry point + phase it returns a
`CreateLeadCommandSnapshot`: resolved context, flow + current stage, operator state + message,
known/missing inputs, preview, `readyForPreview`/`readyToExecute`, the exact `executePayload`,
and a success descriptor. It never executes — execution remains the registered action via the
execute route.

The read-only derivation (`buildCreateLeadEligibility`, `buildCreateLeadPreview`,
`deriveCreateLeadBlockers`) was **extracted from `createLeadAction`** so the registered action
and the view-model share one source of truth (the action now imports it; behavior unchanged).

---

## Phase 4 — BOS integration

`deriveCreateLeadCommandFromBosProposal({ parsedValues, … })` converts BOS-parsed values into a
command snapshot in **BOS voice**. BOS "progressively removes stages": complete parsed values
arrive at preview/confirm; missing values surface the missing fields in operator language. BOS
uses the **same `executePayload` and the same execute route** — no separate mutation path.

Operator-visible copy (BOS voice):
- Enough info → "I found enough information to create this lead. Review it before I create it."
- Missing → "I still need last name, phone or email before I can create this lead."
- Success → "Lead created for {name}. Opening record."

---

## Phase 5 — Manual / Work Unit integration (deferred UI wiring, documented)

The view-model is shared by manual and Work Unit entry (`entryPoint: "manual" |
"work_unit_actions"`). **`CreateLeadModal.tsx` was intentionally NOT modified**: it lives under
`web/components/admin/opportunity/*`, which is **protected runtime-sensitive infrastructure**
(`adminv2-runtime-performance` rule), and the sprint explicitly says not to rewrite the form.

**Deferred UI convergence (documented):** wiring `CreateLeadModal` / `ActionWorkspaceBosShell`
to render `CreateLeadCommandSnapshot.message` + stage chips is a follow-up that must run the
protected drawer/work-unit test suites. Until then the modal keeps its current behavior; the
command model is available and tested for the convergence step. Files to wire later:
`web/components/admin/opportunity/actions/CreateLeadModal.tsx`,
`web/components/admin/actions/ActionWorkspaceBosShell.tsx`.

---

## Phase 6 — Required inputs: source of truth + parity gap

**Three layers exist today (unchanged by this sprint):**

| Layer | Where | Enforces |
|---|---|---|
| Client — intake spec | `validateCreateLeadFromIntakeSpec` (`resolveActionIntakeSpec.ts`) | stage `field_rules` + constraints (e.g. `at_least_one` email\|phone) |
| Client — platform fallback | `validateCreateLeadPlatformMinimum` (`createLeadPlatformGather.ts`) | first, last, location, email\|phone |
| **Server (authoritative)** | `executeCreateLeadAction` (`entryLifecycleActions.ts`) | first, last, email\|phone **only** |

The V4 command model mirrors the **server-authoritative minimum** (first + last + email|phone)
in `deriveCreateLeadBlockers`, and accepts optional `configRequiredInputs` to layer
stage-`field_rules` hints (flagged `fromConfig`) on top for presentation.

**Known follow-up — server-side parity gap (documented, NOT closed this sprint):**
Stage-configured required fields (notably **location** and richer `field_rules`) are enforced
**client-side only**; `executeCreateLeadAction` does not re-check them server-side
(`entryLifecycleActions.ts` comment confirms this is intentional today). Bringing server-side
Create Lead validation to parity with stage intake-spec `field_rules` requires reading the
department/stage spec inside `executeCreateLeadAction` (or its eligibility) and is **higher
risk** (touches the authoritative create path + many existing dept specs). It is deferred and
recorded here as the exact remaining gap. The V4 model is forward-compatible: pass resolved
stage `field_rules` as `configRequiredInputs` and, once the server enforces them, the runtime
eligibility and operator copy already render them.

---

## Phase 7 — Success / refresh contract

`buildCreateLeadSuccess({ result, knownInputs })` standardizes post-execution behavior across
all entry points: `createdRecordId`, `entityType: "opportunity"`, `title`, `nextSurface:
"focus_panel"`, `refreshTargets`, `successCopy`, `nextCopy`. Surfaces consume the descriptor
instead of each re-deriving open/refresh behavior.

---

## Phase 8 — Update Status (second reference, light)

Modeled through the same runtime with **tests only** (no UI wiring): `updateStatusCommandFlow.test.ts`
validates Focus Panel Manage resolves `current_record` as the subject, a valid transition →
confirmable preview, an invalid transition → blocker copy at `resolve_constraints`, and Work
Unit → `user_selection` (needs subject). Eligibility itself remains server-resolved by
`updateStatusAction.resolveEligibility`.

---

## Completion criteria status

| Criterion | Status |
|---|---|
| Create Lead modeled as Operational Intent + Flow | ✅ |
| BOS builds on existing parse/proposal behavior | ✅ (adapter over parsed values) |
| Manual + BOS share command-state modeling | ✅ (one view-model) |
| Execution remains registered `create_lead` | ✅ (view-model is read-only) |
| No duplicate mutation path | ✅ |
| Required-input gaps documented or resolved | ✅ documented (server parity gap deferred) |
| Success behavior standardized | ✅ |
| Modal not broken / not rewritten | ✅ (UI wiring deferred + documented) |
