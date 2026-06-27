# Focus Panel Runtime Cutover — Migration Report

**Status:** Cutover ledger (June 2026). The canonical record of every remaining drawer dependency blocking complete drawer removal, classified for action.
**Decision (locked):** There is **one Focus Panel runtime**. *Opportunity / Person / Child / Customer / Household drawers no longer exist as product architecture.* They may exist only as **internal compatibility** during migration.
**Spine (canonical):** `Queue → Search → Workspace → Business Process → Operational Context → Focus Panel → Configured Surface → Cards → Perspectives`. Everything below **Operational Context** is presentation.
**Related:** [`operational-context-boundary.md`](./operational-context-boundary.md) · [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) (phases A–D) · [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) · [`household-reference-card.md`](./household-reference-card.md)

> **Read this first — what "cutover" means here.** The product model is cut over *now*: the canonical contract is **Operational Context**, the card layer consumes it, and there are no product-level Person/Child/Opportunity Focus Panels. The *physical* drawer runtime (payload composition, reveal gates, cache, request ownership) is **protected infrastructure** (`adminv2-runtime-performance.mdc`) and is removed in **staged phases**, because deleting it blind would break the reveal/payload guarantees the platform depends on. This report is the executable plan for those phases. It does not pretend the ~1,900 drawer-referencing files vanished in one pass — it states exactly what is done, what is quarantined, and what must migrate, in what order.

---

## 1. Cutover scorecard

| Success criterion (from the sprint) | State |
|-------------------------------------|-------|
| There is one Focus Panel | **Met (product model).** One render path; subject-specific *surfaces* removed (see §4). Person/child still share one runtime host pending Phase E. |
| Cards consume Operational Context, not drawer VMs | **Met at the contract.** `FocusPanelCardRenderer`'s main contract is `model` + `context` (+ presentation props); subject id + truth derive from `context`. Pure cards (Household + all archetype-payload cards) read nothing else. The only drawer/VM dependency is a single `compat: FocusPanelCardCompat` wrapper **off the main contract**, consumed solely by the four drill cards (§5). |
| No product-level drawers | **Met in vocabulary + new code.** "Drawer" survives only as infrastructure naming behind the Operational Context boundary (§6). |
| No Child/Person/Opportunity operator *surfaces* | **Met.** Dead `PersonFocusPanel*` surfaces deleted; opportunity/person/child are **subjects** resolved by one runtime host. |
| Only BP → Operational Context → Configured Surface → Cards → Perspectives | **Met for rendering.** Open/establish path (Queue/Search) still uses `openDrawer` transport — **needs migration** (§7, Phase F). |

**Bottom line:** the *boundary* is cut over and locked. The *plumbing below it* (open transport, payload/reveal infra, drill cards) is staged in Phases D0 → F.

---

## 2. The boundary that is now locked

```
Existing composed subject payload  (internal: OpportunityDrawerViewModel / OperationalSubjectViewModel)
   │
   ▼
buildOperationalContext()          ← the ONLY sanctioned adapter
   │
   ▼
OperationalContext                 ← canonical contract cards depend on
   │
   ▼
Focus Panel → Configured Surface → Cards → Perspectives
```

- Contract: `web/lib/adminV2/runtime/operationalContext/types.ts`
- Adapter: `web/lib/adminV2/runtime/operationalContext/buildOperationalContext.ts`
- Built once per subject in `OpportunityFocusPanelModeGrid` (`useMemo`) **and** in the Surfaces preview editor; both renderer call sites now pass `context`.
- Cards take `context.subject.id` and `context.truth`; they no longer accept a standalone `drawerId` or `record`.

**Rule:** anything above the adapter line is product runtime and must speak Operational Context. Anything below the line may say "drawer" — it is infrastructure, invisible to cards.

---

## 3. Done in this sprint (Phase D0 — contract cutover, behavior-preserving)

