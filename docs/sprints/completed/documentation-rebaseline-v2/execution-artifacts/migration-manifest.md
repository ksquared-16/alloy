---
owner: platform
status: sprint
last_reviewed: 2026-07-12
concept: documentation-rebaseline-v2
---

# Documentation Rebaseline V2 — Migration Manifest

**Wave:** 1 (frozen execution plan — no moves executed)  
**Grounded against:** `origin/staging` @ `f70730c167dd3dfe5a7c72ce40f71f5bc588d39c`  
**Source plans:** `docs/audits/documentation-migration-blueprint-2026-07.md` (verified + adjusted)

> This manifest is the **execution inventory** for Waves 2–8. Wave 1 does not execute structural moves.

---

## Repository inventory summary

| Area | .md files | Notes |
|------|-----------|-------|
| `docs/` total | 1,097 | Full tree |
| `docs/platform/` | ~137 | Canonical doctrine |
| `docs/system/` | 36 | Locked runtime implementation |
| `docs/sprints/` | ~441 | Execution history (+ 111 MB assets) |
| `docs/archive/` | 226 | Historical |
| `docs/archive/2026-06-handoff-packs/` | ~94 | 68% duplicate of live docs |
| `docs/audits/` | 21 | Point-in-time investigations |
| `docs/schema/` + `docs/api/` | 29 | Generated reference |
| Loose `docs/` root | 23 | 16 `canonical-*` + layout_v2 orphans |
| Root `README.md` | 1 | **Obsolete product framing** (home cleaning) |
| Co-located (`web/`, `sync/`, `backend/`) | ~21 | Dev runbooks — KEEP |

**Duplicate basenames (canonical scope):** 13 sets flagged by docs-lint  
**Broken internal links (canonical scope):** 621 (baselined)  
**Canonical→sprint dependencies:** 53 (report-only)

---

## Action legend

| Action | Meaning |
|--------|---------|
| KEEP | Stay at current path |
| EDIT | Content repair without move |
| MOVE | Relocate (Wave 2+) |
| RENAME | Path change only |
| MERGE | Combine content into survivor |
| ARCHIVE | Move to `docs/archive/` |
| DELETE | Remove after link sweep |
| GENERATE | Machine-produced output |
| BANNER | Add supersession/historical banner in place |
| REVIEW-GATE | Human doctrine decision before action |

---

## Tier 1 — `docs/` root orphans (23 files)

| Current path | Classification | Concept | Authority | Action | Target | Reconciliation |
|--------------|----------------|---------|-----------|--------|--------|----------------|
| `docs/README.md` | Navigation hub | Doc system index | Canonical | KEEP + EDIT | — | Add audit trio index; fix system/ framing |
| `platform/core/data/data-system.md` | Misfiled doctrine | Data System SSOT | Canonical (de facto) | MOVE+RENAME | `platform/core/data/data-system.md` | None |
| `platform/core/data/entity-specification.md` | Misfiled doctrine | Entity spec | Canonical | MOVE+RENAME + BANNER | `platform/core/data/entity-specification.md` | Banner current |
| `platform/core/data/relationship-model.md` | Misfiled doctrine | Relationships | Canonical | MOVE+RENAME | `platform/core/data/relationship-model.md` | None |
| `platform/core/data/field-catalog.md` | Generated doctrine | Field catalog | Generated | MOVE | `platform/core/data/field-catalog.md` | Generator: `web/scripts/generateCanonicalFieldCatalogDoc.ts` |
| `platform/core/data/field-system.md` | Misfiled doctrine | Field System | Canonical | MOVE+RENAME | `platform/core/data/field-system.md` | None |
| `platform/core/data/status-architecture.md` | Misfiled doctrine | Status architecture | Canonical | MOVE+RENAME + BANNER | `platform/core/data/status-architecture.md` | REVIEW-GATE vs Phase-5 |
| `platform/core/data/action-status-field-matrix.md` | Misfiled doctrine | Action/status matrix | Canonical | MOVE+RENAME | `platform/core/data/action-status-field-matrix.md` | None |
| `platform/core/data/configuration-data-alignment.md` | Misfiled doctrine | Config alignment | Canonical | MOVE+RENAME | `platform/core/data/configuration-data-alignment.md` | REVIEW-GATE |
| `platform/core/data/runtime-data-alignment.md` | Misfiled doctrine | Runtime alignment | Canonical | MOVE+RENAME | `platform/core/data/runtime-data-alignment.md` | REVIEW-GATE |
| `canonical-data-system-phase-1..7*.md` (7) | Sprint phases | Data system rollout | Sprint | MOVE | `sprints/completed/canonical-data-system/` | Historical |
| `canonical-data-system-audit.md` | Audit | Data system investigation | Historical | MOVE | `audits/archive/` | None |
| `layout_v2_*.md` (3) + `LAYOUT_CONFIG_V2_*` + `waitlist_*` (3) | Superseded sprint | Layout v2 | Historical | ARCHIVE | `archive/2026-06-layout-v2/` | None |

