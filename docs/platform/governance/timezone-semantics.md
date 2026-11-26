---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: [web/docs/TIMEZONE_SEMANTICS.md]
---

# Timezone semantics (Alloy Timezone Contract v1)

**Status:** Canonical platform data/runtime doctrine (July 2026)  
**Scope:** How time is interpreted across admin APIs, operational calendar logic, and operator display

This document is the **canonical owner** for timezone semantics. Implementation helpers live in `web/lib/admin/timezoneContract.ts`, `web/lib/adminFormatters.ts`, and related admin modules. Co-located developer notes: `web/docs/TIMEZONE_SEMANTICS.md` (pointer only).

---

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

## Implementation slices (reference)

- **Slice 3C — Financial snapshot:** MTD uses **`gl_journal_entries.entry_date`** (DATE) with inclusive bounds in org operational TZ. Responses include **`calendar_meta`**.
- **Slice 3B — Queue calendar filters:** `date` filters for jobs and opportunities use org operational day bounds; rolling stale logic still uses instant `now`.
- **Slice 3A — Workflow KPIs and lists:** `runs_today` uses org operational bounds; list UI uses viewer display TZ; schedules use visit-local display.

Smoke checklists: `web/tests/TIMEZONE_CONTRACT_V1_SMOKE.md`.
