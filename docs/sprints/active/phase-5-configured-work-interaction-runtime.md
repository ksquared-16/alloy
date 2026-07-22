---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Configured Work Interaction Runtime (recon + plan)

**Mission:** make *any* configured work item executable through one generic platform interaction model behind the
accepted What's Next card. No business-process branches; enrollment is a validation fixture only. This document is the
**required pre-implementation recon** (the generic capability matrix + gap analysis + slice plan), grounded in code.

## Headline finding

The action → capability → host resolution and dispatch are **already largely generic and metadata-driven** — this is
*not* an enrollment toolbar today. Verified: **no** `stage ===` / `process ===` / `journey_segment ===` control-flow
branches exist in the current-work runtime or card. The card's `invokeAction` switches on a generic `plan.kind`
(`executeCurrentWorkAction.ts`), and host mode comes from `resolveCurrentWorkActionSurface.ts` (header:
*"Config-first, category-backed — no enrollment-specific branching"*). So the generic engine mostly exists; the work is
to (a) close the small number of name-based shims, (b) move the surface to the canonical centered drill-in, (c) enforce
command integrity, and (d) group requirements by ownership metadata — then retire the legacy full-page workspace.

## The non-generic residue (exact locations)

Three name/key branches remain — the only things standing between "mostly generic" and "fully generic":
1. **`isScheduleTourRegistryAction`** (`scheduleTourWorkUnitActions.ts:11`) — matches `schedule_tour`/`reschedule_tour`
   by name → forces `inline_form`/tour modal (`resolveCurrentWorkActionSurface.ts:78`, `CurrentWorkActionPanel.tsx:109`).
   **The one genuine business-action-name → host branch.**
2. **`HEADER_DELEGATE_KNOWN_KEYS`** (`resolveCurrentWorkActionSurface.ts:26`) — a registry-key allowlist forcing
   `header_delegate`. Compat shim, not a journey branch, but still name-keyed control flow.
3. **`isEnrollmentIntentAction`** (`classifyCurrentWorkActions.ts:77`) — filters `move_to_waitlist`/`enroll_subject`/
   `close_lead` intent keys from a fallback; bypassed when `allowedActionKeys` is configured.

All three should become **capability-metadata driven** (host mode / input-schema declared by the capability, not
inferred from its key).

## Required deliverable — Generic capability matrix

Classified by **generic capability type**, never by name. "Host mode" is the canonical presentation host the capability
owns. Evidence = current enrollment config (Wenc/Digan).

| Configured interaction (fixture) | Runtime descriptor (today) | Capability type | Capability key | Host mode (canonical) | Current behavior | Required convergence |
|---|---|---|---|---|---|---|
| "Message" | `CurrentWorkActionVM` (category `communication`) | communication | `quick_message` | centered compose (Communications capability) | ✅ generic — resolves via `category === "communication"` → `communications_composer` → `resolveCommunicationsComposerAction` (opens canonical Compose modal, confirmed in QA) | none for dispatch; capability should *declare* host=compose rather than infer from category |
| "Schedule tour" | `CurrentWorkActionVM` | scheduling | `schedule_tour` | canonical scheduling surface (tour modal) | ⚠️ name-branch: `isScheduleTourRegistryAction` → `inline_form` → tour modal | declare host=`inline_form`/scheduling in capability metadata; delete the name check |
| "Send form" | `CurrentWorkActionVM` | forms | `send_form` | header/workflow capability | ⚠️ `HEADER_DELEGATE_KNOWN_KEYS` allowlist → `header_delegate` | declare host in capability metadata; remove key from allowlist |
| "Record outcome" | reserved handler | outcome declaration | `record_outcome` | outcome picker (centered) | ✅ reserved handler-key short-circuit (`handlerKey === "record_outcome"`) → picker (currently in workspace) | move picker into the centered host (Slice D) |
| Lifecycle move (e.g. "Move to Qualification") | process-transition action | lifecycle transition | `process_stage_transition` (target in `actionRef`) | canonical lifecycle transition handler | ✅ generic — `isProcessTransitionAction` (metadata), target from `actionRef`; derived from BP runtime `otherTransitionsFromProcess` | expose in the centered host (Slice E); today only reachable in the workspace's "Other transitions" |
| Missing-info handoff (Program, Date of Birth) | readiness item → owner scope | requirement ownership | n/a | owner card (centered elevate) | ⚠️ owner inferred by `inferWorkItemOwner` **label regex** + `scope`; not true ownership metadata | group by runtime-provided ownership metadata (Slice E), not label heuristics |

