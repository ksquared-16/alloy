# Future Room Capacity — QA evidence

## API ledger

`api-qa-ledger.json` — authenticated create → observe (2 rooms/dates) → cross-org reject → publish v2 keeps v1 bind → rebind v2 → history.

Observations in this environment returned `not_available` when room capacity inputs are unset (honest; never zero).

## Screenshots

| File | Capture |
|------|---------|
| `01-oi-home.png` | OI workspace + Add measurement |
| `02-add-source-chooser.png` | Source chooser (Organization calculation only) |
| `03-add-wizard.png` | Org-calc wizard |
| `04-narrow-layout.png` | Narrow viewport |
| `06-org-calc-panel.png` | Optional when a row is already active |

## Defects noted

- Slot 4 Next process is intermittently unstable under high swap pressure; prefer `127.0.0.1:3014` over `localhost` when flakes appear.
- UI collection rows render only after the OIP settings snapshot finishes loading.
