# API contracts — workspace queues & job shape

**Scope:** Endpoints and shapes **used by** Admin V2 department queues (`useDepartmentQueueData`). **Not** a full OpenAPI catalog.

## `GET /api/admin/jobs`

**File:** `web/app/api/admin/jobs/route.ts`  
**Auth:** Admin context (`getAdminContext()`).

### Query parameters (subset relevant to workspace)

| Param | Effect |
|-------|--------|
| `limit` | Max rows (capped **200**). |
| `assigned_vendor_unassigned=true` | `assigned_vendor_id IS NULL` — **Unassigned jobs** lane. Mutually exclusive with `unassigned_work_unit` / `department_id` / `work_unit_id` (client-enforced; some combos 400). |
| `unassigned_work_unit=true` | `work_unit_id IS NULL` — legacy “no work unit” filter. |
| `department_id=<uuid>` | Resolves all **`work_units`** for that department, then `work_unit_id IN (…)`. |
| `work_unit_id=<uuid>` | Single work unit filter. |
| `status_key=<string>` | Filter by job status key. |
| `assigned_vendor_id=<uuid>` | Filter by vendor. |
| `search=<string>` | `title` / `job_number_for_customer` ilike. |
| `include_archived=true` | Include archived jobs. |

**Response:** `{ jobs: JobRow[], total, … }` — jobs are **enriched** with labels (customer, vendor, work unit, dept name, `_next_schedule`, `receivable_outstanding_cents`, etc.) in the route handler.

## `GET /api/admin/schedules`

**File:** `web/app/api/admin/schedules/route.ts`

### Query parameters (today lane)

| Param | Effect |
|-------|--------|
| `scheduled_on=today` | Local-day schedules for org (used with org timezone rules in route). |
| `limit` | Capped (200 for client). |

**Response:** `{ schedules: ScheduleRow[], … }` — schedule rows include joined job/customer/location fields as implemented in the route.

## Needs Attention — effective requests

From `useDepartmentQueueData` when `mode === "needs_attention"`:

1. `GET /api/admin/jobs?department_id=<deptId>&limit=200`
2. `GET /api/admin/jobs?unassigned_work_unit=true&limit=200`

Merged and filtered **client-side** using `exceptionTypes.ts` (see [NEEDS_ATTENTION_WORK_UNIT.md](./NEEDS_ATTENTION_WORK_UNIT.md)).

## `?exception=` (Needs Attention only)

- **Not** a server query param on `/api/admin/jobs` — it is a **Next.js page** search param:  
  `/adminV2/workspace/dept/[departmentId]/needs-attention?exception=payment_issue`
- Parsed in `DepartmentJobsQueuePage` → `parseNeedsAttentionExceptionParam` → filters merged list.

Allowed values match **`NeedsAttentionExceptionType`** in `exceptionTypes.ts`.

## Expected enriched job row (workspace metrics)

**Minimal type:** `JobRowForWorkspaceMetrics` in `web/lib/workspace/jobMetricsRow.ts`:

```ts
{
  id: string;
  work_unit_id?: string | null;
  gross_price_cents?: number | null;
  _next_schedule?: string | null;
  receivable_outstanding_cents?: number | null;
  status_key?: string | null;
  title?: string | null;
  _job_label?: string | null;
  _location_label?: string | null;
  _vendor_name?: string | null;
  _assigned_vendor_name?: string | null;
}
```

**Hook extension:** `AdminJobListRow` in `useDepartmentQueueData.ts` adds presentation fields (`_customer_name`, `_status_display`, `_price_display`, etc.) as returned by **`GET /api/admin/jobs`**.

## Single job record (drawer / full)

For **authoritative** job payload (not queue preview), use:

- **`GET /api/admin/entity/[type]/[id]`** with `type=jobs` — `web/app/api/admin/entity/[type]/[id]/route.ts`
- **`GET /api/admin/jobs/[id]`** — `web/app/api/admin/jobs/[id]/route.ts` (narrower job-focused handler)

Queue rows **must not** be treated as the full contract — see [record-rendering-system-spec.md](../../../architecture/record-rendering-system-spec.md).

## Other admin APIs used by workspace shell

- **`GET /api/admin/departments`** — department list (`DepartmentQueueRouteShell`).
- **`GET /api/admin/departments`** / work units — as wired in admin system pages (see [schema reference guide](../../audits/schema-reference-guide.md)).
