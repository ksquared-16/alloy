# Commands UI product integration correction

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-28  
Worktree: Slot 1 Commands (`wt1-commands-system-inventory`)  
Server: `http://127.0.0.1:3011` (PID confirmed cwd = this worktree)

---

## Root cause

P7/P8 certified Commands via **sidebar** `configurationModeNav` and a **route rewrite** to
`/organization/commands`, but the operator landing at **`/organization`** renders domains from
`organizationConfigurationDomains()` in `web/lib/configRuntime/organizationRuntime.ts`.

That registry was never updated. Route existence ≠ Organization Configuration product integration.

Prior certification overstated product readiness.

---

## Corrective change

1. Register **Commands** domain in `CONFIGURATION_DOMAINS` with operational order:

   `commands → automation → business-processes → surfaces`

2. Map Commands icon on `OrganizationConfigurationPage`.
3. Align `CONFIGURATION_WORKSPACE_DOMAINS` Operations items.
4. Add back link on Commands product → `/organization`.
5. Add integration tests that assert the **domain grid** order (not only sidebar).

---

## Live UI proof (this worktree, port 3011)

| Check | Result |
|-------|--------|
| `/organization` shows Commands domain card | Yes — 10 domains; Commands before Automation |
| Operational sequence visible | Commands → Automation → Business Processes → Surfaces |
| Sidebar Operations order | Commands → Automation → Processes → Surfaces |
| `/organization/commands` renders catalog | Yes — 34 Commands, family groups, filters |
| Back link present | `← Organization Configuration` |
| `/settings/actions` redirect | `307 → /organization/commands` |
| `/configuration/commands` redirect | `307 → /organization/commands` |

Screenshots:

- `qa/missions/commands-ui-proof/01-organization-domains.png`
- `qa/missions/commands-ui-proof/02-commands-product.png`

---

## Corrected certification statement

**Route + catalog implementation (P7/P8) was real.**  
**Organization Configuration product integration was incomplete until this corrective commit.**

Commands is now operator-reachable from `/organization` and is the first operational domain
ahead of Automation, Business Processes, and Surfaces.

Intentional retained: developer `/adminV2/settings/actions`; `/api/admin/actions/*`; executeAdminAction compatibility ledger.
