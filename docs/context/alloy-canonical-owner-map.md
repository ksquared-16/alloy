---
title: Alloy canonical owner map
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Canonical owner map — one concern, one owner

**Purpose.** For every major platform concern, name the single document that owns it, the documents
that may be cited beside it, the code that outranks both, and what makes the record stale.

**The rule this enforces:** *no concept has two equal default owners.* Where two documents describe
the same concern, one is the owner and the other is a reference — and the reference must not be
loaded as authority. Duplicated authority is how the two foundation documents came to disagree about
Alloy's own configuration URLs while both were marked canonical.

Companion documents: [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md) (the model),
[`alloy-inference-contract.md`](alloy-inference-contract.md) (what may be inferred),
[`alloy-context-packages.md`](alloy-context-packages.md) (what to load),
[`alloy-benchmark-context.md`](alloy-benchmark-context.md) (per-domain certification).

---

## 1. Owner map

`Certified` is the domain certification that covers the concern. `Higher authority` is the code or
artifact that wins when it disagrees with the prose — in every row, without exception.

| Concern | Canonical owner | Reference owners (never authority) | Higher authority | Certified |
|---|---|---|---|---|
| Business process, stage, lifecycle | [`../platform/core/business-process-system.md`](../platform/core/business-process-system.md) | [`../platform/modules/business-process-execution-platform.md`](../platform/modules/business-process-execution-platform.md), [`../platform/core/stage-membership-and-outcomes.md`](../platform/core/stage-membership-and-outcomes.md) | `web/app/api/admin/opportunities/[id]/route.ts` allow-list | Business Process |
| Governed status and disposition | [`../platform/core/status-and-state-system.md`](../platform/core/status-and-state-system.md) | [`../platform/core/data/action-status-field-matrix.md`](../platform/core/data/action-status-field-matrix.md) | `status_definitions` rows; CHECK constraints | Business Process |
| Effective-dated operational truth | [`../platform/core/effective-dated-assignment-doctrine.md`](../platform/core/effective-dated-assignment-doctrine.md) | [`../platform/core/operations-temporal-truth-certification.md`](../platform/core/operations-temporal-truth-certification.md) | `apply_participation_operational_change`; the partial unique indexes and overlap trigger | Operations temporal truth |
| Placement lifecycle | [`../platform/core/placement-system.md`](../platform/core/placement-system.md) | the doctrine above (for the temporal half only) | `web/lib/childcareOperational/childPlacementService.ts` | Enrollment / Placement |
| Staff coverage and staffing projection | [`../platform/governance/staff-coverage-authority.md`](../platform/governance/staff-coverage-authority.md) | [`../platform/governance/time-aware-staffing-projection.md`](../platform/governance/time-aware-staffing-projection.md), [`../platform/governance/assignment-time-authority.md`](../platform/governance/assignment-time-authority.md), [`../platform/governance/assignments-authority-model-debt.md`](../platform/governance/assignments-authority-model-debt.md) | `schedule_assignments` with `subject_type='staff'` | Staff / Scheduling |
| Attendance observation | [`../platform/modules/attendance-system.md`](../platform/modules/attendance-system.md) | — | `record_child_attendance_event`; `web/app/kiosk/**` | Attendance |
| Identity, roles, capability authorization | [`../platform/governance/roles-and-permissions.md`](../platform/governance/roles-and-permissions.md) | [`../platform/governance/authentication-and-session-model.md`](../platform/governance/authentication-and-session-model.md) | `scripts/routeCapabilities.declared.json`; RLS policies | Identity / Access |
| Tenant isolation (RLS) | [`../platform/governance/roles-and-permissions.md`](../platform/governance/roles-and-permissions.md) | [`../platform/governance/rls-authority-model-director-gate.md`](../platform/governance/rls-authority-model-director-gate.md) | the policies themselves; a grant with no admitting policy denies | Identity / Access |
| Person and entity identity | [`../platform/core/entity-model.md`](../platform/core/entity-model.md) | [`../platform/core/record-system.md`](../platform/core/record-system.md) | `persons`, `customer_persons` | Business Process |
| Record detail resolution | [`../platform/core/record-system.md`](../platform/core/record-system.md) | [`../platform/operator/queue-system.md`](../platform/operator/queue-system.md) | resolver-backed entity GET | Runtime |
| Work views, queues, projections | [`../platform/core/work-view-membership-and-navigation.md`](../platform/core/work-view-membership-and-navigation.md) | [`../platform/operator/queue-system.md`](../platform/operator/queue-system.md), [`../platform/operator/current-work-surface.md`](../platform/operator/current-work-surface.md) | the projection queries | Runtime |
| Configuration lifecycles and publication | [`../platform/governance/configuration-publication-model.md`](../platform/governance/configuration-publication-model.md) | [`../platform/modules/configuration-platform.md`](../platform/modules/configuration-platform.md) | `entity_layouts` append-only; the Programs publication chain | Configuration |
| **Product URLs, rewrites, redirects** | [`../system/routing-doctrine.md`](../system/routing-doctrine.md) | — **not** [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md), which must link out rather than restate | `web/lib/admin/canonicalAdminRoutes.ts`; `web/next.config.ts` | (platform spine) |
| Foundational runtimes and architecture | [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md) | [`../platform/runtime/alloy-runtime-kernel.md`](../platform/runtime/alloy-runtime-kernel.md), [`../platform/runtime/runtime-realization-architecture.md`](../platform/runtime/runtime-realization-architecture.md) | the runtime source under `web/lib/presentation/**` | Runtime |
| Operational Intelligence | **certification record:** §0 of [`../platform/core/operational-calculations.md`](../platform/core/operational-calculations.md); **domain narrative:** [`../platform/modules/operational-intelligence-platform.md`](../platform/modules/operational-intelligence-platform.md) (`last_reviewed` 2026-07-28 — it does **not** carry the record) | [`../platform/analytics/metric-platform-doctrine.md`](../platform/analytics/metric-platform-doctrine.md) | the registered metric keys | Operational Intelligence |
| AI reasoning and the Trust boundary | [`../platform/trust/reasoning-runtime.md`](../platform/trust/reasoning-runtime.md) | — | `web/lib/ai/trust/openAiCompatibleProviderAdapter.ts`; `web/lib/ai/aiEnrichmentEnv.ts` | AI / BOS |
| Communications intent vs transport | [`../platform/modules/communications-platform.md`](../platform/modules/communications-platform.md) | — | the canonical enqueue path and provider webhooks | Communications |
| Subsidy | §0.1 of [`../platform/modules/financials-canonical-authorities.md`](../platform/modules/financials-canonical-authorities.md) | — | the ten `fin.subsidy` commands | Subsidy — **no declaration token**; certified in the manifest prose only |
| Commercial catalog, rates, policies | [`../platform/modules/commercial-configuration.md`](../platform/modules/commercial-configuration.md) | — | the catalog tables and their RLS | Commercial |
| **Financials / Payments** | [`../platform/modules/financials-canonical-authorities.md`](../platform/modules/financials-canonical-authorities.md) | — | `web/lib/financials/**` | **NOT CERTIFIED** |
| External API contract | [`../api/api-architecture.md`](../api/api-architecture.md) | [`../api/README.md`](../api/README.md), [`../api/developer-platform/external/alloy-developer-platform-specification.md`](../api/developer-platform/external/alloy-developer-platform-specification.md) | `web/app/api/v1/**`; [`../api/openapi/alloy-public-api.v1.json`](../api/openapi/alloy-public-api.v1.json) | Developer Platform / API |
| Internal API envelope | [`../api/api-response-contract.md`](../api/api-response-contract.md) | — | the `/api/admin` handlers | Developer Platform / API |
| Actions and workflows | [`../platform/modules/actions-and-workflows.md`](../platform/modules/actions-and-workflows.md) | — | the action registry; `workflow_events` | Business Process |
| Ratified cross-platform decisions | [`../platform/foundation/platform-decisions.md`](../platform/foundation/platform-decisions.md) | — | — (decisions are the record; code shows compliance) | (platform spine) |

