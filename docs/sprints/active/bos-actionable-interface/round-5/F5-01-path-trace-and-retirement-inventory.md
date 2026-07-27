---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-01
---

# F5-01 — Create Lead path trace and retirement inventory

**Docs only.** No code changes in this package.

This inventory is the gate for F5-02+. It names every live Create Lead path, the shared draft seams implicated by product-owner QA defects, and what may be deleted only after end-to-end certification.

---

## 1. Path map (how entry points connect)

```text
[Actions / Commands / rail]
  applyRegistryResolvedActionClient (formKey create_lead)
    ├─ isBosCreateLeadSessionEnabled() === true  → alloy-bos:start-command-session
    └─ NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0     → openCreateLead? OR adminv2:open-create-lead

[Slash /create-lead]
  AICommandSurfaceShell → queryBosSlashCatalog → dispatchStartBosCommandSession

[adminv2:open-create-lead]
  CreateLeadEventHost
    ├─ flag ON  → dispatchStartBosCommandSession
    └─ flag OFF → CreateLeadCommandSurface → CreateLeadModal

[BOS command session — CANONICAL]
  BosCommandSessionProvider → BosCommandSessionHost
    → useCreateLeadBosSessionController
    → createLeadConversationIntakeAdapter / createLeadAdapter
    → executeCreateLeadFromBosDraft → executeCreateLeadCommand

[Shared execute — BOTH UIs]
  POST /api/admin/actions/execute
    → runRegisteredAction(createLeadAction) OR executeAdminAction
    → executeCreateLeadAction
    → ingestCreateLeadThroughProcessing (mode: processing_review)
    → IdentityReviewPanel → commit → Open Lead + queue refresh
```

**Canonical product path today:** BOS command session (flag default **true**).

**Legacy dual path:** Action-workspace modal (`CreateLeadModal`) behind `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`.

**Single execute spine:** both UIs must call `executeCreateLeadCommand` → registered `create_lead`. No separate BOS mutation API.

---

## 2. Entry points

### 2a. Actions / Commands — canonical (session) + legacy (modal)

| File | Role |
|---|---|
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | `formKey === "create_lead"` → session start or modal open |
| `web/lib/admin/actions/canonicalActionRegistry.ts` | Catalog: `create_lead`, `bosProposalSupport: true` |
| `web/lib/adminV2/actions/definitions/createLeadAction.ts` | Registered action → eligibility / preview / execute |
| `web/lib/adminV2/actions/actionRegistry.ts` | Registers handler |
| `web/lib/lifecycle/lifecycleCreateLeadEntryBinding.ts` | Server work-unit / status binding |

### 2b. Slash `/create-lead` — canonical

| File | Role |
|---|---|
| `web/lib/bos/commandSession/slash/queryBosSlashCatalog.ts` | `BOS_SLASH_SESSION_ADAPTER_KEYS = ["create_lead"]` |
| `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` | `/` → catalog → `dispatchStartBosCommandSession` |
| `web/app/adminV2/components/aiCommandSurface/bosRail/BosSlashCommandMenu.tsx` | Slash menu UI |

### 2c. BOS command session host — **canonical**

| File | Role |
|---|---|
| `web/contexts/BosCommandSessionContext.tsx` | Provider; `alloy-bos:start-command-session`; persistence |
| `web/app/adminV2/components/AdminV2Shell.tsx` | Mounts provider |
| `web/app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx` | Conversation / Form / Review / Processing / Success |
| `web/app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts` | Intake, parse, preview, execute controller |
| `web/app/adminV2/components/aiCommandSurface/commandSession/CreateLeadProgressiveForm.tsx` | Form projection |
| `web/app/adminV2/components/aiCommandSurface/commandSession/CreateLeadBosRepeaterCards.tsx` | Adult / child repeaters |
| `web/app/adminV2/components/aiCommandSurface/commandSession/CreateLeadCommandHelp.tsx` | Help chrome |

