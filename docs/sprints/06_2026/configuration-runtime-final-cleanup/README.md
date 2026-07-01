# Configuration Runtime — Final Ownership Cleanup

**Sprint:** June 2026  
**Status:** Complete (implementation); screenshots captured via Playwright.

## Goal

Freeze Configuration Mode ownership before Experience Builder (`/settings/layouts`) implementation.

## Frozen ownership

| Surface | Owns |
|---------|------|
| **Fields** | What data exists |
| **Statuses** | Status vocabulary |
| **Action definitions** (internal `/settings/actions`) | Platform catalog metadata only |
| **Processes** | When operators use actions — stages, Work Views, operating plan, process actions |
| **Layouts** | Where operators see actions — presentation surfaces |
| **Access** | Users, roles, permission groups, scope |
| **Automation** | Workflows |

## Primary Configuration IA

1. Organization — Locations, Access, Communications  
2. Data — Fields, Statuses  
3. Operations — Processes, Layouts  
4. Operational Intelligence  
5. Automation  

**Actions removed from primary operator navigation.**

## Screenshots

Captured by `web/playwright/tests/configuration-runtime-final-cleanup.spec.ts`:

| File | Surface |
|------|---------|
| `01-settings.png` | Configuration hub |
| `02-processes.png` | Processes |
| `03-fields.png` | Fields |
| `04-statuses.png` | Statuses |
| `05-access.png` | Access (formerly Users & Roles) |
| `06-communications.png` | Communications |
| `07-automation.png` | Automation |
| `08-full-bos.png` | Full page with BOS rail |

## Acceptance

- [x] Context → Queue → Workspace → BOS on Configuration surfaces
- [x] Actions demoted to internal definition catalog
- [x] Processes owns behavior; Layouts owns presentation (doctrine)
- [x] Access rename in nav and hub
- [x] Login password visibility toggle
- [x] Work View date presets include Previous week + relative builder
- [x] Ownership docs updated

## Related docs

- `docs/system/configuration-ownership-doctrine.md`
- `docs/system/configuration-mode-doctrine.md`
- `docs/system/configuration-runtime-design-alignment.md`
- `docs/system/configuration-workspace-v1-doctrine.md`
