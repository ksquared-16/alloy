# AdminV2 drawer pipeline expansion sprint

## Goal

Apply the reusable drawer pipeline beyond opportunity without one-off patches. Out of scope: `/workspace`, `/dept`, `/work-unit`, BOS, global Tasks/Messages header panels.

## Audit table

| Drawer / entity | Current owner | Uses pipeline? | Late composition risk | Above-fold data owner | Child-owned fetches? | Conversion plan | Priority |
|-----------------|---------------|----------------|----------------------|------------------------|----------------------|-----------------|----------|
| Opportunity (workflow v1) | `AdminEntityDrawer` + `compileOpportunityRecordDrawerShell` | **Yes** — full adapter | Medium — inquiry JSX still in drawer host | Pipeline `inquiry_summary` slot | Section panels (family, tasks, tour) | Extract `OpportunityInquirySummaryRenderer` slot component | P0 (done) |
| Job (Admin V2 / cleaning modal) | `AdminEntityDrawer` + `JOB_DRAWER_V2_OVERVIEW_SECTIONS` | **Yes** — job adapter | Low — signals via `DrawerAboveFoldRenderer` | Pipeline `header_signals` slot | Comms embed section, payment API | Done this sprint | P1 (done) |
| Job (legacy / non–Admin V2) | `configDrivenOverviewSections` field-def discovery | No | High — section rank/sort in host | Field defs + presentation | Per-section | Migrate when `drawerShellVariant=adminV2` is default for jobs | P2 |
| Schedule (record modal v2) | `ScheduleRecordModalV2` + layout blocks | No | Medium — `scheduleSectionsAfterRowExtraction` | Record chrome `layout_blocks` | Schedule visits | `adapters/schedule/` shell from layout blocks | P2 |
| Schedule (classic) | `EntityDrawerOverview` + presentation | No | Medium | Presentation config | Section fetches | Same adapter, classic mode flag | P3 |
| Customer / contact / vendor / location | `EntityDrawerOverview` + presentation | No | Medium | Presentation + field defs | Mixed | Generic shell from presentation; no above-fold slots yet | P3 |
| Persons / payments / offerings / etc. | Presentation-only overview | No | Low | Presentation | Rare | Low priority — thin drawers | P4 |
| Documents / subscriptions | Custom drawer bodies in host | No | Low | Host branches | Some | Case-by-case adapters | P4 |
| Embedded comms (`communications_canonical_embed`) | Section custom content map | Partial (job defers section key) | Medium — mount on expand | Parent drawer pipeline | **Yes** — comms panel fetch | Child must not reserve above-fold; lifecycle `below_fold_deferred` | P2 |

## Classification summary

| Class | Drawers |
|-------|---------|
| Pipeline-backed | Opportunity (workflow v1), Job (Admin V2) |
| Partially pipeline-backed | Job comms section (deferred slot only) |
| Legacy layout-driven | Schedule v2 blocks, classic jobs, most CRM entities |
| Child-composition-driven | `communications_canonical_embed`, opportunity family/tasks panels |

## Recommended next adapter (post-sprint)

**Schedule record modal v2** — already has frozen `layout_blocks` / `overview_rows` from record chrome; closest to shell contract model after jobs.

## One-off opportunity code → generic

| Opportunity-only | Generic target |
|------------------|----------------|
| `opportunityDrawerLayoutStability.ts` computes | Pipeline `above_fold.inquiry_summary` |
| `stabilizeOpportunityWorkflowOverviewSections` | `stabilizeOverviewSectionsFromShell` + `pinned_expanded_section_key` |
| Inquiry summary JSX in `AdminEntityDrawer` | Future `OpportunityInquirySummaryRenderer` |
| `opportunityBackgroundFullHydrateFailed` | `DrawerEnrichmentState.background_full_failed` |
| `compileOpportunityRecordDrawerShell` | Keep entity shell; map via `opportunityShellToDrawerShellContract` |

## Cards completed

- **Card 1** — Audit table (this doc)
- **Card 2** — `DrawerAboveFoldRenderer` + `compileDrawerShellFromSections` + `assembleDrawerPipelineState`
- **Card 3** — Job adapter (`adapters/job/`)
- **Card 4** — Tests under `tests/adminV2/drawerPipeline/`
- **Card 5** — `adminv2_drawer_pipeline.md` updated

## Remaining in `AdminEntityDrawer`

- Opportunity inquiry summary composition (~large JSX block)
- Legacy job path (`configDrivenOverviewSections` rank/sort)
- Schedule / customer / vendor presentation-driven overview
- Custom section content maps (`overviewCustomContent`)

## Acceptance

- [x] Opportunity unchanged (same pipeline entry points)
- [x] Job Admin V2 pipeline-backed
- [x] Doctrine tests for enrichment + layout stability
- [x] No workspace/dept/work-unit changes
