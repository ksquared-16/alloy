# Configuration Runtime — Design Alignment Spec

**Status:** Approved — Phase 0/1 (Settings shell + doctrine registration) shipped June 2026.

**Runtime:** Frozen. Configuration Runtime does **not** redesign Workspace, Work Unit Context, Queue, Focus Panel, BOS rail, or Universal runtime regions.

## Purpose

Register the approved Settings/Configuration experience that controls frozen runtime primitives. Implementation proceeds in convergence packages (BP perspectives metadata, layout cutover, field/status sprint integration) — not parallel builders or new runtime systems.

**Authority:** This doc is the platform entry point. Screen-by-screen layout detail lives in the approved design alignment artifact (Cursor session, June 2026).

---

## Ownership (frozen)

| Concern | Settings owner | Does **not** own |
|---------|----------------|------------------|
| **Business Processes** | Stages, **perspectives** (lane metadata), missions, required info, operating plan, attention, process actions, layout **assignments** | Field definitions, status vocabulary, queue/drawer **presentation** authoring |
| **Layouts / Experience Builder** | Queue row presentation, Focus Panel body (drawer layouts), field placement on surfaces | Stages, perspectives, status rollups, field registry |
| **Fields** | Canonical field catalog, formats, validation, DB binding | Drawer requiredness (Layouts), stage progression requiredness (BP) |
| **Statuses** | Status vocabulary, lifecycle presentation metadata, transitions (sprint) | Stage assignment (BP) |
| **Operational Intelligence** | Metric definitions and placement | KPI strip geometry (runtime) |
| **Action buttons** | Definitions and global placements | Process enablement (BP) |

### Explicitly forbidden

- **No Queue Builder** — queue rows authored in Experience Builder (`entity_layouts` queue surface + `queue_record_layout` v3).
- **No Focus Panel Builder** — Focus Panel body authored in Experience Builder drawer layouts; BP assigns published layouts.
- **No parallel field or status systems** — Configuration Runtime must not introduce fields or statuses outside `/admin/settings/fields` and `/admin/settings/statuses`.

---

## Parallel sprint dependencies

Configuration Runtime **consumes** these sprints; it does not duplicate their UI or storage.

| Sprint | Delivers | Configuration Runtime waits for |
|--------|----------|----------------------------------|
| **Fields & Field Formats** | `field_definitions` catalog, format metadata, validation, DB binding APIs | Unified field picker in BP requirements, layout editor, queue v3 columns, card bindings |
| **Statuses** | Status vocabulary UI, transition truth, presentation metadata | BP stage membership links to Statuses; no status assignment outside BP |

Until sprint APIs ship, Configuration Runtime surfaces show honest cross-links and dependency copy — not parallel editors.

---

## Perspectives (Business Process metadata)

A **Perspective** is operational lens configuration over an existing queue lane — not a separate runtime primitive or settings route.

- **Owner:** Business Processes (stage metadata, e.g. `perspectives_v1` on save stage).
- **Runtime:** Derived via `deriveRuntimePerspective` from `queue_definition` + overrides (compatibility layer).
- **Presentation:** Queue row and Focus Panel layouts assigned via BP layout slots → Experience Builder published docs.

Phase 2+ adds Perspectives section UI in BP stage workspace. Phase 0/1 registers ownership in Settings copy and doctrine only.

---

## Implementation phases (reference)

| Phase | Scope |
|-------|--------|
| **0/1** | Settings hub + nav copy; doctrine registration; drift-prevention tests |
| **2** | BP Perspectives section (metadata only, no new schema) |
| **3** | Experience Builder mode/card affordances (editor-only) |
| **4+** | Field/status sprint integration; layout cutover packages |

See `configuration-ownership-doctrine.md` and `field-model-convergence-doctrine.md` for storage convergence.

---

## Related docs

- `configuration-ownership-doctrine.md` — one owner per concept
- `configuration-workspace-v1-doctrine.md` — Settings domain IA
- `settings-v2-doctrine.md` — Business Processes reference patterns
- `configuration-system.md` — control plane vs runtime
- `platform/operator/runtime-perspective-compatibility-layer.md` — runtime derivation
- `platform/operator/experience-builder-doctrine.md` — presentation authoring
