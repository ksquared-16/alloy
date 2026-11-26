# Locations Configuration Runtime V1 closeout

**Status:** Complete and frozen.
**Reference statement:** **Locations is the reference implementation for Configuration Runtime V1.**

After this closeout, Locations accepts bug fixes, security fixes, and reference-contract corrections only. New configuration experience work proceeds in Organization Runtime and the Settings landing experience by inheriting this implementation.

## Product closeout

All final surfaces were reviewed at 1440×1000 with the platform shell and BOS visible:

- Organization landing: `screenshots/120-organization-landing-final.png`
- Overview: `screenshots/121-overview-final.png`
- Programs view/edit/create: `screenshots/122-programs-view-final.png`, `screenshots/123-programs-edit-final.png`, `screenshots/124-programs-create-final.png`
- Rooms view/edit/create: `screenshots/125-rooms-view-final.png`, `screenshots/126-rooms-edit-final.png`, `screenshots/127-rooms-create-final.png`
- Schedule detail/edit/create + selected weekdays: `screenshots/128-schedule-detail-final.png`, `screenshots/129-schedule-edit-final.png`, `screenshots/130-schedule-create-weekdays-final.png`
- Tours view/create/edit/hard refresh: `screenshots/131-tours-final.png`, `screenshots/132-tours-create-final.png`, `screenshots/111-tours-edit-final.png`, `screenshots/112-tours-hard-refresh-final.png`
- Placement: `screenshots/133-placement-final.png`
- Access view/edit: `screenshots/134-access-view-final.png`, `screenshots/135-access-edit-final.png`

No unresolved design work remains in Overview, Programs, Rooms, Schedule, Tours, Placement, Access, Navigation, Header, or the Organization landing.

## Mutation certification summary

The detailed field matrix and root-cause record is `mutation-persistence-audit.md`.

| Object | Certified mutations | Response | Local consumers | Hard refresh |
|---|---|---|---|---|
| Location | Create; name; street/city/state/postal; phone; timezone; active | PASS | PASS | PASS |
| Program | Create; name; active; age start/end/unit; default room types | PASS | PASS | PASS |
| Room | Create; name; program; capacity; staffing thresholds; age range; active | PASS | PASS | PASS |
| Schedule | Create; name; weekdays; active; edit | PASS | PASS | PASS |
| Tour Window | Create; edit day/time/timezone/duration/buffer/limit/approval/active; toggle; delete | PASS | PASS | PASS |
| Placement | Business Process; Stage; enabled; ordering mode; factor selection; factor order | PASS | PASS | PASS |
| Access | Add/remove Location access | PASS | PASS | PASS |

Every successful client mutation requires the authoritative response to contain the submitted patch. Confirmed mutations update the selected object, collection, dependent summaries, and owned-concern readiness before success is presented.

## Configuration Runtime V1 doctrine

- **Workspace structure:** Context → object collection → selected-object workspace → shell Actions → BOS.
- **Canvas:** Stone is the workspace field; white regions carry coherent operational answers.
- **Region vs Object:** a Region groups an answer; an Object carries identity, status, selection, URL state, and view/edit behavior.
- **Left navigation:** collection identity, count, search, filter, Add, selected state, and keyboard movement.
- **Hero:** selected-object identity, status, business facts, and object-level Edit.
- **Operational Summary:** the primary operating picture, with derived metrics linked to their owned concerns.
- **Operational Readiness:** a supporting, visibly reconciled set of Complete / Needs setup / Not assessed / Not applicable dimensions.
- **Needs Attention:** problem, impact, and attached action; absent when no action is required.
- **View/Edit:** view explains operation; edit replaces the summary with one focused authoring workspace.
- **Master/Detail:** the list supports selection; the selected child owns the workspace; create is a dedicated mode.
- **Action ownership:** shell rail owns contextual commands; inline actions remain attached to their affected object; BOS uses the same registered boundaries.
- **Mutation expectation:** response-confirmed, organization-scoped, locally reconciled, and hard-refresh durable.
- **Organization inheritance:** Organization may create reusable Program, Schedule, and Tour Patterns and apply them only through a future authoritative provider. It inherits this grammar without moving Location-owned truth or exposing fake Apply actions.

## Canonical documents updated

- `docs/platform/operator/configuration-workspace-platform-doctrine.md`
- `docs/platform/operator/configuration-workspace-visual-language.md`
- `docs/platform/operator/configuration-workspace-component-library.md`
- `docs/platform/modules/configuration-platform.md`
- `docs/system/configuration-runtime-v1.md`
- This completed Locations certification corpus.

## Intentionally deferred

- Date-specific Schedule closures/exceptions: no authoritative provider exists; Add Closure remains disabled with an explicit reason.
- Cross-location/Organization Apply: hidden until a durable, auditable copy/apply provider exists.
- Organization Configuration Runtime and Settings landing implementation: next sprint; this closeout preserves its inheritance boundary.

## Engineering validation

- Focused Vitest suite: 12 files, 74 tests passed.
- Production TypeScript graph: passed.
- Test TypeScript graph: passed.
- Staged module-import verification: passed (7,866 files checked).
- Changed-file ESLint: passed with zero errors or warnings.
- Full-repository ESLint: blocked by the existing repository baseline (700 errors / 1,019 warnings outside this change); no Locations-closeout lint findings remain.
- Documentation lint command completed; repository report remains the pre-existing generated-boundary/broken-link/orphan inventory.
- Authenticated Playwright smoke: 2/2 passed on the managed sprint server.
- Manual browser mutation certification: Program create; Tour create/edit/delete/readiness; Placement process/stage/ranking; all passed and test data/original policy were restored.

## Release-note summary

Locations Configuration Runtime V1 now provides the complete reference workspace for organization landing, Location navigation, operational Overview, Programs, Rooms, Schedule, Tours, Placement, and Access. Child objects have dedicated create/view/edit modes, every exposed mutation is response-confirmed and refresh-durable, readiness explains its basis, and commands follow shared shell/BOS/inline ownership. Closures and cross-location Apply remain intentionally unavailable until authoritative providers exist. Locations is complete because its product surfaces, persistence contract, browser evidence, tests, and canonical doctrine now agree.
