# Roadmap (working)

## Purpose

Short, bucketed working roadmap derived from current product areas — not a commitment calendar.

## Current state (2026-05-02)

Buckets align with platform surfaces actually present in repo: CRM/workspace, config, documents/AI, billing, scheduling, production readiness.

## Buckets

### CRM go-live

- Complete person-first data path on opportunities and inbound leads (reduce contact-only reliance where still live).
- Queue/workspace parity: confirm KPI definitions match operator queues (`QueueService` vs KPI routes).
- Drawer parity: opportunity `surface` behavior documented and tested like jobs RRS.

### Configuration / settings

- Finish migrating hardcoded workflow remnants (legacy audits archived — verify with grep when planning).
- Expand structured validation for all JSON config columns that affect operations.
- Admin UI for record layouts and queue definitions — keep schema-versioned.

### Documents / forms / AI

- Clarify documents storage and compliance story; fill `product/documents-and-forms.md` gaps.
- AI: document real agent routes, tool policy, and kill switches.
- Form capture — either document as vertical-specific or build shared primitive.

### Billing / payments

- Stripe webhook ↔ local state mapping doc + tests as source of truth.
- Refunds/credits model check against production usage.

### Scheduling / attendance / staffing

- Confirm whether attendance/staffing is roadmap or out-of-scope short term.
- Timezone correctness audit on org-boundary helpers for multi-timezone orgs.

### Production readiness / security

- RLS review for communications and payment tables (archived checklists moved — re-verify in Supabase).
- Service role usage inventory (`createAdminClient`, server service client).
- Observability: perf overlay exists client-side; server tracing **Needs verification**.

## Source of truth / key files

- This file; execution doctrine: `documentation-doctrine.md`
- Confirmed unknowns: `known-gaps.md`

## Guardrails

This roadmap **does not** override principles in `core/system-overview.md`. If roadmap conflicts with architecture, update architecture first.

## Known gaps / risks

Buckets are high level; **does not** replace issue tracker granularity.

## When this doc must be updated

When priorities shift or a bucket completes enough to collapse/merge.
