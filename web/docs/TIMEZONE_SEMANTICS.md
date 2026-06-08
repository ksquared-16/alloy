# Timezone semantics (Alloy Timezone Contract v1)

This document defines how time is interpreted across the admin app and APIs. It complements `web/tests/TIMEZONE_CONTRACT_V1_SMOKE.md` (checklists).

## 1. UTC instant / duration logic

- **Stored timestamps** (`timestamptz`, ISO strings with offset or `Z`) represent a single point on the UTC timeline.
- **Comparisons** such as “is this visit in the past?” (`start_at < now`), **elapsed** minutes for activity signals, SLA-style **rolling windows** (e.g. “stale for 2 days” as ~48h in ms), and **durations** (workflow run length) use **instant arithmetic**, not calendar days.
- **Do not** rewrite stored values when displaying or bucketing.

## 2. Org operational calendar logic

- **Source of truth:** `org_settings.metadata.timezone` → `metadata.time_zone` → UTC (see `lib/admin/timezoneContract.ts`).
- **Use for:** Shared operational concepts tied to an org “business day”: e.g. `GET /api/admin/schedules?scheduled_on=today`, workspace **scheduled today** counts, **`GET /api/admin/workflow-runs?list=kpis`** `runs_today`, **`GET /api/admin/financials/snapshot`** month-to-date `entry_date` window, and queue calendar filters (`today` / `past_due`).
- **API contract:** Endpoints that bucket by this calendar should return metadata such as `timezone_effective`, `timezone_source`, and day bounds where applicable (see schedules API and workflow-runs KPI response `meta`).

## 3. User display timezone

- **Source:** `user_profiles.timezone` → same org metadata fallback → UTC (`fetchEffectiveUserDisplayTimezone` / `AdminViewerTimezoneProvider`).
- **Use for:** Operator-facing admin UI where the viewer should see wall clock in their chosen zone: e.g. workflow runs/events lists, communications threads, related-record timestamps (except visit-local schedule fields — see below).
- **Helpers:** `formatDateTimeForUserDisplay`, `formatDateForUserDisplay` in `lib/adminFormatters.ts` (explicit IANA; not raw `toLocaleString` without `timeZone`).

## 4. Visit-local schedule timezone

- **`schedules.timezone`** (IANA) labels **when** a visit is intended in local wall time for that visit.
- **Use for:** Schedule start/end display when showing “visit time” — prefer `schedule.timezone`, then **org operational** default if null (`SchedulesClient`, related-records schedule columns).
- **Do not conflate** with user display TZ for those columns: ops often need visit-local labels; other admin fields still use viewer display TZ.

## Known follow-ups (not yet aligned)

Further reporting slices may add fiscal periods or viewer-timezone presentation for statements; MTD snapshot itself uses org operational dates only.

## Implemented in Slice 3C

- **Financial snapshot (`getFinancialSnapshot`)** MTD uses **`gl_journal_entries.entry_date`** (DATE) with inclusive bounds **`mtd_start` / `mtd_end`** = first day of current month in org operational TZ through current org-local “today”, via `fetchOperationalTimezoneForOrg` + `resolveOrgOperationalMonthToDateForFinancialMtd`. Responses include **`calendar_meta`** (`operational_month_to_date`, timezone fields, local dates, UTC bounds). Balance snapshot cutover for all posted entries still uses **`entry_date` ≤ MTD end** (local date). No mutation of stored rows.

## Implemented in Slice 3B

- **QueueService** `date` filters for jobs and opportunities (`today`, `past_due`) use **org operational** calendar day bounds via `fetchOperationalTimezoneForOrg` + `getOrgLocalTodayUtcBounds` (same helpers as schedules / workflow KPIs). Queue summaries and item list responses include optional **`calendar_meta`** when those filters apply (`calendar_type`, `timezone_effective`, `timezone_source`, `day_start_utc`, `day_end_exclusive_utc`).
- Rolling **needs_attention** / exception / stale logic still uses **`now`** in instant comparisons; it is not converted to calendar-day semantics.

## Implemented in Slice 3A

- Workflow KPI `runs_today` uses org operational day bounds; response includes `meta.day_start_utc`, `meta.day_end_exclusive_utc`, etc.
- Workflow runs/events list UI uses viewer display timezone (with header tooltips).
- Schedules admin table uses visit-local display TZ for start/end.
- Related records: schedule tab uses visit-local; other datetime columns use viewer TZ.
