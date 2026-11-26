# Migration timestamp collision repair — 20260630 / 20260707

**Status:** Applied locally (July 2026).

## Collisions resolved

| Original version | Retained file | Renamed file |
|------------------|---------------|--------------|
| `20260630120000` | `20260630120000_financial_substrate_generalization_p3_1.sql` (added 2026-06-28) | `20260630120100_commercial_tuition_rates.sql` (added 2026-06-30) |
| `20260707120000` | `20260707120000_operational_consumption_schedule_slice2.sql` (added 2026-06-29) | `20260707120100_header_metric_definitions_activation.sql` (added 2026-06-30) |

File contents unchanged. Renamed files are idempotent (`CREATE TABLE IF NOT EXISTS`, etc.).

## Shared environment ledger

For environments where renamed migration SQL already ran under the old version, mark the new versions applied without re-running:

```bash
supabase migration repair --status applied 20260630120100
supabase migration repair --status applied 20260707120100
```

## Validation

`ls supabase/migrations | sed 's/_.*//' | sort | uniq -d` returns no output.
