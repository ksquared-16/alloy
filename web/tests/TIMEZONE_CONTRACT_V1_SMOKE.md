# Timezone Contract v1 — manual smoke checklist

Canonical semantics (UTC vs org day vs user vs visit-local): see [`docs/TIMEZONE_SEMANTICS.md`](../docs/TIMEZONE_SEMANTICS.md).

Run after deploy / migration `20260502143000_user_profiles_timezone.sql`.

1. **Org timezone controls `scheduled_on=today`**
   - Set `org_settings.metadata` → `{ "timezone": "America/Chicago" }` for a test org.
   - Call `GET /api/admin/schedules?scheduled_on=today&limit=200` (authenticated).
   - Response `meta` must include `timezone_effective: "America/Chicago"`, `timezone_source: "org_metadata"`, `calendar_type: "operational_day"`.
   - Visits shown must match the org-local calendar window (compare `start_at` range to org “today”).

2. **User timezone controls display**
   - Set `user_profiles.timezone` for your user to e.g. `Europe/Paris`.
   - Open Admin drawer / communications: timestamps should render in Paris wall time (not raw UTC-only labels from before).

3. **Workspace “scheduled today” count = schedules API total**
   - On department workspace (operations slice), note KPI / signal using `schedules.scheduled_today_count`.
   - Same session: `GET /api/admin/schedules?scheduled_on=today&limit=1` → `total` must match that metric (both use org operational calendar).

4. **Null user timezone → org**
   - Clear `user_profiles.timezone` (NULL).
   - Display should match org metadata timezone (same as operational org TZ when org defines one).

5. **Missing org timezone → UTC**
   - Remove both `metadata.timezone` and `metadata.time_zone` (or invalid string).
   - `GET /api/admin/schedules?scheduled_on=today` → `meta.timezone_effective` is `UTC`, `timezone_source` is `utc_fallback`.

6. **No data mutation**
   - Confirm `created_at` / `start_at` / `occurred_at` values unchanged in DB for sample rows after browsing admin.

7. **Public booking / availability (slice 2)**
   - `GET /api/public/booking-config` includes `operational_timezone_iana` when `ALLOY_PUBLIC_ORG_ID` is set (org metadata chain → UTC).
   - `/book-v2` uses that field for slot fetch after catalog loads; before load, client uses `UTC` (no hardcoded LA).
   - `GET /api/book-v2/availability` without `timezone` uses the same public-org resolution; invalid `timezone` query falls back to UTC.

8. **Admin schedule forms**
   - Create schedule / job schedule drawer defaults: org operational TZ from layout (`AdminOrgOperationalTimezoneProvider`), not viewer profile TZ. Existing rows still prefer `schedules.timezone` when editing.

Automated coverage: `npm test` → `tests/timezoneContract.test.ts`, `tests/workspace/deriveDepartmentJobMetrics.scheduledToday.test.ts`, `tests/orgLocalDayBounds.financialMtd.test.ts`.

9. **Financial snapshot MTD = org operational month-to-date**
   - Set org `metadata.timezone` (e.g. `America/Chicago`).
   - `GET /api/admin/financials/snapshot` → body includes `calendar_meta.calendar_type: "operational_month_to_date"`, `timezone_effective` / `timezone_source`, `mtd_start_local_date`, `mtd_end_local_date` (and `mtd_start_utc` / `mtd_end_exclusive_utc`).
   - `mtd_start` / `mtd_end` on the payload must match those local dates; MTD totals include posted rows whose `entry_date` is in that inclusive local range.
