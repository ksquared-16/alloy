# Queue Row Builder + Runtime Vocabulary — Final Handoff

**Status:** **Frozen** on `origin/staging`  
**Baseline SHA:** `c99e381f3105b7b433f1ba48206724f9f4ba0443`  
**Sprint close:** July 2026  
**Canonical thread handoff:** `presentation-surfaces-settings-thread-closeout.md`

## Freeze policy

**Queue Row Builder is now considered the canonical Surface Composer interaction.**

Future surface authoring work should **extend this interaction model** — click surface → library → place → select → inspector (Section + Placement) — rather than creating new builder paradigms.

| Rule | Detail |
|------|--------|
| **Frozen** | Queue Row Builder architecture, canvas, library shell, inspector pattern |
| **Allowed** | Configuration-only changes (fields, variants, visibility, group/sort, registry/resolver wiring) |
| **Production bugs only** | Do **not** reopen Queue Row Builder for feature work, redesign, or parallel composer UX |
| **Next consumer** | **Focus Panel Composer** — see `focus-panel-composer-handoff.md` |

Shared composer primitives live in `web/lib/adminV2/settings/surfaces/surfaceFieldComposer.ts`. Extend those for Focus Panel; do not fork a second interaction model.

## Staging commits

| SHA | Message |
|-----|---------|
| `48815f061` | `feat(surfaces): refine queue row field composer interaction` |
| `43d4665ad` | `feat(surfaces): complete queue row sibling runtime vocabulary` |
| `0a4293855` | `feat(surfaces): add queue row name display options` |
| `4157a37a6` | `chore(settings): align legacy field settings with platform configuration` |
| `c99e381f3` | `chore(settings): close out legacy settings route reachability` |

**Thread baseline:** `c99e381f3`

## What shipped

Queue Row Builder and Queue Row Runtime Vocabulary are **frozen**. Future queue row improvements should be **configuration-only** (fields, variants, visibility, group/sort) — not new builder architecture.

### Interaction model (click-first field composer)

1. Operator clicks the row canvas (or **+ Add field** on a line).
2. **Library** opens — registry-backed fields and widgets grouped by category.
3. Operator picks an item → field is **placed** on the selected section/line.
4. Operator **selects** a placed field → **inspector** edits label, section, placement, order.
5. **Row focus** (Family / Child) reorders library suggestions only — it does **not** control layout.

Shared terminology lives in `web/lib/adminV2/settings/surfaces/surfaceFieldComposer.ts`:

- **Section:** Primary, Secondary, Supporting, Right, Bottom
- **Placement:** Same line, New line below
- Help: *"Section chooses where the field appears. Placement chooses whether it sits beside nearby fields or starts a new line."*

### Key builder files

| File | Role |
|------|------|
| `QueueRowBuilderV2.tsx` | Canvas, library, inspector, inline tokens |
| `queueRowComposerModel.ts` / `queueRowComposerCanvasLayout.ts` | Placements, 3-field line cap |
| `queueRowBuilderLibrary.ts` | Library catalog from registry |
| `QueueRowVariantSettings.tsx` | Group / sort below canvas |
| `SurfaceRowFocusPicker.tsx` | Family / Child library order |
| `surfaceFieldComposer.ts` | Reusable section/placement pattern |

### Queue row variant model

- **One** queue row runtime (`CondensedQueueRow`) — variants change **which columns** feed fixed compact slots.
- **Default** = top-level `columns` on the published layout (used when no variant rule matches).
- **Variants** = named column sets + `appliesWhen` rules + optional `subjectFocus`.

**Matching:** `resolveQueueRowVariant()` evaluates rules in ascending **priority**; first match wins. Clauses are ANDed; empty clause = unconstrained.

**Runtime path:** `useWorkUnitSurfaceRuntime` → per-row `queueRowVariantMatchInputFromContext(row.context, scope)` → `resolveQueueRowPresentation()` → compact slots + optional subject focus.

**Match input signals** (from frozen `QueueRowContext`):

- `stageKey` — `drawer_open.active_subject.stage_key` or `stage_focus_key`
- `statusKey` — `row_status_key`
- `grain` — `row_subject.subject_type` (`case`, `child`, `candidate`, …)
- `processKey` — `lifecycle_key`
- `workViewId` / `workViewKey` — active work view scope

**Starter enrollment variants** (`queueRecordLayoutDefaults.ts`):

| Variant | Typical match |
|---------|----------------|
| Tour | `stage_key`: tour_scheduled, tour, tour_completed |
| Waitlist | `stage_key`: waiting, waitlist, waitlisted + `grain`: candidate/child |
| Enrolling | `stage_key`: enrolling, registration, enrolled |
| Default | Top-level columns when no variant matches (e.g. New Leads / lead stage) |

### Runtime vocabulary fields

Platform fields register through:

1. `compositionFieldAdapter.ts` — `QUEUE_FIELD_CATALOG`
2. `queueRecordValidatorAllowList.ts` — publish gate
3. `buildOpportunityQueueRowRecordFromPreview.ts` — VM → record resolver
4. `evaluateLayoutCondition.ts` — `visibleWhen`

**Sibling vocabulary** (`queueRowSiblingFieldRegistry.ts` + `resolveQueueRowSiblingFields.ts`):

| RefKey | Source |
|--------|--------|
| `waitlist.siblingContext` | Composite first context line |
| `sibling.names` | Waitlisted + enrolled sibling names |
| `sibling.count` | Sibling count with context |
| `sibling.enrolled` | Enrolled sibling lines |
| `sibling.waitlisted` | Waitlisted sibling lines |
| `sibling.location` | Enrolled sibling campus |
| `sibling.program` | Sibling program/cohort labels |
| `household.otherChildren` | Other inquiry children on family record |

