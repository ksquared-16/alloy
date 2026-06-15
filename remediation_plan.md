# Remediation Plan

_Generated: 2026-06-14. Scope: migration correctness only — no runtime/POS/Comms behavior changes._

## Priority 0 — Blockers for clean replay

### P0.1 Add placement foundation migration (before `20260605100000`)

Create a new migration (suggested timestamp before waitlist indexes) that adds:

- `placement_candidates`
- `placement_link_groups`
- `placement_link_group_members`
- `placement_overrides`
- `validate_placement_candidates_consistency()` + triggers
- RLS policies matching staging CSV
- Indexes from `supabase_indexes.csv` (except those added later)

**Source of truth:** reconstruct DDL from `docs/supabase/reference/*.csv` and `docs/schema/schema-*.md`, or `pg_dump --schema-only` from staging.

### P0.2 Convert org hard-failures to skip pattern

Replace `RAISE EXCEPTION` org guards in:

| File | Pattern to apply |
|------|------------------|
| `20260402143000_public_booking_field_config_seed.sql` | `RAISE NOTICE '… skipped — org not found'`; wrap body in `IF EXISTS` |
| `20260423143000_opportunity_identity_seed_childcare_org.sql` | same |

Reference implementations: `20260506120000_forms_medication_authorization_demo_seed.sql`, `20260602150000_demo_kurzman_cleanup_person_gender_options.sql`.

### P0.4 Fix migration ordering (pre-baseline / pre-CREATE)

| Issue | Fix |
|-------|-----|
| `20260328120000_firstfree4x120_discount_program` updates `discount_programs` before `20260329165048_remote_schema` creates it | Move migration after baseline, or merge into baseline seed data |
| `20260403120000_quote_intake_option_sets_specialty_opportunity` inserts into `option_sets` before `20260404130000` creates tables | Reorder timestamps or fold option_sets DDL into earlier migration |

### P0.3 Validate clean replay

```bash
# Prerequisites: Docker, Supabase CLI
cd /path/to/Alloy
supabase start
supabase db reset   # must exit 0, no manual SQL

cd web
npm ci
npx tsc --noEmit
npm run build

# Schema verification (after reset, against local DB)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  npm run export:supabase-schema

# Diff reference export vs staging snapshot (tables, functions, indexes)
node scripts/supabase/audit_migrations.mjs --write-docs
```

## Priority 1 — Staging parity

### P1.1 Close remaining object gaps

Re-run audit until these counts are zero for required objects:

- Tables: 4 missing
- Functions: 4 missing (includes trigger helpers, extensions)
- Indexes: 604 missing

Triage each missing function: many may be `remote_schema` baseline vs later `CREATE OR REPLACE` — confirm with live `db reset` + `pg_dump`.

### P1.2 Repair migrations — keep or fold

| Migration | Action |
|-----------|--------|
| `20260430215000_repair_action_registry_foundation.sql` | Keep until root `20260427180000` ordering proven on clean replay; then consider folding into original |
| `20260611120000_childcare_field_catalog_e1_repair.sql` | Data-only; OK on empty DB (no-op) |
| `20260612120000_enrollment_process_status_vocabulary_repair.sql` | Requires enrollment department rows; document bootstrap dependency |
| `20260613120000_status_settings_category_repair.sql` | Data-only; OK on empty DB (no-op) |
| `20260614120000_enrollment_field_catalog_e3_repair.sql` | Data-only; OK on empty DB (no-op) |

### P1.3 Duplicate timestamp hygiene

Git shows renames: `20260603120000` → `20260603120000_…` deleted, `20260603120001` added; `20260610140000` → `20260610140001`. Ensure **no** duplicate version entries in `supabase_migrations.schema_migrations` on staging.

## Priority 2 — CI gate (recommended)

Add GitHub Actions job `migration-replay`:

```yaml
name: migration-replay
on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'supabase/config.toml'
jobs:
  replay:
    runs-on: ubuntu-latest
    services:
      # Or: supabase/setup-cli + supabase start
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start -x studio,imgproxy,logflare
      - run: supabase db reset
      - run: cd web && npm ci && npx tsc --noEmit
      - run: node scripts/supabase/audit_migrations.mjs
      - name: Assert no missing required tables
        run: |
          node -e "
          const r = require('fs').readFileSync('docs/audits/migration-reliability/audit-summary.json','utf8');
          const j = JSON.parse(r);
          const blockers = ['placement_candidates','placement_link_groups','placement_link_group_members','placement_overrides'];
          const miss = j.missingTables.filter(t => blockers.includes(t));
          if (miss.length) { console.error('Missing blockers:', miss); process.exit(1); }
          "
```

**Gate policy:** fail PR if `supabase db reset` fails OR audit reports missing tables referenced by `web/` runtime.

## Priority 3 — Documentation

- Add `docs/platform/governance/local-database-bootstrap.md` with the validation procedure above.
- Regenerate `docs/supabase/reference/*.csv` after P0.1 lands.
- Link this audit from `docs/README.md`.

## Out of scope (per sprint charter)

- Application runtime behavior
- POS
- Communications feature work

## Suggested commit sequence

1. `fix(migrations): add placement foundation DDL from staging snapshot`
2. `fix(migrations): canonical org-missing skip for Bend seeds`
3. `chore(ci): migration replay gate on PR`
4. `docs: migration reliability audit deliverables`
