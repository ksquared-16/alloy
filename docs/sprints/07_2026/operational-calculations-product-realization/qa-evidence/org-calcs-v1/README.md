# Organization Calculations V1 — QA evidence

Authenticated Slot 4 QA against `http://127.0.0.1:3014` (storage-state: slot4).

## API ledger

`api-qa-ledger.json` proves:

Create draft → Evaluate → Publish v1 → Bind → Fork → Publish v2 → exact-version bind stays on v1 → Rebind v2 → invalid room → Archive → Restore

## Screenshots

| File | Surface |
| --- | --- |
| 01-domain-home.png | Domain home |
| 02–05-new-wizard-*.png | Guided new calculation steps |
| 06-selected-overview.png | Selected workspace Overview |
| 07-definition.png | Definition |
| 08-test-result.png | Test (missing capacity messaging) |
| 09-versions.png | Versions |
| 10-usage.png | Usage |
| 11-lifecycle.png | Lifecycle |
| 12-narrow-layout.png | Narrow / mobile |

## Scripts

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3014 node scripts/org-calcs-v1-api-qa.mjs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3014 node scripts/org-calcs-v1-ui-screenshots.mjs
```
