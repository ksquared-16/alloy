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
- **HEAD:** *(see `git rev-parse HEAD` at promotion time)*

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
| *(final)* | docs(certification): freeze Documentation Rebaseline V2 |

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

| Category | Wave 1 baseline | Final local |
|----------|----------------:|------------:|
| invalid-root-placement | 22 | **0** |
| broken-link | 621 | 794 |
| frontmatter-missing | 134 | 126 |
| orphan-canonical | 68 | 69 |
| canonical-sprint-dependency | 53 | 49 |
| duplicate-basename | 13 | 9 |
| generated-boundary | 21 | 21 |

**Canonical-scope broken links:** ~74 (mostly web/lib cross-refs and commercial links).

## 15. Validation results

| Check | Result |
|-------|--------|
| `tests/scripts/docsLint.test.ts` | 7/7 passed |
| `npm run docs:lint` | Report mode — debt baselined |
| No UI/DB/migration/product changes | ✅ Confirmed |

## 16. Remaining blocked credentials

```bash
DATABASE_URL=<staging> npm run export:supabase-schema
npm run generate:schema-docs
```

## 17. Remaining review gates

1. Phase-5 vs July status examples in configuration-data-alignment
2. Identity Surface Composition v1 → v2 supersession banner
3. `web/docs/TIMEZONE_SEMANTICS.md` canonical home
4. `web/components/workspace/doctrine.ts` visual-token authority
5. Sprint asset git-LFS migration
6. ~74 canonical-scope broken links (web/lib README paths, commercial cross-refs)
7. Historical sprint internal links (~700 in archive — intentionally baselined)

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

Documentation Rebaseline V2 is **structurally complete on the local branch**. Canonical doctrine is organized under `docs/platform/` with a promoted data-contract layer, execution artifacts evicted, export duplicates removed, sprint lifecycle normalized, and machine validation in place. Residual debt is documented, baselined, and scoped to historical archives or explicit review gates. **Ready for one consolidated promotion review** when authorized.

**Milestone:** `docs/platform/milestones/documentation-rebaseline-v2-certification.md`