## Canonical hosts to reuse (never re-implement)

- **Centered drill-in / Focus Card:** `useReportPerspective(coordination, card, "focused"|"edit")` → host raises the
  card to a centered ~560px surface with zoom-from-origin + scrim (`FocusPanelCardGrid.tsx`; used by Household,
  Children, Communications, BillingPreview). **`current_work` is currently EXCLUDED** (`WORK_OWNING_CARDS`,
  `isFocusElevatingCard` in `focusPanelCoordinationModel.ts:165/181`) and uses a full-canvas-replace workspace instead.
- **Communications compose:** `coordination.resolveCommunicationsComposerAction()` → canonical Compose modal (verified).
- **Registered capability execution:** `runRegisteredAction` (`actionExecutor.ts:126`) with the eligibility gate
  (`resolveEligibility` → blockers). Only 3 real handlers today (`update_status`, `create_lead`, `confirm_tour`); the
  rest are `CanonicalActionDefinition` metadata routed to `admin_execute`/`relationship_execute`/`dedicated_modal`/
  `ui_intent` executors.
- **Eligibility:** `ActionEligibility { eligible, blockers, availableTransitions, requiredInputs }`. Note:
  `CurrentWorkActionVM` has **no eligibility field today** — command integrity (Slice F) needs it threaded in.

## Slice plan (mapped to what already exists)

- **Slice A — Generic centered configured-work host.** Flip `current_work` from canvas-replace workspace to the
  canonical centered Focus Card: add `current_work` to elevation eligibility (`isFocusElevatingCard`), have the card
  `useReportPerspective`, and render the work VM in the centered surface. *Structural; biggest change; needs auth QA.*
- **Slice B — Generic action→capability resolution.** Remove the 3 name shims; make host mode + input-schema come from
  capability metadata (`CanonicalActionDefinition.executor`/`inputSchema` or an added `hostMode`). *Metadata, additive.*
- **Slice C — Canonical capability convergence.** Route each configured action into its owning capability surface
  (compose / scheduling / forms / outcome) via the registry; the What's Next layer keeps **no** alternate versions.
- **Slice D — Generic outcome + transition rendering.** Render `completionOutcomes` and BP transitions from the runtime
  collections in the centered host; no target-state or outcome-name branches.
- **Slice E — Requirement ownership grouping.** Group missing requirements by **runtime ownership metadata** (replace
  the `inferWorkItemOwner` label regex), dedupe, drop internal ids, link to the owner's canonical surface.
- **Slice F — Command integrity.** Thread eligibility into `CurrentWorkActionVM`; before rendering an *enabled* action,
  prove capability resolves + subject valid + payload present + eligibility passes + host supported; else
  hidden/disabled-with-reason/blocked-with-handoff/config-error. No no-op buttons.
- **Slice G — Legacy workspace retirement.** Only after A–F prove parity, remove normal navigation to
  `CurrentWorkWorkspace`; keep shared runtime/capability code.

## Final proof — "Could a newly configured Business Process use this surface without adding presentation code?"

**Today: mostly, not fully.** Dispatch and host resolution are generic and process-agnostic (no stage/process
branches), so a new BP's communication/transition/outcome actions already render and route with **zero** presentation
code. **But** three name-based shims (`schedule_tour`, `HEADER_DELEGATE_KNOWN_KEYS`, `isEnrollmentIntentAction`) and the
label-regex owner inference mean a new BP could still hit a name it doesn't match, and there's no command-integrity gate
proving a rendered action is executable. **After Slices B/E/F, the answer is an unqualified yes** — and the two-BP test
(enrollment + one non-enrollment fixture through the same surface) proves it.

No implementation begun in this recon. Slices follow, each committed and validated independently; nothing pushed.
