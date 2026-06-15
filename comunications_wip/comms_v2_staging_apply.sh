#!/usr/bin/env bash
# ============================================================================
# Communications V2 — STAGING-SAFE migration apply (project ikaxilmwmrmbagoidedu = staging)
# DRAFT runbook — review before running. Applies ONLY the 4 additive comms_v2
# migrations, and ONLY the ones not already present. No destructive operations.
#
# Why "only if missing": tables/columns are guarded (IF NOT EXISTS), but the
# CREATE POLICY statements are NOT — re-running an already-applied migration
# would error on "policy already exists". So we probe an anchor table per
# migration and skip the ones that already exist.
#
# DO NOT run against production. This is for staging only.
# Use the staging DIRECT connection (port 5432), with the freshly ROTATED
# password — not the transaction pooler (6543), which can't run DDL reliably.
# ============================================================================
set -euo pipefail

# Staging direct connection string (rotated password). Export before running, e.g.:
#   export PGURL='postgresql://postgres:<NEW_PASSWORD>@db.ikaxilmwmrmbagoidedu.supabase.co:5432/postgres'
: "${PGURL:?Set PGURL to the STAGING direct connection string (rotated password) before running}"

# Safety assertion: refuse to run unless the host clearly belongs to the staging project ref.
case "$PGURL" in
  *ikaxilmwmrmbagoidedu*) : ;;
  *) echo "REFUSING: PGURL does not contain the staging project ref 'ikaxilmwmrmbagoidedu'."; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIG_DIR="${REPO_ROOT}/supabase/migrations"

run_if_missing () {
  local anchor="$1" file="$2" label="$3"
  local present
  present="$(psql "$PGURL" -tAc "select (to_regclass('public.${anchor}') is not null);")"
  if [ "$present" = "t" ]; then
    echo "SKIP   ${label}  (public.${anchor} already exists)"
  else
    echo "APPLY  ${label}"
    # -1 wraps the file in a single transaction; ON_ERROR_STOP aborts cleanly on any error.
    psql "$PGURL" -v ON_ERROR_STOP=1 -1 -f "${MIG_DIR}/${file}"
    echo "DONE   ${label}"
  fi
}

echo "== Pre-flight (read-only): current presence =="
for a in conversation_assignment_events communication_delivery_events communication_preferences communication_templates; do
  printf "  %-32s %s\n" "$a" "$(psql "$PGURL" -tAc "select (to_regclass('public.$a') is not null);")"
done
echo

echo "== Applying only-if-missing =="
run_if_missing conversation_assignment_events 20260611120000_comms_v2_conversation_core.sql          "M1 conversation_core"
run_if_missing communication_delivery_events  20260611130000_comms_v2_delivery_events_receipts.sql   "M2 delivery_events_receipts"
run_if_missing communication_preferences      20260611140000_comms_v2_preferences_recipients.sql     "M3 preferences_recipients"
run_if_missing communication_templates        20260611150000_comms_v2_templates_announcements.sql    "M4 templates_announcements"
echo

echo "== Post-check: required columns the conversations route reads =="
psql "$PGURL" -tAc "select string_agg(column_name, ', ' order by column_name)
  from information_schema.columns
  where table_name='communication_threads'
    and column_name in ('attention_state','assignment_state','assigned_user_id','sla_state');"
echo "(expect: assigned_user_id, assignment_state, attention_state, sla_state)"
echo
echo "OPTIONAL — record these 4 in the remote migration history so a future"
echo "'supabase db push' won't retry them (and error on policies):"
echo "  supabase migration repair --status applied 20260611120000 20260611130000 20260611140000 20260611150000 --linked"
echo
echo "Next: run comms_v2_qa_seed.sql, then QA UI-2, then comms_v2_qa_cleanup.sql."
