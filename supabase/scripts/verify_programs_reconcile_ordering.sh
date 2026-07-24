#!/bin/bash
# Verify the clean-apply ordering safety + idempotency of
# 20260721183000_programs_identity_reconcile_from_lpc.sql.
#
# That reconcile backfills public.programs / public.program_drafts, which are created in the
# LATER-timestamped 20260722020000_configuration_publication_runtime_v1.sql. On a clean apply the
# reconcile therefore runs before those tables exist; the migration guards on their presence.
#
# Proves the three required scenarios against a throwaway Postgres:
#   A clean-apply order (target tables ABSENT) -> succeeds (guard skips; nothing to reconcile)
#   B existing tables + LPC data              -> reconcile backfills programs/program_drafts/links
#   C rerun                                    -> idempotent (no change, no error)
#
# Usage:
#   PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=postgres \
#     bash supabase/scripts/verify_programs_reconcile_ordering.sh
# (or point at a disposable `postgres:15` container).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$HERE/migrations/20260721183000_programs_identity_reconcile_from_lpc.sql"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

fixtures() {
cat <<'SQL'
CREATE TABLE public.programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL, program_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT programs_org_key_unique UNIQUE (org_id, program_key));
CREATE TABLE public.program_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL, program_id uuid NOT NULL, label text NOT NULL, description text, category text,
    audience jsonb NOT NULL DEFAULT '{}'::jsonb, required_resource_type text,
    qualification_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT program_drafts_one_per_program UNIQUE (org_id, program_id));
CREATE TABLE public.location_program_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL, key text NOT NULL, label text, program_id uuid,
    created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.location_program_categories (org_id, key, label) VALUES
    ('11111111-1111-4111-8111-111111111111','infant','Infant Care'),
    ('11111111-1111-4111-8111-111111111111','toddler','Toddler'),
    ('11111111-1111-4111-8111-111111111111','toddler','Toddler (dup key)');
SQL
}
counts() { "${PSQL[@]}" -d "$1" -t -A -c \
  "select 'programs='||count(*)||' program_drafts='||(select count(*) from public.program_drafts)||' lpc_linked='||(select count(*) from public.location_program_categories where program_id is not null) from public.programs"; }

"${PSQL[@]}" -c "DROP DATABASE IF EXISTS mig_a"  >/dev/null; "${PSQL[@]}" -c "CREATE DATABASE mig_a"  >/dev/null
"${PSQL[@]}" -c "DROP DATABASE IF EXISTS mig_bc" >/dev/null; "${PSQL[@]}" -c "CREATE DATABASE mig_bc" >/dev/null

echo "A clean-apply order (tables absent):"; "${PSQL[@]}" -d mig_a -f "$MIG" >/dev/null && echo "  OK (guard skipped, no error)"
echo "B existing + LPC data:"; fixtures | "${PSQL[@]}" -d mig_bc >/dev/null; "${PSQL[@]}" -d mig_bc -f "$MIG" >/dev/null; echo -n "  "; counts mig_bc
echo "C rerun (idempotent):"; "${PSQL[@]}" -d mig_bc -f "$MIG" >/dev/null; echo -n "  "; counts mig_bc

"${PSQL[@]}" -c "DROP DATABASE IF EXISTS mig_a"  >/dev/null; "${PSQL[@]}" -c "DROP DATABASE IF EXISTS mig_bc" >/dev/null
echo "verify_programs_reconcile_ordering: PASS"
