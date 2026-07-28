# BOS Create Lead — execution map (pre-generalization)

**Mission:** BOS Command Runtime Convergence  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory`  
**Branch:** `agent/cursor/1-commands-system-inventory`  
**Staging:** already reconciled at `df12fca95` (0 behind `origin/staging` as of this audit)  
**Surface Command Exposure:** stopped/reverted (`ea10ed500`); BP Process Actions remain exposure owner  
**Date:** 2026-07-28  
**Scope:** Discovery only — map before generalizing

---

## Architecture verdict (Create Lead today)

```text
BOS slash / session UI
  → createLeadAdapter (gather / preview / confirm)  [Create-Lead-specific]
  → executeCreateLeadFromBosDraft
  → executeCreateLeadCommand (client)
  → POST /api/admin/actions/execute
  → executeCommandInvocation (Command Runtime facade)  [when create_lead facade-supported]
  → RegisteredAction create_lead executor
  → domain mutation + Processing review path
```

**Mutation ownership:** Server execute route + RegisteredAction / Runtime — **not** a BOS-owned executor.  
**Gap:** Live slash discovery does **not** yet pass `processEffectiveCommandKeys` (helper exists; UI unwired). Adapter allowlist is hardcoded to `create_lead` only.

---

## 1. Discovery

| Question | Answer |
|----------|--------|
| How does BOS know Create Lead exists? | `queryBosSlashCatalog` walks `listRegisteredActionKeys()` for `bosProposalSupport`; Round-2 product only **shows** keys in `BOS_SLASH_SESSION_ADAPTER_KEYS` (`["create_lead"]`). |
| Hardcoded? | **Yes** — adapter allowlist is hardcoded. Create Lead also has special-case label/token copy in the catalog. |
| Process-effective Commands? | **Library support yes** — `resolveBosProcessEffectiveCommandKeys` → `projectProcessRuntimeCommands`. **Live shell no** — `AICommandSurfaceShell` calls `queryBosSlashCatalog({ query })` only. |
| Stage recommendations? | Projection accepts `stageKey` / `stageActionCatalog`; live slash does not supply them. |
| Invent outside process set? | **Live UI can** (process keys omitted ⇒ filter skipped). **Tests** prove filter blocks when keys provided. |
| Active BP / stage / WU / subject | Workspace scope from global assistant (`department_id`, `work_unit_id`); subject for create_lead uses synthetic `CREATE_LEAD_ACTION_ENTITY_ID`. Process record not resolved in slash path today. |

**Files:**

- `web/lib/bos/commandSession/slash/queryBosSlashCatalog.ts`
- `web/lib/bos/commandSession/slash/resolveBosProcessEffectiveCommandKeys.ts`
- `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` (`slashItems` ~680)

---

## 2. Conversation / input collection

| Concern | Mechanism |
|---------|-----------|
| Required fields | `ActionIntakeSpec` via Create Lead conversation intake (`buildEffectiveCreateLeadIntakeSpec`, `createLeadConversationIntakeAdapter`) — entity form / intake parity, not generic Command metadata alone |
| Missing values | Session phases: `gathering` → field prompts / progressive form (`CreateLeadProgressiveForm`, repeaters) |
| Validation | Draft value states (`missing_required`, `inferred`, `invalid`); effective-intake filters strip inactive entities |
| Partial progress | `BosCommandDraft` + session reducer + persistence (`commandSessionPersistence`) |
| Resume | Session host / persistence; fingerprint guards stale preview |

**Create-Lead-specific:** household repeaters, Processing-review side effects, intake parse (`parseCreateLeadIntakeText`), commit selection (`createLeadRepeaterDraft`).

**Reusable session shell:** `BosCommandSessionHost`, `reduceSession`, draft fingerprint, preview/confirm phases, `BosCommandAdapter` interface.

**Files:**

- `web/lib/bos/commandSession/adapters/createLeadAdapter.ts`
- `web/lib/bos/commandSession/conversationIntake/*`
- `web/app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts`
- `web/lib/bos/commandSession/types.ts` (`BosCommandAdapter`, phases)

---

## 3. Invocation

| Question | Answer |
|----------|--------|
| API | `POST /api/admin/actions/execute` via `executeCreateLeadCommand` |
| Command Runtime? | **Yes on server** — facade-supported `create_lead` → `executeCommandInvocation` exactly once in route |
| Direct RegisteredAction bypass from BOS? | BOS does not import the domain executor; it uses the shared execute HTTP path |
| Actor / org | Server-owned in execute route (`getAdminContextCached`); client must not supply actor |
| Confirmation / preview | BOS session preview + operator confirm; fingerprint must match before execute |
| Destructive | Create Lead is non-destructive; Runtime still owns confirmation policy for other Commands |

**Files:**

- `web/lib/platform/commands/createLead/executeCreateLeadCommand.ts`
- `web/app/api/admin/actions/execute/route.ts`
- `web/lib/platform/commands/runtime/executeCommandInvocation.ts`

---

## 4. Completion

| Outcome | Behavior |
|---------|----------|
| Success | Often **Processing review** first (`processing_review` phase) — records finalize after Processing commit |
| Focus / WU | Success payload may include opportunity / processing case ids; controller navigates / continues session |
| Structured result | `BosCommandExecutionResult` / `ActionResultOk` |
| Events | Emitted by canonical executor path, not by BOS |

---

## 5. Error handling

Covered in adapter/session: validation/missing inputs (gather), stale preview fingerprint, execute HTTP failure (retryable), Processing vs direct success branches. Permission / unsupported / process-unselected should fail at discovery (once wired) and again at Runtime authorization.

---

## 6. Hardcoded vs reusable

| Element | Classification |
|---------|----------------|
| Session phases, draft, fingerprint, preview/confirm shell | **Reusable** |
| Slash catalog query shape + process key filter | **Reusable** (needs live wiring + multi-adapter registry) |
| `BOS_SLASH_SESSION_ADAPTER_KEYS = [create_lead]` | **Hardcoded** — replace with adapter registry |
| Create Lead intake spec / household / Processing copy | **Command-specific adapter** |
| `executeCreateLeadCommand` thin HTTP client | **Pattern reusable** as `executeCommandViaActionsApi(commandKey, …)` |
| Create Lead label special-cases in slash | **Hardcoded** — use registry labels |

---

## 7. Conversation Runtime alignment

BOS already has a **command-session** conversation intake layer under `lib/bos/commandSession/conversationIntake/`. After staging merge (Phase 7 packet/participant projection), Participant Runtime packet work lives under `lib/pos/packet/*` — **adjacent, not the same BOS session engine**.

**No stop yet** for two incompatible conversation models — BOS command-session is the practical Conversation Plan for Commands; packet participant projection is a separate product surface. Align by shared Intent→Requirements→Invoke vocabulary; do not merge packet UI into BOS this mission.

---

## 8. Inheritance rules — current honesty

Required precedence (mission):

```text
command_set_v1 → stage → WT → capability support → subject validity → auth at invoke
```

**Today:** Runtime projection helpers exist; BOS slash live path skips process/stage. Placement filter exists in catalog API but is unused in shell (and **must not** become BOS eligibility authority per corrected product decision).

---

## Immediate generalization increments (planned)

1. Wire live BOS discovery to `resolveBosProcessEffectiveCommandKeys` (department → process).
2. Remove Surface/placement as BOS eligibility (do not pass `placedActionKeys` as authority).
3. Introduce adapter registry beyond `create_lead`.
4. Shared invoke helper → same execute route / Runtime.
5. Prove mutation + relationship + confirmation Commands with thin adapters or generic preparation where possible.
6. Coverage ledger for all Commands.

---

## Regression after Surface stop

```text
Commands + process authority + BOS slash + Surfaces UI
→ 29 files / 292 passed
```