**Events:** `alloy-bos:start-command-session` (`BOS_START_COMMAND_SESSION_EVENT`).

### 2d. Old BOS Create Lead (Action Workspace modal) — **legacy / fallback**

Branded “BOS” chrome around a **separate** local React draft — not `BosCommandDraft`.

| File | Role |
|---|---|
| `web/components/admin/opportunity/actions/CreateLeadModal.tsx` | Gather → review → processing → success; **local** `useState` draft |
| `web/components/presentation/rightRail/CreateLeadEventHost.tsx` | `adminv2:open-create-lead`; modal only when flag off |
| `web/components/platform/commands/createLead/CreateLeadCommandSurface.tsx` | Platform host wrapping modal; must call `executeCreateLeadCommand` |
| `web/components/admin/actions/ActionWorkspaceBosShell.tsx` (+ Banner / CloudShell / Guidance / Suggestions) | Modal chrome |
| `web/lib/admin/actions/bosWorkspaceShell.ts` | Width / title constants |
| `web/components/admin/actions/CreateLeadOperationalIntake.tsx` | Modal gather |
| `web/components/admin/actions/CreateLeadMaterialStackColumn.tsx` | Paste column |
| `web/components/admin/actions/CreateLeadDraftLeadColumn.tsx` | Draft column |
| `web/components/admin/actions/CreateLeadProgressRail.tsx` | Step rail |
| `web/components/admin/actions/CreateLeadRequiredChecklistRow.tsx` | Required checklist + location |
| `web/components/admin/actions/CreateLeadCommitPreviewPanel.tsx` | Commit preview |
| `web/lib/admin/actions/createLeadBosGuidance.ts` | Modal guidance copy |
| `web/lib/bos/actionWorkspaceDrawerHandoff.ts` | Modal Open Lead handoff |
| `web/components/admin/actions/BosExecutionLoader.tsx` | Execute loader |

**Compat events:** `adminv2:open-create-lead`, optional `host.openCreateLead`.

### 2e. Feature flag

| Item | Behavior |
|---|---|
| `web/lib/bos/commandSession/bosCreateLeadSessionFlag.ts` | `isBosCreateLeadSessionEnabled()` |
| `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION` | Default **on**; `0` / `false` → modal |

**Retirement rule (F5-08):** after certification, remove flag and modal branch. Rollback is Git/deploy — not a permanent dual-product flag.

---

## 3. Shared draft / session (authoritative model)

### Types, reducer, persistence

| File | Symbols |
|---|---|
| `web/lib/bos/commandSession/types.ts` | `BosCommandDraft`, `BosCommandSession`, phases |
| `web/lib/bos/commandSession/createSession.ts` | `emptyBosCommandDraft`, `createBosCommandSession` |
| `web/lib/bos/commandSession/reduceSession.ts` | `reduceBosCommandSession` |
| `web/lib/bos/commandSession/fingerprint.ts` | Stale preview fingerprint |
| `web/lib/bos/commandSession/commandSessionPersistence.ts` | `sessionStorage` `alloy-bos-command-session-v1` |
| `web/lib/bos/commandSession/draftValues.ts` | `bosDraftToEligiblePayload`, upsert helpers |
| `web/lib/bos/commandSession/draftEdits.ts` | Form ↔ draft flat field sync |
| `web/lib/bos/commandSession/staleGuards.ts` | Stale response apply guards |

### Repeaters / household (shared modules)

