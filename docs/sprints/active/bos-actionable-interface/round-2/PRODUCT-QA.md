---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# Round 2 — Product realization evidence

## Automated

```bash
cd web && npm run test -- tests/bos/commandSession
```

Protected Round 1 suites remain green where unchanged.

## Focused scenarios (product bar)

| # | Scenario | Coverage |
|---|---|---|
| 1 | Turn-based lifecycle | reducer + gather UX + controller |
| 2 | Slash → Create Lead | `queryBosSlashCatalog` + shell wiring |
| 3 | Mode switch silent | reducer asserts no `mode_switch` |
| 4 | Effective Form fields | `effectiveCreateLeadIntakeSpec` + controller |
| 5 | Unsupported Form guidance | parse coverage + host form guidance |
| 6 | Pinned compact layout | `commandSessionLayout` |
| 7 | Discard vs rail Close | host chrome test |

Live authenticated screenshots: product-owner on `:3012` after stable `alloy-dev-start`.

## Pause confirmation

Round 2 ends here. Do not start Processing Conversation Runtime in this branch without a new sprint charter.
