# Commands P8 — Product completion

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-27

---

## Honesty correction (2026-07-28) — product realization

Route + catalog foundation was real, but the first product shell was a **registry/placement inspector** (five tabs, duplicate Availability rows, `Limited` maturity jargon). That is **not** accepted administrator product.

Corrective pass evidence:
`qa/missions/commands-product-realization-correction-msn_188e8bea6fb6de28dd21.md`

Accepted shape: progressive disclosure; Supported / Needs attention / Not yet supported; grouped operational exposures; org-owned label + enable + placement toggles only; empty Variants hidden; compact Safety.

---

## Outcome

`/organization/commands` is a usable Organization Command catalog and **bounded org configuration** surface.

Absorbed from Action Buttons (without dual operator products):

- Org placement enable/disable (grouped contexts)
- Org-owned label edit + enablement
- Operational context listing (human surfaces, deduped)

Added:

- Product support filters (not maturity jargon)
- Business Process usage (selection authority) + manage link
- Variants only when present (`metadata.command_config.variants`)
- Compact Safety (confirmation / preview / destructive class)
- Detail API `GET /api/admin/commands/[commandKey]`

---

## Administrator walkthrough

1. Open Organization Configuration → **Commands** (`/organization/commands`).
2. Search or filter by Supported / Needs attention / Not yet supported.
3. Select a Command — progressive sections (not a forced five-tab shell).
4. Organization settings: enable/disable and label when org-owned.
5. Where operators encounter it: toggle grouped org contexts Shown/Hidden.
6. Business Processes: see selection usage or empty state; link to Processes.
7. Safety: platform-owned confirmation and destructive class (not editable).
8. Legacy `/settings/actions` redirects here. Developer placement CRUD remains at `/adminV2/settings/actions`.

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
