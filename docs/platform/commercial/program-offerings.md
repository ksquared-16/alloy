---
owner: commercial
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Program Offerings — Platform Primitive

## What

A **Program Offering** is a structured, purchasable configuration of a program: one attendance pattern at one quantity level. Examples:

- Infant / Full Time / 5 days
- Toddler / Part Time / 3 days
- Preschool / Drop-in (no quantity)
- School Age / Before School (no quantity)

Offerings are **operational primitives** — they describe what a family is enrolling in, not just a label on a rate row.

## Ownership

**Programs domain owns offerings.** Commercial consumes them.

Programs are organization-owned reusable services. Locations choose which Programs they offer. Rooms or other Delivery Resources may deliver a Program, but they are not children owned by that Program.

```
Programs
└── Program (key: "infant", "toddler", ...)
    └── Program Offerings (this table)
        └── Commercial Tuition Rates (FK to offering_id)
            └── Billing Engine
                └── Accounting
```

Commercial never owns what is being sold. It only prices what Programs defines.

## Schema: `program_offerings`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `org_id` | uuid | FK to orgs |
| `program_key` | text | Matches location_program_categories.key |
| `label` | text | Operator-visible display name |
| `attendance_type` | text | full_time \| part_time \| drop_in \| hourly \| before_school \| after_school \| custom |
| `quantity_type` | text? | days \| hours \| sessions \| weeks \| months |
| `quantity_value` | numeric? | e.g. 5 for "5 days/week" |
| `status` | text | active \| draft \| coming_soon \| seasonal \| retired \| archived |
| `effective_start` | date? | Operational date bounds (not billing) |
| `effective_end` | date? | Operational date bounds (not billing) |
| `sort_order` | int | Display order within a program |
| `is_active` | bool | Soft-delete flag |
| `metadata` | jsonb | Extension point |

Unique constraint: `(org_id, program_key, attendance_type, quantity_type, quantity_value)` with `NULLS NOT DISTINCT`.

## Scope

Offerings are **org-level per program_key**. There is no per-location offering variation in V1 — all locations that offer a program share the same offering definitions. Location-level pricing variation is handled in `commercial_tuition_rates` (org default vs. location override).

## Consumers

| Domain | Uses |
|---|---|
| **Commercial** | Rates attach to offering_id + cadence_key |
| **Enrollment** (planned) | Families enroll into a specific offering |
| **Scheduling** (planned) | Uses offering identity for demand and assignment; capacity remains resource-owned |
| **Attendance** (planned) | Expected days/hours derived from offering |
| **Analytics** (planned) | Revenue and occupancy reporting |
| **AI** (planned) | Wait-list placement, demand forecasting |

## Rooms and Delivery Resources

Rooms are **Location-owned Delivery Resources**, not Program containers. A resource may be assigned to deliver one or more Programs for scheduling and operational execution. That assignment does not move resource identity, capacity, or scheduling ownership into Programs and does not affect pricing — commercial defaults remain attached to the Program/Offering model.

Resource management, capacity, and local scheduling live in the Locations and operational runtimes.

## V1 → V2 migration path

V1 uses one flat table. If operators need variant pricing within an attendance type (e.g. Mon/Wed/Fri at one price vs. Tue/Thu at another for "Part Time 2-day"), the table is designed to separate into:

- **Offering Type** (attendance_type + quantity) — the abstract offering
- **Offering Configuration** (specific schedule pattern, room assignment) — the concrete variant

This separation is deferred until there is operator demand for it.

## API

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/programs/offerings?program_key=` | List offerings for a program |
| POST | `/api/admin/programs/offerings` | Create offering (ops role) |
| PATCH | `/api/admin/programs/offerings/[id]` | Update label, status, sort_order, effective dates |
| DELETE | `/api/admin/programs/offerings/[id]` | Archive if rates exist; delete otherwise |
