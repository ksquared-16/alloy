---
owner: platform
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Documentation Rebaseline V2 Certification

**Date:** July 2026  
**Status:** Complete on local branch `chore/documentation-rebaseline-v2` — **not yet promoted to staging**

## Result

Alloy documentation architecture has been structurally rebaselined locally:

- **One canonical tree** (`docs/platform/`) with data-contract layer at `core/data/`
- **One locked runtime tier** (`docs/system/`) with explicit README
- **Lifecycle sprint structure** (`active/`, `completed/`, `archive/`)
- **Normalized audits** (`audits/active/`, `audits/archive/`)
- **Single archive** for superseded material (`docs/archive/`)
- **Export tree removed** after unique content extraction
- **Governance consolidated** under `platform/governance/`
- **Machine validation** via `scripts/docs-lint.mjs`

## Key metrics

| Metric | Before (Wave 1) | After (local) |
|--------|----------------:|--------------:|
| Invalid `docs/` root placement | 22 | **0** |
| Broken links (all) | 621 | 794* |
| Canonical-scope broken links | ~96 | **74** |
| Missing governed frontmatter | 134 | 126 |

\*Total broken links include historical sprint/archive internal refs; canonical tree reduced but archive migration exposed legacy sprint cross-refs.

## Promotion

This certification documents local completion only. **One consolidated PR** to `staging` is the authorized promotion path when explicitly approved.

Full execution record: `docs/sprints/completed/documentation-rebaseline-v2/00-closeout.md`
