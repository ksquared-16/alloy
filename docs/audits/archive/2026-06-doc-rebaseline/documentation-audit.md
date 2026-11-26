# Documentation audit

**Date:** 2026-06-12  
**Scope:** Full `docs/` tree — active, sprints, audits, archive, export  
**Objective:** Rebaseline canonical platform documentation; reframe Work Units as implementation detail of Business Process System.

---

## Executive summary

Alloy documentation grew through sprint-driven accumulation (614 markdown files). The **June 2026 freeze** (`repository-state-2026-06.md`, navigation/drawer/performance doctrines) provides a stable base, but:

1. **Operator mental model drift** — docs still emphasize Lifecycle → Work Unit → Record; product shipped **Business Process → Stage → Record**.
2. **Duplicate doctrine** — navigation, workspace, queue, and drawer rules spread across `system/`, `product/`, and sprint closeouts.
3. **Schema truth split** — CSV exports exist; no generated human-readable schema layer until this rebaseline.
4. **Sprint sprawl** — 279+ sprint files with nested `completed/`, month folders, and superseded cards in archive.
5. **Industry framing in platform layer** — `crm-system.md`, enrollment-heavy `workspace-system.md` headings.

**Resolution:** New canonical tree under `docs/platform/` + `docs/schema/`. Old active topic files become **transitional expanded references** until link sweep completes.

---

## Doctrine freeze assessment

| Topic | Frozen? | Notes |
|-------|---------|-------|
| Navigation spine (process-first) | **Yes** | June 2026; reframe labels to Business Process |
| Routing / slug paths | **Yes** | Phase G complete |
| Drawer VM / reveal | **Yes** | Locked performance doctrine |
| BOS identity + human-in-the-loop | **Yes** | Expansion paused |
| Business Process operator language | **Yes** | V1 sprint shipped 2026-06-10 |
| Work unit layout V3 | **Yes** | Closeout frozen |
| Case vs child status grain | **Yes** | May convergence closeout |
| Status ownership expansion | **No** | Active sprint — stay in roadmap |
| Person/Child VM cutover | **No** | Implementation in flight |
| Comms V2 | **No** | Design/planning — not canonical |

**Policy applied:** Frozen decisions captured in `docs/platform/`; open work referenced from roadmap only.

---

## Duplicate / conflicting doctrines

| Conflict | Locations | Resolution |
|----------|-----------|------------|
| Operator hierarchy wording | `system-overview`, `navigation-doctrine`, `workspace-system`, `repository-state` | **Merge** → `platform/core/business-process-system.md` + updated `system-overview` |
| Queue truth boundary | `record-system`, `workspace-system`, `queue-record-doctrine`, sprint closeouts | **Merge** → `platform/operator/queue-system.md` + `platform/core/record-system.md` |
| Drawer ownership | `drawer-doctrine`, `drawer-operating-model-v1`, `drawer-view-model-runtime-contract`, audits | **Keep** detail docs; **index** → `platform/operator/drawer-system.md` |
| Performance / reveal | `platform-performance`, `adminv2-runtime-performance`, sprint closeouts | **Keep** locked files in `system/`; link from governance |
| Configuration four-plane | `configuration-system`, `settings-v2-doctrine`, sprint parity | **Merge** index → `platform/modules/configuration-platform.md` |
| CRM vs platform | `product/crm-system.md` vs workspace docs | **Demote** CRM doc to supplemental enrollment reference |

---

## Major document disposition

### Schema layer

| Document | Action | Target |
|----------|--------|--------|
| `docs/supabase/reference/*.csv` | **Keep** | Source of truth — regenerate only |
| *(none existed)* | **Create** | `docs/schema/schema-*.md` (7 files, generated) |

### Platform — Foundation

| Document | Action | Target |
|----------|--------|--------|
| `docs/platform/foundation/system-overview.md` | **Rewrite** | `docs/platform/foundation/system-overview.md` + stub pointer in core |
| *(none)* | **Create** | `architecture.md`, `release-history.md`, `platform-capabilities.md` |
| `docs/execution/roadmap-and-gaps.md` | **Merge** | `product-roadmap.md` (canonical); keep execution copy as transitional |
| `docs/system/repository-state-2026-06.md` | **Keep** | Point-in-time snapshot — link from architecture |

### Platform — Core

| Document | Action | Target |
|----------|--------|--------|
| `docs/archive/2026-06-superseded-system/entity-model.md` | **Merge** | `platform/core/entity-model.md` (canonical summary) |
| `docs/archive/2026-06-superseded-system/navigation-doctrine.md` + `routing-doctrine.md` + workspace landing | **Merge** | `navigation-and-workspace-doctrine.md` |
| `docs/archive/2026-06-superseded-system/record-system.md` | **Merge** | `platform/core/record-system.md` |
| `docs/archive/2026-06-superseded-system/workspace-system.md` | **Rewrite/Merge** | `business-process-system.md` + `queue-system.md`; archive enrollment-only sections to supplemental |
| *(none)* | **Create** | `status-and-state-system.md` |

### Platform — Operator

| Document | Action | Target |
|----------|--------|--------|
| `docs/system/queue-record-doctrine.md` | **Keep** | Linked from `queue-system.md` (locked) |
| `docs/system/drawer-doctrine.md` + contracts | **Merge index** | `drawer-system.md` |