| File | Role |
|---|---|
| `web/lib/admin/actions/createLead/commit/createLeadCommitSelection.ts` | `CreateLeadCommitSelection`, add/remove/patch, primary adult |
| `web/lib/bos/commandSession/createLeadRepeaterDraft.ts` | **Bridge:** Form selection ↔ `draft.household`; syncs **primary** flat keys |
| `web/lib/admin/actions/mapCreateLeadCommitSelectionToPayload.ts` | Emits `household_commit_v1` |
| `web/lib/pos/processingIdentity/sources/householdFromCommitSelection.ts` | Selection ↔ `IntakeHouseholdCandidate` |
| `web/lib/admin/actions/createLead/adapters/mapHouseholdToCreateLeadFields.ts` | Household → flat `first_name` / `child_*` |
| `web/lib/admin/actions/createLead/adapters/mapFactsToCreateLeadIntake.ts` | Facts → intake (parse / modal) |

**Draft shape reality (F5-02 target):**

- Flat `draft.values[]` — primary adult + shared context keys (eligibility / Conversation legacy projection)
- `draft.household` — either `IntakeHouseholdCandidate` (from parse) **or** `CreateLeadCommitSelection` (after Form edits)
- Resolution order: stored selection → intake household → flat fallback (`resolveCreateLeadCommitSelectionFromDraft`)

**Suspected QA defect seams (do not fix in F5-01):**

1. **Two adults → Form shows only Trey:** flat primary sync (`syncCreateLeadValuesFromCommitSelection` / `applyCreateLeadCommitSelectionToDraft`) can overwrite primary flat keys; Conversation understanding or a later parse may rebuild selection with wrong primary; Form summary uses `summarizeCommitParents(commitSelection)` — if selection collapsed to one parent, summary matches.
2. **Stale Conversation “Still needed”:** missing-state cards may be transcript history or derived from flat values while selection already has Trey’s email/phone; eligibility may not recompute from full selection.
3. **Location:** platform gather includes `location_id`; progressive Form person/child sections use **repeaters** and context gather for placement — if effective sections omit Location or option cascade never binds, Review can appear available while Location is still missing (client/server mismatch risk).

---

## 4. Intake / required fields / Location

| File | Role |
|---|---|
| `web/lib/lifecycle/fetchActionIntakeSpec.ts` | Client fetch |
| `web/app/api/admin/lifecycle/action-intake-spec/route.ts` | API |
| `web/lib/lifecycle/resolveActionIntakeSpec.ts` | `resolveCreateLeadActionIntakeSpec`, validate / missing labels |
| `web/lib/admin/actions/createLeadPlatformGather.ts` | Platform gather catalog; `location_id` required in platform minimum |
| `web/lib/admin/actions/resolveCreateLeadRequiredFields.ts` | Gather fields from spec + platform extras |
| `web/lib/bos/commandSession/conversationIntake/buildEffectiveCreateLeadIntakeSpec.ts` | Session effective spec + unsupported partition |
| `web/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy.ts` | Platform always requires `location_id` |
| `web/lib/admin/actions/resolveCreateLeadDefaultLocation.ts` | Default location heuristics |
| `web/lib/admin/hooks/useInquiryChildPlacementCascade.ts` | Site / program / room options (controller) |
| `web/lib/platform/commands/createLead/createLeadRequiredInputs.ts` | Command-model required inputs / eligibility |

**Invariant for F5-04:** if a field can block Create Lead, Form must expose a control; Conversation and Form both project supported types from the same effective spec.

---

## 5. Parse / Conversation adapter

| File | Role |
|---|---|
| `web/lib/bos/commandSession/conversationIntake/createLeadConversationIntakeAdapter.ts` | Bounded Conversation Intake Adapter |
| `web/lib/bos/commandSession/adapters/createLeadAdapter.ts` | Parse → draft; preview; execute; revalidate |
| `web/lib/intake/adapt/parseCreateLeadIntakeText.ts` | Parser implementation |
| `web/lib/intake/map/mapFactsToActionIntake.ts` | Facts → flat candidates + household |
| `web/lib/bos/commandSession/createLeadUnderstandingPresentation.ts` | Understanding / Review groups |
| `web/lib/bos/commandSession/createLeadSectionPresentation.ts` | Progressive Form section models |

