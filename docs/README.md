# Alloy documentation

**Purpose:** Authoritative navigation for engineers, implementers, and AI agents. Prefer these files over chat memory or archived sprint material.

**June 2026 rebaseline:** Canonical platform docs live under **`docs/platform/`**. Schema reference under **`docs/schema/`** (generated). Business Process → Stage → Record is the operator mental model; work units are documented as runtime constructs.

For behavior-changing work, include **`docs/platform/governance/design-and-operational-doctrine.md`** in context.

---

## What Alloy is

A configurable operating system for service businesses. Primary documentation is **industry-agnostic**; childcare enrollment appears as a reference implementation in supplemental docs.

Start here: **`platform/foundation/system-overview.md`**

---

## Load order (onboarding)

**Agent load order (Cursor / AI):** matches **`.cursor/rules/alloy-project-context.mdc`** — start at `docs/README.md`, then foundation → core → operator → modules → governance → schema.

### 1. Foundation

1. `platform/foundation/system-overview.md`
2. `platform/foundation/platform-capabilities.md`
3. `platform/foundation/product-roadmap.md`
4. `platform/foundation/architecture.md`
5. `platform/governance/glossary.md`

### 2. Core platform

6. `platform/core/business-process-system.md` — **operator model: Business Process → Stage → Record**
7. `platform/core/entity-model.md`
8. `platform/core/placement-system.md` — **School → Program → Room; lead vs child authority**
9. `platform/core/navigation-and-workspace-doctrine.md`
10. `platform/core/record-system.md`
11. `platform/core/status-and-state-system.md`

### 3. Operator experience

11. `platform/operator/queue-system.md`
12. `platform/operator/drawer-system.md`
13. `platform/operator/experience-builder-doctrine.md` — LayoutDoc, builder, queue v3, actions/widgets
14. `platform/operator/business-process-layout-assignments.md` — BP stage layout routing

### 4. Platform modules (load when touching area)

| Module | Doc |
|--------|-----|
| Documents & forms | `platform/modules/documents-and-forms.md` |
| Communications | `platform/modules/communications-platform.md` |
| Actions & workflows | `platform/modules/actions-and-workflows.md` |
| Configuration | `platform/modules/configuration-platform.md` |
| AI / BOS | `platform/modules/ai-platform.md` |
| Operational intelligence | `platform/modules/operational-intelligence-platform.md` |

### 5. Governance & standards

| Topic | Doc |
|-------|-----|
| Design & operational doctrine | `platform/governance/design-and-operational-doctrine.md` |
| Documentation rules | `platform/governance/documentation-governance.md` |
| Agent repo boundaries | `governance/agent-repo-boundaries.md` |
| API contracts | `platform/governance/api-contracts.md` |
| Roles & permissions | `platform/governance/roles-and-permissions.md` |
| Implementation patterns | `platform/governance/implementation-patterns.md` |
| Deployment | `platform/governance/deployment-and-environments.md` |
| Testing | `platform/governance/testing-and-quality.md` |

### 6. Roadmap & history

- `platform/foundation/product-roadmap.md` (also in §1)
- `platform/foundation/release-history.md`

### 7. Schema (when touching DB / RLS / triggers)

1. `schema/schema-tables.md`
2. `schema/schema-columns.md`
3. `schema/schema-constraints.md`
4. `schema/schema-indexes.md`
5. `schema/schema-functions.md`
6. `schema/schema-triggers.md`
7. `schema/schema-policies-and-security.md`

**Regenerate:**

```bash
DATABASE_URL=... npm run export:supabase-schema
node scripts/generate-schema-docs.mjs
```

CSV source: `supabase/reference/*.csv` (8 files)

---

## Locked runtime doctrines (do not duplicate)

| Topic | Doc |
|-------|-----|
| AdminV2 reveal / performance gates | `system/adminv2-runtime-performance-doctrine.md` |
| Platform performance passes | `system/platform-performance-doctrine.md` |
| Work unit page layout (V3) | `system/work-unit-layout-doctrine.md` |
| Queue record row layout | `system/queue-record-doctrine.md` |
| BOS visual identity | `system/bos-identity-doctrine.md` |
| Routing detail | `system/routing-doctrine.md` |
| Drawer VM contracts | `system/drawer-doctrine.md`, `drawer-operating-model-v1.md`, `drawer-view-model-runtime-contract.md` |
| Operating Plan runtime | `system/operating-plan-runtime-doctrine.md` |
| Legacy inventory | `system/legacy-architecture-inventory.md` |

---

## Supplemental (vertical / expanded reference)

| Doc | Use |
|-----|-----|
| `product/crm-system.md` | Enrollment pipeline grain detail (childcare) |
| `product/billing-and-financials.md` | Billing maturity |
| `system/*` (remaining) | Transitional expanded references — prefer `platform/` |
| `core/system-overview.md` | Redirect — see platform foundation |
| `execution/roadmap-and-gaps.md` | Transitional detailed gap list |

---

## Sprints, audits, archive

| Location | Purpose |
|----------|---------|
| `sprints/active/` | In-flight initiatives (index) |
| `sprints/completed/` | Shipped closeout index |
| `sprints/archive/` | Historical sprint artifacts |
| `sprints/05_2026/`, `06_2026/` | **Transitional paths** — migrating to active/completed/archive |
| `audits/` | Point-in-time investigations |
| `archive/` | Superseded docs — not current truth |
| `export/` | Portable handoff packs |

**Agent development:** [`governance/agent-repo-boundaries.md`](governance/agent-repo-boundaries.md) — Cursor vs Claude repo separation, branching, merge flow

**Rebaseline audit:** `audits/documentation-audit.md`  
**Governance follow-up:** `audits/documentation-governance-followup.md`  
**Closeout:** `audits/documentation-closeout-report.md`

---

## Active initiatives (June 2026)

See `sprints/active/README.md` and `platform/foundation/product-roadmap.md`.

**Experience Builder / unified actions (shipped to staging):** layout library + BP assignment, queue v3 composer, relationship action framework, OCM-first enrollment status, Create Lead lifecycle binding, New Leads legacy alias compatibility. Backlog status: `backlog/experience-builder-framework-backlog.md`.

---

## When this README must be updated

Canonical path changes, new frozen doctrine files, consolidation moves, or schema regeneration workflow changes.
