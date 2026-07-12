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
| Historical / archive broken links | ⚠️ **634** total — legitimate historical debt only (see § Broken-link classification) |
| Live schema CSV export | ⚠️ Credential-dependent — see § Generated reference |
| Nonblocking review gates | See closeout §17 |

**Verdict:** **Ready for promotion** — active documentation integrity is clean; remaining debt exists only in preserved historical records.

**Not performed:** push, PR, merge, or Vercel preview.

---

## Active documentation integrity

**Active documentation integrity is clean.**

Remaining documentation debt exists only within preserved historical sprint, archive, audit, and implementation-history documents. These references are intentionally retained as historical records and are **excluded from promotion gating**.

### Broken-link classification (certification gate)

| Category | Remaining |
|----------|----------:|
| Active Canonical | **0** |
| Active System | **0** |
| Active Product | **0** |
| Generated (`docs/schema/`, `docs/api/`) | **0** |
| Documentation Indexes (`docs/README.md`, sprint indexes) | **0** |
| Sprint History (`docs/sprints/archive/`, internal cross-refs) | **373** |
| Archive (`docs/archive/`, non-implementation) | **93** |
| Audits | **0** |
| Historical Closeout | **0** |
| Historical Implementation Notes | **168** |
| **Total** | **634** |

**Certification gate actions:** 71 low-value navigation-index links repaired (post-migration path corrections only). No sprint execution history rewritten. No archive implementation notes altered.

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
| Broken links (all) | 621 → 794* | **705** → **634**† |
| Active canonical-scope broken links | ~96 → **74** | **0** |
| Canonical → sprint dependencies | 53 → **49** | **0** |
| Missing governed frontmatter | 134 → **126** | **0** |
| Ambiguous active duplicate basenames | 13 → **9** | **0** |
| Orphan canonical | 68 → 69 | 70 |
| Generated boundary | 21 | 21 |

\*Archive migration exposed legacy sprint cross-refs; total count is not a promotion blocker.

†Certification gate: 71 navigation-index links repaired; **634** remaining links classified as historical debt only (see § Broken-link classification).

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

## Validation (hardening + certification gate)

```bash
cd web && npm run test -- tests/scripts/docsLint.test.ts   # pass
npm run docs:lint                                          # report mode — 634 historical broken links
npm run docs:lint:ci                                       # no blocking failures on changed files
npm run docs:lint:baseline                                # broken-link: 634
```

Full execution record: `docs/sprints/completed/documentation-rebaseline-v2/00-closeout.md`
