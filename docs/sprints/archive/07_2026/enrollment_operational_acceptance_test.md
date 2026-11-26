# Enrollment Operational Acceptance Test

The baseline acceptance test for Enrollment going forward. Deliverable is **operationally usable**,
not "compiles". Run this against a live stack (local Supabase or a dev tenant) after applying the
branch migrations. It cannot run in the CI sandbox (no live DB) — see the validation doc.

## Prerequisites (one-time)
1. Apply branch migrations to the dev DB (includes `20260711000000` + `20260711000100`):
   `supabase db push` (or your migration runner).
2. Ensure the dev department has the enrollment process/tracks applied (apply-template) so the
   stage-based builder membership path is active.
3. Confirm `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER` is enabled for the org (stage-based membership).

## Step 0 — Clean baseline (Phase 3)
Goal: every record exists because the app created it.
```sql
-- Read-only: confirm no un-owned business rows before starting.
select count(*) as opportunities from opportunities;               -- expect 0 on a clean tenant
select count(*) as demo_rows from opportunities
  where metadata->>'seed_key' like 'enroll_demo_%'
     or metadata->>'demo_seed_package' is not null;                -- expect 0
```
If demo rows exist, they came from an explicit `npm run dev:seed:*`/`demo:seed`, or from migration
`20260423143000` (Rivera, staging org only). Do NOT auto-seed. If you need demo data, run the explicit
seed command deliberately; otherwise leave the tenant empty.

## Step 1–10 — The scenario

| # | Action | Expected | How to verify |
|---|--------|----------|---------------|
| 1 | Start clean DB (Step 0) | 0 business rows | SQL above |
| 2 | Create a Lead in the UI (or POST the create_lead action) | 1 opportunity created | see SQL A |
| 3 | Lead appears in the correct Work View **immediately** | New Leads lane shows it, no manual refresh | UI + SQL B |
| 4 | Status displays the configured **label**, not the raw key | shows "Open" (not `open`) | UI inspect |
| 5 | Open the drawer | Focus panel loads the record | UI |
| 6 | Edit a field (e.g. child start date) | persists to OCM | see SQL C |
| 7 | Change status via a **domain verb** (e.g. Close Lead) | status→closed + reason | see SQL A |
| 8 | Work View updates | record leaves New Leads, enters Closed | UI + SQL B |
| 9 | Search finds the record | appears in search | UI |
| 10 | No hardcoded/demo data interferes | only your created record present | SQL Step 0 |

### Verification SQL (read-only)
```sql
-- A) the created lead has canonical initial state
select id, status_key, stage_key, close_reason_key
from opportunities order by created_at desc limit 1;
-- EXPECT after step 2: status_key='open', stage_key='lead', close_reason_key IS NULL
-- EXPECT after step 7 (Close Lead): status_key='closed', close_reason_key set (e.g. 'lost'/'withdrawn'/'other')

-- child participation initial state
select outcome_status_key, stage_key
from opportunity_customer_members order by created_at desc limit 1;
-- EXPECT after step 2: outcome_status_key IS NULL, stage_key IS NULL (child on family track pre-decision)

-- B) membership is stage-based (the record's stage, not a legacy status)
select id, stage_key from opportunities where stage_key = 'lead';   -- new lead present
-- If the New Leads lane is EMPTY in the UI while this row exists, the lane is still filtering
-- on a deleted status key → apply follow-up #1 (cut lanes to stage_key). See validation doc.

-- C) canonical fields (not desired_* legacy names)
select column_name from information_schema.columns
where table_name='opportunity_customer_members'
  and column_name in ('start_date','schedule_type','program_category_id');  -- all 3 present
select column_name from information_schema.columns
where table_name='opportunity_customer_members' and column_name like 'desired_%';  -- EXPECT 0 rows

-- D) status_definitions holds only the collapsed vocabulary
select entity_type, status_key, status_label from status_definitions
where entity_type in ('opportunities','opportunity_customer_members') order by 1,3;
-- EXPECT opportunities: open, closed ; OCM: waitlisted, enrolling, enrolled, withdrawn, not_enrolling
-- EXPECT: NO new_inquiry / tour_scheduled / offer_pending / registration_pending / etc.

-- E) no code path wrote a deleted key (integrity)
select distinct status_key from opportunities
where status_key not in ('open','closed','inactive','archived');   -- EXPECT 0 rows
select distinct outcome_status_key from opportunity_customer_members
where outcome_status_key is not null
  and outcome_status_key not in ('waitlisted','enrolling','enrolled','withdrawn','not_enrolling'); -- EXPECT 0 rows
```

## Pass criteria
- Steps 2–10 succeed with **no manual refresh, rebuild, or workaround.**
- SQL A/B/C/D/E all match EXPECT.
- Any FAIL at step 3/8 with SQL B showing the row present ⇒ legacy queue-definition lanes still
  status-based ⇒ apply follow-up #1 in the validation doc, then re-run.

## Automatable form
`web/tests/admin/tenantEndToEnd.test.ts` (`npm run test:tenant:e2e`) and the playwright specs
(`web/playwright/tests/workspace-v3-enrollment-operational-surface.spec.ts`) are the hooks to grow this
into an automated acceptance gate once run against a seeded tenant. Extend them to assert SQL A/D
invariants + New-Leads membership after a programmatic create_lead.
