# Host-resource certification blocker — 2026-08-04

## Status
Browser certification of the restored coherent Assignment offer card did **not** complete.
Product model is unchanged (HEAD `63fdb7ee2`). No PR opened.

## Observed failure mode
- Next on port 3016 reaches root `200`, can prewarm `/workspace/work-unit/new-leads` when alone.
- Process then goes stale / dies before or during Playwright under machine contention.
- Concurrent Next on slot 4 (3014) holds the other `heavy-next-dev` permit.
- Free RAM frequently drops to a few thousand 16KB pages when multiple Next instances run.

## Captured at last stop
- Port 3016: stopped
- Permits: released (`heavy-next-dev`, `browser-certification`)
- Competing: wt4 Next on 3014 + exclusive-certification-db
- Stalled route pattern: work-unit Focus Panel cold compile / post-prewarm death before matrix paint
- Before evidence (five-section) still at: `archive-before-five-section/`
- After offer screenshots: not captured

## Resume condition
Run when **no other Next** holds `heavy-next-dev`, free memory is comfortable, then one atomic start→prewarm→Playwright with `ALLOY_AUTH_SLOT=slot3`.
