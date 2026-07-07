# /surfaces — Presentation Runtime Completion (sprint log)

**Status:** **Closed** — baseline `c99e381f3` on `origin/staging`. Queue Row builder half + Focus Panel nested editing landed. See `presentation-surfaces-settings-thread-closeout.md` for canonical handoff.

This sprint finishes the visible /settings/surfaces **Queue Row** configuration experience so the Presentation Runtime work has something real to consume. It is visible builder behavior, not model-only.

## Landed (visible + tested)

### 1. Stacked condensed row (outcomes 1, 3)
- Schema: additive `QueueRecordColumnConfig.rowIndex` (back-compat: absent = row 0, legacy single strip).
- Model: `queueRowStackedModel.ts` — group into stacked sections, move block between rows, reorder within a row, normalize gaps, clamp, `MAX_STACKED_ROWS = 3`. Fully unit-tested.
- Builder: `QueueRowBuilderV2` canvas renders stacked rows inside the fixed **440px** condensed rail; each `rowIndex` is its own horizontal strip. Inspector gained a **Row (1/2/3)** selector that moves a block between stacked sections. Persists via `buildConfigFromState` → `column.rowIndex` and reads back via `stateFromConfig`.
- Real round-trip test (`queueRowBuilderStacked.test.ts`) exercises the exported functions: rowIndex persists and reads back.
- **Runtime deferral (labeled in-UI):** the live /work-unit condensed row does not consume stacking yet — the builder preview is **presentation-runtime-ready** and says so.

### 2. One Queue Row — grain + conditions (outcome 2, model + wiring)
- `queueRowGrainModel.ts` — unified grain (`family` | `child`), `grainForSurfaceId` bridge, `WAITLISTED_CONDITION` (`placement_status = waitlisted`), and waitlist/placement fields expressed as **conditional composition items** (not a separate surface). Tested.
- **No fake fields:** `availableWaitlistFields` offers placement override **only** when a persisted source exists.
- Note: the two surface-catalog entries + two API surfaces still exist; collapsing them to one entry is staged (below). The model is the contract they converge on.

### 6. Custom field availability (outcome 6)
- `useTenantFieldDefinitions` loads tenant `field_definitions` (reusing the field-catalog endpoint, fail-soft).
- `QueueRowBuilderV2` passes them into `namedEvidenceGroupsForZone(zone, isWaitlist, tenantFieldDefinitions)`, so operator-created custom fields appear in every **namespace-compatible** group's field list — proven by round-trip test (person field appears in household, not in children). No fake fields.

### 7. Navigation (outcome 7, nested-ready)
- `surfacesBreadcrumbModel.ts` — builds `Surfaces / Section / Surface` and the nested form `Surfaces / Focus Panel / Children Card / Children Surface`, with clickable pop-to-depth targets. Tested.
- `SurfacesConfigurationPage` renders the breadcrumb from the model; top-left **Surfaces** crumb returns to the library. Nested trail wires in when nested editing lands.

## Focus Panel nested-surface editing (outcomes 4, 5 — LANDED in the second slice)

Visible nested editing in /settings/surfaces → Focus Panel:
- **Navigation:** the FP editor shows **Expansion surfaces** launchers (Children Card › Children Surface, Financial Configuration Card › Financial Configuration Surface). Opening one drills into a nested editor and the breadcrumb becomes `Surfaces / Focus Panel / Children Card / Children Surface`, with each crumb clickable back.
- **`NestedSurfaceEditor`** renders each named evidence group with its selected fields, **+ Add Field** (compatible predefined + tenant custom, custom-badged), remove, reorder (↑/↓), and **Save & Publish**.
- **Children Surface** groups: Child Summary · Placement · Schedule · Medical · Documents.
- **Financial Configuration Surface** groups: Placement & Tuition · Billing Configuration · Billing Responsibility · History / Activity. Groups seed **empty** — no fake payers/invoices/estimates; only real compatible fields are offered, else an honest empty state.
- **Custom-field wiring:** `availableFieldsForNamespaces` + `useTenantFieldDefinitions` → custom fields flow into namespace-compatible nested groups.
- **Persistence:** real — `nestedSurfaceConfigService` writes `metadata.nestedSurfaces[surfaceId]` on the Focus Panel summary `entity_layouts` doc via the existing draft/publish loop.
- **Runtime deferral:** live runtime does not consume nested surface configs yet — labeled presentation-runtime-ready in-UI.

Models: `nestedSurfaceEditorModel.ts` (registry + ops), `nestedSurfaceConfigService.ts` (persistence), `NestedSurfaceEditor.tsx` (UI), wired in `SurfacesConfigurationPage`.

## Staged (intentionally deferred — next sprints only)

### Queue surface-entry collapse
Retire the separate `waitlist-queue-row` catalog entry + API surface into one `queue-row` with a grain selector (the model + conditions already support it). Schema-level change to the catalog + route.

### Live runtime adoption (not builder blockers)
- Stacked row `rowIndex` at runtime (builder preview is presentation-runtime-ready).
- Column/field `visibleWhen` evaluation on live condensed row where not yet wired.
- Focus Panel nested-surface config consumption at runtime overlay.

**These are not open items from the closed thread** — see `presentation-surfaces-settings-thread-closeout.md` §4 for the authoritative deferred list (Placement ranking, Focus Panel Composer, unavailable registry fields).
