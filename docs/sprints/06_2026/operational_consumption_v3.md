# Operational Consumption V3 — Slice 3 (pipeline + attendance)

**Status:** Built (June 2026). Continues the **frozen** Slice 1–2 architecture; does **not** redesign it. Posting remains out of scope. This slice completes the Operational Consumption runtime.

Doctrine: [`../../platform/modules/operational-consumption-platform.md`](../../platform/modules/operational-consumption-platform.md) (Slice 3 sections).

## The realization → the pipeline

Slices 1–2 consumed each vertical directly. Attendance would make a third bespoke path — not scalable. Slice 3 introduces **one canonical pipeline** every domain enters identically:

```
Operational Fact → Consumption Candidate → Consumption Event → Commercial Resolution → Resolved Obligation → Draft Charge
```

A **Consumption Candidate** is a normalized, non-persisted runtime interpretation; it resolves to one event, many, or none (discarded with a reason). The shared core `resolveDirective` consumes the existing Rate Resolution + Charge Template resolver + Financial Policies for every domain (rate-derived, fixed-fee, preview-only credits) — pricing is never reimplemented.

## Milestone (achieved)

*"A child checked out at 5:18 PM"* → Candidate (attendance/check_out) → after the 17:00 threshold → `attendance.late_pickup` event → fixed Late-Pickup template → review policy → one Resolved Obligation → **$25 draft charge**, posting nothing. An on-time check-out is **discarded** with an explanation.

## As-built

- **Pure attendance engine** `attendanceInterpretation.ts` — normalizes attendance facts → directives; encodes *not every fact is commercial* (room transfer, early pickup, excused absence, on-time check-out, expected attendance → discarded). Absence → vacation credit only when eligible; no-show → fee only if configured.
- **Pipeline runtime** — `consumptionService.ts`: `buildCandidate` + a shared `resolveDirective` used by schedule AND attendance (the Slice 2 schedule path was refactored onto it with identical behavior). `previewConsumption` dispatches attendance → `previewAttendanceConsumption`.
- **Schema (additive)** `20260708120000` — seeds the `attendance.*` Consumption Event catalog (late_pickup, drop_in, extra_day, extended_day, hourly_care, no_show, vacation_credit). No table/column changes; no money writes; no new policy types.
- **Seed/demo** — adds an hourly rate rule + an `hourly_care` rate-derived template (late_pickup + drop_in already existed).
- **API + UI** — simulate accepts attendance facts (`attendance_fact_type`, check-out/threshold times, hours, vacation eligibility); the simulator gains an Attendance scenario group and renders the Candidate + discard reason + suppressed obligations.
- **Explanation** — first-class for created **and** suppressed obligations: discard reasons, matched commercial objects, applied policies, and `suppressed_obligation_count`.
- **Tests** — pure interpretation (every fact type), the late-pickup milestone end-to-end, drop-in/hourly/vacation-credit/no-show/discarded scenarios, **idempotency (duplicate attendance facts → no duplicate obligations)**, preview-no-persist, draft-only, explanation coverage for every Candidate outcome, route attendance dispatch, Slice 3 convergence. All 87 consumption tests green; Slice 1–2 unchanged.

## Downstream (not built)

Posting, Invoicing, Payments, Statements, Subsidies, Claims, Settlement, General Ledger — downstream consumers of this runtime.

## Merge & closeout

Slices 1–3 shipped as one stacked branch (`claude/operational-consumption-v3`) merged via **PR #27** into `origin/staging`; the earlier stacked PRs **#23** (Slice 1) and **#24** (Slice 2) were closed as superseded. Before merge the branch was rebased onto the latest `origin/staging` (which had advanced with Alloy Services V1 + others); the only overlap — `financialConfigDemoDataset.ts` — auto-merged cleanly (consumption rate rules + charge templates coexist with the new service capabilities).

Integration fix during closeout: staging independently introduced a migration at `20260706120000`, colliding with the Slice 1 foundation timestamp. Since Supabase keys migrations by version prefix (the repo holds 219 unique prefixes across 220 files — this was the sole duplicate), the foundation migration was renamed to **`20260706120050_operational_consumption_foundation.sql`** (after the lead-status migration, before the `…120100` seed) and all references updated. No schema change.

Final validation: 87 Operational Consumption tests + 299 consumption/financial tests green against the rebased base; scoped typecheck + lint clean; migrations additive and uniquely ordered; idempotency and no-Posting verified; the runtime consumes the Commercial Model with no duplicated pricing logic.
