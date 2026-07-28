# Second-Surface Certification — Design (Lane 2D)

**Status:** DESIGN (not a build). **Date:** 2026-07-28. **Owner doc:** `RUNTIME-V1-CERTIFICATION-SPRINT.md` §7 Lane 2D.

Cross-surface validation **GATES** Runtime V1 certification: the contracts extracted from the Work Unit
proving slice must be shown to compose a *second, meaningfully-different* real Alloy surface with **no
Kernel / Surface Host / central-switch changes**. Per the continuation plan we **select and design the
second surface now — before migrating all 22 cards — so it exposes missing contracts early** and shapes how
the remaining registry concerns (placement, loadingPolicy, deps, permissions, render) are extracted.

This document does **not** build the surface. It (1) selects it with evidence, (2) states why it is
meaningfully different, (3) defines the *minimum* proving slice, (4) enumerates the contracts it exercises
and the generalizations it forces, and (5) fixes the PASS/FAIL criteria.

---

## 1. The landscape (facts, evidence-backed)

- The Focus Panel presentation runtime instantiates **exactly one grain today: `case` (subject =
  opportunity)**. `PresentationSurface = "workspace" | "work-unit"` (`components/presentation/PresentationRuntime.tsx:15`);
  Work Unit is the only Focus-Panel *subject* surface. `focusPanelWorkModeModel.ts:50` hardcodes
  `subject.type: "opportunity"`; `focusPanelWorkModeModelFromProvisioningAnswer.ts:56` hardcodes `grain: "case"`.
