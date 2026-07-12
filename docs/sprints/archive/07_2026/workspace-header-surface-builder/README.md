# Workspace Header Surface Builder — Sprint Package

## Goal

Make the Workspace Header a real Surfaces-configurable surface: identity (title + subtitle) and three required KPIs (+ two optional), published through existing `entity_layouts` (`surface = workspace`) and rendered identically in builder preview and `/workspace` runtime.

## Navigation model

Under **Settings → Surfaces → Workspaces**:

1. **Workspace Header** (first — identity + header KPIs)
2. **Configured process summaries** (each published Business Process workspace surface, same catalog as before)

## Config model

`WorkspaceHeaderSurfaceConfig` (`web/lib/presentation/runtime/workspaceHeaderSurfaceConfig.ts`):

| Field | Role |
| --- | --- |
| `title` | Display title (falls back to org-resolved label when empty) |
| `subtitle` | Optional subtitle |
| `kpis[0..2]` | Required KPI slots (`enabled: true`) |
| `kpis[3..4]` | Optional KPI slots (`enabled` toggle) |

Each KPI: `{ slot, enabled, label, icon, sourceKey, accent }`.

- `sourceKey` is an Operational Calculation key (same metric resolve path as process summary cards).
- Values come from the resolve API. Empty / no-data renders as an em dash (`—`), never portal org-user fake totals.
- Shared assembly: `buildWorkspaceHeaderPresentation(config, { answersByKey, titleFallback })` — builder and runtime.

## Persistence

- Table: `entity_layouts`
- `surface = 'workspace'`
- `layout_key = 'workspace_header'`
- Doc metadata: `{ workspaceHeaderSurface: <WorkspaceHeaderSurfaceConfig> }`
- Write path: `PUT` upserts **one** published row per org for this key (draft path publishes in place; re-publish updates the same row — no second published row).

Admin HTTP:

- `GET /api/admin/surfaces/workspace-header` → `{ config, source: 'builtin_default' | 'published' }`
- `PUT /api/admin/surfaces/workspace-header` body: `{ config }`

## Files (primary)

| Path | Role |
| --- | --- |
| `web/lib/presentation/runtime/workspaceHeaderSurfaceConfig.ts` | Types, defaults, normalize, presentation builder |
| `web/lib/presentation/runtime/useWorkspaceHeaderSurfaceConfig.ts` | Client load/save + cache invalidate on publish |
| `web/lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts` | Runtime wiring + ready gate |
| `web/app/api/admin/surfaces/workspace-header/route.ts` | Load/publish API |
| `web/components/presentation/workspace/WorkspaceHeader.tsx` | Shared header renderer |
| `web/components/presentation/workspace/WorkspaceSurface.tsx` | Skeleton until header+tiles ready |
| `web/components/adminV2/settings/surfaces/WorkspaceHeaderSurfaceEditor.tsx` | Surfaces builder |
| `web/components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx` | Workspaces hierarchy |
| `web/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings.ts` | Nav model (Header first) |

## Runtime guardrails

- Surface stays on skeleton until header config is loaded **and** presentation is committed **and** process tiles are ready.
- Refresh keeps the last complete header snapshot (no title/KPI flash to builtins).
- Builder preview and runtime use the same `buildWorkspaceHeaderPresentation` + `WorkspaceHeader`.

## Tests

```bash
cd web && npm run test -- \
  tests/presentation/runtime/workspaceHeaderSurfaceConfig.test.ts \
  tests/presentation/workspace/workspaceHeader.test.tsx \
  tests/adminV2/workspaceHeaderSurfaceNav.test.ts \
  tests/admin/surfaces/workspaceHeaderRoute.test.ts \
  tests/adminV2/surfacesNavigationModel.test.ts
```

**Result (2026-07-06):** 5 files / 17 tests passed.

## Screenshots

- `01-builder.png` — Surfaces builder (identity + KPI inspector + live preview)
- `02-runtime.png` — capture `/workspace` after publish when local stack is up (optional if stack is not running)
