# Command Surface V2 — Operator Experience + First UI Wiring

**Status:** First operator-visible Command Surface implementation (June 2026). Builds on the
V1 model (`command_surface_v1.md`, commit `b0de6360`). **No new Create Lead system, no BOS
fork, no execution fork, no modal rewrite.**

**Code anchors:**
- `web/components/adminV2/actions/surface/CommandSurfaceShell.tsx` — platform-owned presentational shell (first UI)
- `web/lib/adminV2/actions/surface/useCommandSurfaceController.ts` — platform-owned lifecycle; **execution injected**
- `web/lib/adminV2/actions/surface/commandSurfacePresentation.ts` — operator UX contract (pure copy)
- `web/lib/adminV2/actions/surface/deriveCommandSurfaceState.ts` — V1 state derivation (unchanged)
- `web/lib/adminV2/actions/createLead/createLeadCommandModel.ts` — reference command snapshot

> **What does an Operational Command feel like to an operator?** A short, guided panel: a clear
> intent title, where they are in the flow, what's known, what's still needed in plain language,
> a preview of what will happen, one confirm button in their words, and a clean "done / opening
> record" or "here's what I still need" ending — never a form full of database fields.

---

## Phase 1 — Command Surface UX contract

Every command surface renders the same operator-facing anatomy (platform-fixed):

| Element | Source | Operator example |
|---|---|---|
| Intent header | `state.header.title` | "Create Lead" |
| Current stage | `commandSurfaceStageCaption` | "Step 2 of 4 · Review" |
| Section caption | `commandSurfaceSectionCaption` | "Add the required information" |
| Known context | `state.header.contextChips` | "Work Unit: Enrollment", "Source: BOS" |
| Required inputs | `state.body.missingInputs[].label` | "First name" (never `first_name`) |
| Preview | `state.body.confirmationSummary` | "Create household + opportunity for Ada Lovelace" |
| Confirm action | `state.footer.primary.label` | "Create lead" |
| Success | `state.success.message` + `nextCopy` | "Lead created." / "Opening lead." |
| Failure | `state.failure.message` + `recovery` | "I still need a last name…" |

`isOperatorSafeCopy` + `operatorFacingStrings` enforce that no action key, payload key, or
runtime enum reaches the operator (asserted across every Create Lead state in tests).

---

## Phase 2 — Create Lead command surface

`CommandSurfaceShell` renders the Create Lead surface state for every entry point; the input is
always a Create Lead command snapshot (`deriveCreateLeadCommandState` /
`deriveCreateLeadCommandFromBosProposal`) → `deriveCreateLeadSurfaceState`.

| Entry point | Opens at | Subject | Confirm |
|---|---|---|---|
| Work Unit Actions | `input_fields` | none | executes registered `create_lead` |
| BOS (complete parse) | `confirmation`/`preview` | none | executes registered `create_lead` |
| BOS (missing parse) | `input_fields` | none | (disabled until satisfied) |
| Manual | `input_fields` | none | executes registered `create_lead` |

`useCommandSurfaceController` owns the lifecycle (idle → executing → success/failure) and
re-derives the surface on every input edit. **Execution is injected** (`execute`) — the
controller never calls a mutation API; the caller wires `execute` to the existing
`executeCreateLeadFromModal` / `POST /api/admin/actions/execute` path. No duplicate mutation
logic.

---

## Phase 3 — BOS Create Lead preservation

BOS keeps parsing/proposing exactly as today. The only change is convergence: BOS hands its
parsed values to the **same** command model, which feeds the **same** surface shell. BOS:
- parses lead info → known inputs (unchanged),
- renders preview / missing-inputs through the shared surface,
- executes through the existing `/api/admin/actions/execute` registered `create_lead`,
- opens/refreshes the created record via the standardized success contract.

BOS does **not** create leads through a private path, own its own lifecycle, or bypass surface
state — it is an entry point (the `bos` variant) into one runtime.

---

## Phase 4 — Manual Create Lead alignment

`CreateLeadModal.tsx` is protected runtime-sensitive infrastructure
(`adminv2-runtime-performance`) and is **not** rewritten. Convergence achieved at the model
level: manual and BOS both derive from `deriveCreateLeadCommandState` and produce compatible
preview / required-input / success behavior (asserted in `createLeadCommandModel.test.ts` and
`commandSurface.test.ts`).

**Deferred full convergence (documented):** wrapping/replacing the modal body with
`CommandSurfaceShell` + `useCommandSurfaceController` (execution wired to the existing
`executeCreateLeadFromModal`). That UI change must run the protected drawer/work-unit suites
and is the next step; the shell + controller are ready and tested for it.

---

## Phase 5 — Platform-owned surface, config-driven experience

| Platform owns (fixed in code) | Config drives (content only) |
|---|---|
| shell layout (`CommandSurfaceShell`) | whether Create Lead appears in Work Unit Actions |
| stage rendering + progression | label / description override |
| confirm / success / failure patterns | ordering, visibility |
| lifecycle (`useCommandSurfaceController`) | required inputs (where supported) |
| execution contract (injected registered action) | process-specific constraints, confirm copy |

The only config channel is `CommandSurfaceConfigInfluence` (title/description/confirm/blocker
copy). Tests prove config overrides change header content but leave section, stage indicator,
footer pattern, and body anatomy **identical** — config cannot alter the lifecycle.

---

## Phase 6 — Update Status reference mapping

Update Status maps onto the same surface with no new shell code (model/test-level, no UI
wiring): Focus Panel Manage → subject = current record; required input = target status;
invalid transition → `blocker` section; valid transition → `confirmation` with a from→to
summary; confirm executes registered `update_status`. Validated in
`commandSurface.test.ts` and `updateStatusCommandFlow.test.ts`.

---

## Completion criteria status

| Criterion | Status |
|---|---|
| Create Lead has a visible command surface model/path | ✅ shell + controller + tests |
| BOS Create Lead builds on existing proposal flow | ✅ (model adapter, same execute route) |
| Manual + BOS use the same command model | ✅ |
| Config/platform boundary documented + tested | ✅ |
| No duplicate mutation path introduced | ✅ (execution injected, registered action only) |