- The **grain vocabulary already exists** but is unused at the panel: `OperationalGrain = "case" | "child" |
  "candidate"` (`operationalContext/types.ts:15`), and `"child"` is explicitly *reserved* ("OCM / child
  within a case … not yet used in the Focus Panel", `:6-11`). Queues/stages/surfaces already carry `child`,
  `candidate`, `person`, `family`, `account`, `work_item` grains.
- The **platform/domain seam is already articulated.** The provisioning envelope is generic
  (`recordOfAttention`, `recordOfTruth {entityType}` — already a string, not "opportunity"; `currentBusinessState`,
  `primaryAction`, bounded `rows`, `settlement`, `timings`, `presentation`, `actionsProjection`). The
  opportunity-specific pieces are few and named: `FocusPanelSubjectSnapshot`
  (`workUnitProvisioningAnswer.ts:178`), `OpportunityStageWorkSlice`, the `FOCUS_PANEL_SUMMARY_*` doc keys,
  the `subject_grain: "case"` literal, and the two commit-critical truth keys
  `person.primary_contact_name` / `_inquiry_children` (`focusPanelCommitCriticalCards.ts:36-41`).
- **Commit-critical contract (the thing a 2nd surface must re-supply):** `COMMIT_CRITICAL_CARD_SPECS`
  (`focusPanelCommitCriticalCards.ts:43-71`) is **already generic and iterated** — `{key, isKnowable(context),
  build(context)}`, no per-card hardcode. Only the *predicates and builders* are opportunity-shaped.

## 2. Selection — the **Child (Participant)** subject surface

**Chosen because it is the cheapest slice that still differs on every axis we must certify.**

Cheap (maximum reuse — this is a proving slice, not a product):
- A full **child drawer-VM stack** exists: `lib/adminV2/viewModel/drawer/child/` (compose, first-viewport
  contract, open-preload) + `lib/adminV2/runtime/focusPanel/children/` (identity compose, field policy,
  nested-surface runtime) + API view-model & layout-runtime routes + dev/proof harnesses
  (`app/dev/child-inspector-verify`, `app/(proof)/adminV2/layout-proof/child-drawer`).
- The **drawer→panel bridge pattern already exists** (`focusPanelWorkModeModelFromDrawerVm.ts:36-78`) —
  opportunity-only today, but the structural seam is proven.

Meaningfully different (the certification axes — must differ, per Lane 2D):
| Axis | Work Unit (case/opportunity) | Child surface (child) | Forces generalization of |
|---|---|---|---|
| Subject grain | `case` | **`child`** (reserved, unused) | `subject.type:"opportunity"` literal + `grain:"case"` hardcodes |
| Subject identity truth | primary contact + inquiry-children roster | child identity (name, DOB, enrollment status, room/schedule, family link) | `FocusPanelSubjectSnapshot` + `hasSubjectIdentityTruth` truth-key hardcode (Leak 2C) |
| Card set | household/children/current_work/readiness… (case cards) | child-grain cards ("defined separately and never rendered in the case-grain panel", `focusPanelCardModel.ts:79-80`) | the registry must carry non-`case` cards (grain as a card concern) |
| Permissions | children roster **read-only** at case grain (`focusPanelCardModel.ts:101`) | some child facts become **editable** on the child's own surface | the (not-yet-extracted) permissions/visibility concern |
| Data dependencies | opportunity + person contacts + stage-work | child OCM + placement/enrollment + schedule assignment | the dependencies/data-requirements concern; a child `isKnowable`/`build` spec pair |
| Deferred interaction | Activity/Comms tabs | **scheduling** ("Create/Change via configured command", `:103`) | reveal/loadingPolicy + a commanded deferred action on a non-case subject |

Rejected alternatives (evidence in the landscape map):
- **Family/Household** — least differentiated: household *is* the case grain (already a Work Unit card). Fails "meaningfully different."
- **Staff/Employee** — employee is a *facet of person*, not its own subject model; moderate reuse, weak grain difference.
- **Scheduling Assignment** — differs *most* (a `work_item`-ish relationship record, dedicated table) but has **no drawer/detail composition to reuse** → most expensive. Keep as a *future third* surface once the contracts are proven on Child.

## 3. The MINIMUM proving slice (not a full build)

Prove the runtime can **commit a usable Child panel from a seed** with only domain-owned additions. Minimum =
the commit-critical frame + one deferred interaction, nothing more:

1. **One child subject route/seed** (dev-fixture gated — a real child id from the OCM), composing a
   `ProvisioningAnswer` with `subject_grain: "child"` (not `"case"`) via a **domain** child-answer composer
   that reuses the generic envelope.
2. **A child subject-identity contract** — the generic replacement for `FocusPanelSubjectSnapshot`: the
   child's commit-critical identity truth (name, enrollment status, primary family link), supplied by a
   **domain** child composer, consumed by a **generic** `isKnowable`.
3. **2–3 child-grain commit-critical cards** declared through the existing `COMMIT_CRITICAL_CARD_SPECS`
   pattern with child `isKnowable`/`build` (e.g. `child_identity`, `child_enrollment`, `child_schedule`).
4. **One deferred interaction** — the scheduling command on the child subject, proving reveal/settlement
   defers it exactly as the Work Unit tabs defer.

Everything else (queue rows, lens set, tabs breadth, full card catalog, editing depth) is **out of the
minimum slice** — added only if a contract gap demands it.

## 4. Contracts exercised, and the generalizations this EXPOSES

Registry concerns already extracted are validated here:
- **identity.title** (concern 1) — child cards declare their own titles → proves `CardIdentity` is grain-agnostic.
- **lifecycle** (concern 2) — a child card that owns editable truth (e.g. `child_enrollment`) declares
  `ownsOperationalTruth` → proves `CardLifecycle` + the registry-reading composers are grain-agnostic (they
  key on card, not on `case`).

Generalizations this design **forces** (feed them back into the sequence, in order):
1. **Subject contract generalization (SC-1).** `subject.type` must become a union / carry `entityType`
   (already string in `recordOfTruth`); `grain` must be parameterized off the answer's `subject_grain`, not
   the `"case"` literal. **This is the first thing the slice breaks — do SC-1 before the slice compiles.**
2. **Provisioning leak 2C.** `FocusPanelSubjectSnapshot` (opportunity-shaped) → a generic
   `SubjectIdentityTruth` the domain fills; `hasSubjectIdentityTruth`'s hardcoded `person.primary_contact_name`
   / `_inquiry_children` → a domain-declared "commit-critical identity bindings" check. The Child surface is
   the forcing function that turns 2C from "rename" into "must genuinely generalize."
3. **Grain as a card concern.** The registry must express that a card belongs to a grain/surface (so the
   Child surface selects child cards, not case cards) — informs the **placement** and a future **catalog/grain**
   concern. Do NOT let this become a central switch; it is a per-card declaration read by a selection composer.
4. **Permissions/visibility concern** — the read-only→editable flip for child facts is the first real
   multi-surface use of a permissions concern (satisfies admission test #3 "multiple surfaces use it").
5. **loadingPolicy / dependencies** — child commit-critical specs prove `COMMIT_CRITICAL_CARD_SPECS`
   generalizes; the scheduling deferred command proves reveal/settlement is grain-agnostic.

## 5. PASS / FAIL

**PASS (certifies the extraction):** the Child minimum slice commits a usable panel and defers its
interaction using **only**:
- domain-owned Child composers/cards/data declarations,
- registration + declared placement + declared loading policy + declared data dependency + optional
  permission/visibility,

with **UNCHANGED**: `lib/runtime/kernel/*` (RuntimeKernel), `lib/experience/surfaceHost/*` (Surface Host),
the global reveal/settlement logic, central placement grids, global renderer chains, central title maps, and
provisioning **truth-key switches**. Same reveal · placement · lifecycle · diagnostics · loading contracts as
Work Unit.

**FAIL (means a contract is still missing — fix the contract, do not special-case):** any central switch
edited, the Kernel/Surface-Host learning about `child`, a new `if (grain === "child")` in a platform layer,
or the child cards only rendering because a central list was hand-edited.

## 6. Why this is the right thing to do NOW (not after 22 cards)

The slice's step 1 **won't even compile** until the `subject.type:"opportunity"` / `grain:"case"` hardcodes
generalize (SC-1) and the `FocusPanelSubjectSnapshot` leak is genuinely generalized (2C). Discovering that
*now* — from a concrete second subject — is worth more than migrating ten more case-only cards that would all
need reworking once grain generalization lands. **The Child surface is the specification for SC-1 and 2C.**

**Immediate follow-ups this design sets up (sequence-aligned):**
- SC-1 (generalize subject contract) becomes **READY and specified** — PoC type that compiles for both
  `opportunity` and `child` (EEC-free, typecheck-certifiable).
- Leak 2C's fix acquires an acceptance test: "a non-family subject supplies identity truth without
  `person.*`/`inquiry_children`."
- The remaining registry concerns (placement, permissions, deps) each gain a *second consumer*, satisfying
  admission test #3 ("multiple future surfaces use it") with evidence instead of assertion.
