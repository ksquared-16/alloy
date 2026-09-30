---
owner: platform
status: canonical
last_reviewed: 2026-09-29
supersedes: []
---

# Platform documentation

Canonical Alloy platform doctrine. Start at [`../README.md`](../README.md) for the full library map.

**Teach first:** [`foundation/alloy-platform-handbook.md`](./foundation/alloy-platform-handbook.md) — Alloy Platform Handbook.  
**Durable decisions:** [`foundation/platform-decisions.md`](./foundation/platform-decisions.md).

| Folder | Owns |
|--------|------|
| [`foundation/`](./foundation/) | What Alloy is, capabilities, roadmap, architecture maps |
| [`core/`](./core/) | Operator model, entities, records, status, data contracts, truth flow |
| [`operator/`](./operator/) | Interaction model, workspaces, queues, drawers, card systems |
| [`experience/`](./experience/) | Presentation runtime, motion, loading/reveal |
| [`modules/`](./modules/) | Domain modules (communications, billing, documents, AI, …) |
| [`trust/`](./trust/) | Trust Platform doctrine (publication in progress — see folder index) |
| [`analytics/`](./analytics/) | Metric / analytics platform |
| [`commercial/`](./commercial/) | Commercial / offerings platform |
| [`runtime/`](./runtime/) | Runtime ownership references (implementation-adjacent platform truth) |
| [`governance/`](./governance/) | Documentation, design, roles, deployment, glossary |
| [`milestones/`](./milestones/) | Freezes and certifications |
| [`rfcs/`](./rfcs/) | Approved proposals not yet frozen as sole truth |


## Canonical owners by area

The folder table above says what each area owns. This lists the individual canonical owners inside
them, so a reader (or an agent) can reach a specific authority without already knowing its filename.

### `analytics/`

- [`analytics/metric-builder-ux.md`](./analytics/metric-builder-ux.md) — Metric Builder UX
- [`analytics/metric-data-model.md`](./analytics/metric-data-model.md) — Analytics V2 Metric Data Model
- [`analytics/metric-platform-doctrine.md`](./analytics/metric-platform-doctrine.md) — Analytics V2 Metric Platform Doctrine

### `communications/`

- [`communications/live-email-routing-test.md`](./communications/live-email-routing-test.md) — Live Email routing — Director setup and controlled test

### `core/`

- [`core/commercial-execution-simulator-deltas.md`](./core/commercial-execution-simulator-deltas.md) — Commercial Execution Simulator — expected deltas vs Substrate A
- [`core/queue-lanes-product-review.md`](./core/queue-lanes-product-review.md) — Verdict

### `experience/`

- [`experience/editable-card-runtime.md`](./experience/editable-card-runtime.md) — Editable Card Runtime (canonical)
- [`experience/experience-layer-architecture.md`](./experience/experience-layer-architecture.md) — Experience Layer — Architecture
- [`experience/focus-panel-work-mode-model.md`](./experience/focus-panel-work-mode-model.md) — Focus Panel Work-mode Model — the canonical composition contract (A)
- [`experience/operational-experience-doctrine.md`](./experience/operational-experience-doctrine.md) — Operational Experience Doctrine
- [`experience/operational-motion-doctrine.md`](./experience/operational-motion-doctrine.md) — Operational Motion Doctrine
- [`experience/premium-interaction-principles.md`](./experience/premium-interaction-principles.md) — Premium Interaction Principles
- [`experience/search-platform.md`](./experience/search-platform.md) — Search Platform
- [`experience/surface-composer.md`](./experience/surface-composer.md) — Surface Composer

### `governance/`

