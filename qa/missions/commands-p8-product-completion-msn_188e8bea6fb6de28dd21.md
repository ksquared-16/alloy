# Commands P8 — Product completion

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-27

---

## Honesty correction (2026-07-28) — product-boundary

**Standalone Organization Commands configuration product is rejected.**

Architecture (Capability Registry, Runtime, adapters, `command_set_v1`, safety, telemetry) remains.
`/organization/commands` is **internal capability diagnostics only** — removed from Organization
Configuration domain grid and ordinary Operations navigation. Sequence: Automation → Processes → Surfaces.
`/settings/actions` → developer Action Buttons CRUD.

Evidence: `qa/missions/commands-product-boundary-correction-msn_188e8bea6fb6de28dd21.md`

---

## Honesty correction (2026-07-28) — product realization (superseded for operator product)

Route + catalog foundation was real, but the first product shell was a **registry/placement inspector**.
That operator product is now rejected at the product boundary (see above), not merely polished.

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

## Administrator note (post product-boundary)

Do **not** use `/organization/commands` as organization configuration. Use Business Processes for
`command_set_v1`, Surfaces for exposure, Automation for invocation, and `/adminV2/settings/actions`
for developer placement CRUD.

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
