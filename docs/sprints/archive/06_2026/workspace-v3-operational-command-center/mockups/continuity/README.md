# Continuity mockup references (System 5)

All continuity visuals anchor on **live baselines** captured from today's product.  
Do not use retired assets (`01-current-work-unit-enrollment.png`, pre–System 5 screenshots).

## Current-state references

| File | Surface |
|------|---------|
| [`../baseline/01-workspace-current-system5.png`](../baseline/01-workspace-current-system5.png) | Workspace — org pulse, Operational Pulse, Enrollment tile |
| [`../baseline/02-work-unit-system5-context.png`](../baseline/02-work-unit-system5-context.png) | Work Unit — `adminv2-os-context` at entry |
| [`../baseline/03-work-unit-queue-system5.png`](../baseline/03-work-unit-queue-system5.png) | Queue — compressed header |
| [`../baseline/04-work-unit-focus-panel-split-system5.png`](../baseline/04-work-unit-focus-panel-split-system5.png) | Split State 2 — queue + Focus Panel |
| [`../baseline/05-focus-panel-universal-cards-system5.png`](../baseline/05-focus-panel-universal-cards-system5.png) | Universal Cards detail |

## Evolution targets (spec only — no greenfield layouts)

Future annotated composites should **crop and annotate** the baselines above — never invent new chrome.

See [`sprint-4-ux-continuity.md`](../../sprint-4-ux-continuity.md) §5 for the cover-page evolution spec.

## Re-capture

```bash
cd web && npx playwright test workspace-work-unit-continuity-baseline.spec.ts --project=chromium
```

Requires dev server on `:3000` with `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1`.