**Visibility signal paths** (layout conditions only): `_sibling.hasWaitlisted`, `_sibling.hasEnrolled`, `_household.hasMultipleChildren`.

**Presets:** `QUEUE_ROW_SIBLING_VISIBILITY_PRESETS` — hide when empty, show when sibling waitlisted/enrolled, show when multiple children.

**Guardrails:** Builder does **not** hardcode sibling values. Unregistered sibling refKeys appear as **unavailable placeholders** (`QUEUE_ROW_SIBLING_PLACEHOLDER_FIELD_CATALOG`) and fail publish validation.

### Name display options (July 2026)

Person / child / family name fields support **Display as: Full name | First name** (`nameDisplay` on `QueueRecordFieldConfig`). Applied after runtime resolver (`formatQueueRowNameDisplay.ts`). List fields (`children.names`, `sibling.names`) format each comma-separated name.

### Registry-backed unavailable fields

Fields registered in the entity registry but **without queue row runtime resolver** appear in the library as **unavailable** — not active pickables. Example: `child.gender` (`queueRowChildProfileFieldRegistry.ts`) — registered for drawer/profile, no queue row resolver yet.

### Group / sort config status

- **Group / sort** controls live in `QueueRowVariantSettings.tsx` below the canvas (variant-scoped).
- Underlying sort criteria persist on variant config (`queueRowVariantDisplayControls.ts`).

### Placement ranking — deferred

- **Placement ranking UI** is hidden from the queue row builder shell.
- `QueueRowVariantInspector` shows a disabled note only: *"Placement ranking configuration is handled in Placement settings."*
- Underlying placement ranking catalog/config remains for future operator-facing work.
- Do not remove persisted ranking data in this sprint.

### Sibling field scope

Granular sibling fields (`sibling.*`, `waitlist.siblingContext`, `household.otherChildren`) resolve **only** on **waitlist candidate-grain** queue rows.

- **Library:** Pipeline surfaces show sibling fields as **unavailable** with scope note — not as active pickables (`queueRowBuilderLibrary.ts`).
- **Publish:** `isWaitlistOnlyFieldKey` rejects sibling refKeys on pipeline layouts (`validateQueueRecordLayoutConfig`).
- **Runtime:** `resolveQueueRowSiblingFields` runs on waitlist candidate VM only; pipeline rows do not populate sibling refKeys.

### Variant rule `conditions` — reserved

- `appliesWhen.conditions` (LayoutCondition[]) is **not evaluated** at runtime.
- `queueRowVariantRuleMatches` uses typed clauses only (stage, grain, status, …).
- `sanitizeQueueRowVariantRule` strips `conditions` on layout normalize/save so configs cannot imply unevaluated behavior.

## Runtime confirmation (tests)

| Scenario | Test file |
|----------|-----------|
| Variant rule matching (tour / waitlist / enrolling / default) | `resolveQueueRowVariant.test.ts` |
| Context → match input → compact slots | `queueRowVariantResolve.test.ts` |
| New Leads → Default, Waitlist → Waitlist, Enrolling → Enrolling, fallback | `queueRowRuntimeCloseout.test.ts` |
| Sibling resolver + visibility | `queueRowSiblingFieldVocabulary.test.ts` |
| Publish guard — no fake sibling fields | `queueRowSiblingFieldPublishGuard.test.ts` |
| Builder library + composer interaction | `queueRowBuilderLibrary.test.ts`, `queueRowBuilderEditingCanvas.test.ts` |
| Enrollment starter variants | `queueRowSurfaceBuilderV1.test.ts` |

### Tests to run before merge

```bash
cd web && npx tsc --noEmit

cd web && npm run test -- \
  tests/presentation/runtime/queueRowRuntimeCloseout.test.ts \
  tests/presentation/runtime/resolveQueueRowVariant.test.ts \
  tests/presentation/runtime/queueRowVariantResolve.test.ts \
  tests/layout/queueRowSiblingFieldVocabulary.test.ts \
  tests/layout/queueRowSiblingFieldPublishGuard.test.ts \
  tests/adminV2/queueRowBuilderLibrary.test.ts \
  tests/adminV2/queueRowComposerCanvasLayout.test.ts \
  tests/adminV2/queueRowComposerModel.test.ts \
  tests/adminV2/queueRowBuilderEditingCanvas.test.ts
```

## Known gaps (intentional deferred only)

| Gap | Notes |
|-----|-------|
| Placement ranking operator UI | Deferred — builder shows disabled note only |
| Focus Panel composer | See `focus-panel-composer-handoff.md` |
| Registry fields without queue resolver | e.g. `child.gender` — unavailable in library until resolver lands |

See `presentation-surfaces-settings-thread-closeout.md` §4 for the complete deferred list. **No other gaps are open from this thread.**

## Operator guidance

- Use **Default** variant columns for stages without a dedicated variant (New Leads, Qualification, etc.).
- Add **Waitlist** variant columns for candidate-grain waitlist work views.
- Use **Section + Placement** in inspector — not row focus — to control layout.
- Prefer granular sibling fields (`sibling.names`, `sibling.count`) with **hide when empty** over composite `waitlist.siblingContext` when operators need structured rows.

## Next phase

**Focus Panel Composer** is the next consumer of the canonical Surface Composer interaction.

See `focus-panel-composer-handoff.md` — apply the same composer mental model to Focus Panel cards/fields. Do **not** reopen Queue Row Builder except for production bugs.
