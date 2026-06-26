# Configuration Runtime — Settings Pattern Rollout

**Sprint:** June 2026 · Configuration Runtime  
**Status:** Processes + Statuses implemented on shared shell; other surfaces documented

## Pattern

Every configuration surface under `/settings` follows:

**Context → Queue → Workspace → BOS**

| Layer | Role |
| --- | --- |
| **Context** | Page title, subtitle, global actions (filters, create) |
| **Queue** | Section nav and/or category/object lists — selection drives workspace |
| **Workspace** | Detail editor, empty states, save actions |
| **BOS** | Business Operations System rail — persistent platform shell |

Shared primitives: `web/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx`

- `ConfigurationContext`, `ConfigurationShell`, `ConfigurationQueue`, `ConfigurationQueueItem`
- `ConfigurationWorkspace`, `ConfigurationPrimaryButton`, `ConfigurationDetailCard`
- `ConfigurationPatternPlaceholder` — rollout target copy for surfaces not yet converted

## Typography doctrine

Configuration Mode typography levels (`configurationRuntime.css`):

| Level | Class | Use |
| --- | --- | --- |
| Page / context title | `config-typo-page-title` | Settings page title, Processes, Statuses |
| Workspace title | `config-typo-workspace-title` | Detail card headers inside workspace |
| Queue item title | `config-typo-queue-item-title` | Selectable queue/list rows |
| Queue section label | `config-typo-queue-section-label` | Column headers in queue columns |
| Field / section label | `config-typo-field-label` | Form labels, section headers (uppercase) |
| Sublabel / helper | `config-typo-sublabel` | Subtitles, helper copy — never same weight as labels |
| Technical metadata | `config-typo-meta` | Advanced sections only |

Visual tokens: white canvas, Bend Pine (`#00a283`) selected/active states, stone/forge borders — no blue checkmarks, blue links, or gray accordion panels.

## Implemented

### Processes (`/settings/processes`)

- Full **Context → Queue → Workspace → BOS** via `LifecycleActivationBoard` + shared `ConfigurationShell`.
- Work Views: collapsed sections, presentation inside Work Views (not top-level nav).
- **Configuration Health** label at process level.
- User-facing copy avoids migration/legacy language.

### Statuses (`/settings/statuses`)

- **Context:** Statuses title, vocabulary subtitle, inactive toggle, New Status.
- **Queue:** Enrollment · Lead/Case · People → status list for selected group.
- **Workspace:** Label, active, sort order, where used / Assigned in Processes, Advanced (technical identity).
- No Display Style block, no cross-link banner, no stacked accordions.

## Next (pattern placeholders only)

Each page below shows `ConfigurationPatternPlaceholder` until converted:

| Route | Queue target | Workspace target |
| --- | --- | --- |
| `/settings/fields` | Entities · field groups · fields | Field detail editor; system fields read-only |
| `/settings/actions` | Action list | Selected action setup |
| `/settings/users-roles` | Roles · permission groups | Selected role permission setup |
| `/settings/communications` | Channels · templates · rules | Selected template/channel/rule setup |
| `/settings/layouts` | Not started | Not started |
| `/settings/analytics` | Not started | Not started |

## Workflows (`/workflows`)

**Not part of polished Configuration Mode yet.**

- Current route is **diagnostic / early automation infrastructure** for workflow inspection and runs.
- Future target: an **Automation** configuration surface should absorb workflows into Context → Queue → Workspace.
- Until then, treat `/workflows` as internal/diagnostic — not a user-facing settings surface on par with Processes or Statuses.

## Remaining legacy surfaces

- Fields, Actions, Users & Roles, Communications — hub layouts with pattern placeholders.
- Layouts, Analytics — prior editor surfaces.
- Non-AdminV2 `/admin/settings/statuses` still mounts legacy `StatusesClient`.

## Screenshots

Latest cleanup pass: `docs/sprints/06_2026/configuration-runtime-doctrine-cleanup/`

Prior rollout: `docs/sprints/06_2026/configuration-runtime-settings-pattern/`

## Tests

- `web/tests/adminV2/configurationRuntimeSettingsPattern.test.ts`
- `web/tests/adminV2/configurationRuntimeDoctrineCleanup.test.ts`
- `web/playwright/tests/configuration-runtime-doctrine-cleanup.spec.ts`

## Non-goals

- No new DB tables
- No change to status ownership doctrine
- No Layouts / Fields / Actions full rebuild in this pass
