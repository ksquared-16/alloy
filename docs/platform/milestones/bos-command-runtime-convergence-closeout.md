---
owner: platform
status: frozen
last_reviewed: 2026-07-28
supersedes: []
---

# BOS Command Runtime Convergence — Architecture Closeout (Mission 1)

**Status:** FROZEN closeout (2026-07-28). Mission accepted. Architecture complete. Ready for integration.

This document is the long-term reference for what Mission 1 accomplished. It is **not** an implementation log. Sprint/mission evidence remains under `qa/missions/commands-*msn_188e8bea6fb6de28dd21*`.

**Browser certification** for interactive walks is classified **environment-blocked** (local Next instability under machine pressure). That classification is accepted and is **not** an architecture blocker. Automated shared-bridge proofs remain promotion evidence.

---

## 1. Mission summary

**Before:** BOS could look like a special mutation engine for Create Lead, with discovery and execution paths that did not clearly prove every Command family shares one Runtime.

**After:** Business Process selects effective Commands; BOS prepares and confirms; a shared client bridge invokes Command Runtime once; existing domain executors own durable writes and events.

**Why it matters:** Operators get one trusted Command model across Assist and manual UI. Alloy can grow conversational coverage without inventing parallel write paths or a standalone Commands product.

---

## 2. Before

```text
BOS
 ├── Create Lead (session + Processing intake)     ← looked like “the” BOS path
 ├── bespoke mutation clients (e.g. /mutations/execute)
 ├── bespoke relationship clients (e.g. /relationship-actions/execute)
 └── bespoke tour cancel REST (no Runtime preview token)
```

Why this did not scale:

- Each family risked a private BOS mutation architecture.
- Process `command_set_v1` authority was easy to bypass in live slash discovery.
- Surfaces / placements could be mistaken for Command configuration.
- A standalone Organization Commands product would have duplicated Process ownership.

---

## 3. After (canonical platform diagram)

```text
Business Process (command_set_v1)
        ↓
Effective Commands
        ↓
BOS (slash / session placement)
        ↓
Preparation Adapter (bosCommandAdapterRegistry)
        ↓
Shared Runtime Bridge (executePlatformCommandViaActionsApi)
        ↓
POST /api/admin/actions/execute
        ↓
Command Runtime (executeCommandInvocation)
        ↓
Domain Executor (RegisteredAction / Mutation / Relationship / Tour / …)
        ↓
Events / Result
```

This is the **canonical** BOS → Command path. Create Lead remains the richest preparation example; it is not a special write architecture.

---

## 4. Proven Command families

| Family | Representative Command | Preparation model |
|--------|------------------------|-------------------|
| Record creation | `create_lead` | Create Lead conversation intake (owner-accepted reference) |
| Existing-record mutation | `update_lead_status` | Generic payload fields |
| Relationship | `add_parent_guardian` | Relationship subject + identity |
| Confirmation-governed | `cancel_tour` | Confirmation-only + server preview token |

**Why representatives are enough:** Mission 1 proves the architecture, not conversational coverage of every capability. Runtime-executable ≠ BOS-ready. Honesty in the coverage ledger is success.

---

## 5. BOS responsibilities

**BOS owns:**

- Discovering **process-effective ∩ adapter-ready** Commands (slash / session start)
- Gathering missing preparation inputs (conversation and/or form over one draft)
- Building client preview / confirmation UX (and requesting server preview when policy requires it)
- Invoking the shared Runtime bridge after operator confirm
- Presenting results / recovery without owning durable mutation

**BOS intentionally does not own:**

- Durable mutation / domain writes
- Authorization (server / Runtime)
- Executor logic or domain invariants
- Business Process Command selection (`command_set_v1`)
- Surface configuration of which Commands exist
- Inventing Commands outside process-effective keys

---

## 6. Command Runtime responsibilities

- Resolve capability honesty and execution owner
- Authorization and operational context
- Validation / eligibility / preparation snapshots
- Invocation governance and **exactly-once** delegation guards
- Preview / confirmation policy enforcement (including destructive preview tokens)
- Delegation to the canonical domain executor
- Normalized results back to the placement

