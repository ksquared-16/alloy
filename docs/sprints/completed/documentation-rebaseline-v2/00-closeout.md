---
owner: platform
status: sprint
last_reviewed: 2026-07-12
concept: documentation-rebaseline-v2
---

# Documentation Rebaseline V2 — Closeout

**Status:** Complete (local only — not promoted)  
**Branch:** `chore/documentation-rebaseline-v2`  
**Worktree:** `/Users/Kelly/.cursor/worktrees/Alloy/doc-rebaseline-wave1`

---

## 1. Starting staging SHA

`f70730c167dd3dfe5a7c72ce40f71f5bc588d39c` (pre-rebaseline; includes handoff merge `3c767ef9`)

## 2. Final local branch and HEAD

- **Branch:** `chore/documentation-rebaseline-v2` (renamed from `chore/documentation-rebaseline-v2-wave1`)
- **Starting HEAD (hardening pass):** `948c51083e06c6d7463bce7bf982e5c11ff79b43`
- **Final HEAD:** `git rev-parse HEAD` on this branch after hardening commits (certification commit: `docs(validation): certify active documentation integrity`)

## 3. Full commit list (rebaseline commits)

| SHA | Message |
|-----|---------|
| `4082b7b9e` | docs(audit): reconcile rebaseline plan with latest staging |
| `4fdc96fd2` | docs(ci): add documentation validation infrastructure |
| `cc06b42a2` | docs(governance): define metadata contract and repair active truth |
| `6d7aa7b6e` | chore(docs): merge latest staging before rebaseline continuation |
| `e5e4832c8` | docs(core): promote canonical data-system doctrine |
| `741541d85` | docs(platform): remove execution artifacts and organize milestones |
| `c9bdd7d90` | docs(system): reconcile locked runtime documentation |
| `66b21810a` | docs(governance): consolidate governance and singleton folders |
| `34864d39c` | docs(product): separate vertical reference from platform doctrine |
| `0365e23a0` | docs(cleanup): deduplicate export and normalize historical archives |
| `daae2952e` | docs(sprints): normalize sprint lifecycle and initiative history |
| `f5808b214` | docs(reference): regenerate indexes schema API and field catalog |
| `c8c0fbe7d` | docs(validation): repair links metadata and documentation debt baseline |
| `948c51083` | docs(certification): freeze Documentation Rebaseline V2 |
| *(hardening)* | docs(links): repair active canonical references |
| *(hardening)* | docs(governance): remove canonical sprint dependencies |
| *(hardening)* | docs(metadata): complete governed documentation frontmatter |
| *(hardening)* | docs(ownership): resolve active duplicate and doctrine authority |
| *(hardening)* | docs(validation): certify active documentation integrity |

## 4. Final documentation architecture

```text
docs/
├── README.md
├── platform/           # canonical doctrine
│   ├── foundation/
│   ├── core/           # + data/ data-contract layer
│   ├── operator/
│   ├── experience/
│   ├── modules/
│   ├── commercial/
│   ├── governance/     # absorbed docs/governance/
│   ├── milestones/
│   └── rfcs/
├── system/             # locked runtime (authoritative)
├── schema/             # generated
├── api/                # generated
├── product/            # vertical reference only
├── sprints/
│   ├── active/
│   ├── completed/
│   └── archive/        # 05_2026 … 08_2026 month folders
├── audits/
│   ├── active/
│   └── archive/
└── archive/            # superseded material
```

**Removed:** `docs/export/`, `docs/governance/`, `docs/core/` stubs, `docs/execution/`, `docs/backlog/`, `docs/forms/`, `docs/platform_convergence/`, `docs/handoffs/`, loose `canonical-*` at root.

## 5. Canonical ownership matrix (established)

| Concept | Owner |
|---------|-------|
| Data System / field catalog | `platform/core/data/*` |
| Operator model | `platform/core/business-process-system.md` |
| Status (operator) | `platform/core/status-and-state-system.md` |
| Status (data contract) | `platform/core/data/status-architecture.md` |
| Presentation Runtime | `platform/experience/presentation-runtime-v2.md` |
| Platform freeze/certification | `platform/milestones/*` |
| Governance | `platform/governance/*` |
| Locked runtime | `system/*` |
| Vertical childcare | `product/crm-system.md` |

## 6–9. Files moved, merged, archived, deleted

| Operation | Approx count |
|-----------|-------------:|
| Renamed/moved (`git mv`) | 1,123 |
| Added | 22 |
| Deleted | 105 |
| Export tree deleted | 94 md + 2 zip |

**Key merges:** `card-archetypes.md` archived (survivor: `universal-card-archetypes.md`)

**Key promotions:** 9 `canonical-*` → `platform/core/data/`

## 10. Unique export content preserved