**Parse mapping:** extraction fields → `draft.values`; `extraction.household` → `draft.household`. Multi-member execute payload built when converting to `household_commit_v1`.

---

## 6. Review / Processing / execute / success

### Review (session)

- Phases: `preview` / `confirming` via reducer + `BosCommandSessionHost` `ReviewBody`
- Preview: `createLeadConversationIntakeAdapter.buildReview` / `buildCreateLeadBosPreview`
- Gate: host `canReview` + controller fingerprint before confirm/execute

### Processing

| File | Role |
|---|---|
| `web/lib/admin/actions/entryLifecycleActions.ts` | `executeCreateLeadAction` → `mode: "processing_review"` |
| `web/lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts` | `ingestCreateLeadThroughProcessing` |
| `web/app/adminV2/processing/IdentityReviewPanel.tsx` | Operator identity review (session + modal) |

**Rule:** no person / CRM rows before Processing approval / commit boundary.

### Execute spine (canonical for both UIs)

```text
executeCreateLeadFromBosDraft  OR  CreateLeadCommandSurface.onSubmit
  → executeCreateLeadCommand
  → POST /api/admin/actions/execute
  → createLeadAction / executeAdminAction
  → executeCreateLeadAction
  → ingestCreateLeadThroughProcessing
```

| File | Role |
|---|---|
| `web/lib/platform/commands/createLead/executeCreateLeadCommand.ts` | **Single client execute adapter** |
| `web/app/api/admin/actions/execute/route.ts` | HTTP entry |
| `web/lib/admin/actions/executeAdminAction.ts` | Server dispatch |
| `web/lib/admin/actions/entryLifecycleActionClient.ts` | `postAdminActionExecute`; legacy `executeCreateLeadFromModal` (compat export) |

### Success / Open Lead / refresh

| File | Role |
|---|---|
| `BosCommandSessionHost` SuccessBody | Explicit Open Lead; Create Another; no auto Focus Panel |
| `web/lib/admin/opportunityQueueRefreshEvent.ts` | `dispatchOpportunityQueueUpdated(..., "create_lead")` |
| `web/lib/admin/canonicalOperatorRoutes.ts` | `resolveCreatedLeadFocusPanelHref` |
| `web/lib/platform/commands/createLead/createLeadSuccess.ts` | Success descriptor |

---

## 7. Classification cheat sheet

| Surface | Class | Draft | Execute |
|---|---|---|---|
| Slash `/create-lead` | Canonical | `BosCommandDraft` | `executeCreateLeadFromBosDraft` |
| Actions / Commands (flag on) | Canonical | session | same |
| `adminv2:open-create-lead` (flag on) | Canonical | session | same |
| Modal (`NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`) | **Legacy** | local React state | `executeCreateLeadCommand` |
| Server | Canonical | N/A | `executeCreateLeadAction` → Processing |

---

## 8. Retirement inventory (F5-08 — after certification only)

### Candidates to remove (modal / dual-product)

- `CreateLeadModal.tsx` and Action Workspace BOS chrome stack listed in §2d (after all consumers migrate)
- Modal-only columns / progress rail / commit preview panels if unused elsewhere
- `bosCreateLeadSessionFlag.ts` + env `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION`
- `CreateLeadEventHost` **modal branch** (keep event → session start)
- `executeCreateLeadFromModal` if no remaining callers
- `actionWorkspaceDrawerHandoff.ts` if modal-only
- Dev galleries under `web/app/dev/action-workspace-*` if orphaned
- Stale docs claiming dual path as permanent

### Must NOT delete

- Entire `web/lib/bos/commandSession/**` (except flag file post-cleanup)
- `executeCreateLeadCommand` + platform `createLead/*` model/success
- `executeCreateLeadAction` + Processing identity adapters
- Platform gather / required fields / intake resolve
- Commit selection + household commit + map payload
- Parse pipeline (`parseCreateLeadIntakeText`, intake map)
- Location cascade / policy
- Registered `create_lead` action + canonical registry entry
- Queue refresh + focus panel href helpers
- Session UI `commandSession/CreateLead*`

