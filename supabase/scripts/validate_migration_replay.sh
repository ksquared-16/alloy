#!/usr/bin/env bash
# Repeatable local validation: clean Supabase replay + app build + schema audit.
# Usage (from repo root):
#   ./supabase/scripts/validate_migration_replay.sh
#
# Prerequisites: Docker running, Supabase CLI installed, Node 20+.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> supabase start"
supabase start

echo "==> supabase db reset"
supabase db reset

echo "==> web TypeScript check"
(cd web && npm ci && npx tsc --noEmit)

echo "==> web production build"
(cd web && npm run build)

echo "==> migration static audit"
node scripts/supabase/audit_migrations.mjs --write-docs

if [[ -f docs/audits/migration-reliability/audit-summary.json ]]; then
  node -e "
    const j = require('./docs/audits/migration-reliability/audit-summary.json');
    const blockers = [
      'placement_candidates',
      'placement_link_groups',
      'placement_link_group_members',
      'placement_overrides',
    ];
    const miss = (j.missingTables || []).filter((t) => blockers.includes(t));
    if (miss.length) {
      console.error('FAIL: staging tables still missing from migrations:', miss.join(', '));
      process.exit(1);
    }
    if ((j.realViolations || []).length) {
      console.error('FAIL: ordering blockers remain:', JSON.stringify(j.realViolations, null, 2));
      process.exit(1);
    }
    console.log('OK: no known migration blockers in audit summary');
  "
fi

echo "==> optional: export local schema (set DATABASE_URL if not using default local)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
fi
if npm run export:supabase-schema 2>/dev/null; then
  echo "Schema reference CSVs exported from local replay DB"
else
  echo "WARN: export:supabase-schema skipped or failed (check DATABASE_URL)"
fi

echo "Done: migration replay validation complete"
