# Commercial Configuration — Architecture

## Ownership boundaries

```
Programs domain
├── Programs          (location_program_categories)
└── Program Offerings (program_offerings)       ← Programs owns what is sold

Commercial domain
├── Billing Cadences  (commercial_billing_cadence option set)
├── Tuition Rates     (commercial_tuition_rates)
└── [future] Revenue Mapping (reference only — Accounting owns GL codes)

Billing Engine domain (separate, not in this sprint)
└── Rate Plans + Rules (childcare_rate_plans, childcare_rate_rules)

Accounting domain (separate)
└── GL mappings, revenue categories
```

**Rule**: Commercial never owns what is being sold. Programs defines offerings; Commercial prices them.

## Data model

### Billing Cadences (`commercial_billing_cadence` option set)

Commercial-domain option set. Items are operator-editable (rename, reorder, add custom). System defaults seeded at org creation:

| item_key | label |
|---|---|
| weekly | Weekly |
| biweekly | Bi-weekly |
| monthly | Monthly |
| annual | Annual |
| daily | Daily |
| hourly | Hourly |
| per_session | Per Session |

### Tuition Rates (`commercial_tuition_rates`)

Rate grid: **offering × cadence → rate**, per org or per site.

| Column | Description |
|---|---|
| `offering_id` | FK to program_offerings |
| `cadence_key` | item_key from commercial_billing_cadence |
| `payer_type` | private_pay \| subsidy \| corporate (V1: private_pay only) |
| `rate_cents` | Integer cents |
| `not_offered` | True = explicitly not available at this scope |
| `location_id` | NULL = org default; non-null = location override |

### Inheritance model

```
Org default (location_id = NULL)
    → inherited by all sites unless overridden

Location override (location_id = site UUID)
    → wins over org default for that cell

not_offered = true
    → explicit "not available here", distinct from "no rate set"
```

## UI: CommercialConfigWorkspace

Layout: `ConfigurationShell` with program queue column + detail workspace.

### Programs tab (per selected program)

- **Location availability**: which sites offer this program (toggle per site)
- **Offerings builder**: add/manage program offerings (attendance type + quantity)
- **Rooms note**: rooms are managed in Locations, not here

### Tuition tab (per selected program)

- **Scope selector**: pill row — "Org defaults" + one pill per site location
- **Payer tabs**: Private pay (active), Subsidy (coming), Corporate (coming)
- **Rate grid**: offerings as rows × billing cadences as columns
- **Cell editing**: click to edit inline, ⊘ to mark not offered
- **Revenue mapping**: reference card linking to Accounting

### What operators see

Operators see business language only:
- Offering labels ("Full Time – 5 days", "Part Time – 3 days")
- Cadence labels ("Monthly", "Weekly")
- No internal keys, no UUIDs, no database column names

## Local QA setup

After pulling the branch, apply migrations and reload the PostgREST schema cache:

```bash
# From project root
npx supabase db push

# Reload schema cache (PostgREST won't see new tables without this)
npx supabase stop && npx supabase start
```

Verify with:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('program_offerings', 'commercial_tuition_rates')
ORDER BY 1;

-- Check billing cadences seeded
SELECT item_key, label FROM option_set_items osi
JOIN option_sets os ON os.id = osi.option_set_id
WHERE os.set_key = 'commercial_billing_cadence'
ORDER BY sort_order;

-- Check tuition_rates has new columns
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commercial_tuition_rates'
ORDER BY ordinal_position;
```

Expected: `program_offerings` and `commercial_tuition_rates` both present; tuition rates columns include `offering_id`, `cadence_key`, `payer_type` (no `program_key`, `schedule_key`, `billing_period`); 7 billing cadence items seeded per org.