### Test migration notes

**Modal / flag sensitive (update or retire with F5-08):**

- `web/tests/presentation/rightRail/createLeadEventHost.test.tsx`
- `web/tests/adminV2/actions/createLeadCommandSurfaceWiring.test.ts`
- `web/tests/admin/actions/actionWorkspaceFoundation.test.ts`
- `web/tests/admin/actions/createLeadModalCleanup.test.ts`
- `web/tests/admin/actions/createLeadSuccessUx.test.tsx`
- `web/tests/admin/actions/createLeadHouseholdReview*.tsx`
- Playwright `action-workspace-drawer-regression.spec.ts`

**Canonical session (keep / extend in F5-09):**

- `web/tests/bos/commandSession/**`
- `web/playwright/tests/bos-create-lead-command-session-smoke.spec.ts`
- `web/tests/adminV2/actions/executeCreateLeadCommand.test.ts`
- `web/tests/platform/commands/createLead/**`
- `web/tests/processing/processingIdentityD4CreateLead.test.ts`

### Pre-deletion checklist (F5-08)

1. Map every import of modal host / flag / `adminv2:open-create-lead` modal branch
2. Migrate remaining entry points to session
3. Prove no orphan listeners / events / env docs
4. Add guard test: one canonical BOS Create Lead host + execute path
5. Remove flag; certify unreachable modal path
6. Update platform docs (ai-platform, actions-and-workflows, bos-foundation, capabilities)

---

## 9. F5-01 package contract

| | |
|---|---|
| **Objective** | Exact repository trace of every Create Lead path + retirement inventory |
| **Files touched** | This doc + `round-5/README.md` + ledger update only |
| **Preconditions** | Worktree slot 2; no push |
| **Tests** | None (docs) |
| **Browser acceptance** | None |
| **Evidence** | This inventory |
| **Commit boundary** | Docs-only commit allowed when Kelly requests |
| **Non-goals** | Any product/code fix; parser/LLM work; retirement deletion |

---

## 10. Ordered next packages (code starts at F5-02)

1. **F5-02** — Stable repeater IDs; selection is sole multi-adult/child truth; Form edits never overwrite wrong adult; primary stable across turns
2. **F5-03** — Parsed household → Form parity; mode switch / restore preserve rows
3. **F5-04** — Effective spec drives Form including Location + all blocking `record_creation` fields
4. **F5-05** — Missing/eligibility derived from current draft (selection + flat); stale transcript ≠ current Still needed
5. **F5-06** — Review real stage; Processing handoff preserves session + subject binding
6. **F5-07** — Confirm / execute / success / refresh / Open Lead / Create Another
7. **F5-08** — Delete old path after certification
8. **F5-09** — Tests + Playwright + docs
9. **F5-10** — Pause closeout: `BOS CREATE LEAD COMPLETE — OLD PATH RETIRED — BOS PAUSED`

---

## 11. Stop conditions (report before proceeding)

- Processing must be bypassed to ship
- New DB table required
- Registered `create_lead` cannot accept complete effective draft
- Location / blocking fields cannot be represented without changing field ownership
- Unidentified legitimate consumer of old path at retirement time
- Foundational runtime redesign required

Do **not** stop for normal bounded defects — fix at the correct owner in F5-02+.

---

## F5-01c gate (product decisions)

Binding decisions after path trace: [`PRODUCT-DECISIONS.md`](./PRODUCT-DECISIONS.md).

Command-authority inspection (named constraint lane + staging Location ownership): [`evidence/command-authority-comparison.md`](./evidence/command-authority-comparison.md).

**F5-02+ product code remains gated** until those documents are accepted. Premature Placement / BOS-only Location work must be realigned to entity-group Form ownership.
