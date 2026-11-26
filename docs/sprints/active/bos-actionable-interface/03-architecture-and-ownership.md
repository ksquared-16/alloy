---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 03 — Architecture and Ownership Decisions

## Core law

BOS is a **placement and interaction surface** over the **Operational Command Runtime**.

It must not become: parallel action runtime, parallel mutation path, privileged AI API, second form engine, second identity resolver, second Processing runtime, second command lifecycle, or client service-role shortcut.

**Runtime binding (resolves doctrine Contradiction #2):** V1 binds exclusively to  
`RegisteredAction` → `POST /api/admin/actions/execute` → command-owned side effects (for Create Lead: Processing intake).  
The unfinished Mutation Execution Runtime (`POST /api/admin/mutations/execute`) is **out of scope** and must not be mixed into BOS command sessions.

---

## Decisions 1–25

| # | Decision | Answer |
|---|---|---|
| 1 | What is a BOS command session? | Client-owned provisional workspace for **one** registered command invocation: transcript segment + shared draft + mode + phase. |
| 2 | Durable or ephemeral? | **Ephemeral** in V1: `sessionStorage` (survives reload in-tab). No new durable tables. Cross-device drafts deferred. |
| 3 | Identifier? | `sessionId: string` (`bos_cmd_<ulid>`). Optional `correlationId` for audit. |
| 4 | Who owns transcript? | BOS command session (client). Ambient Orchestrator transcript remains separate. Server audit does not store full chat; stores confirmed payload + Processing evidence. |
| 5 | Who owns command draft? | `BosCommandDraft` inside the session — single mutable source of truth for inputs. |
| 6 | Who owns parsed values + evidence? | Draft `values[]` with `BosInputEvidence`. Parser writes evidence; operator edits supersede. |
| 7 | Who owns form values? | Projection of the same draft. Form never has a private store. |
| 8 | Conversation/Form sync? | One draft; mode switch re-renders projections. Latest write wins; stale parser responses discarded via `requestSeq`. |
| 9 | When is Processing Case created? | **Only when registered `create_lead` execute succeeds** in opening/reusing a case — same as today. Not at conversation start. |
| 10 | Every conversational command = Processing Case? | **No.** Adapter declares `executionKind: "processing_intake" \| "direct_registered_execute" \| "assist_proposal"`. Only Create Lead uses processing_intake in V1. |
| 11 | How Create Lead reuses Processing without coupling all commands? | Create Lead adapter calls existing `executeCreateLeadCommand` → `ingestCreateLeadThroughProcessing`. Generic session runtime only knows the adapter interface. |
| 12 | Generic extension contract? | `BosCommandAdapter` per `actionKey`: deriveDraftFromParse, validate, buildPreview, toExecutePayload, mapSuccess, optional slash descriptors. |
| 13 | Selected command representation? | `BosCommandInvocation { actionKey, label, placement, contextResolution: "bos_proposal", workspaceContext }`. Never expose raw keys in operator copy. |
| 14 | Slash → registered capability? | Catalog query over authorized registered actions + BOS capability registry; slash token maps to `actionKey` / capability, not free-form strings. |
| 15 | Permissions / placements? | Client filters discovery; **server re-checks** eligibility + RBAC + placement rules at preview/execute. Prompt-supplied action keys rejected unless in allowlist for operator. |
| 16 | BOS context vs authoritative subject? | Before commit: BOS context is provisional (`bos_proposal`). After commit: subject is created/linked records. Queue rows never authoritative. |
| 17 | Inferred confirm/override? | Operator edit or explicit confirm chip → `confirmed`. Unconfirmed inferred values may not satisfy required eligibility unless policy marks them acceptable (V1: inferred alone does **not** satisfy required; operator must confirm or type). |
| 18 | Persisted before confirmation? | Draft + transcript in sessionStorage only. **Zero** identity/opportunity rows. Processing case only after execute. |
| 19 | Survives navigation/reload? | Yes within tab via sessionStorage. Closing browser loses draft (documented). |
| 20 | Exact execution boundary? | `adapter.execute(draft)` → existing client adapter (`executeCreateLeadCommand`) → `POST /api/admin/actions/execute`. No BOS-owned write API. |
| 21 | Idempotency? | Reuse Create Lead SHA-256 intake key + Processing execution idempotency. Session stores `lastIdempotencyKey` after first execute. |
| 22 | Audit events? | Existing `action_executed` + Processing case/plan/approval/commit audits. Payload metadata records `input_provenance` (parsed vs operator) without raw prompt dumps of secrets beyond needed fields. |
| 23 | Refresh propagation? | `buildCreateLeadSuccess.refreshTargets` + `dispatchOpportunityQueueUpdated` — unchanged. |
| 24 | After success? | Success turn; session `phase: completed`; no auto-open; Open Lead explicit; optional follow-ups from authorized catalog later. |
| 25 | Daily briefings vs command sessions? | Briefings are `BosOperationalBriefingMessage` in ambient transcript. CTA starts a **new** command session. Briefings never mutate an open draft. |

---

## Ownership map

```text
Presentation / BOS shell
  AICommandSurfaceShell + BosPresentationController
    └── BosCommandSessionHost (new)
          ├── ConversationProjection
          ├── FormProjection (reuses CreateLeadOperationalIntake pieces)
          ├── Preview / Confirm (CommandSurfaceShell anatomy)
          └── Success / Recovery turns

Command draft + session state (client)
  bosCommandSession/* (new, thin)

Create Lead domain (existing)
  createLeadCommandModel, required inputs, intake parser,
  executeCreateLeadCommand, createLeadSuccess

Operational Command Runtime (existing)
  actionRegistry → /api/admin/actions/execute → executeCreateLeadAction

Processing (existing, Create Lead only)
  ingestCreateLeadThroughProcessing → IdentityReviewPanel → plan/approve/commit
```

---

## Layer responsibilities

| Concern | Owner |
|---|---|
| Chat UX / mode toggle | BOS presentation |
| Parsed command inputs | BosCommandDraft (client) |
| Field definitions / options | ActionIntakeSpec + existing providers |
| Eligibility / required | createLeadRequiredInputs (code) + config hints |
| Identity resolution | Processing (server) |
| Immutable plan | Processing |
| Final records | Processing executor |
| Audit | Action execute + Processing |
| Refresh | createLeadSuccess + queue events |

---

## Conversation as intake adapter (proven)

Target flow (Create Lead):

```text
BOS conversation
→ command identified (create_lead)
→ source text captured
→ parseCreateLeadIntakeText / ActionIntakeSpec mapping
→ draft values + evidence
→ missing/ambiguous follow-up (client eligibility)
→ preview (command model)
→ human confirm
→ executeCreateLeadCommand
→ Processing case + identity review (unchanged)
→ commit → success/refresh
```

**Do not** create a Processing Case at first paste. That would couple every conversational keystroke to durable cases and break “no identity writes before approval” only if facts were misused — more importantly it creates orphan cases. Keep case creation at execute.

---

## Contradiction resolutions baked into plan

| Contradiction | Resolution |
|---|---|
| Command Surface “shipped in docs” vs unwired | Wire for BOS Form/preview; keep rich intake components |
| Direct create vs Processing | Processing is current truth; update docs at closeout |
| bosProposalSupport true/false | Set both registries to **true** for create_lead in WP-01 |
| Two Command Surface meanings | BOS V1 uses Operational Command Surface only |
| update_status docs conflict | Out of scope for Create Lead V1; flag for separate doctrine fix |

---

## New persistence?

**None required for V1.** sessionStorage + existing Processing tables suffice.

If later product requires cross-device resume: prefer extending a BOS proposal durable table or Processing draft source — **not** a third identity store. Deferred.
