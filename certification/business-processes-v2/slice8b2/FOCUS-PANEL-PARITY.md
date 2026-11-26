# Enrollment Focus Panel: Firefly vs QA Shared configuration parity (read-only)

**Deployed:** staging `267d9400b8c7`.
**Evidence:**
- census `gar_fdefb7091146c6` (`focus-panel-parity-census.sql`, sha `559ea158…`, read-only, configuration only);
- Firefly read-only browser trace (session `gar_01d58a2e2c45a8`; all writes aborted) → `firefly-focus-panel-trace.redacted.json`;
- QA Shared failure from run `qar_58463703cedd` (`hosted-qar_58463703cedd/`).

No configuration, layout, process or record was changed.

## How a Work View row opens an Enrollment record (code path)

`useRecordWorkRuntime` loads `GET /api/admin/view-models/drawer/opportunity/<id>`. Its first gate is `sharedCanonicalDeps` → `fetchEffectiveRecordDrawerLayout(org, "opportunity")`:

1. Read the **org override** in `record_drawer_layouts` (`entity_type = opportunity`, `surface = drawer`, `key = default`, active).
2. If there's none, fall back to the global `record_layouts` (`opportunity`).
3. If the effective config's `inquiry_drawer_mode` is not `"workflow_v1"`, return `classic_layout_deferred`. The UI then shows "This inquiry drawer uses a classic layout…". The hard cutover is unconditional (`opportunityDrawerHardCutoverEnabled() === true`).

Only after the view-model succeeds does the panel read Surfaces → Focus Panel configuration (`entity_layouts`, for example `GET /api/admin/entity-layouts/focus-panel-summary`). The gate never consults `entity_layouts`.

## Field-level difference

| Property | Firefly (works) | QA Shared (fails) | Class |
|---|---|---|---|
| `record_drawer_layouts` org override, opportunity/drawer/default | **present**, id `16d8c771…`, active, `inquiry_drawer_mode: "workflow_v1"`, keys `field_placements_v1, inquiry_drawer_mode, inquiry_workflow_sections, overview_hidden_sections, overview_section_order, suppress_body_status, version`; created 2026-04-24, updated 2026-05-20 | **absent** | Product provisioning defect (below) |
| Effective layout source | org override (workflow_v1) | global `record_layouts` default `0680209d…`, `inquiry_drawer_mode: null` (classic) | consequence of the row above |
| View-model result | **200**, panel `state = record`, `FP.SURFACE`, Enrollment timeline Lead → Tour → Decision → Enrolling → Enrolled (Decision row and Waitlist child row both traced) | `classic_layout_deferred` → "classic layout" message | consequence |
| Surfaces (`entity_layouts`) | 11 layout families, operator-authored since 2026-06-05: `opportunities/drawer/focus_panel_summary` (164 published versions), `opportunities/drawer/default` (v43), queue rows, person and child drawers, workspace headers | **none** | Missing configuration. Authorable through Surface Builder, but **not sufficient**: the gate does not read it |
| Enrollment process | `lead_management` department, published r59, 7 stages, 8 Work Views | `enrollment`, published r2, 8 stages, 6 Work Views | Expected difference (different template generations); not causal |
| Records | 76 Enrollment records (lead, tour, decision, waitlist; closed cases stay in `lead`) | 2 (decision; closed in `closed`) | not causal |

## Provenance of Firefly's working configuration

The drawer override is **migration-era provisioning**.
- `20260424190000_childcare_opportunity_inquiry_drawer_workflow_layout.sql` and `20260430203000_…_workflow_v3_layout.sql` **UPDATE** the `record_drawer_layouts` rows of every org that was childcare at that time, setting `inquiry_drawer_mode = "workflow_v1"`.
- The row was later edited through the legacy workflow_v1 editors (`updated_at` 2026-05-20).
- Its Surfaces layouts were authored later through Surface Builder.
- Neither migration creates rows for orgs made afterwards.

## Can a new org obtain the same panel through today's supported tools? **NO.**

- **No provisioning.** The org creation and shared-QA ensure paths, Business Process create, publish and template paths, and stage work units write no drawer override.
- **No creation path.** The only writers are `persistOpportunityDrawerLayoutConfig` and the three `record-drawer-layouts/opportunity-workflow-v1-*` PATCH routes.
  - Each one refuses unless the **effective** layout is already `workflow_v1` (`"… applies only when inquiry_drawer_mode is workflow_v1"`).
  - Each one is additionally **blocked** while visual layout configuration is active (`legacy_layout_write_blocked` → "Use Configuration → Layout Gallery").
  - `record-layouts` is GET-only.
- **No bridge.** The supported authoring path (Surfaces / Layout Gallery, `entity_layouts`) does not write the override: "read-through migration hints … (no auto-write)". The view-model gate does not read `entity_layouts`.

**Conclusion.** QA Shared's failure is **not** a QA configuration omission that a supported tool could correct, and **not** a broken Focus Panel: Firefly proves the runtime works. It is a **provisioning gap with a gate/authoring mismatch**. The record gate still keys on a legacy, migration-provisioned drawer mode that no current tool can create, while authoring has moved to `entity_layouts`.

## D1 and D3

- **D1 (QA Enrollment panel doesn't open): reclassified as a provisioning defect**, with a surface-resolution mismatch. Not a QA configuration defect and not a runtime break.
  - Owner: Configuration / Surfaces, with Record Chrome (the drawer view-model).
  - Every Enrollment org created after 2026-04-30 is affected. Firefly is not.
- **D3 (closed-stage record doesn't open): UNVERIFIED.**
  - Firefly has no record in a stage without work templates; its 3 closed cases remain in `lead`. It can't be reproduced there read-only.
  - The single observation is 8B-1 in QA Shared, before D1 masked it: "stage `closed` offers no work templates". It came through the provisioning-answer composition, which is a different code path from D1's gate.
  - It stays a candidate pending a safe reproduction.

## Smallest next action (not implemented)

1. **Product (bounded):** provision the opportunity drawer override for a new org with the **same shape the seed migrations gave Firefly**: `inquiry_drawer_mode: "workflow_v1"`, `version`, `suppress_body_status`, `inquiry_workflow_sections`.
   - Use the existing `persistOpportunityDrawerLayoutConfig` helper.
   - Do it idempotently, when an org's Enrollment staged lifecycle is first published or at childcare org bootstrap.
   - No new layout engine, fallback or panel.
   - **Alternative:** have the gate accept an org whose effective layout is the global default when the org has a published Enrollment process. That's riskier, because it changes runtime semantics for every org.
2. **QA only, before any product change:**
   - A governed one-time reconciliation could apply the Firefly-equivalent override to QA Shared. That reproduces Firefly's provenance exactly, through migration-equivalent SQL.
   - That needs Director approval as an environment correction. It doesn't fix the product for real new tenants.
   - Without one of these, the Enrollment record-panel scenarios can't resume in QA Shared.
