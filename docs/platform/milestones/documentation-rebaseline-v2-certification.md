---
owner: platform
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Documentation Rebaseline V2 Certification

**Date:** July 2026  
**Branch:** `chore/documentation-rebaseline-v2` (local only)  
**HEAD at certification:** same as closeout §2 (`git rev-parse HEAD`)

## Promotion readiness

| Gate | Status |
|------|--------|
| Structural migration | ✅ Complete |
| Active canonical link integrity | ✅ **0** broken links from `docs/README.md`, `docs/platform/**`, authoritative `docs/system/**` |
| Canonical → sprint dependencies | ✅ **0** |
| Governed frontmatter (platform/system/product) | ✅ **0** missing |
| Ambiguous active duplicate basenames | ✅ **0** (tier `README.md` indexes excluded) |
| Historical / archive broken links | ⚠️ Retained and baselined (**705** total repo-wide) |
| Live schema CSV export | ⚠️ Credential-dependent — see § Generated reference |
| Nonblocking review gates | See closeout §17 |

**Verdict:** **Ready for one consolidated promotion review** — active doctrine integrity targets met; historical debt explicitly baselined; live schema export remains a post-merge operational step.

**Not performed:** push, PR, merge, or Vercel preview.

---

## Structural result

Alloy documentation architecture has been rebaselined locally:

- **One canonical tree** (`docs/platform/`) with data-contract layer at `core/data/`
- **One locked runtime tier** (`docs/system/`) with explicit README
- **Lifecycle sprint structure** (`active/`, `completed/`, `archive/`)
- **Normalized audits** (`audits/active/`, `audits/archive/`)
- **Single archive** for superseded material (`docs/archive/`)
- **Export tree removed** after unique content extraction
- **Governance consolidated** under `platform/governance/`
- **Machine validation** via `scripts/docs-lint.mjs`

## Debt metrics (before → after hardening)

| Metric | Wave 1 / pre-hardening | After hardening (local) |
|--------|----------------------:|------------------------:|
| Invalid `docs/` root placement | 22 | **0** |
| Broken links (all) | 621 → 794* | **705** |
| Active canonical-scope broken links | ~96 → **74** | **0** |
| Canonical → sprint dependencies | 53 → **49** | **0** |
| Missing governed frontmatter | 134 → **126** | **0** |
| Ambiguous active duplicate basenames | 13 → **9** | **0** |
| Orphan canonical | 68 → 69 | 70 |
| Generated boundary | 21 | 21 |

\*Archive migration exposed legacy sprint cross-refs; total count is not a promotion blocker.

## Review gates resolved (local)

| Gate | Resolution |
|------|------------|
| Identity v1 → v2 supersession | V2 supersedes **disclosure model**; V1 retained for persistence/parity baseline with explicit boundary banner |
| Timezone semantics canonical home | `docs/platform/governance/timezone-semantics.md`; `web/docs/TIMEZONE_SEMANTICS.md` is thin pointer |
| `doctrine.ts` visual-token authority | Documented in `alloy-visual-language.md` § Executable token authority |
| Schema CSV freshness | Checked-in schema docs regenerated from checked-in CSV; CSV stale for `communications_identity` (migration `20260715120000`); live export requires staging `DATABASE_URL` |

## Generated reference honesty

| Generator | Status |
|-----------|--------|
| `generate-schema-docs.mjs` | ✅ Regenerated from checked-in CSV |
| `generate-api-inventory.mjs` | ✅ Regenerated |
| `generateCanonicalFieldCatalogDoc.ts` | ✅ Regenerated |
| `export:supabase-schema` | ❌ Blocked without `DATABASE_URL` — accepted post-merge prerequisite |

## Validation (hardening pass)

```bash
cd web && npm run test -- tests/scripts/docsLint.test.ts   # pass
npm run docs:lint                                          # report mode
npm run docs:lint:ci                                       # no blocking failures on changed files
npm run generate:schema-docs && npm run check:schema-docs  # from checked-in CSV
npm run generate:api-inventory && npm run check:api-inventory
```

Full execution record: `docs/sprints/completed/documentation-rebaseline-v2/00-closeout.md`
