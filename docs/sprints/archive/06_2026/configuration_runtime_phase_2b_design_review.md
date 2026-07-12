# Configuration Runtime — Phase 2B Design Review

**Status:** Visual proof gate before Phase 2B commit (June 2026)  
**Branch:** `feat/configuration-runtime-phase-2b` (uncommitted — awaiting approval)  
**Scope:** Perspectives section UI + stage save persistence — **no runtime merge (Phase 2C deferred)**

---

## Purpose

Validate the Perspectives section and Business Processes stage workspace visually before committing Phase 2B metadata save wiring. Confirm the section feels native to Alloy OS Settings and does not read as a separate builder product.

---

## Screenshots

Captured locally via Playwright:

```bash
cd web && npx playwright test playwright/tests/configuration-runtime-phase-2b-review.spec.ts
```

| Screen | File |
|--------|------|
| `/settings` hub | [settings-hub.png](./configuration-runtime-phase-2b/settings-hub.png) |
| `/settings/business-processes` — Lead stage workspace | [business-processes-stage-workspace.png](./configuration-runtime-phase-2b/business-processes-stage-workspace.png) |
| Perspectives section (expanded, default) | [perspectives-section-default.png](./configuration-runtime-phase-2b/perspectives-section-default.png) |
| Edited perspective card (dirty) | [perspective-card-edited-dirty.png](./configuration-runtime-phase-2b/perspective-card-edited-dirty.png) |
| Same card after Save + page reload | [perspective-card-saved-reloaded.png](./configuration-runtime-phase-2b/perspective-card-saved-reloaded.png) |

**Capture notes:** Lead stage (`lifecycle_lead`) was used — single synced queue lane. Playwright verified label/mission/order/visible values reload after Save stage + refresh.

---

## Design review answers

### 1. Does the Perspectives section visually match Alloy OS settings style?

**Mostly yes.** The section uses the same collapsible `StageSection` card shell as Stage Membership, Required Info, and Operating Plan: rounded-xl border, white/90 background, pine-accent page chrome inherited from the Business Processes hero. Typography (11px helper copy, 10px uppercase field labels, mono lane-key line) matches existing lifecycle editor patterns.

**Minor gaps:** Perspective row cards use a slightly different inner surface (`bg-alloy-stone/[0.03]`) than Operating Plan work-item rows (`bg-[#FAFBFC]`). Not wrong, but not perfectly unified.

### 2. Does it feel like part of Business Processes, not a separate builder?

**Yes.** Perspectives live inside the stage workspace accordion stack with unified **Save stage** at the top. Intro copy explicitly routes queue row / Focus Panel work to **Layouts (Experience Builder)**. No standalone nav tile, no `/settings/perspectives` route, no drag-reorder builder chrome.

### 3. Is the section placement correct?

**Partially.** Current order:

1. Stage Membership  
2. Stage requirements  
3. Operating Plan  
4. **Perspectives**  
5. Ready Check  

**Missing vs target architecture:** `LifecycleStageLayoutAssignmentsCard` is **not yet** in the stage workspace. Design alignment spec called for Perspectives between Operating Plan and **Layout assignments**, then Ready Check. Today Perspectives sits directly above Ready Check with no Layout assignments section between them.

**Recommendation before or with Phase 2B commit:** Add Layout assignments section (read-only/slot placeholders) between Perspectives and Ready Check, or document explicit deferral to Phase 2C/2D.

### 4. Are the row cards too dense, too tall, or visually noisy?

**Acceptable for single-lane stages; watch multi-lane.** Lead stage shows one card with label, order, mission, visibility, and two Layout links — readable, not cramped.

**Concerns for multi-lane stages:**

- Each card is ~200px tall; 4–6 lanes will require significant scroll inside the section.
- Lane key + grain mono line is useful for implementers but adds visual noise for admins.
- Duplicate title (bold card header repeats display label input value).

**Recommend before wider rollout:** Consider collapsing grain/lane-key into a single “Advanced identity” disclosure, and deduplicating the card title vs display label field.

### 5. Are labels clear enough for non-technical admins?