---

## Tier 2 — `docs/platform/` structural fixes

### Sprint leakage (must evict — Wave 3)

| Current path | Action | Target |
|--------------|--------|--------|
| `sprints/archive/06_2026/premium-operational-experience/` (6) | MOVE | `sprints/archive/06_2026/premium-operational-experience/` |
| `platform/operational-expansion-wave1-cursor-execution-packet.md` | MOVE | `sprints/archive/06_2026/operational-expansion/` |
| `platform/operational-expansion-wave1-implementation-spec.md` | MOVE | `sprints/archive/06_2026/operational-expansion/` |
| `platform/operational-expansion-phase1-architecture-rfc.md` | MOVE + REVIEW-GATE | `platform/rfcs/` (new) |

### Milestone consolidation (Wave 3)

| Current path | Action | Target |
|--------------|--------|--------|
| `platform/milestones/certification-july-2026.md` | MOVE | `platform/milestones/certification-july-2026.md` |
| `platform/milestones/freeze-july-2026.md` | MOVE | `platform/milestones/freeze-july-2026.md` |
| `platform/milestones/stabilization-july-2026.md` | KEEP+RENAME | `platform/milestones/stabilization-july-2026.md` |
| `platform/foundation/platform-manifesto.md` | KEEP | Stays in foundation (living constitution) |

### Duplicate / supersession (Wave 2–3)

| Current path | Action | Notes |
|--------------|--------|-------|
| `platform/foundation/capability-model-doctrine.md` | MOVE+RENAME | → `platform/foundation/capability-model-doctrine.md` (basename collision) |
| `platform/operator/universal-universal-card-archetypes.md` | MERGE | → `universal-universal-card-archetypes.md` |
| `platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` | ARCHIVE+BANNER | Superseded by `experience/presentation-runtime-v2.md` |
| `platform/operator/focus-panel-edit-information-doctrine.md` | BANNER | Superseded-by editing shipped |
| `platform/modules/operational-mutation-platform.md` | ARCHIVE | Superseded module |
| `platform/commercial/commercial-configuration.md` | ARCHIVE | Dup of `modules/commercial-configuration.md` |
| `platform/runtime/operational-runtime-topology.md` | ARCHIVE+BANNER | Superseded topology |

### Post-staging additions (not in July blueprint)

| Current path | Classification | Action |
|--------------|----------------|--------|
| `platform/operator/identity-surface-composition-v2.md` | Canonical operator | KEEP + REVIEW-GATE (v1 supersession) |
| `platform/operator/action-system.md` | Canonical operator | KEEP |
| `platform/operator/current-work-surface.md` | Canonical operator | KEEP |
| `platform/operator/actions-current-work-alignment.md` | Canonical operator | KEEP |
| `platform/experience/presentation-runtime-v2.md` | Canonical experience | KEEP (supersession survivor) |
| `platform/experience/presentation-runtime-v2-handoff.md` | Sprint closeout in canon | MOVE → `sprints/completed/presentation-runtime-v2/` |
| `platform/experience/presentation-runtime-v2-focus-panel-surface-composer-closeout.md` | Sprint closeout in canon | MOVE → `sprints/completed/presentation-runtime-v2/` |

### Remaining `platform/operator/*` (~52 files)

| Action | Notes |
|--------|-------|
| KEEP | Per blueprint §3.2; GENERATE `operator/README.md` version map in Wave 3 |

---

## Tier 3 — `docs/system/` (36 files)

| Group | Count | Action |
|-------|-------|--------|
| Locked runtime doctrines (adminv2, performance, work-unit, queue, drawer, BOS, routing, configuration, operating-plan, typography, workspace-atmosphere, legacy-inventory) | 20 | KEEP — reclassify as authoritative in README |
| Active planning (action-workspace-foundation, option-sets-system) | 2 | KEEP |
| Field model convergence | 1 | KEEP + BANNER cross-link to future `core/data/field-system.md` |
| True duplicates of `platform/` (entity-model, record-system, actions, navigation, workspace, api-contracts, roles) | 7 | ARCHIVE → `archive/2026-06-superseded-system/` |
| Reverted / audit | 3 | ARCHIVE or MOVE to audits |

---

## Tier 4 — Generated reference