### Platform — Modules

| Document | Action | Target |
|----------|--------|--------|
| `docs/product/documents-and-forms.md` | **Rewrite** | `modules/documents-and-forms.md` |
| `docs/product/communications.md` | **Rewrite** | `modules/communications-platform.md` |
| `docs/archive/2026-06-superseded-system/actions-and-workflows.md` | **Rewrite** | `modules/actions-and-workflows.md` |
| `docs/system/configuration-system.md` | **Rewrite** | `modules/configuration-platform.md` |
| `docs/product/bos-foundation.md` + `ai-system.md` | **Merge** | `modules/ai-platform.md` |
| `docs/product/crm-system.md` | **Archive → supplemental** | Keep file; demote in README load order |
| `docs/product/billing-and-financials.md` | **Keep supplemental** | Not platform core |

### Platform — Governance

| Document | Action | Target |
|----------|--------|--------|
| `docs/archive/2026-06-superseded-system/api-contracts.md` | **Merge** | `governance/api-contracts.md` |
| `docs/archive/2026-06-superseded-system/roles-and-permissions.md` | **Merge** | `governance/roles-and-permissions.md` |
| `docs/execution/operating-doctrine.md` | **Merge** | `design-and-operational-doctrine.md` + `documentation-governance.md` |
| `docs/platform/governance/glossary.md` | **Rewrite** | `governance/glossary.md` |
| *(none)* | **Create** | `implementation-patterns.md`, `deployment-and-environments.md`, `testing-and-quality.md` |

### Locked runtime (keep in place)

| Document | Action |
|----------|--------|
| `adminv2-runtime-performance-doctrine.md` | **Keep** — cursor rule dependency |
| `work-unit-layout-doctrine.md` | **Keep** — implementation detail |
| `work-unit-surface-context-contract.md` | **Keep** |
| `bos-identity-doctrine.md` | **Keep** |
| `platform-performance-doctrine.md` | **Keep** |
| `routing-doctrine.md` | **Keep** detail; canonical summary in navigation doc |
| `legacy-architecture-inventory.md` | **Keep** |

### Sprints (~279 files)

| Pattern | Action |
|---------|--------|
| `*/completed/*closeout*.md` | **Summarize** → release-history; **move index** to `sprints/completed/` |
| Active `06_2026/*.md` (non-closeout) | **Keep** in `sprints/active/` index |
| `future/` | **Move** to `sprints/archive/future/` |
| `05_2026/later-phase/` | **Keep** as planned work references |
| Intermediate audits in sprints | **Archive** → `docs/archive/sprints-superseded/` (many already there) |
| `.txt` sprint dumps | **Archive** after capability summarized |

### Audits (13 active)

| Document | Action |
|----------|--------|
| `supabase-schema-alignment-audit.md` | **Keep** — link from schema policies doc |
| Runtime/drawer audits | **Keep** until findings closed |
| Event/workflow audits | **Keep** — verification debt |

### Archive / export

| Location | Action |
|----------|--------|
| `docs/archive/2026-05-02-docs-reset/` | **Keep** |
| `docs/archive/2026-06-freeze/` | **Keep** |
| `docs/archive/sprints-superseded/` | **Keep** |
| `docs/archive/2026-06-handoff-packs/*-handoff-pack/` | **Keep** supplemental |

---

## Outdated references to remove over time

- "Lifecycle → Work Unit → Record" as **primary** hierarchy in active docs
- Work Unit System as top-level doc topic
- `communications-system.md` typo reference in repository-state (file is `communications.md`)
- Sprint docs duplicated as doctrine (performance closeout vs adminv2-runtime-performance-doctrine)

---

## Sprint consolidation plan

| Folder | Rule |
|--------|------|
| `sprints/active/` | One doc per in-flight objective; index only |
| `sprints/completed/` | Closeout summaries + pointer to archived detail |
| `sprints/archive/` | Month folders (`05_2026/`, `06_2026/`) migrate here in phased link sweep |

**Phase 1 (this rebaseline):** Create folder READMEs + index; do not mass-move files (link breakage).

---

## Archive recommendations

| Path | Reason |
|------|--------|
| `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/` | Historical cutover plans — merge milestones to release-history |
| Duplicate glossary in archive | Already superseded |
| Sprint intermediate performance cards | Already in `sprints-superseded` |
| Orphan `.txt` sprint exports | After capability extraction |

---

## Remaining gaps

1. **Full link sweep** — update internal links from `docs/system/*` to `docs/platform/*`
2. **CRM supplemental doc** — rename/reframe `crm-system.md` → enrollment pipeline supplement
3. **Status ownership** — canonical doc after sprint freezes
4. **OpenAPI** — optional future; representative API doc exists
5. **Industry implementation guides** — separate pack under `docs/supplemental/` (not created yet)
6. **Cursor rules** — update load order paths in `.cursor/rules/alloy-project-context.mdc`

---

## Recommended supplemental documentation (future)

- Enrollment pipeline implementer guide (childcare vertical)
- Waitlist operator guide
- Tour scheduling configuration guide
- Migration guide: lifecycle API → business process language

---

## Sign-off

This audit supports the June 2026 documentation rebaseline. Canonical navigation: **`docs/README.md`**.
