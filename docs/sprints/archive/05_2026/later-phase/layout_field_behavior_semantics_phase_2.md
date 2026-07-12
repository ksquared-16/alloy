# Layout + field behavior semantics — Phase 2 (backlog)

**Path:** `docs/sprints/archive/05_2026/layout_field_behavior_semantics_phase_2.md`  
**Status:** **Backlog only** — not scheduled; no implementation in Phase 1 sprint.  
**Prerequisite:** Phase 1 complete — see `layout_field_behavior_semantics_v1.md`.

## Purpose

Capture **future** enhancements to the placement behavior model and Record layouts operator experience. Phase 1 intentionally stopped at opportunity workflow v1 drawer overview with JSON `field_placements_v1` and a cohesive but bounded Settings UX.

Phase 2 is for operators who need **more configurability**, **more surfaces**, and **stronger platform reuse** — without reopening Phase 1 scope.

## What Phase 1 completed

- `field_placements_v1` on `record_drawer_layouts.config_json` (no new table)
- Effective resolution: placement → `field_definitions` → system preset
- Opportunity drawer GET `_field_policy_resolved` and PATCH enforcement
- Placement-aware layout integrity (`required_on_layout_not_visible`)
- Layouts Settings: per-field Required/Editability; section list including synthetic **Drawer header** row
- Fields Settings: structure-first for opportunity/job
- Operational UX: debug hidden behind Developer details, stable section selection, compact settings headers, drawer header density + breathing room

## What is intentionally deferred

| Area | Why deferred |
|------|----------------|
| Configurable drawer header / summary grid | Hardcoded inquiry header chrome in v1 |
| Safe delete/archive of layout sections | Lifecycle + data migration risk |
| Full built-in section field catalogs | Child grid / tuition panels partially fixed in UI |
| Inquiry child grid column configuration | Not backed by `field_definitions` grid in v1 |
| First-class placement table | G0/G1 locked JSON overlay for Phase 1 |
| Forms / workflows / booking placement reuse | Separate product surfaces; not unified |
| Status/action phase requiredness | Different enforcement plane |
| Config assist / BOS placement ops | Assist scope separate |
| Multi-surface layout behavior | Only `drawer_overview` wired |
| Job drawer layout behavior | Job remains definition-based |
| Card 8-scale visual redesign | Paused after targeted density passes |

**Explicit non-claims:** Forms and workflows do **not** share the placement model today. Header summary layout is **not** operator-configurable today.

---

## Proposed cards (indicative)

| # | Theme | Outcome |
|---|--------|---------|
| P2-1 | **Header / summary grid** | Operator-configurable drawer header fields and summary layout (beyond behavior-only on known keys) |
| P2-2 | **Section lifecycle** | Safe archive/delete/hide for layout sections with integrity guards and migration notes |
| P2-3 | **Built-in sections** | Richer Inquiry children / Tuition: full behavior matrix, fewer “fixed” dead ends |
| P2-4 | **Inquiry child columns** | Configurable child grid columns (field_definitions or dedicated manifest) |
| P2-5 | **Placement storage** | Evaluate migration from JSON `field_placements_v1` to normalized placement table if scale/audit requires |
| P2-6 | **Surface expansion** | `drawer_*`, forms, workflow panels — shared resolver, explicit surface keys |
| P2-7 | **Forms / workflows reuse** | Read placement behavior in form render + workflow field steps (design first) |
| P2-8 | **Status / action requiredness** | Phase-aware required rules aligned with actions/status machine |
| P2-9 | **Config assist / BOS** | Placement read/write in assist tools with same enforcement paths |
| P2-10 | **Integrity & perf** | Advanced integrity rules, layouts editor load/refetch strategy |
| P2-11 | **Visual design** | Optional premium pass if product wants beyond Phase 1 density targets |

Order is not locked; entry criteria below gate start.

---

## Risks

- **Normalization (P2-5):** Dual-read/dual-write period if moving off `config_json`; org override migration complexity.
- **Header grid (P2-1):** Coupling to runtime inquiry chrome and action registry — easy to break drawer save paths.
- **Built-in / child grid (P2-3, P2-4):** `inquiry_child` entity vs opportunity field_definitions split confuses operators if not modeled clearly.
- **Multi-surface (P2-6, P2-7):** Enforcement drift if forms PATCH bypasses `resolveEffectiveFieldBehavior`.
- **Section delete (P2-2):** Orphan placements and hidden required fields without integrity coverage.

---

## Non-goals (Phase 2 draft)

- Rewriting Phase 1 enforcement semantics without a migration story
- Childcare-only hardcoding in platform layers (prefer vertical config)
- Replacing workflow engine or status machine in the same sprint as placement expansion
- Automatic sync from placements back to `field_definitions` policies (G3 still applies unless explicitly revoked)

---

## Entry criteria

1. Phase 1 shipped and paused; no open P0 bugs on opportunity placement GET/PATCH/integrity.
2. Product priority for at least one Phase 2 theme (usually P2-1, P2-3, or P2-6).
3. Design note for any cross-surface work (forms/workflows) before code.
4. Schema decision recorded if P2-5 is in scope (ADR or sprint amendment).

---

## Acceptance criteria (Phase 2 — theme-dependent)

Phase 2 closes per theme, not as one monolith. Example bar for **P2-1 header grid**:

- Operators can configure which summary fields appear in drawer header without developer details.
- Effective behavior still resolves through placement → definition → preset.
- Drawer PATCH/GET and integrity updated with tests; no silent bypass.
- Docs updated in `configuration-system.md` / `record-system.md` only for shipped themes.

Global bar when any theme ships:

- No regression to Phase 1 opportunity workflow v1 behavior for orgs not using new features.
- Operator UI does not expose raw provenance/IDs in default view.

---

## References

- `docs/sprints/archive/05_2026/layout_field_behavior_semantics_v1.md` — Phase 1 closeout
- `docs/system/configuration-system.md`
- `docs/archive/2026-06-superseded-system/record-system.md`
