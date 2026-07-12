---
owner: platform
status: sprint
last_reviewed: 2026-07-12
concept: documentation-rebaseline-v2
---

# Asset Cleanup Report — Documentation Rebaseline V2

**Scope:** Forward-looking cleanup only — no git history rewrite.

## Removed from branch (tracked)

| Path | Reason |
|------|--------|
| `PRE_COMMIT_SHIP_CHECK.md` | One-off scratch (May 2026) |
| `web/test-results/*` (2 files) | Generated Playwright output — already in `.gitignore` |
| `docs/export/` (entire tree, 94 md + 2 zip) | Duplicate handoff packs after unique extraction |

## Retained reference assets

| Area | Approx size | Notes |
|------|-------------|-------|
| `docs/sprints/archive/` | ~115 MB | Sprint QA screenshots, HTML mockups — **retained** (LFS migration deferred) |
| `web/docs/` PDF/PNG dev references | unchanged | Co-located developer references |

## Working-tree size impact

- **Export removal:** ~2.3 MB markdown + 580 KB zips removed from working tree
- **Test-results:** negligible
- **Sprint assets:** not removed in this pass (requires separate LFS/history authorization)

## External preservation

No external backup required for removed export duplicates (live owners verified). Unique forms-handoff content preserved in `archive/2026-06-handoff-packs/`.

## Follow-up (requires authorization)

- git-LFS migration for 495+ tracked PNG/HTML in `sprints/archive/`
- History rewrite for repository size reduction
