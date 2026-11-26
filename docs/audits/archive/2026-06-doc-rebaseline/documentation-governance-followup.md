# Documentation governance follow-up

**Date:** 2026-06-12  
**Branch:** `staging`  
**Commit message:** `docs: align agent rules with platform documentation baseline`

---

## Summary

Aligned Cursor rules, development guardrails, and active transitional docs with the June 2026 platform documentation rebaseline. Removed CRM/enrollment/work-unit-first framing from agent rules. Schema not regenerated from live staging (no credentials in shell).

**Prior commits on this branch:**

| Commit | Message |
|--------|---------|
| `63795a44` | `docs: rebaseline platform documentation around Business Process System` |
| `fcd482d7` | `docs: follow-up link sweep and Cursor load-order update` |
| `6b47a61d` | `docs: add agent repo boundary governance` |

---

## Cursor rules updated

### `.cursor/rules/alloy-project-context.mdc`

- Load order replaced with canonical 16-step list (foundation → core → operator → modules → governance → schema)
- **Canonical framing** section added:
  - Configurable business operations platform
  - Business Process → Stage → Record
  - Work units as implementation detail
  - Childcare/enrollment as supplemental domain
  - Placement priority as generalized cohort-ranking concept
- Explicit ban on CRM-first, enrollment-first, work-unit-first, childcare-only agent framing
- Supplemental vs transitional doc paths clarified

### `.cursor/rules/alloy-development-guardrails.mdc`

- Before-editing doc paths → `docs/platform/governance/design-and-operational-doctrine.md` and `docs/platform/**`
- Behavior-change updates → `docs/platform/**` or `docs/platform/governance/**`

### `.cursor/rules/adminv2-runtime-performance.mdc`

- **Unchanged** — correctly references locked `docs/system/adminv2-runtime-performance-doctrine.md` (protected infrastructure)

### `.cursor/rules/repo-boundry.mdc`

- **Unchanged** — links to `docs/platform/governance/agent-repo-boundaries.md`

---

## Stale links fixed (active / transitional)

| File | Change |
|------|--------|
| `docs/archive/2026-06-superseded-system/actions-and-workflows.md` | Canonical module pointer; glossary → platform |
| `docs/execution/roadmap-and-gaps.md` | Fold-into targets → platform entity-model + glossary |
| `docs/execution/operating-doctrine.md` | Canonical governance pointers; load order → README + cursor rules |
| `docs/audits/person-vs-contact-audit.md` | Related docs → platform paths |
| `docs/platform/governance/glossary.md` | Placement priority defined as generalized concept |
| `docs/platform/foundation/system-overview.md` | Maturity line de-enrollmentized |
| `docs/platform/foundation/platform-capabilities.md` | Placement priority row generalized |
| `docs/README.md` | Load order aligned with agent rules; governance table reordered |
| `docs/platform/governance/agent-repo-boundaries.md` | Related → cursor rules load order |

**Not swept:** `docs/archive/**`, `docs/archive/2026-06-handoff-packs/**`, month sprint folders (intentional).

---

## Old framing removed

| Location | Removed / replaced |
|----------|-------------------|
| Cursor project context | CRM/enrollment/work-unit-first as platform identity |
| Platform system-overview | Waitlist-specific customer-readiness gate |
| Platform capabilities | "Placement priority (waitlist)" label → generalized placement priority |
| Agent rules | Implicit lifecycle/work-unit operator spine |

**Retained (supplemental / accurate):** enrollment and waitlist references in `docs/product/crm-system.md`, sprint closeouts, and roadmap in-progress rows where they describe vertical work — not platform identity.

---

## Agent governance check

| File | Status |
|------|--------|
| `.cursor/rules/alloy-project-context.mdc` | Updated |
| `.cursor/rules/alloy-development-guardrails.mdc` | Updated |
| `.cursor/rules/repo-boundry.mdc` | OK |
| `CLAUDE.md` | Not present in repo |
| `AGENTS.md` | Not present in repo |
| `docs/README.md` | Updated |
| `docs/platform/governance/agent-repo-boundaries.md` | Updated related links |

---

## Schema refresh status

| Step | Status |
|------|--------|
| Live staging export (`npm run export:supabase-schema`) | **Not run** — no `DATABASE_URL` in shell |
| `npm run generate:schema-docs` | **Not re-run** this pass (no CSV change) |

**Remaining follow-up:** export from staging when credentials approved, then commit CSV + regenerated `docs/schema/*.md`.

---

## Remaining transitional docs

These retain expanded detail; canonical pointer at top where updated:

| Transitional path | Canonical replacement |
|-------------------|----------------------|
| `docs/platform/foundation/system-overview.md` | `docs/platform/foundation/system-overview.md` |
| `docs/platform/governance/glossary.md` | `docs/platform/governance/glossary.md` |
| `docs/archive/2026-06-superseded-system/entity-model.md` | `docs/platform/core/entity-model.md` |
| `docs/archive/2026-06-superseded-system/record-system.md` | `docs/platform/core/record-system.md` |
| `docs/archive/2026-06-superseded-system/workspace-system.md` | `docs/platform/core/business-process-system.md` + `queue-system.md` |
| `docs/archive/2026-06-superseded-system/actions-and-workflows.md` | `docs/platform/modules/actions-and-workflows.md` |
| `docs/execution/operating-doctrine.md` | `documentation-governance.md` + `design-and-operational-doctrine.md` |
| `docs/execution/roadmap-and-gaps.md` | `product-roadmap.md` + `platform-capabilities.md` |
| `docs/product/crm-system.md` | Supplemental vertical — not canonical |

Locked runtime (stay in `docs/system/`): `adminv2-runtime-performance-doctrine.md`, `queue-record-doctrine.md`, `work-unit-layout-doctrine.md`, drawer contracts, routing detail.

---

## Validation

```text
grep CRM-first|enrollment-first|work-unit-first in .cursor/rules → no matches
grep docs/core/system-overview in docs/platform → no matches
grep docs/core/system-overview in docs/execution, docs/audits (active) → updated
Runtime files changed → none
```

---

## Recommended next cleanup

1. Staging schema export + commit when credentials available
2. Header pointers on remaining `docs/system/*.md` (configuration, drawer, communications modules)
3. Fold `operating-doctrine.md` deployment sections into platform governance; trim transitional file
4. Sprint/export pack link sweep (low priority — not in agent load path)
5. Root `README.md` still describes legacy home-cleaning vertical — separate onboarding pass

---

## Related

- `documentation-audit.md` — initial rebaseline audit
- `documentation-followup-closeout.md` — first follow-up pass
- `documentation-closeout-report.md` — rebaseline closeout
