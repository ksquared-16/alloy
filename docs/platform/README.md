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

- [`communications/COMMUNICATIONS-V1-CLOSEOUT.md`](./communications/COMMUNICATIONS-V1-CLOSEOUT.md) — Communications V1 — closeout
- [`communications/public-link-origin-defect-2026-08-25.md`](./communications/public-link-origin-defect-2026-08-25.md) — Public link origin — defect, repair, and what the census proved

### `core/`

- [`core/commercial-execution-simulator-deltas.md`](./core/commercial-execution-simulator-deltas.md) — Commercial Execution Simulator — expected deltas vs Substrate A
- [`core/effective-dated-assignment-doctrine.md`](./core/effective-dated-assignment-doctrine.md) — Effective-dated assignment doctrine — truth intervals, supersession, cancellation, correction

### `experience/`

- [`experience/editable-card-runtime.md`](./experience/editable-card-runtime.md) — Editable Card Runtime (canonical)
- [`experience/experience-layer-architecture.md`](./experience/experience-layer-architecture.md) — Experience Layer — Architecture
- [`experience/focus-panel-work-mode-model.md`](./experience/focus-panel-work-mode-model.md) — Focus Panel Work-mode Model — the canonical composition contract (A)
- [`experience/operational-experience-doctrine.md`](./experience/operational-experience-doctrine.md) — Operational Experience Doctrine
- [`experience/operational-motion-doctrine.md`](./experience/operational-motion-doctrine.md) — Operational Motion Doctrine
- [`experience/operational-navigation-contract.md`](./experience/operational-navigation-contract.md) — Operational Navigation Contract
- [`experience/premium-interaction-principles.md`](./experience/premium-interaction-principles.md) — Premium Interaction Principles
- [`experience/search-platform.md`](./experience/search-platform.md) — Search Platform
- [`experience/surface-composer.md`](./experience/surface-composer.md) — Surface Composer

### `governance/`

- [`governance/assignment-time-authority.md`](./governance/assignment-time-authority.md) — Assignment owns its recurring time
- [`governance/assignments-authority-model-debt.md`](./governance/assignments-authority-model-debt.md) — Assignment authority — the model, and what is still blocked
- [`governance/business-process-draft-validation-scope.md`](./governance/business-process-draft-validation-scope.md) — Draft validation scope — what a save may block on
- [`governance/business-process-execution-graph.md`](./governance/business-process-execution-graph.md) — The Business Process execution graph
- [`governance/business-process-publication-coverage.md`](./governance/business-process-publication-coverage.md) — Business Process Publication Coverage
- [`governance/business-process-stage-save-decomposition.md`](./governance/business-process-stage-save-decomposition.md) — Stage Configuration save — decomposition
- [`governance/business-process-writer-inventory.md`](./governance/business-process-writer-inventory.md) — Business Process configuration — writer inventory
- [`governance/configuration-publication-model.md`](./governance/configuration-publication-model.md) — Alloy Configuration Publication Model
- [`governance/database-target-vocabulary.md`](./governance/database-target-vocabulary.md) — Database target vocabulary
- [`governance/demo-runtime-cleanup-workflow.md`](./governance/demo-runtime-cleanup-workflow.md) — Demo / Tenant Runtime Cleanup Workflow
- [`governance/execution-run-durability.md`](./governance/execution-run-durability.md) — Vacilando — Execution Run durability, abandonment, liveness, and recovery
- [`governance/human-acceptance-qa-standard.md`](./governance/human-acceptance-qa-standard.md) — Human acceptance QA — the platform standard
- [`governance/local-docker-containment.md`](./governance/local-docker-containment.md) — Local Docker containment — one shared stack
- [`governance/migration-promotion-controls.md`](./governance/migration-promotion-controls.md) — Migration promotion controls
- [`governance/operations-calendar.md`](./governance/operations-calendar.md) — Roster asks who. Calendar asks when and where.
- [`governance/staff-coverage-authority.md`](./governance/staff-coverage-authority.md) — Coverage owns the day that differs
- [`governance/standing-authorization.md`](./governance/standing-authorization.md) — Standing Authorization
- [`governance/stripe-test-credentials.md`](./governance/stripe-test-credentials.md) — Stripe test credentials on a Vacilando node
- [`governance/time-aware-staffing-projection.md`](./governance/time-aware-staffing-projection.md) — The staffing day is not one number
- [`governance/timezone-semantics.md`](./governance/timezone-semantics.md) — Timezone semantics (Alloy Timezone Contract v1)
- [`governance/typescript-performance.md`](./governance/typescript-performance.md) — TypeScript performance and typecheck operating doctrine

### `modules/`