| Path | Generator | Inputs | Deterministic | Freshness |
|------|-----------|--------|---------------|-----------|
| `docs/schema/*.md` (7) | `scripts/generate-schema-docs.mjs` | `docs/supabase/reference/*.csv` | Yes (CSV present) | **Stale** — missing post-`20260715` communications_identity tables |
| `docs/supabase/reference/*.csv` (8) | `npm run export:supabase-schema` | Live DB (`DATABASE_URL`) | No (needs DB) | **Blocked** without staging credentials |
| `docs/api/api-index.md` + inventory | `scripts/generate-api-inventory.mjs` | `web/app/api/**` routes | Yes | Regenerated Wave 1 |
| `docs/platform/core/data/field-catalog.md` | `web/scripts/generateCanonicalFieldCatalogDoc.ts` | Field registry code | Yes | Not regenerated Wave 1 (separate from schema) |

---

## Tier 5 — Duplicate / historical trees

| Tree | Files | Action | Wave |
|------|-------|--------|------|
| `docs/archive/2026-06-handoff-packs/` | ~94 | DELETE after extract ~18 unique | 6 |
| `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/` | 28 | ARCHIVE → `archive/2026-06-runtime-convergence/` | 6 |
| `docs/archive/2026-06-handoffs/handoffs/` | 3 | ARCHIVE | 6 |
| `docs/platform/governance/` (4) | 4 | MOVE → `platform/governance/` | 5 |
| `docs/core/` stubs | 2 | DELETE post-link-sweep | 5 |
| `docs/doctrine/` | 1 | MOVE → `system/` | 5 |
| `docs/execution/` | 2 | MERGE/ARCHIVE | 5 |

---

## Tier 6 — Audits (this initiative)

| Path | Status | Action |
|------|--------|--------|
| `audits/documentation-architecture-audit-2026-07.md` | Planning artifact | KEEP in audits; index as historical planning |
| `audits/documentation-migration-blueprint-2026-07.md` | Planning artifact | KEEP |
| `audits/documentation-initiative-handoff-2026-07.md` | Planning artifact | KEEP |
| `sprints/active/documentation-rebaseline-v2/current-staging-reconciliation.md` | Wave 1 execution | KEEP (this sprint) |
| `sprints/active/documentation-rebaseline-v2/migration-manifest.md` | Wave 1 execution | KEEP (this file) |

---

## Tier 7 — Non-`docs/` documentation

| Path | Action | Notes |
|------|--------|-------|
| `README.md` (repo root) | EDIT | Fix obsolete home-cleaning framing → platform OS for service businesses |
| `web/docs/TIMEZONE_SEMANTICS.md` | KEEP + REVIEW-GATE | Mirror to `platform/` in Wave 3 |
| `web/components/workspace/doctrine.ts` | KEEP + REVIEW-GATE | Code authority for visual tokens |
| `.cursor/rules/alloy-project-context.mdc` | GENERATE (Wave 7) | From README load order |
| `sync/README.md`, `backend/README_*`, `web/README_ADMIN_AUTH` | KEEP | Co-located dev docs |

---

## Tier 8 — CI / validation scripts

| Path | Action | Notes |
|------|--------|-------|
| `scripts/docs-lint.mjs` | KEEP (new Wave 1) | Documentation validator |
| `scripts/docs-lint-baseline.json` | KEEP | Pre-existing debt baseline |
| `.github/workflows/docs-lint.yml` | KEEP (new Wave 1) | Narrow-blocking CI |
| `web/tests/scripts/docsLint.test.ts` | KEEP | Fixture tests |

---

## Wave sequencing (frozen)

| Wave | Scope | Blueprint phase |
|------|-------|-----------------|
| **1 (this PR)** | Reconciliation, manifest, docs-lint, governance contract, truth repairs | Phase 0 partial |
| 2 | Banners + root README + promote `canonical-*` cluster | Phases 1–2 |
| 3 | Evict sprint leakage; milestones; merge card-archetypes | Phases 3–4 |
| 4 | Reclassify `system/`; fold `governance/` | Phase 5 |
| 5 | `export/` deletion; archive collapse | Phase 6 |
| 6 | Sprint normalization; asset eviction | Phase 7 |
| 7 | `.cursor` generation; gitignore test-results | Phase 8 |
| 8 | Flip docs-lint to full blocking; link sweep green | Phase 9 |

---

## Review-gate register

1. Phase-5 vs July status contract reconciliation
2. Sprint→doctrine promotion candidates
3. `TIMEZONE_SEMANTICS.md` canonical home
4. `doctrine.ts` vs docs visual token authority
5. `identity-surface-composition` v1 → v2 supersession
6. `navigation-runtime-doctrine` vs `surface-host-architecture`
7. `export/` retention policy (generator vs delete)
8. Sprint asset git-LFS vs delete-forward

---

## Inbound-link dependency note

**Mechanical moves must update inbound links in the same commit.** Highest fan-in paths before Wave 2:

- `docs/README.md` (navigation hub — 200+ outbound refs)
- `docs/platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` (supersession target)
- Loose `canonical-*` cluster (unindexed but referenced from sprint docs)

Use `node scripts/docs-lint.mjs --json` before/after each move wave to measure link delta.
