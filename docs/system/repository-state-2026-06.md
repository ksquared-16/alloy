# Repository state — June 2026

**Path:** `docs/system/repository-state-2026-06.md`  
**Status:** **Canonical snapshot** (2026-06-09 freeze). Developer handoff baseline before next audit/hardening sprint.  
**Not a roadmap** — describes what exists today.

---

## Executive summary

Alloy is a configurable operating system for service businesses (childcare first). The **operator workspace** is **process-first**: Organization → **Business Process** → **Stage** → **Record**. Work units remain internal execution hosts. **Admin/config** lives at `/admin`. **Legacy admin** remains at `/legacy-admin` for unmigrated modules.

Implementation runs on Next.js App Router (`web/`), Supabase (RLS, org-scoped), event/workflow side effects, and a converging **drawer VM + layout runtime** stack for CRM records.

---

## Current architecture

### Operator plane

| Layer | Implementation |
|-------|----------------|
| Landing | `/workspace` — lifecycle tiles, KPI strip |
| Execution | `/workspace/work-unit/:slug` — queues, filters, actions |
| Detail | Drawer on same route + `/:recordId` URL segment |
| Shell | `AdminV2Shell` — persistent sidebar, BOS bar, inbox warm deferred |

### Config plane

| Layer | Implementation |
|-------|----------------|
| Landing | `/admin` |
| Lifecycle builder | `/admin/settings/lifecycle` |
| Layouts / fields / actions | `/admin/settings/*` |
| Forms / workflows | `/admin/forms`, `/admin/workflows` |

### Data plane

- **Org-scoped** reads/writes (`org_id`)
- **Persons** + **customer_persons** for human identity
- **Opportunities** / enrollment pipeline as primary process entity
- **Work units** + **queues** as execution domains
- **Events/workflows** for meaningful side effects

---

## Major systems

| System | Doc entry | Maturity |
|--------|-----------|----------|
| Workspace / queues | `platform/operator/queue-system.md`, `platform/core/business-process-system.md` | Production — atomic reveal Pass 3 |
| CRM / enrollment pipeline | `product/crm-system.md` (supplemental) | Production — process hub configurable |
| Records / drawers | `record-system.md`, `drawer-doctrine.md` | Opp VM canonical; Person/Child transitional |
| Actions / workflows | `actions-and-workflows.md` | Production |
| Configuration | `configuration-system.md` | Production — `/admin/settings` |
| Routing | `routing-doctrine.md` | Phase G complete |
| Performance | `platform-performance-doctrine.md` | Passes 1–3 on staging |
| BOS / AI assist | `product/bos-foundation.md` | Foundation — human-in-the-loop |
| Communications | `communications-system.md` | Production — inbox deferred on WU entry |

---

## Known technical debt

| Item | Severity | Notes |
|------|----------|-------|
| Queue row API latency (~800ms–1s) | **High** | Backend optimization phase planned |
| Cold opportunity VM compose (~1s+) | **High** | Cache hit rate, compose diet |
| `AdminEntityDrawerLegacy` surface area | **Medium** | Per-entity VM cutover |
| Person/Child VM flags default OFF | **Medium** | Drawer completion sprint in flight |
| Dept/uuid workspace routes still mounted | **Low** | Compat; slug is product path |
| `/adminV2` filesystem vs `/admin` URL | **Low** | Rewrites stable; rename optional |
| Duplicate doctrine in sprint docs | **Low** | Consolidated in June freeze docs |
| `tsconfig.tsbuildinfo` in git status | **Low** | Should be gitignored if committed accidentally |

---

## Known cleanup items (priority order)

1. **Backend query/payload optimization** — queue row and VM compose hot paths (`adminv2_backend_query_payload_optimization_phase.md`)
2. **Person/Child drawer VM cutover** — default flags ON; delete legacy tab paths
3. **Legacy-admin module retirement** — migrate financials and remaining lists to `/admin`
4. **Dept route removal** — after slug bootstrap fully owns metadata path
5. **AdminEntityDrawerLegacy shrink** — entity-by-entity deletion
6. **Filesystem rename** `adminV2` → `admin` (optional; rewrites sufficient today)

---

## Performance status (June 2026)

| Pass | Status | Outcome |
|------|--------|---------|
| Pass 1 | **Shipped** (`86c70e01`) | Slug cache, legacy prefetch gate, perf traces |
| Pass 2 | **Shipped** (`0cf7c4a5`) | Entry prewarm, cold shell, Vercel perf relay |
| Pass 3 | **Shipped** (`0fcf5203`) | Atomic reveal, sidecar deferral, critical path diet |

**Remaining:** Server-side row/VM latency; not a reveal regression if gates hold.

**Debug:** `platform-performance-doctrine.md`, `__alloyPlatformPerf`, `[PLATFORM_PERF]` on Vercel.

---

## Next recommended audits

| Order | Audit | Why |
|-------|-------|-----|
| 1 | Drawer completion (Person/Child VM + layout) | Largest UX inconsistency vs Opportunity |
| 2 | Backend queue/VM payload | Dominates perceived latency post-Pass 3 |
| 3 | Legacy-admin retirement inventory | Reduce dual-admin maintenance |
| 4 | Status ownership / lifecycle grain | Active sprint docs in `06_2026/` |
| 5 | BOS action workspace | Shell exploration assets in sprint folder |
| 6 | Communications drawer parity | Background loader patterns |

---

## Developer load order (clone → understand)

1. `README.md`, **`docs/README.md`**
2. **`docs/platform/foundation/system-overview.md`**
3. **`docs/platform/governance/glossary.md`**
4. **`docs/platform/core/business-process-system.md`**
5. **`docs/platform/core/navigation-and-workspace-doctrine.md`**, **`docs/system/drawer-doctrine.md`**
6. **`docs/platform/operator/queue-system.md`**
7. **`docs/system/platform-performance-doctrine.md`**
8. **`docs/system/legacy-architecture-inventory.md`** (this file's companion)
9. Relevant **`docs/platform/modules/*`** or supplemental **`docs/product/*`** for task area
10. Sprint docs only when touching that sprint's scope

---

## Gaps discovered at freeze (documentation)

| Gap | Action taken |
|-----|--------------|
| Department-first hierarchy in core docs | Updated to business-process-first |
| No single routing doctrine | Created `routing-doctrine.md` |
| Performance split across sprints | Created `platform-performance-doctrine.md` |
| Drawer ownership scattered | Created `drawer-doctrine.md` index |
| No legacy classification | Created `legacy-architecture-inventory.md` |
| Person/Child VM default state unclear in glossary | Updated glossary |

**Remaining gaps (implementation, not doc):**

- Person drawer VM cutover completion
- Queue row server optimization
- Full legacy-admin migration list per module

---

## Related docs

All canonical doctrine files linked from **`docs/README.md`** and **`docs/platform/foundation/system-overview.md`**.
