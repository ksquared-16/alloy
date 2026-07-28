# Commands P7 — Organization Commands catalog foundation

Mission: `msn_188e8bea6fb6de28dd21`  
Worktree: Slot 1 Commands (`agent/cursor/1-commands-system-inventory`)  
Date: 2026-07-27

---

## Honesty correction (2026-07-28) — product-boundary

**Standalone Organization Commands configuration product is rejected.**

P7 foundation (catalog projection, detail API, route shell) is retained only as
**internal capability diagnostics**. Removed from ordinary Operations nav and from the
Organization Configuration domain grid. `/settings/actions` → `/adminV2/settings/actions`.

Evidence: `qa/missions/commands-product-boundary-correction-msn_188e8bea6fb6de28dd21.md`

---

## Outcome (historical — operator product later rejected)

Organization Commands product foundation (later boundary-corrected):

```text
Product name: Commands (operator product rejected 2026-07-28)
Live route: /organization/commands → internal diagnostics only
Product alias: /configuration/commands → /organization/commands
Action Buttons: /settings/actions → /adminV2/settings/actions (developer CRUD)
Operations nav: Automation → Processes → Surfaces (Commands removed)
```

No schema migration. No execution changes. No dual equal operator config products.

---

## Delivered

| Item | Location |
|------|----------|
| Catalog projection | `web/lib/platform/commands/organizationCommandCatalog.ts` |
| List + selected workspace | `web/components/adminV2/settings/commands/CommandsConfigurationPage.tsx` |
| Route page | `web/app/adminV2/settings/organization/commands/page.tsx` |
| Operations nav | `web/lib/adminV2/configurationModeNav.ts` |
| Org subpath alias | `web/lib/admin/canonicalAdminRoutes.ts` |
| Rewrite + redirects | `web/next.config.ts` |

---

## Honesty

- Catalog is Capability Registry projection — Commands are not invented.
- Status labels: Available / Limited / Unavailable (operator language).
- Authorization note: availability ≠ permission.
- Legacy Action definitions page retained at `/adminV2/settings/actions` for developers only.

---

## Deferred to P8

- Org enable/disable overlays on `action_definitions`
- Variants presentation from metadata
- Process usage lookup (which BPs select each Command)
- Placement/availability contexts absorbed from Action Buttons
- Destructive policy presentation from Capability Registry
- Search/filter/grouping polish + screenshots walkthrough

---

## Tests

```text
vitest: organizationCommandCatalog.test.ts + organizationCommandsRoute.test.ts + processCommandSetAuthoring.test.ts
→ 15 passed
```

---

## Honesty correction (2026-07-28)

P7 delivered route + sidebar entry. **It did not register Commands on the `/organization`
domain grid** (`organizationConfigurationDomains`). Operator product integration completed in
corrective commit — see
`qa/missions/commands-ui-product-integration-correction-msn_188e8bea6fb6de28dd21.md`.

---

## Checkpoint

```text
Slice: P7 foundation
Commit: (pending commit)
Tests: 15 passed (organizationCommandCatalog + organizationCommandsRoute + processCommandSetAuthoring)
Typecheck: pass (tsc -p tsconfig.build.json)
Behavior change: Commands product shell + Operations nav + Action Buttons redirect
Compatibility retained: /adminV2/settings/actions developer path; action_definitions storage unchanged
Next slice: P8 product completion
```
