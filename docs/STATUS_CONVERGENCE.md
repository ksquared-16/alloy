# Status convergence (Phase 2)

## Canonical fields

- **`status_key`** — application-level status; validated against `status_definitions` where enforced in admin APIs.
- **Legacy FKs** (`job_status_id`, `schedule_status_id`, `payment_status_id`) — kept in sync on active write paths as a compatibility layer for joins, Stripe, and older queries.

## Intentional exceptions

- **Assignments:** `status_key` is stored on `assignments` and kept aligned with `assignment_statuses`, but **admin status definitions do not yet include `assignments` as an entity type**. The catalog for assignment states remains `assignment_statuses` until definitions-backed assignment statuses are added.

## Workflows

- Prefer **`status_key`** (and `job.status_key` / `schedule.status_key` in conditions) over legacy id columns.
- `update_entity` normalizes **jobs** and **schedules** patches: non-UUID values in `job_status_id` / `schedule_status_id` are treated as keys; setting either id or key syncs the other when resolvable.
