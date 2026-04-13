# Implementation documentation

Active engineering reference: **[foundation implementation plan](./foundation-implementation-plan.md)** (Track A bridge), remediation plans, deployment, UI structure specs, workflows, and V1/V2 planning docs that **complement** (but do not replace) [`../architecture/README.md`](../architecture/README.md).

**Workspace V2 (concrete):** [`workspace-v2/README.md`](./workspace-v2/README.md) — visual context, department queues, Needs Attention, API notes.

**AI agent (implementation bridge):** [`ai-agent-implementation-slice-v0.md`](./ai-agent-implementation-slice-v0.md) — thinnest v0 slice (`update_queue_definition`), envelopes, validation, audit, build order (no full agent build). **Smoke / local verification:** [`ai-agent-v0-smoke-test.md`](./ai-agent-v0-smoke-test.md).

**AI agent record layout (v1 slice plan):** [`ai-agent-record-layout-slice-v1.md`](./ai-agent-record-layout-slice-v1.md) — `update_record_layout` on org `record_overview_layouts` (job overview) first; global `record_layouts` deferred.

**AI agent field visibility (v2 slice):** [`ai-agent-field-visibility-slice-v2.md`](./ai-agent-field-visibility-slice-v2.md) — `update_field_visibility` on `field_definitions` visibility flags only; sections/ordering deferred.

**AI agent foundation checkpoint:** [`ai-agent-foundation-checkpoint.md`](./ai-agent-foundation-checkpoint.md) — v0/v1/v2 rails, routes, flags, lab, scope.

See [`../README.md`](../README.md) for how this folder relates to **audits/** and **archive/**.
