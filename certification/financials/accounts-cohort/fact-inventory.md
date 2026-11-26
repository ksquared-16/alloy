# §11 — Subjects fact inventory

Every fact the subjects cohort acquires, where it comes from, which measured wave it sits in, the
field it would occupy in a cohort acquisition, and **which application authority consumes it**.
No mystery blob: each field below is a named row set with named columns.

Waves are the measured cold P50 offsets from the deployed instrumentation at `268fc0770`.

| # | FACT | SOURCE | CURRENT READ | WAVE | NEW BUNDLE FIELD | APPLICATION AUTHORITY THAT CONSUMES IT |
|---|---|---|---|---|---|---|
| 1 | households | `customers` | `select id, name` · `eq org_id` · `order (name, id)` · `range` paged | **1** — @122 | `households[]` `{id, name}` | `resolveFinancialSubjectCohort` — builds `customerIds`, `householdName`; owns the scan cap and the `truncated` verdict |
| 2 | household members | `customer_members` | `select id, customer_id, display_name, first_name, last_name, is_active` · `in customer_id` | **2** — @243 | `members[]` (same columns, **including `is_active`**) | `childNamesFrom` — owns `is_active === false → skip`; also supplied onward to the placement facets so the table is read once |
| 3 | direct agreement sites | `child_enrollment_agreements` | `select customer_id, site_location_id` · `in customer_id` | **2** — @257 | `agreement_sites_direct[]` `{customer_id, site_location_id}` | `readAgreementSites` → `isFinancialSubjectVisible` — owns site scoping |
| 4 | orphan agreement sites | `child_enrollment_agreements` | `select customer_member_id, site_location_id` · `is customer_id null` · paged | **3** — @372 | `agreement_sites_orphan[]` `{customer_member_id, site_location_id}` | same — the nullable-`customer_id` fallback rule stays in TS |
| 5 | orphan → household | `customer_members` | `select id, customer_id` · `in id` | **4** (did not execute: this tenant has no orphan agreements) | `orphan_members[]` `{id, customer_id}` | same |
| 6 | contacts | `customer_persons` + `persons` | `select customer_id, role_type, status, end_date, persons(first_name,last_name)` · `in customer_id` | **2** — @248 | `contacts[]` (same columns, **including `role_type`, `status`, `end_date`**) | `readContactNames` — owns `end_date → skip`, `status inactive → skip`, `role_type child → skip` |
| 7 | placements | `child_placements` | `select customer_member_id, program_category_id, room_location_id, status` · `in customer_member_id` | **3** — @360 | `placements[]` (same columns, **including `status`**) | `readCurrentPlacements` — owns `CURRENT_PLACEMENT_STATUSES = planned/active/ending` |
| 8 | enrolment program intent | `process_instances` | `select subject_id, metadata` · `eq process_key` · `in subject_id` | **4** — @482 | `enrolment_intents[]` `{subject_id, metadata}` | `readCurrentPlacements` — owns the precedence *placement program first, then `metadata.program_category_id`* |
| 9 | program labels | `location_program_categories` | `select id, label, key` · `in id` | **5** — @582 | `program_labels[]` `{id, label, key}` | `readCurrentPlacements` — owns `label || key` fallback |
| 10 | room labels | `locations` | `select id, label` · `in id` | **6** — @679 | `room_labels[]` `{id, label}` | `readCurrentPlacements` |

Ten fact sets, nine of which execute on this tenant, in **six sequential waves**.

## What stays in the application — every one of these is a RULE, not transport

- **Site visibility** — `isFinancialSubjectVisible(siteLocationIds, siteScope, allowedSiteLocationIds, activeSiteLocationId)`.
- **Account membership and order** — the cohort is `customers` ordered `(name, id)`; §5 of the
  instruction makes subjects authoritative for this and the acquisition must not change it.
- **Scan cap and truncation** — `FINANCIAL_SUBJECT_SCAN_CAP = 2000`, and `truncated` is a verdict
  about whether the cohort was complete.
- **Member activity** — `is_active === false` skips a child name.
- **Contact eligibility** — ended, inactive, or `role_type = child` are each excluded.
- **Placement liveness** — `planned`, `active`, `ending`.
- **Program precedence** — a placed child's `program_category_id`, otherwise the enrolment
  participation's `metadata.program_category_id`. The scheduling route already settled that
  precedence and named `process_instances.metadata.program_category_id` the canonical owner.
- **Label fallback** — `label || key`.

The acquisition therefore returns **rows with the columns those rules read**, and decides nothing.
That is the same transport/meaning boundary the account fact bundle already holds: the function
returns rows; `direction = inbound`, `refunds_payment_id IS NULL` and `status <> voided` stayed
with their application authorities there, and `is_active`, `end_date`, `status`, `role_type` and
the placement statuses stay with theirs here.

## Why one acquisition is the right shape

The measurement is unambiguous that the cost is **round-trip count, not rows**: twelve households,
seven placements, and a mean 113 ms per wave. Ten fact sets keyed by one org and one household
list have no dependency on each other that the database cannot resolve internally — waves 2 to 6
exist only because each read needs ids the previous read returned, and the database already holds
those ids.