### Deliberate non-owners

These are cited often and own nothing. Loading them as authority is a known failure:

- [`../platform/foundation/alloy-platform-handbook.md`](../platform/foundation/alloy-platform-handbook.md) — teaching narrative. It explains the platform; it does not define it.
- [`../platform/foundation/system-overview.md`](../platform/foundation/system-overview.md) — entry point and index.
- [`../platform/foundation/product-roadmap.md`](../platform/foundation/product-roadmap.md) — intent and sequencing. **Never** current authority.
- [`../platform/foundation/release-history.md`](../platform/foundation/release-history.md) — historical.
- [`../platform/foundation/platform-manifesto.md`](../platform/foundation/platform-manifesto.md) — frozen values.
- `certification/**`, `docs/audits/**`, `docs/sprints/**` — evidence of how something came to be, never what is true now.

---

## 2. Staleness and re-certification contract

`Full recert?` answers: does this trigger require re-running the whole domain certification, or only
re-checking the named claim?

| Domain | Trigger | Required check | Full recert? |
|---|---|---|---|
| Developer Platform / API | any new `/api/v1` route or operation; any scope added or removed; any change to the public error taxonomy | `web/tests/support/publicSurfaceInventory.ts` parity across route files, OpenAPI and the scope catalog | **No** — the parity suite localises it |
| Runtime | a new foundational runtime; a change to the presentation tree or reveal contract | the runtime performance certification and presentation suites | Yes |
| Business Process | a new writer of lifecycle state; a change to the Opportunity PATCH allow-list | `web/tests/docs/lifecycleWriterCensus.test.ts`, `businessProcessLifecycleWriters.test.ts` | No |
| Identity / Access | a migration granting EXECUTE on a mutating RPC; a new public table; a capability added or removed | `web/tests/docs/identityAccessCertificationEvidence.test.ts` plus a fresh hosted census | Yes if a grant or policy changed; otherwise No |
| Operations temporal truth | a migration touching `child_placements`, `schedule_assignments` or `employments`; a new writer of either table | `participationTemporalWriterCensus.test.ts`, `temporalCardinalityAsymmetry.test.ts`, the two live suites | Yes |
| Enrollment / Placement | a change to placement supersession, site consistency or the candidate lifecycle | the placement live suites | No |
| Staff / Scheduling | a staff single-operational index; a shift model; a change to overlap governance | `temporalCardinalityAsymmetry.test.ts` (it asserts the **absence** of a staff unique index) | Yes for a shift model; otherwise No |
| Attendance | a new attendance producer; a change to kiosk identity or person codes | `attendanceCertificationClaims.test.ts` | No |
| Subsidy | an eleventh `fin.subsidy` command; a mounted HTTP write surface; any change to suppression bounds | `subsidyCertificationClaims.test.ts` | Yes if a write surface is mounted |
| Commercial | a new pricing or catalog table; resolution of the six `pending` DELETE declarations | the commercial claim matrix | No |
| Operational Intelligence | a new registered metric key; a new Answer consumer surface | `operationalIntelligenceWriteAuthority.test.ts` | No |
| Communications | a provider change or addition; a change to what resolves attention | `communicationsCertificationClaims.test.ts` | Yes on a provider change |
| Configuration | a fifth configuration lifecycle; first rows in the Programs publication chain; a change to the three-stage `config_assist` separation | the Configuration certification record's measured counts | Yes when the publication chain is first exercised |
| AI / BOS | **a new provider or adapter**; a capability becoming model-backed or ceasing to be; a change to the `lib/trust` purity control | `aiBosCertificationClaims.test.ts`, `tests/trust/**` | Yes on a new provider |
| **Financials / Payments** | **certification is blocked, not stale.** The trigger is the *absence* of change: seven consecutive quiet days under `web/lib/financials/payments` | `git log` under that path; then a full domain certification | Yes — it has never been certified |
| Product URLs | any change to `redirects()` or `rewrites()` in `web/next.config.ts`, or to `canonicalAdminRoutes.ts` | re-read both files; the doctrine restates neither | No |

### Triggers that apply to every domain

- A **migration** touching a table the domain owns.
- A **new route family** under a path the domain owns.
- A **new mutation writer** of an owned table — the characteristic silent regression, because a
  writer can be added without touching any document.
- A domain record older than **90 days** with material commit activity in its owned paths.

---

## When this document must be updated

When an owner changes, when a concern gains a second claimant, or when a domain is certified or
de-certified. A new domain record must add both an owner row and a staleness row.