| Change | File(s) | Risk |
|--------|---------|------|
| Card renderer consumes `OperationalContext`; derives `drawerId`/`record` from `context`; `displayVm`/`onSelectTab` marked **internal compatibility** | `components/admin/focusPanel/FocusPanelCardRenderer.tsx` | Pure prop plumbing; behavior identical |
| Grid stops passing `drawerId`/`record` to the card layer (still builds the context) | `components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | None (caller plumbing) |
| Surfaces preview editor builds an Operational Context and passes `context` (also fixes a latent missing-prop type error) | `components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` | None; unifies the 2nd renderer caller on the boundary |
| Deleted dead **Person Focus Panel** surfaces (zero imports) | `components/admin/focusPanel/PersonFocusPanelModeBody.tsx`, `PersonFocusPanelHeader.tsx` | None (orphaned) |
| Codified invariants (one Focus Panel; renderer reads context; both callers use the adapter) | `tests/adminV2/runtime/focusPanelArchitectureCutover.test.ts` | Test-only |

**Explicitly NOT done (and why):** no payload/reveal/cache/request-ownership changes, no drill-card rewrite, no open-transport rename. Those are protected infrastructure and are staged below.

### Phase D1/D2 — card-facing contract tightening (follow-up; behavior-preserving)

The renderer's public contract is now context-first; all drawer/opportunity-shaped props are removed from the main contract and the remaining compatibility is isolated behind one explicit wrapper.

| Change | File(s) |
|--------|---------|
| Removed stale unused props `opportunitySingular`, `canMutate` from the card contract | `FocusPanelCardRenderer.tsx` |
| Isolated `displayVm` + `onSelectTab` into an explicit `compat: FocusPanelCardCompat` wrapper (subject terminology: `subjectVm`); drill cards read `compat.*` | `FocusPanelCardRenderer.tsx` |
| Removed dead `opportunitySingular` from the card-composition path (renderer ← grid ← ModeBody ← runtime call site) | `OpportunityFocusPanelModeGrid.tsx`, `OpportunityFocusPanelModeBody.tsx`, `OpportunityDrawerVmRuntime.tsx` (1-line JSX prop removal; variable still used by the legacy overview body) |
| Both renderer callers pass `compat={{ subjectVm, onSelectTab }}` | `OpportunityFocusPanelModeGrid.tsx`, `FocusPanelSummarySurfaceEditor.tsx` |
| Added D1/D2 contract assertions | `tests/adminV2/runtime/focusPanelArchitectureCutover.test.ts` |

**Final `FocusPanelCardRenderer` contract:**

```ts
type Props = {
    model: FocusPanelCardModel;        // what to render
    context: OperationalContext;       // canonical data boundary (subject id + truth)
    focusPanelMode: FocusPanelMode;    // composition mode (presentation, not subject-shaped)
    onPrimaryAction?: (key) => void;   // generic action hook
    receded?: boolean;                 // presentation state
    compat: FocusPanelCardCompat;      // INTERNAL COMPATIBILITY ONLY (drill cards) — pure cards ignore
};
// FocusPanelCardCompat = { subjectVm: OperationalSubjectViewModel; onSelectTab: (tab) => void }
```

**Still NOT done (deeper D1/D2 — protected/large):** the four drill cards (`workflow_steps`/`timeline`/`documents`/`notes`) still *consume* the compat wrapper rather than projecting from context; `OpportunityDrawerVmTabPanes`, the lifecycle-rail builder, the embedded workspace, and the header are not yet re-projected. Those are the remaining D1 (re-projection) and D2 (header) tasks in §9.

---

## 4. Subject-specific surfaces — inventory & disposition

| Item | Path | Classification | Disposition |
|------|------|----------------|-------------|
| `PersonFocusPanelModeBody`, `PersonFocusPanelHeader` | `components/admin/focusPanel/` | dead surface | **Removed (this sprint).** |
| `OpportunityDrawerVmRuntime` (host) | `components/admin/vmDrawer/` | internal compatibility | Keep as host impl; canonical name is `EnrollmentSubjectSurfaceRuntime` (Phase C shim exists). Reveal/host logic = protected. |
| `PersonsDrawerVmRuntime` / `PersonDrawerVmRuntime` / `ChildDrawerVmRuntime` | `components/admin/vmDrawer/` | internal compatibility | Keep; person/child are **subjects** on one host. Person card blueprints land in Phase E. |
| `EnrollmentSubjectSurfaceRuntime`, `PersonSubjectSurfaceRuntime`, `SubjectSurfaceRuntime`, `FocusPanelShell` | `components/admin/subjectSurface/` | canonical (shims) | Keep — already the forward names. |
| `AdminEntityDrawer` (router), `AdminEntityDrawerLegacy` | `components/admin/` | internal compatibility / legacy | Router stays during migration; `*Legacy* ` is sunset-tracked (drawer-sunset-roadmap). |

**Result:** there are no product-level per-subject Focus Panels. There is one host runtime resolving a **subject** → one Focus Panel.

---

## 5. Card-layer drawer dependencies — what still reads the VM

Classification key: **PURE** = already projects from the context/derived models; **NEEDS-MIGRATION** = still reaches into drawer internals.

| Card key | Source | Class |
|----------|--------|-------|
| `household` | `HouseholdCard` ← `OperationalContext` | **PURE (reference)** |
| `attention`, `current_mission`, `current_work`, `required_information`, `readiness_kpi`, `health`, `tour_summary`, `children`, `tasks`, `automations`, `primary_next_action`, `work_launcher`, `audit`, `workflow_history`, `communications` (summary insight) | `ArchetypeCardBody` ← `model.payload` (derived) | **PURE projection** |
| `workflow_steps` | `buildOpportunityVmLifecycleRailModel({ displayVm })` → `ProofDoctrineLifecycleRail` | **NEEDS-MIGRATION** — lifecycle rail reads VM |
| `timeline` / `documents` / `notes` | `OpportunityDrawerVmTabPanes` (drawer tab drill) | **NEEDS-MIGRATION** — full drawer tab panes |
| Activity mode body | `OpportunityFocusPanelEmbeddedWorkspace` → `OpportunityDrawerVmTabPanes` + `CommunicationsDrawerSection` | **NEEDS-MIGRATION** — embedded drill |
| Header | `OpportunityFocusPanelHeader` ← `OpportunityDrawerHeaderControls`, status VM | **NEEDS-MIGRATION** — header chrome reads VM |

**Quarantine mechanism (now):** the renderer exposes a single `compat: FocusPanelCardCompat` wrapper (`{ subjectVm, onSelectTab }`) — the *only* drawer/VM dependency on the card layer, and it is **off the main contract**. The four drill/lifecycle cards read `compat.*`; every other card (Household + all archetype-payload cards) reads only `model` + `context` and never sees the wrapper. The boundary is real and enforced by tests, even though the drill cards have not yet been re-projected.

---

## 6. Drawer terminology — full classification

### 6a. Internal compatibility (keep; behind the Operational Context boundary)

| Surface | Why it stays |
|---------|--------------|
| VM type `OpportunityDrawerViewModel` (+ aliases `OperationalSubjectViewModel`, `OpportunityFocusPanelViewModel`) | Implementation of `context.truth`; renaming the type is Phase D, gated by reveal/payload tests. |
| `web/lib/adminV2/viewModel/drawer/**` (96 files) | Payload compose/load/cache for subjects. Pure infra. |
| `AdminDrawerContext` (`openDrawer`, `drawer` state, seeds) | Open-state transport. Rename = Phase D/F (reveal contract). |
| `composedDrawerPayload`, reveal gates, `prefetchPersonDrawerSnapshot`, cache keys | **Protected infrastructure.** Do not touch without a runtime sprint. |
| `vmDrawer/*Runtime`, `AdminEntityDrawer` router, `EntityDrawerOperatingShell` | Host/shell; canonical shims already exist (Phase C). |
| `DrawerTabKey`, `OpportunityDrawerVmTabPanes`, `CommunicationsDrawerSection` | Drill implementations consumed by the four NEEDS-MIGRATION cards. |
| `focusPanelLayoutDocModel` `surface = "drawer"`, `focusPanelSummaryLayoutService` | Stored LayoutDoc surface key; config-vocabulary rename only, no behavior. |
| `focusPanelMode` ↔ `DrawerTab` mappers (`drawerTabToFocusPanelMode`, …) | Mode/tab bridge while tab panes exist. |

### 6b. Needs migration now (drawer terms inside the *new* runtime contract)

| Item | Path | Migration |
|------|------|-----------|
| Drill cards read `displayVm` / drawer tab panes | `FocusPanelCardRenderer.tsx` (workflow_steps/timeline/documents/notes) | Phase D1 — re-project as context-native cards |
| Embedded workspace reads drawer tab panes | `OpportunityFocusPanelEmbeddedWorkspace.tsx` | Phase D1 |
| Header reads drawer VM controls | `OpportunityFocusPanelHeader.tsx` | Phase D2 |
| Component props typed `OpportunityDrawerViewModel` (`displayVm`, `drawerId`, `DrawerTabKey`) | `OpportunityFocusPanelModeBody/Grid`, header, embedded workspace | Phase D2 — adopt `OperationalSubjectViewModel`/`SubjectComposition` types |
| Queue/Search "open a drawer" | open-path (§7) | Phase F — "establish a context" |

---

## 7. Open path — Queue & Search establish a context (not a drawer)

**Today:** Queue rows and global search call `openDrawer(...)` with drawer seeds; the Operational Context is built *after* the VM payload arrives inside the Focus Panel.

| Step | File | Term |
|------|------|------|
| Queue row open | `app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` → `buildOpportunityDrawerOpenParams` → `openDrawer` | drawer-open |
| Default/route auto-open | `lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen` | mixed |
| Search open | `lib/adminV2/globalRecordSearchOpen.ts` → `GlobalRecordSearchOpenListener` → `openDrawer` | drawer-open |
| Linked-field open | `lib/layout/runtime/openQueueRecordLinkedDrawer.ts` | drawer-open |
| URL sync | `lib/admin/operatorWorkUnitDrawerUrlSync.ts` | drawer-named |

**Target (Phase F):** `establishOperationalContext(subjectRef)` is the public verb; `AdminDrawerContext` becomes the **transport** (renamed `OperationalSubjectContext` in Phase D) that holds the selected subject ref + reveal state. Queues/search resolve a **subject**, never "open a drawer." This is the reveal/payload contract — **runtime-sprint gated**.

---

## 8. Blockers preventing complete drawer removal

1. **Reveal/payload contract is protected.** `composedDrawerPayload`, reveal gates, cache keys, request-ownership, prefetch — removal requires the runtime-sensitive test suite and a dedicated runtime sprint (`adminv2-runtime-performance.mdc`). *Hard blocker for physical deletion.*
2. **Drill cards depend on drawer tab panes.** `timeline/documents/notes/workflow_steps` + activity embedded workspace must be re-projected before `OpportunityDrawerVmTabPanes` can be retired (Phase D1).
3. **Header chrome reads the VM** (Phase D2).
4. **Open transport is drawer-shaped** (`openDrawer` + seeds). Needs the `establishOperationalContext` verb + context-shaped transport (Phase F).
5. **Person/child card blueprints don't exist yet** — person/child render via opportunity derivation today; real person Subject Composition is Phase E.
6. **Scale.** ~1,900 files reference "drawer" (mostly infra/tests). Removal is mechanical *after* 1–4, not before.

---

## 9. Staged removal sequence

| Phase | Scope | Gate |
|-------|-------|------|
| **A–C** | EmbeddedWorkspace renames; `useFocusPanelDocked`/`OperationalSubjectViewModel`/`SubjectComposition`; `subjectSurface/` shims | **Done** (vocabulary doc) |
| **D0** | Card layer consumes Operational Context; dead Person Focus Panels removed | **Done** |
| **D1/D2 (contract)** | Card renderer contract is context-first; stale props removed; drawer/VM compatibility isolated behind one `FocusPanelCardCompat` wrapper off the main contract; opportunity naming removed from the card path | **Done** |
| **D1 (re-projection)** | Re-project drill cards (`timeline/documents/notes/workflow_steps`) + embedded workspace as context-native — retire `OpportunityDrawerVmTabPanes` + lifecycle-rail builder + the `compat` wrapper | UI + focus-panel tests |
| **D2 (header)** | Header consumes context; focus-panel *component* props (grid/body/header) adopt `OperationalSubjectViewModel`/`SubjectComposition` types | focus-panel tests |
| **E** | Person/child **Subject Composition** (real person card blueprints); one host renders all subjects from BP | runtime suite |
| **F** | `establishOperationalContext` open verb; `AdminDrawerContext` → `OperationalSubjectContext`; queues/search establish context, not drawers | **runtime sprint** (reveal/payload) |
| **G** | Physical deletion of `vmDrawer/*` drawer bodies, `AdminEntityDrawerLegacy`, composed-payload "drawer" naming | **runtime sprint** |

**Do not reorder F/G before D1–E.** Removing infra before the card layer is context-native re-introduces drawer coupling.

---

## 10. Validation note

- `tsc`: all edited source files are clean; the Surfaces editor's prior latent missing-`context` error is resolved. (Repo has ~69 pre-existing errors in unrelated test fixtures/scripts, unchanged and not touched here.)
- Focus-panel + cutover + household + surface-editor + edit-mode + archetype suites: **pass** (88 tests; cutover suite includes the D0 + D1/D2 contract assertions).
- ESLint on edited focus-panel files: clean (prior unused-prop warnings removed with the props).
- Protected reveal suite: the **same 3 pre-existing failures** (124 passed) in `composedDrawerPayload` / `drawerAboveFoldCoordinatedReveal` — owned by **prior in-flight reveal-gate work** in the working tree (`workspaceRevealGate.ts`, `focusPanelSubjectReveal.ts`); they reference **none** of this sprint's files. The D1/D2 one-line dead-prop removal in `OpportunityDrawerVmRuntime.tsx` did **not** change the failure set.
