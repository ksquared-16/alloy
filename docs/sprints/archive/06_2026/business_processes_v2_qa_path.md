# Business Processes V2 — Tenant configuration and QA path

No seed scripts. Configure everything in the browser via **Settings**. No env flags required for normal QA.

## 1. Statuses (`/admin/settings/statuses`)

1. **Lead Statuses** (`opportunities`) — create/map family-track statuses (e.g. New Lead, Contacting, Qualified, Tour Scheduled, Decision Pending, Closed).
2. **Enrollment Statuses** (`opportunity_customer_members`) — create/map child-track statuses (e.g. Waitlisted, Enrolling, Enrolled, Withdrawn).
3. **People Statuses** (`persons`) — parent/guardian and people lifecycle as needed.

Assign each Lead status an **Enrollment Stage** column value matching a builder stage key when saving from Business Processes. Saves write `process_stage_key` on status metadata (legacy `enrollment_operator_stage` is read-only fallback).

## 2. Business Processes (`/admin/settings/lifecycle`)

1. Open or create the **Enrollment Process** department.
2. On an empty process, click **Apply Enrollment V2 template** (adds Family + Child tracks, 8 rollup stages, Decision split metadata — no status rows created).
3. For each stage:
   - Assign **status rollups** (which Lead or Enrollment statuses belong to this stage).
   - Configure **Who belongs here?** (queue membership subject grain).
   - Configure **Expected Work** (optional).
4. At **Decision**, confirm split hint: Waitlist · Enrolling · Closed / Withdrawn · No action.
5. Activate / repair workspace work units so Waitlist and Enrolling queues appear.

## 3. Runtime activation (metadata-driven)

| Signal | Runtime behavior |
|--------|------------------|
| `tracks_v1` on active process | Business Process queue runtime **ON** |
| `queue_membership_v1` on stage / work unit | Builder-backed stage membership routing |
| `subject_type: child` or `candidate` | Child-track / candidate row context automatically |
| No `tracks_v1` | Legacy compatibility fallback (pre-V2 tenants) |

No env setup is required when the Enrollment V2 template is applied.

**Optional emergency kill switches** (default behavior is ON when metadata is present):

- `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=0` — force legacy queue routing for all tenants
- `ALLOY_QUEUE_CHILD_GRAIN_LANES=0` — disable legacy child-grain env path when tracks are configured

**Legacy-only opt-in** (tenants without `tracks_v1`):

- `ALLOY_QUEUE_CHILD_GRAIN_LANES=tours,waitlist` (or `all`) — enable Phase A child-grain builders

## 4. QA scenario — Smith Family

Prerequisites: Enrollment V2 template applied; statuses mapped to stages; work units activated. **No `.env` changes.**

1. Create **Smith Family** lead with children **Emma**, **Noah**, **Ava**.
2. Move family through Lead → Qualification → Tour → Decision (family statuses).
3. At Decision, set per child:
   - Emma → Waitlisted
   - Noah → Enrolling
   - Ava → Enrolling
4. Verify:
   - Smith Family in **Waitlist** queue; Emma first in row children
   - Smith Family in **Enrolling** queue; Noah and Ava first
   - Queue row opens **opportunity drawer**
   - Drawer shows all children and statuses
   - Noah → Enrolled without moving Emma
   - Emma stays Waitlisted

## 5. Regression tests

```bash
cd web && npm run test -- \
  tests/lifecycle/enrollmentBusinessProcessV2.test.ts \
  tests/lifecycle/lifecycleBuilderConfig.test.ts \
  tests/lifecycle/enrollmentProcessTemplate.test.ts \
  tests/queues/queueMembershipRuntimeResolver.test.ts \
  tests/queues/queueMembershipBuilderLanes.test.ts \
  tests/queues/childGrainLaneBuilders.test.ts \
  tests/businessProcesses/businessProcessRuntimeCleanup.test.ts \
  tests/lifecycle/enrollmentOperatorStage.test.ts \
  tests/admin/statuses/statusSettingsClarity.test.ts
```

```bash
cd web && npx tsc --noEmit
```