**Mixed.**

| Element | Assessment |
|---------|------------|
| Section title + summary | Clear — “operational lenses… maps to a synced queue lane” |
| Intro paragraph | Good — explains metadata vs Layouts ownership |
| “Display label” / “Default mission” | Clear |
| “Visible in rail” | Reasonable for staff-facing concept |
| “Display order” | Clear |
| `Lane key: lifecycle_lead · Grain: case` | **Too technical** for primary admin audience |
| “Assign in Layouts” links | Clear and correctly scoped |

**Recommend:** Rename or hide lane key behind “Technical identity” helper; show human-readable lane label only above the fold.

### 6. Does the save/dirty behavior feel consistent with the stage workspace?

**Yes.** Editing label, mission, order, or visible-in-rail triggers the shared **Unsaved changes** indicator on the stage Save bar (same boundary as membership, requirements, operating plan). **Save stage** persists `perspectives_v1`; reload restores edited values (verified in capture run).

**UX gap:** Dirty state is only visible on the top Save bar — not on the Perspectives section header. Operators who expand Perspectives at the bottom may not see “Unsaved changes” without scrolling up. Sticky save bar helps but is easy to miss when editing lower sections.

### 7. What should be fixed before Phase 2B is committed?

**Blockers (design/product):**

1. **Layout assignments section gap** — placement doctrine expects Layout assignments between Perspectives and Ready Check; not implemented yet.
2. **Technical lane metadata** — lane key / grain line should be secondary or collapsible for admin-facing polish.

**Recommended (non-blocking):**

3. Unify inner card surface with Operating Plan row styling.
4. Section-level dirty hint on Perspectives summary line when perspectives are dirty (mirror other stage sections if pattern exists).
5. Multi-lane empty state — validate visual review on a stage with 2+ synced lanes (Tour/Waitlist) before production rollout.
6. Crop screenshots for review should include Save bar in dirty-state capture (current card-only crop hides unsaved indicator).

**Engineering verified in branch (not visual):**

- `perspectives_v1` persists on Save stage  
- Stale lane keys coerced on read/save  
- No `deriveRuntimePerspective` merge  

### 8. Runtime behavior confirmation

- **No runtime queue, drawer, BOS rail, or perspective merge changes** in Phase 2B branch.
- Persistence is metadata-only on `departments.metadata.lifecycle_builder_v1` stage records.
- Runtime still derives lanes from synced queue definition until Phase 2C flag merge.

### 9. Forbidden builders / routes confirmation

Drift tests and route inventory unchanged:

- No `/settings/perspectives` standalone page  
- No `/settings/queue-builder` or `/settings/focus-panel-builder`  
- Layout links point to `/settings/layouts` only  

---

## Alignment summary

| Area | Verdict |
|------|---------|
| Alloy OS Settings chrome | ✅ Aligns |
| BP ownership (not separate product) | ✅ Aligns |
| Section placement vs doctrine | ⚠️ Layout assignments slot missing |
| Card density (single lane) | ✅ Acceptable |
| Card density (multi lane) | ⚠️ Needs follow-up review |
| Admin-readable labels | ⚠️ Lane key / grain too technical |
| Unified Save / dirty | ✅ Works; ⚠️ dirty indicator not local to section |
| Persistence proof | ✅ Save + reload verified |
| Runtime frozen | ✅ Confirmed |
| Forbidden builders | ✅ Confirmed |

---

## Gate decision

**Phase 2B should not be committed until product approves:**

1. Whether to ship without Layout assignments section in workspace, or add placeholder section first.  
2. Whether lane key / grain visibility is acceptable for v1 admin UX.

After approval, commit `feat/configuration-runtime-phase-2b` only — do **not** start Phase 2C runtime merge in the same package.

---

## Related

- Phase 2A review: [configuration_runtime_phase_2a_design_review.md](./configuration_runtime_phase_2a_design_review.md)
- Design alignment: `docs/system/configuration-runtime-design-alignment.md`
- Playwright capture: `web/playwright/tests/configuration-runtime-phase-2b-review.spec.ts`
