# Documentation closeout report

**Date:** 2026-06-12  
**Initiative:** Alloy Documentation Consolidation & Platform Rebaseline  
**Type:** Documentation only — no product/runtime changes

---

## Summary

Documentation reorganized around **Business Process → Stage → Record** operator mental model. Work units documented as **implementation construct** inside the Business Process System. Generated schema layer added from Supabase CSV exports. Platform capability inventory, roadmap, and release history created as operational maturity docs.

---

## Documents created

### Schema layer (`docs/schema/`)

| File | Source |
|------|--------|
| `schema-tables.md` | Generated from CSV + domain groupings |
| `schema-columns.md` | Generated |
| `schema-constraints.md` | Generated |
| `schema-indexes.md` | Generated |
| `schema-functions.md` | Generated |
| `schema-triggers.md` | Generated |
| `schema-policies-and-security.md` | Generated |

Generator: `scripts/generate-schema-docs.mjs`

### Platform layer (`docs/platform/`)

**Foundation:** `system-overview.md`, `architecture.md`, `product-roadmap.md`, `release-history.md`, `platform-capabilities.md`

**Core:** `entity-model.md`, `navigation-and-workspace-doctrine.md`, `record-system.md`, **`business-process-system.md`**, `status-and-state-system.md`

**Operator:** `queue-system.md`, `drawer-system.md`

**Modules:** `documents-and-forms.md`, `communications-platform.md`, `actions-and-workflows.md`, `configuration-platform.md`, `ai-platform.md`

**Governance:** `api-contracts.md`, `roles-and-permissions.md`, `design-and-operational-doctrine.md`, `glossary.md`, `implementation-patterns.md`, `deployment-and-environments.md`, `testing-and-quality.md`, `documentation-governance.md`

### Audits & navigation

| File | Purpose |
|------|---------|
| `docs/audits/documentation-audit.md` | Phase 1 audit |
| `docs/audits/documentation-closeout-report.md` | This report |
| `docs/README.md` | Phase 8 navigation hub (updated) |

### Sprint structure

| Path | Purpose |
|------|---------|
| `docs/sprints/active/README.md` | Active initiative index |
| `docs/sprints/completed/README.md` | Closeout index |
| `docs/sprints/archive/README.md` | Archive migration rules |

---

## Documents merged (conceptually)

| From | Into |
|------|------|
| `workspace-system.md` (operator model) | `business-process-system.md` + `queue-system.md` |
| `navigation-doctrine` + routing + workspace landing | `navigation-and-workspace-doctrine.md` |
| `roadmap-and-gaps.md` (timeline) | `product-roadmap.md` + `platform-capabilities.md` |
| `operating-doctrine.md` (doc rules) | `documentation-governance.md` + `design-and-operational-doctrine.md` |
| Multiple product/system module docs | `docs/platform/modules/*` |

Old files **retained as transitional expanded references** — not deleted in this pass.

---

## Documents archived (recommended)

| Path | Action |
|------|--------|
| Sprint superseded cards | Already in `docs/archive/sprints-superseded/` |
| `docs/platform_convergence/` | Recommend archive after milestone extraction |
| Month sprint folders | Phased move to `sprints/archive/` (not executed — link sweep first) |

---

## Key reframing

| Before (primary docs) | After |
|-----------------------|-------|
| Work Unit System | **Business Process System** |
| Lifecycle → Work Unit → Record | **Business Process → Stage → Record** |
| Work unit as operator noun | Work unit as **runtime construct** (section in business-process-system.md) |

Internal code/API paths (`lifecycle-*`, `work_units` table) unchanged — documentation only.

---

## Doctrine freeze applied

Documented as **decisions** (not debates):

- Business Process operator language (shipped V1)
- Single enrollment execution work unit with multi-queue stages
- Queue preview boundary
- AdminV2 reveal gates
- BOS human-in-the-loop

**Not frozen** (roadmap only): status ownership expansion, Person/Child VM default ON, Comms V2.

---

## Remaining gaps

1. Internal link sweep (`docs/system/*` → `docs/platform/*`)
2. Update `.cursor/rules/alloy-project-context.mdc` load order
3. Demote `product/crm-system.md` to supplemental in all indexes
4. Physical sprint file migration to `active/` / `completed/` / `archive/`
5. `docs/core/glossary.md` full merge into platform glossary
6. Regenerate schema CSVs from latest staging when `DATABASE_URL` available

---

## Recommended supplemental documentation

- Vertical implementer guide: enrollment pipeline (childcare)
- Waitlist configuration & ranking operations
- Tour scheduling operator setup
- Legacy admin retirement checklist

---

## Validation

- [x] Documentation audit produced
- [x] Canonical structure created (32 platform + schema docs)
- [x] Schema docs generated from existing CSV exports
- [x] Platform capability inventory
- [x] Roadmap & release history
- [x] Sprint folder structure + READMEs
- [x] Documentation README updated
- [x] Closeout report
- [ ] Full repo link sweep (follow-up)
- [ ] Cursor rules update (follow-up)

---

## Suggested commit message

```
docs: rebaseline platform documentation around Business Process System

Reframe operator model as Process → Stage → Record; document work units
as implementation detail. Add generated schema layer, platform capabilities,
roadmap, release history, and documentation governance.
```
