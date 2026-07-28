# Commands P8 — Product completion

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-27

---

## Outcome

`/organization/commands` is a usable Organization Command catalog and policy console.

Absorbed from Action Buttons (without dual operator products):

- Org placement enable/disable
- Org-owned label edit
- Operational context listing (surface/slot)

Added:

- Family grouping + status filter
- Business Process usage (selection authority)
- Variants read from `metadata.command_config.variants`
- Safety panel (confirmation / preview / destructive class)
- Detail API `GET /api/admin/commands/[commandKey]`

---

## Administrator walkthrough

1. Open Configuration → Operations → **Commands** (`/organization/commands`).
2. Search or filter by Available / Limited / Unavailable.
3. Select a Command — workspace tabs: Overview, Availability, Business Processes, Variants, Safety.
4. Availability: toggle organization placements Enabled/Disabled.
5. Business Processes: see which processes select the Command; link to Processes.
6. Safety: platform-owned confirmation and destructive class (not editable).
7. Legacy `/settings/actions` redirects here. Developer placement CRUD remains at `/adminV2/settings/actions`.

---

## Tests

```text
commandsProductCompletion.test.ts
organizationCommandCatalog.test.ts
organizationCommandsRoute.test.ts
```

---

## Honesty correction (2026-07-28)

P8 completed the Commands **workspace** on `/organization/commands`. Entry from the real
Organization Configuration domain grid was missing until the corrective integration commit.
Screenshots of integrated product: `qa/missions/commands-ui-proof/`.

---

## Checkpoint

```text
Slice: P8 product completion
Commit: (pending commit)
Tests: 20 passed (commandsProductCompletion + catalog + route + authoring)
Typecheck: pass
Behavior change: Commands product usable; Action Buttons absorbed into Commands UX
Compatibility retained: /adminV2/settings/actions; /api/admin/actions/*
Next slice: P9 executeAdminAction drain
```