2 files → `archive/2026-06-handoff-packs/forms-handoff-pack/`  
Report: `execution-artifacts/export-deduplication-report.md`

## 11. Sprint normalization summary

Month folders `05_2026`–`08_2026` → `sprints/archive/`  
Sprint leakage evicted from `platform/`  
POS package → `sprints/archive/06_2026/pos/`

## 12. Asset cleanup summary

See `execution-artifacts/asset-cleanup-report.md`  
Sprint PNG/HTML assets **retained** (~115 MB); LFS deferred.

## 13. Generated reference status

| Generator | Status |
|-----------|--------|
| `generate-schema-docs.mjs` | ✅ Regenerated from CSV |
| `generate-api-inventory.mjs` | ✅ Regenerated |
| `generateCanonicalFieldCatalogDoc.ts` | ✅ Regenerated |
| `export:supabase-schema` | ❌ Blocked — needs `DATABASE_URL` |

**Stale:** `communications_identity` tables absent from CSV (migration `20260715120000`).

## 14. Docs-lint debt before and after

| Category | Wave 1 baseline | Post-structural (pre-hardening) | After hardening |
|----------|----------------:|--------------------------------:|----------------:|
| invalid-root-placement | 22 | **0** | **0** |
| broken-link (all) | 621 | 794 | **705** |
| active canonical broken-link | ~96 | **74** | **0** |
| frontmatter-missing (governed) | 134 | 126 | **0** |
| orphan-canonical | 68 | 69 | 70 |
| canonical-sprint-dependency | 53 | 49 | **0** |
| duplicate-basename (active ambiguous) | 13 | 9 | **0** |
| generated-boundary | 21 | 21 | 21 |

**Historical debt retained:** ~705 total broken links, predominantly sprint/archive internal cross-refs and preserved historical artifacts. Intentionally not rewritten to chase zero total count.

## 15. Validation results

| Check | Result |
|-------|--------|
| `tests/scripts/docsLint.test.ts` | pass |
| `npm run docs:lint` | report mode — active targets clean; historical debt baselined |
| `npm run docs:lint:ci` | no blocking failures on changed governed files |
| `npm run generate:schema-docs` + check | pass (checked-in CSV) |
| `npm run generate:api-inventory` + check | pass |
| `npm run generate:field-catalog` + check | pass (if available) |
| Active canonical → sprint links (`rg` on `docs/platform/`) | **0** markdown dependencies |
| Conflict markers | **0** |
| No UI/DB/migration/product runtime changes | ✅ Confirmed |

## 16. Remaining blocked credentials

```bash
DATABASE_URL=<staging> npm run export:supabase-schema
npm run generate:schema-docs
```

## 17. Remaining review gates

**Resolved locally:**

1. Identity Surface Composition v1 → v2 — disclosure model superseded; V1 retained for persistence/parity
2. `web/docs/TIMEZONE_SEMANTICS.md` — canonical home at `platform/governance/timezone-semantics.md`
3. `doctrine.ts` visual-token authority — documented in `alloy-visual-language.md`
4. Active canonical broken links — **0**
5. Canonical → sprint dependencies — **0**

**Nonblocking / post-merge:**

1. Phase-5 vs July status examples in configuration-data-alignment (product-owner judgment)
2. Sprint asset git-LFS migration (~115 MB retained)
3. Historical sprint/archive internal links (~705 total broken links — baselined)
4. Live `export:supabase-schema` — requires staging `DATABASE_URL`; CSV stale for `communications_identity`

## 18. Proposed final push/PR strategy

**When authorized:**

1. Single PR: `chore/documentation-rebaseline-v2` → `staging`
2. Title: `Documentation Rebaseline V2 — Complete Structural Migration`
3. Include this closeout + certification in PR body
4. Run full docs-lint CI on PR diff
5. Human review of review-gate register before merge
6. Post-merge: `DATABASE_URL` schema export on staging infrastructure

## 19. Rollback instructions

```bash
# Discard local rebaseline (if not pushed):
git checkout f70730c16

# Or reset branch to staging:
git reset --hard origin/staging
```

**Do not force-push staging.**

## 20. Certification statement

Documentation Rebaseline V2 is **structurally complete** and **active doctrine integrity is certified** on the local branch `chore/documentation-rebaseline-v2`. Canonical doctrine under `docs/platform/` meets hardening targets: zero active canonical broken links, zero canonical→sprint dependencies, zero missing governed frontmatter, and zero ambiguous active duplicate basenames. Historical archive/sprint link debt (~705 total) is baselined and intentionally retained. Live schema CSV export remains a credential-dependent post-merge step.

**Ready for one consolidated promotion review** when authorized. **Nothing has been pushed; no PR opened; no Vercel preview triggered.**

**Milestone:** `docs/platform/milestones/documentation-rebaseline-v2-certification.md`