---

## 7. Business Process responsibilities

- Sole process-wide Command selection authority: **`command_set_v1`**
- Stage recommendation / evaluation metadata for **selected** Commands only
- Work Template constraints gated to process-selected Commands

**Surfaces do not configure Commands.** Surfaces render layout and presentation. Process Actions / `command_set_v1` remain ownership. A Surface Command Exposure product was investigated and **rejected**.

Standalone Organization Commands as an operator configuration product was **rejected**. `/organization/commands` is internal capability diagnostics only.

---

## 8. Runtime guarantees

| Guarantee | Status |
|-----------|--------|
| BOS never invents Commands outside process-effective ∩ adapter-ready | Live slash fail-closed |
| Business Process remains selection authority | `command_set_v1` |
| Authorization stays Runtime / server-owned | Execute route |
| Existing executors remain authoritative | No BOS-owned writers |
| Exactly-one client invocation per Confirm through the shared bridge | Adapter + unit proofs |
| No bespoke BOS mutation paths for the proven families | Bridge-only network call |
| Surfaces do not own Command configuration | Rejected / reverted |

---

## 9. Current BOS coverage (summary)

Full ledger: `qa/missions/commands-bos-coverage-ledger-msn_188e8bea6fb6de28dd21.md`

| Disposition (examples) | Meaning |
|------------------------|---------|
| **BOS Ready** | Adapter shipped; process-gated discovery |
| Needs domain / generic preparation adapter | Runtime exists; BOS preparation not shipped |
| Confirmation / destructive adapter | Needs strong-confirm / preview UX |
| Requires Conversation Runtime | Rich multi-turn collection deferred |
| Navigation only | Not a mutation Command |
| Operator only / Focus Panel | Manual surface preferred |
| Unsupported / placeholder / processing-only | Honesty — not forced into BOS |

---

## 10. Remaining work (not this mission)

- Universal **Conversation Runtime** (separate mission; Create Lead keeps a bounded intake adapter)
- Richer preparation adapters for additional Runtime-executable Commands
- Broader conversational coverage where product chooses it
- Explicitly non-conversational Commands (remain Focus Panel / operator UI)
- Placeholder and unavailable capabilities
- Interactive browser certification on a stable localhost (operator checklist; env-blocked in Mission 1)

Do **not** treat these as incomplete Mission 1 architecture.

---

## 11. Integration notes (reviewer guide)

**Review:**

- Shared bridge + adapter registry + process-gated slash discovery
- Representative family adapters (preparation only)
- Host dispatch: Create Lead body vs generic preparation body
- Coverage ledger honesty
- Docs: this closeout + `actions-and-workflows.md` / `ai-platform.md` alignment

**Intentionally changed:**

- BOS discovery and prepare → one Runtime invoke path for proven families
- Process-effective gating on live slash
- Doctrine: Surfaces do not configure Commands; standalone Commands product rejected

**Intentionally did not change:**

- Domain executors and Mutation / Relationship / Tour ownership
- Create Lead Processing intake semantics (no polish pass)
- Conversation Runtime / Participant Runtime
- Every Capability Registry entry’s conversational UX

---

## 12. Final mission verdict

**Mission accepted.**  
**Architecture complete.**  
**Ready for integration.**

Browser certification remains **environment-blocked only**.  
**No known architecture blockers.**

---

## Evidence index

| Artifact | Role |
|----------|------|
| `qa/missions/commands-bos-command-runtime-convergence-msn_188e8bea6fb6de28dd21.md` | Execution map + convergence evidence |
| `qa/missions/commands-bos-coverage-ledger-msn_188e8bea6fb6de28dd21.md` | Honest Command dispositions |
| `qa/missions/commands-bos-browser-qa-msn_188e8bea6fb6de28dd21.md` | Browser / env-block classification |
| `qa/missions/commands-bos-browser-env-block-msn_188e8bea6fb6de28dd21.txt` | Machine evidence for env block |

Related canonical modules: `../modules/actions-and-workflows.md`, `../modules/ai-platform.md`, `../core/business-process-system.md`.