- [`modules/core-payments-contract.md`](./modules/core-payments-contract.md) — Core Financials → Payments — the contract
- [`modules/existing-record-public-link-contract.md`](./modules/existing-record-public-link-contract.md) — Existing-record form launch (contract sketch)
- [`modules/field-concepts.md`](./modules/field-concepts.md) — Field Concepts — Business Fields, Calculated Fields, Runtime Signals
- [`modules/financials-canonical-authorities.md`](./modules/financials-canonical-authorities.md) — Financials — the canonical authorities
- [`modules/financials-documentation-gap-matrix.md`](./modules/financials-documentation-gap-matrix.md) — Financials documentation gap matrix — Thread 11A, Stage A
- [`modules/inbound-email-privacy-posture.md`](./modules/inbound-email-privacy-posture.md) — Inbound email — privacy posture
- [`modules/linkage-review-operator-flow.md`](./modules/linkage-review-operator-flow.md) — Operator flow: record linkage review (Forms V1.3)
- [`modules/payment-setup-and-payer-model.md`](./modules/payment-setup-and-payer-model.md) — Payment setup and the payer model
- [`modules/payments-autopay.md`](./modules/payments-autopay.md) — Payments V1 · W5 — Autopay
- [`modules/payments-collection-completion.md`](./modules/payments-collection-completion.md) — Payments V1 · W3 — Collection Completion
- [`modules/payments-held-deposits.md`](./modules/payments-held-deposits.md) — Payments V1 · W4 — Held Deposits
- [`modules/payments-payment-method-reference.md`](./modules/payments-payment-method-reference.md) — Payments V1 · W2 — the Payment Method Reference
- [`modules/payments-provider-architecture.md`](./modules/payments-provider-architecture.md) — Payments — the provider boundary, and Stripe as Provider V1
- [`modules/payments-provider-webhook.md`](./modules/payments-provider-webhook.md) — Payments — the provider webhook boundary
- [`modules/resend-inbound-provider-contract.md`](./modules/resend-inbound-provider-contract.md) — Resend inbound (Receiving) — the provider contract

### `operator/`

- [`operator/experience-builder-universal-composition-model.md`](./operator/experience-builder-universal-composition-model.md) — Experience Builder — Universal Composition Model
- [`operator/focus-panel-builder.md`](./operator/focus-panel-builder.md) — Focus Panel Builder
- [`operator/focus-panel-card-library.md`](./operator/focus-panel-card-library.md) — Focus Panel — Canonical Card Library
- [`operator/identity-surface-composition-v2.md`](./operator/identity-surface-composition-v2.md) — Identity Surface Doctrine — Canonical Disclosure Model
- [`operator/identity-surface-composition.md`](./operator/identity-surface-composition.md) — Identity surface composition
- [`operator/operational-configuration-card-pattern.md`](./operator/operational-configuration-card-pattern.md) — Operational Configuration Card Pattern
- [`operator/record-resolution.md`](./operator/record-resolution.md) — Record Resolution (Intake)

### `financials/`

- [`financials/payments-bank-setup-handoff.md`](./financials/payments-bank-setup-handoff.md) — Bank account setup is the payer's act — the handoff, and the slice that builds it
- [`financials/payments-v1-canonical-maps.md`](./financials/payments-v1-canonical-maps.md) — Payments V1 — the current system, after W6-A1

### `foundation/`

- [`foundation/capability-model-doctrine.md`](./foundation/capability-model-doctrine.md) — Platform Capability Model (API-first doctrine)

### `runtime/`

- [`runtime/enrollment-process-runtime.md`](./runtime/enrollment-process-runtime.md) — Enrollment Process Runtime — canonical architecture
- [`runtime/work-unit-session-continuity.md`](./runtime/work-unit-session-continuity.md) — Work Unit Session Continuity (implemented)

### `qa/`

- [`qa/operations-calendar-walkthrough.md`](./qa/operations-calendar-walkthrough.md) — Operations Calendar — a walk through it
- [`qa/spaces-director-qa.md`](./qa/spaces-director-qa.md) — Spaces — 15 minutes, in your own words
- [`qa/staffing-v1-final-walkthrough.md`](./qa/staffing-v1-final-walkthrough.md) — Staffing V1 — final operator walkthrough
- [`qa/staffing-v1-human-qa-acceptance.md`](./qa/staffing-v1-human-qa-acceptance.md) — Staffing / Scheduling / Coverage V1 — human QA acceptance walkthrough

## Proposals, frozen contracts and records

These are reachable from here so they are not invisible, and listed **apart from the canonical
owners above** because they are not current doctrine. The status in brackets is the document's own.
A proposal is not authority; a frozen contract binds only what it froze; a record is true of the day
it was written. Read the canonical owner for current truth.

### `analytics/`

- [`analytics/analytics-v2-roadmap.md`](./analytics/analytics-v2-roadmap.md) — **[proposed]** Analytics V2 Roadmap

### `core/`