- [`governance/business-process-publication-coverage.md`](./governance/business-process-publication-coverage.md) — Business Process Publication Coverage
- [`governance/configuration-integrity-laws.md`](./governance/configuration-integrity-laws.md) — Alloy Configuration Integrity Laws
- [`governance/configuration-publication-model.md`](./governance/configuration-publication-model.md) — Alloy Configuration Publication Model
- [`governance/database-target-vocabulary.md`](./governance/database-target-vocabulary.md) — Database target vocabulary
- [`governance/demo-runtime-cleanup-workflow.md`](./governance/demo-runtime-cleanup-workflow.md) — Demo / Tenant Runtime Cleanup Workflow
- [`governance/local-docker-containment.md`](./governance/local-docker-containment.md) — Local Docker containment — one shared stack
- [`governance/operations-calendar.md`](./governance/operations-calendar.md) — Roster asks who. Calendar asks when and where.
- [`governance/run-identity-and-store-durability.md`](./governance/run-identity-and-store-durability.md) — Run identity and store durability
- [`governance/staff-coverage-authority.md`](./governance/staff-coverage-authority.md) — Coverage owns the day that differs
- [`governance/standing-authorization.md`](./governance/standing-authorization.md) — Standing Authorization
- [`governance/stripe-test-credentials.md`](./governance/stripe-test-credentials.md) — Stripe test credentials on a Vacilando node
- [`governance/time-aware-staffing-projection.md`](./governance/time-aware-staffing-projection.md) — The staffing day is not one number
- [`governance/timezone-semantics.md`](./governance/timezone-semantics.md) — Timezone semantics (Alloy Timezone Contract v1)
- [`governance/typescript-performance.md`](./governance/typescript-performance.md) — TypeScript performance and typecheck operating doctrine
- [`governance/work-items-folders-and-views.md`](./governance/work-items-folders-and-views.md) — Work Items — folders, views, waiting, due state, assignment
- [`governance/work-items-recurring-work.md`](./governance/work-items-recurring-work.md) — Work Items — Recurring Work (Studio)

### `modules/`

- [`modules/core-payments-contract.md`](./modules/core-payments-contract.md) — Core Financials → Payments — the contract
- [`modules/existing-record-public-link-contract.md`](./modules/existing-record-public-link-contract.md) — Existing-record form launch (contract sketch)
- [`modules/field-concepts.md`](./modules/field-concepts.md) — Field Concepts — Business Fields, Calculated Fields, Runtime Signals
- [`modules/linkage-review-operator-flow.md`](./modules/linkage-review-operator-flow.md) — Operator flow: record linkage review (Forms V1.3)
- [`modules/payments-autopay.md`](./modules/payments-autopay.md) — Payments V1 · W5 — Autopay
- [`modules/payments-held-deposits.md`](./modules/payments-held-deposits.md) — Payments V1 · W4 — Held Deposits
- [`modules/payments-payment-method-reference.md`](./modules/payments-payment-method-reference.md) — Payments V1 · W2 — the Payment Method Reference
- [`modules/payments-provider-architecture.md`](./modules/payments-provider-architecture.md) — Payments — the provider boundary, and Stripe as Provider V1
- [`modules/payments-provider-webhook.md`](./modules/payments-provider-webhook.md) — Payments — the provider webhook boundary

### `operator/`

- [`operator/focus-panel-card-library.md`](./operator/focus-panel-card-library.md) — Focus Panel — Canonical Card Library
- [`operator/health-foundation-h1-h4-contract.md`](./operator/health-foundation-h1-h4-contract.md) — Health foundation — the H1–H4 contract
- [`operator/identity-surface-composition-v2.md`](./operator/identity-surface-composition-v2.md) — Identity Surface Doctrine — Canonical Disclosure Model
- [`operator/operational-card-production-ledger.md`](./operator/operational-card-production-ledger.md) — Operational Cards — Production Implementation Ledger

### `qa/`

- [`qa/operations-calendar-walkthrough.md`](./qa/operations-calendar-walkthrough.md) — Operations Calendar — a walk through it
- [`qa/spaces-director-qa.md`](./qa/spaces-director-qa.md) — Spaces — 15 minutes, in your own words
- [`qa/staffing-v1-final-walkthrough.md`](./qa/staffing-v1-final-walkthrough.md) — Staffing V1 — final operator walkthrough
- [`qa/staffing-v1-human-qa-acceptance.md`](./qa/staffing-v1-human-qa-acceptance.md) — Staffing / Scheduling / Coverage V1 — human QA acceptance walkthrough

Locked implementation contracts also live under [`../system/`](../system/). Execution history lives under `docs/sprints/` (history only — not current doctrine).
