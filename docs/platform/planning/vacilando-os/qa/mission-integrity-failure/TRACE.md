# Mission-Integrity Failure — trace & authority model

Failed run: `msn_d32a9c061f9615d429` (Access & Roles), executed + accepted, but it performed the generic "refresh the V2 proposal" objective, not the operator's substantial discovery scope. Evidence preserved alongside this file (01–04).

## Trace table

| Stage | Expected authoritative intent | Actual authoritative intent | Source |
|---|---|---|---|
| Operator request | The operator's discovery scope (inventory authority paths, security model, contradictions, future model, delivery sequencing, **do not build V2**) | Same, entered via "Shape this work" | operator input (a long paste) |
| Director interpretation | Interpret the discovery scope as the mission | Interpreted the input as a **product decision** | `replyToDirector` → `addProductDecision` |
| Shared Understanding | The discovery direction is the intent | Scope shown as a **"You decided" claim**; intent stayed `"Access & Roles V2"` | `product-definition` accepted_decisions |
| Proposed mission (objective) | Objective = the operator's discovery scope | Objective = **templated** "Analyze… produce the V2 proposal" | `mission-compiler.compile()` (hardcoded, ignores `mission.intent`) |
| Operator approval | Approve the discovery objective | Approved a Ready package whose objective was the template (never shown as the contract) | `startMission` (no contract review) |
| Execution contract | Worker does the discovery | Worker prompt = **templated objective** + the scope as "ACCEPTED DECISIONS" context | `serializePackagePrompt` |
| Verification | Test discovery outputs | Tested **generic-proposal** criteria (file exists, sections present) → auto-met | `acceptance.evaluateMission` |

## Root cause (earliest layer)

**Mission compilation.** `compile()` compiles exactly one mission class — the templated "produce the V2 proposal" — and **never reads `mission.intent`**. The objective, scope, deliverables, and acceptance criteria are all derived from the capability template. The operator's intent could only enter as a *decision* (supporting context), never as the objective. Everything downstream (worker prompt, acceptance) inherited the wrong objective faithfully. Fixing the worker prompt would be a patch over wrong mission state; the fix belongs in compilation and in the input path that feeds it.

## Authority model (current-intent precedence — using the frozen architecture)

The Constitution rule holds: *the operator authors; Director counsels.* Precedence, highest first:

1. **Current, explicitly-approved operator direction** (the mission's intent) — authoritative for objective, deliverables, scope, exclusions, acceptance.
2. **Confirmed operator decisions** — refine within that direction; cannot replace it.
3. **Current Shared Understanding** — reflects 1–2; derived, not authoritative on its own.
4. **Director recommendations** — advisory; become authoritative only when the operator accepts them.
5. **Prior missions / attempts** — evidence & continuity (continue / reconcile / supersede / restart / new), never automatic authority.
6. **Capability defaults / seeded product definitions / generic templates** — the *fallback* only when the operator gave no substantial direction.

Invariants:
- A substantial operator direction outranks the generic capability template (fixes this failure).
- A mission cannot execute until objective/deliverables/exclusions/acceptance reflect the approved direction.
- Material change after approval (objective/deliverables/exclusions/acceptance/continuation) returns the mission for re-approval.
- Verification evaluates the *approved* mission; evidence for a generic proposal cannot satisfy a discovery objective.
- Two materially different missions are never silently combined.

## Raw evidence
Bulky raw captures (full conversation JSON, mission/package/outputs, execution outputs) are archived locally at `~/.local/state/alloy-dev/_mission-integrity-evidence/` (kept out of the repo to avoid bloat). The regression is durably protected by tests in `mission-runtime.test.mjs`.
