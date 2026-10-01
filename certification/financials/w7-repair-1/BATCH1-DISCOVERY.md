# W7 Repair Batch 1 — measured discovery (§7, §8, §10, §11)

Two read-only censuses of `alloy_deployed_primary`:
`gar_bca766cd079e8b` → `tha_…` (schema + population) and `gar_fcef701a4e7f5d` → `tha_19368b870904f7`
(origin evidence). Schema and runtime evidence win; nothing below is inferred from a label.

---

## Two corrections to what I previously reported

I told you earlier that of the origin columns you named, "only `job_id` and `source_charge_id` exist
on `charges`; there is no `schedule_id` or `subscription_id`." **That was wrong.** Both exist. What
is absent is `enrollment_agreement_id` and `template_id` (the column is `charge_template_id`).

I also said the Due field was hardcoded over a resolver that "returns no due date at all." The
resolver half is right for the *preview*; the stored half is not — **`charges.due_date` exists and
is populated on 37 of 125 rows.**

---

## §10 · What `charges` actually stores

Present: `org_id, amount_cents, currency_code, status, charge_type, charge_category,
billable_source_type, billable_source_id, charge_template_id, service_date, occurs_on, billable_on,
due_date, created_at, created_by, updated_at, updated_by, posted_at, posted_by, job_id,
source_charge_id, schedule_id, subscription_id, metadata`.

Absent: `enrollment_agreement_id`, `template_id`.

Related tables — present: `financial_responsibility_arrangements`,
`financial_responsibility_allocations`, `financial_reduction_applications`,
`financial_journal_entries`, `ledger_transactions`.
**Absent**: `financial_reductions`, `charge_discount_applications`, `charge_templates`.

### Existing ≠ populated

| column | set on |
|---|---|
| `service_date` | 125 / 125 |
| `posted_at` | 90 |
| `charge_template_id`, `occurs_on`, `billable_on` | 65 |
| `due_date` | 37 |
| `source_charge_id` | 9 |
| **`job_id`** | **0** |
| **`schedule_id`** | **0** |
| **`subscription_id`** | **0** |

The three columns that would name a scheduled/automated origin are **written by nothing**. They
exist and are universally null.

---

## §11 · What Details may truthfully say about origin

The only origin evidence that carries anything is `metadata->>'source'`, with four values:

| `source` | charges | `created_by` set | `created_by` null |
|---|---|---|---|
| `charge_template` | 65 | 47 | **18** |
| `manual_reduction` | 44 | 44 | 0 |
| `financial_reduction` | 7 | 7 | 0 |
| *(null)* | 9 | 9 | 0 |

Every one of the 18 charges with no human actor is `source = charge_template`, carries a
`charge_template_id`, and has `lifecycle_status` of `scheduled` (6) or `draft` (12) — with no
`job_id`, no `schedule_id`, no `subscription_id`, no `source_charge_id`.

**A · What Details can say today.** For a `created_by`-null charge, stored evidence supports exactly
*"raised from a charge template"*, and which template. It does **not** support "Scheduled Billing",
"Import", or any named job — there is no column holding that, and the three that would are empty.
Turning `created_by = null` into a named origin would be invention.

**B · The model boundary.** Distinguishing Scheduled Billing vs Enrollment vs Import *does* require
new persisted provenance. The smallest general extension is not a new column — `schedule_id`,
`subscription_id` and `job_id` are already there — it is **a writer for them**. Reported as canonical
capability debt; not implemented in this batch.

---

## §8 · Due — the surface is wrong in both directions

`Due — Configured policy` is hardcoded in `adaptAddChargeSpecimen` on a field the type documents as
`charges.due_date`. Measured:

- **37 rows carry a real `due_date`** — 33 of them *after* `billable_on`, 2 equal to it. So a due
  date is genuinely resolved, with real policy variation, and the card hides it.
- **88 rows have none** (30 of those have `billable_on`). On those the card implies a configured
  policy that produced nothing.

A canonical resolver does exist for a *written* charge: the persisted column. What does not exist is
a **preview-time** due-date resolver — the Add command's preview returns `Occurs` and `Billable` and
no due date. So the honest surface states the resolved date where the charge has one, and says
plainly that none is resolved where it has none. No second due-date engine; no invented date.

---

## §7 · Billing period — there is no stored interval

No column on `charges` matches period / interval / cycle / `_start` / `_end`. The row carries only
`service_date`, `occurs_on`, `billable_on`, `due_date`. Any interval must therefore be **derived**
from `billable_on` by the canonical `billingPeriodFor`, and where it cannot be derived the honest
answer is that the period is unknown — not a single date wearing a period's label.

Note `occurs_on` / `billable_on` are set on only 65 of 125 rows (the `charge_template`-sourced
ones), so "unknown" is a real and common state, not a corner case.
