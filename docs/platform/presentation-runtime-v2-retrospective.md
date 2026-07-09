# Presentation Runtime V2 — Engineering Retrospective

**Status:** Closeout (July 2026)  
**Audience:** Platform engineers extending operational workflows  
**Companion:** [`presentation-runtime-v2-closeout.md`](./presentation-runtime-v2-closeout.md)

This is an engineering retrospective — what we built, what we changed, and what we intentionally deferred.

---

## What worked

### One runtime tree

Consolidating Workspace → Work Unit → Queue Region → Focus Panel → Right Rail under a single `PresentationRuntime` eliminated duplicate render paths and conflicting reveal semantics. Each surface has one render site, one `data-runtime-label`, and one ownership boundary. Warm navigation and coordinated reveal became enforceable because there was only one tree to gate.

### Runtime-as-composer canvas

Shipping Focus Panel Surface Composer as an **overlay on the production runtime** (`FocusPanelRuntimeComposerCanvas` wrapping the same card renderer as `/workspace/work-unit`) removed an entire class of builder/runtime drift bugs. Operators edit what they see. Tests can assert parity by comparing the same components with edit affordances toggled.

### Shared Surface Composer primitives

Extracting library, inspector, placement, and publish vocabulary into `lib/adminV2/settings/surfaces/*` meant Focus Panel and nested surfaces did not re-implement builder UX. New surfaces contribute a **Surface Definition** (catalog, constraints, runtime reader) — not a new interaction paradigm.

### Nested surface persistence without a second config store

Nested surfaces persist on parent summary metadata (`metadata.nestedSurfaces[surfaceId]`) and reconcile on read/publish. Runtime readers (`householdNestedSurfaceRuntime.ts`, `childNestedSurfaceRuntime.ts`, `childrenNestedSurfaceConfig.ts`, etc.) stay thin. The data model did not fork.

### Test-backed composition contracts

Focused Vitest suites on drill-in elevation, field layout, removal, and orphan cleanup (`focusPanelDrillInComposition.test.ts`, `nestedSurfaceFieldLayout.test.ts`) caught regressions that visual QA would miss — especially elevated-cell resolution and half-row unpairing after delete.

---

## What changed

### Builders → edit overlay

Early Focus Panel authoring used builder-specific layouts and preview-only chrome. V2 converged on **Edit Mode**: grips, library, inspector, and placement are additive layers on the frozen runtime grid. Published layout (`focusPanelLayout`) and nested surface configs are the source of truth; the composer never invents parallel card anatomy.

### Queue Row frozen; Focus Panel became the stress test

Queue Row Builder shipped first and was frozen as the canonical Surface Composer interaction (`click → library → place → select → inspector → publish`). Focus Panel then proved the same model at greater depth: header summary, card fields, nested drill-ins, evidence sections, drag/drop row layout, and runtime field policy.

### Nested drill-in elevation aligned with work-unit runtime

Settings composer initially keyed elevation off raw card ids while the grid uses resolved instance keys. Aligning with `resolveElevatedCellKey` from `focusPanelCoordinationModel.ts` fixed centered drill-in presentation — the same resolution path work-unit runtime already used.

### Field removal and layout integrity

Drop zones and remove controls competed for pointer events; half-width orphan fields survived delete. Gating drop-zone interactivity to active drag and unpairing orphaned half-fields in `removeFieldFromNestedGroup` made deletion reliable without new architecture.

---

## Why Queue Row became the canonical interaction model

Queue Row was the first surface where operators needed high-frequency, low-context configuration: many fields, tight horizontal space, variant vocabulary, and immediate runtime feedback. The click-first composer pipeline (canvas → library → place → inspector) proved usable under real operator constraints.

Once that interaction shipped with runtime parity and coordinated reveal, duplicating it for Focus Panel would have been waste. Duplicating a *different* builder would have guaranteed drift. Freezing Queue Row locked the **interaction contract** while allowing Focus Panel to extend **depth** (nested surfaces, evidence, drag layout) on shared primitives.

---

## Why Focus Panel proved nested runtime composition

Focus Panel is where operational truth concentrates: household, children, readiness, current work, and drill-in depth. A flat field list could not express:

- card-level questions and evidence groups
- household → contact → emergency drill-in
- children roster → child edit → evidence surfaces
- published row layout with intent sizing

Nested runtime composition forced the platform to answer: *can one renderer, one config shape, and one composer vocabulary express all of this?* It could — with nested surface definitions, domain-locked boundaries, and reconcile-on-read. Focus Panel became the proof that Surface Composer scales past Queue Row without a second builder.

---

## Why runtime editing replaced builders

Separate builders implied separate preview components, separate selection stores, and separate publish pipelines. Every new card or nested surface doubled maintenance and broke parity during sprints.

Runtime editing inverts the default: **production components are the editor canvas**. Configuration is incomplete until the runtime reader consumes it. That rule is now enforceable in code review: if a PR adds a preview-only field or a builder-only renderer, it violates doctrine.

---

## Lessons learned

1. **Freeze early, extend later.** Queue Row freeze was contentious but correct. It stopped architectural churn and redirected effort into shared composer modules.
2. **Instance keys, not logical ids.** Elevation, selection, and drag targets must resolve through the same key model the grid uses — work-unit and settings composer must share helpers.
3. **Pointer-event layering matters.** Invisible drop targets above remove controls look like "unreliable delete bugs." Layout editing chrome must respect interaction z-order.
4. **Domain-locked is better than fake editable.** Child program/schedule save paths, photo persistence, and vertical pickers should stay explicitly locked until real mutation paths exist.
5. **Tests for composition mechanics, not screenshots.** Row pairing, orphan cleanup, and elevated-cell attributes are cheap to test and expensive to regress.
6. **Documentation at freeze, not during churn.** Sprint handoffs were necessary mid-flight; this closeout and retrospective replace scattered notes as the durable record.

---

## Things intentionally deferred

| Item | Rationale |
|------|-----------|
| `persons` photo persistence | Avatar composer is preview-only; no fake save |
| Program / room / teacher pickers in composer | Require domain save paths and resolver wiring |
| Additional evidence namespaces | Extend catalog incrementally per vertical workflow |
| Workspace / Documents / Forms as full Surface Composer consumers | Presentation Runtime V2 foundation first; operational domains next |
| Retiring all legacy layout language in UI | Storage terms unchanged; product language migrates gradually |

---

## Future extension philosophy

When Scheduling, Attendance, Billing, Documents, or Communications need operator-facing presentation:

1. **Attempt Runtime Surface first** — can the workflow be expressed as Surface → Nested Surface → Section → Field?
2. **Reuse Surface Composer** — library, inspector, placement, publish; contribute a Surface Definition only.
3. **One renderer** — production component is the edit canvas; no parallel preview tree.
4. **Introduce a new presentation concept only when** existing composition cannot reasonably express the workflow — and document why in platform doctrine.

Presentation Runtime V2 is complete. The next sprints earn their complexity from business workflows, not from reinventing how Alloy presents record truth.
