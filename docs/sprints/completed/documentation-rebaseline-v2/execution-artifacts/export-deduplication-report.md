---
owner: platform
status: sprint
last_reviewed: 2026-07-12
concept: documentation-rebaseline-v2
---

# Export Deduplication Report — Documentation Rebaseline V2

**Analysis date:** 2026-07-12  
**Tree removed:** `docs/archive/2026-06-handoff-packs/` (94 markdown files + 2 zip archives)

## Summary

| Category | Count | Action |
|----------|------:|--------|
| Byte-identical duplicates | 77 | **Deleted** — live owner retained |
| Stale forks | 15 | **Deleted** — live or archived owner retained |
| Genuinely unique | 2 | **Preserved** → `docs/archive/2026-06-handoff-packs/forms-handoff-pack/` |
| ZIP archives | 2 | **Deleted** — duplicated directory contents |

## Unique content preserved

| Export file | Archive destination |
|-------------|---------------------|
| `forms-handoff-pack/CODE-ENTRY-POINTS.md` | `archive/2026-06-handoff-packs/forms-handoff-pack/CODE-ENTRY-POINTS.md` |
| `forms-handoff-pack/SCHEMA-AND-MIGRATIONS.md` | `archive/2026-06-handoff-packs/forms-handoff-pack/SCHEMA-AND-MIGRATIONS.md` |

## Stale fork survivors (live owners)

| Export basename | Surviving owner |
|-----------------|-----------------|
| `api-contracts.md` | `platform/governance/api-contracts.md` |
| `entity-model.md` | `platform/core/entity-model.md` |
| `glossary.md` | `platform/governance/glossary.md` |
| `actions-and-workflows.md` | `platform/modules/actions-and-workflows.md` |
| `documents-and-forms.md` | `platform/modules/documents-and-forms.md` |
| `configuration-system.md` | `system/configuration-system.md` |
| `crm-system.md` | `product/crm-system.md` |
| `communications.md` | `archive/2026-06-product/communications.md` (archived stub) |
| `navigation-doctrine.md` | `archive/2026-06-superseded-system/navigation-doctrine.md` |
| `roadmap-and-gaps.md` | `archive/2026-06-execution/roadmap-and-gaps.md` |

## Deletion decision

**Approved:** Remove entire `docs/archive/2026-06-handoff-packs/` after unique extraction. Offline portability packs can be regenerated from `docs/README.md` load order + `npm run docs:lint` green canonical tree.

Raw analysis: `export-analysis.json` (this sprint folder).