- [`core/commercial-execution-platform.md`](./core/commercial-execution-platform.md) — **[proposed]** Commercial Execution Platform — Canonical Architecture
- [`core/operational-commercial-integration.md`](./core/operational-commercial-integration.md) — **[proposed]** Operational Consumption × Commercial Operating System — Integration Doctrine
- [`core/queue-lanes-product-review.md`](./core/queue-lanes-product-review.md) — **[proposed]** Verdict

### `experience/`

- [`experience/focus-panel-card-format.md`](./experience/focus-panel-card-format.md) — **[frozen]** Focus Panel card format — the frozen contract
- [`experience/navigation-runtime-doctrine.md`](./experience/navigation-runtime-doctrine.md) — **[proposed]** Navigation Runtime Doctrine

### `governance/`

- [`governance/business-process-platform-v1-certification.md`](./governance/business-process-platform-v1-certification.md) — **[frozen]** Business Process Platform V1 — Certification Matrix
- [`governance/certified-contract-governance-requirements.md`](./governance/certified-contract-governance-requirements.md) — **[proposed]** Certified Contract Governance — requirements handoff
- [`governance/configuration-integrity-laws.md`](./governance/configuration-integrity-laws.md) — **[proposed]** Alloy Configuration Integrity Laws
- [`governance/incidents/2026-09-10-production-migration-executed-without-approval.md`](./governance/incidents/2026-09-10-production-migration-executed-without-approval.md) — **[historical]** Incident — Thread 5 migrations executed against the deployed primary without an approved production mutation
- [`governance/operator-qa-host-identity-defect-2026-09-02.md`](./governance/operator-qa-host-identity-defect-2026-09-02.md) — **[proposed]** Operator QA host-identity defect — `localhost` is not an address, it is a question
- [`governance/programs-publication-stale-draft-gap.md`](./governance/programs-publication-stale-draft-gap.md) — **[historical]** Programs publication — `base_revision_id` is provenance, not a guard
- [`governance/incidents/2026-09-04-run-identity-and-store-durability.md`](./governance/incidents/2026-09-04-run-identity-and-store-durability.md) — **[historical]** Run identity and store durability — incident record
- [`governance/stabilization-closeout-2026-08.md`](./governance/stabilization-closeout-2026-08.md) — **[historical]** Development Platform Stabilization — Closeout
- [`governance/work-items-folders-and-views.md`](./governance/work-items-folders-and-views.md) — **[proposed]** Work Items — folders, views, waiting, due state, assignment
- [`governance/work-items-recurring-work.md`](./governance/work-items-recurring-work.md) — **[proposed]** Work Items — Recurring Work (Studio)

### `milestones/`

- [`milestones/packet-obligation-architecture-closeout.md`](./milestones/packet-obligation-architecture-closeout.md) — **[frozen]** Packet / Obligation — Architecture Initiative Closeout

### `operator/`

- [`operator/child-health-information-architecture.md`](./operator/child-health-information-architecture.md) — **[proposed]** Child health information — verified inventory, ownership, and the smallest gaps
- [`operator/health-foundation-h1-h4-contract.md`](./operator/health-foundation-h1-h4-contract.md) — **[proposed]** Health foundation — the H1–H4 contract
- [`operator/health-ownership-cross-sprint-contract.md`](./operator/health-ownership-cross-sprint-contract.md) — **[proposed]** Child health — cross-sprint canonical ownership contract
- [`operator/operational-card-convergence-plan.md`](./operator/operational-card-convergence-plan.md) — **[proposed]** Operational cards — backend / runtime convergence plan
- [`operator/operational-card-system-expansion.md`](./operator/operational-card-system-expansion.md) — **[proposed]** Operational Card System Expansion — Specification & Local Design Lab
- [`operator/operational-card-visual-audit.md`](./operator/operational-card-visual-audit.md) — **[proposed]** Existing Card Visual Audit — reset basis for the five operational cards

### `rfcs/`

- [`rfcs/location-operational-domain-consumer-inventory.md`](./rfcs/location-operational-domain-consumer-inventory.md) — **[proposed]** Location Operational Domain — Consumer Inventory & Migration Matrix
- [`rfcs/location-operational-domain-convergence.md`](./rfcs/location-operational-domain-convergence.md) — **[proposed]** RFC — Location Operational Domain Convergence
- [`rfcs/location-operational-domain-phase-a-implementation-plan.md`](./rfcs/location-operational-domain-phase-a-implementation-plan.md) — **[proposed]** Location Operational Platform — Phase A Implementation Plan (Canonical Contracts)

### `runtime/`

- [`runtime/communications-duplicate-loader-handoff.md`](./runtime/communications-duplicate-loader-handoff.md) — **[proposed]** Communications workspace — duplicate loader ownership (HANDOFF)

### `communications/`


Locked implementation contracts also live under [`../system/`](../system/). Execution history lives under `docs/sprints/` (history only — not current doctrine).
