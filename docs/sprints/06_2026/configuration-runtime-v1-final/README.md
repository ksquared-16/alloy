# Configuration Runtime V1 — Final

**Status:** Frozen — Configuration Runtime V1 complete. Next sprint: **Surfaces**.

## Delivered

1. **Frozen shell widths** — Section Queue 260px, Object Queue 320px, Workspace flex
2. **Locations** — Context → Queue → Workspace → BOS
3. **Settings index** — compact context row (no hero card)
4. **Doctrine** — ownership and interaction model frozen

## Screenshots

Captured by `web/playwright/tests/configuration-runtime-v1-final.spec.ts`:

| File | Surface |
|------|---------|
| `01-settings-index.png` | Compact `/settings` index |
| `02-processes.png` | Processes |
| `03-fields.png` | Fields |
| `04-statuses.png` | Statuses |
| `05-access.png` | Access |
| `06-communications.png` | Communications |
| `07-locations.png` | Locations |
| `08-full-bos.png` | Full page with BOS |

## Doctrine

- `docs/system/configuration-runtime-v1.md` — **Frozen**
- `docs/system/configuration-mode-doctrine.md`
- `docs/system/configuration-ownership-doctrine.md`

## Next sprint

**Surfaces** — presentation authoring. Route `/settings/layouts` may remain for compatibility; product language is Surfaces.
