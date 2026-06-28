# Command Surface V1 — Platform-Owned Command Surface (Operational Command Runtime V5)

**Status:** Architecture + reference implementation (June 2026). Reusable platform-owned shell
model + Create Lead reference + Update Status design. **No bespoke command UIs, no form
builder, no BOS fork, no Create Lead execution change, no modal rewrite.**

**Code anchors:**
- `web/lib/adminV2/actions/surface/commandSurfaceTypes.ts` — anatomy + config-influence types
- `web/lib/adminV2/actions/surface/deriveCommandSurfaceState.ts` — platform-owned derivation
- `web/lib/adminV2/actions/surface/commandSurfaceModel.ts` — snapshot adapters + variant mapping
- `web/lib/adminV2/actions/createLead/createLeadCommandModel.ts` — reference command snapshot

---

## 1. Doctrine — the Command Surface is platform-owned

The **Command Surface** is the reusable UI/runtime shell for completing an Operational Intent.
It renders: command title, summary, known context, current stage, missing subject, missing
inputs, preview, confirmation, execution state, success/failure, and next-action / open-record
/ refresh behavior.

**Platform owns** (fixed, identical everywhere): layout, flow structure, stage rendering,
progress model, preview pattern, confirmation pattern, success/failure pattern, BOS↔manual
convergence, accessibility/responsiveness, and consistency across every surface variant.

**Configuration influences content only**: availability, placement, label/description
overrides, order/visibility, required-input definitions, process/status constraints,
confirmation copy, and blocker copy where allowed. Config **cannot** create bespoke command
UIs (see §7).

The surface model is **read-only**: it prepares UI state from runtime state and never executes
mutations. Execution remains the registered action via `POST /api/admin/actions/execute`.

It can host: Create Lead, Update Status, Schedule Tour, Confirm Tour, Send Message, Generate
Document, and future Enroll Child / Billing / Scheduling commands — one shell, no per-command
branching.

---

## 2. Surface variants (one shell, many entry points)

These are variants over the **same** command snapshot (`commandSurfaceVariantForPlacement`),
not four systems. The variant comes from the resolved logical placement.

| Variant | Placement | Subject | Typically opens at | Examples |
|---|---|---|---|---|
| **work_unit** | `work_unit_actions` | often none / needs selection | `resolve_required_inputs` or `resolve_subject` | Create Lead, Schedule Tour |
| **focus_panel_manage** | `focus_panel_manage` | current record (inherited) | `resolve_required_inputs` / `preview` | Update Status, Send Message |
| **queue_row** | `queue_row_menu` | row record (inherited) | lightweight Focus Panel Manage | Update Status |
| **bos** | `bos_recommendations` | proposed / parsed | `preview` or missing-input | BOS Create Lead |

(The BOS surface string now maps to the `bos_recommendations` placement —
`logicalPlacementForPhysicalSurface`.)

---

## 3. Canonical anatomy (platform-fixed)

**Header** — intent title, human description, context chip(s), stage/state indicator.
**Body** — current-stage renderer: subject selector · input fields · preview card · blocker
state · confirmation summary.
**Footer** — cancel/back, primary action, optional secondary.
**Success** — success message, open created/affected record, return to work unit, refresh
targets.
**Failure** — human recovery copy, retry-safe, inputs preserved.

Raw payload keys are never shown except in `debug` mode (`CommandSurfaceState.debug`).

State → section mapping (fixed in `deriveCommandSurfaceState`):

| Command state | Section | Primary action |
|---|---|---|
| `needs_subject` | `subject_selector` | Continue (disabled) |
| `needs_required_input` | `input_fields` | Continue (disabled) |
| `disabled_blocked` | `blocker` | Continue (disabled) |
| `preview_ready` | `preview` | Confirm (enabled) |
| `confirmation_required` | `confirmation` | {confirm label} (enabled) |
| `executing` | `executing` | busy |
| `success` | `success` | Open record |
| `failure` | `failure` | Try again |

---

## 4. Surface model

`deriveCommandSurfaceState(input, config?)` normalizes a {@link CommandSurfaceInput} into
`CommandSurfaceState` (header/section/body/footer/success/failure). Adapters build the input
from a `GenericCommandSnapshot` (`commandSurfaceInputFromSnapshot`), which any command snapshot
satisfies — CreateLeadCommandSnapshot today, Update Status / Schedule Tour next. Intent title/
description are resolved from the Operational Intent layer.

---

## 5. Create Lead — reference surface

- **Work Unit**: opens at `input_fields` (no subject), primary disabled until inputs satisfied,
  preview/confirm when ready, executes registered `create_lead`.
- **BOS**: snapshot built from the parsed proposal; complete data → `confirmation`, missing data
  → `input_fields` with operator-language prompts. Confirm executes the **same** registered
  `create_lead` — BOS is an entry point, not a separate UI runtime.
- **Success**: standardized via `createLeadSuccess.ts` → open record + refresh targets + copy.

**Migration path (manual modal):** `CreateLeadModal.tsx` is protected runtime-sensitive
infrastructure (`adminv2-runtime-performance`) and is **not** rewritten. The Command Surface is
introduced as the platform model + (future) wrapper/side-by-side preview; the existing modal
keeps its execution. Wiring the surface renderer into the modal/BOS shell is the documented
next UI step and must run the protected drawer/work-unit suites.

---

## 6. Update Status — second command (designed)

Update Status maps onto the same surface with **no new shell code** (validated by tests):
- Launched from Focus Panel Manage → subject = current record (inherited, no selection).
- Opens at `input_fields`/`preview`; target-status selector + optional note are required inputs.
- Blockers from transition rules render the `blocker` section (e.g. "cannot move to Enrolled
  yet"); a valid transition renders `confirmation` with a from→to summary.
- Confirm executes the registered `update_status` action.

This becomes the second visible command surface once the renderer is wired; the model already
produces a correct snapshot today.

---

## 7. Config boundary (guardrails)

`CommandSurfaceConfigInfluence` is the **only** channel config has into the surface, and it is
content-only: `titleOverride`, `descriptionOverride`, `confirmLabelOverride`,
`blockerCopyOverride`. There is no field for layout, stage order, lifecycle, success/failure
pattern, or components.

| Config CAN influence | Config CANNOT influence |
|---|---|
| availability, placement | shell layout |
| label, description, order | stage order |
| required-input definitions | execution lifecycle |
| process/status constraints | success/failure pattern |
| confirmation copy, blocker copy | raw mutation behavior |
| | custom JSX/components, per-command UI branching |

Tests assert that applying config overrides changes header content but leaves section, stage
indicator, footer pattern, and body anatomy **identical** to the platform-only derivation.

---

## 8. Completion criteria status

| Criterion | Status |
|---|---|
| Command Surface doctrine exists | ✅ (this doc) |
| Platform/config boundary documented | ✅ §7 + type-enforced |
| Reusable Command Surface model exists | ✅ `surface/*` |
| Create Lead representable as first surface snapshot | ✅ + tests |
| BOS Create Lead intact, existing execution | ✅ (read-only model only) |
| Update Status designed as next surface | ✅ §6 + tests |
