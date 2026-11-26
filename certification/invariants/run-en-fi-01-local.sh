#!/usr/bin/env bash
# EN-FI-01 database facts on the shared local stack (alloy-cert), rollback-only: the staging Documents chain is applied
# inside ONE transaction, the checks run, everything is rolled back. Usage (repository root):
#   certification/invariants/run-en-fi-01-local.sh
set -euo pipefail
M=supabase/migrations
{
  echo "BEGIN;"
  for v in 20261207181500 20261207181600 20261208090000 20261209090000 20261209090100 20261209090200 20261210093500 20261212090000; do
    echo "\\echo applying $v"
    cat "$M/${v}"_*.sql
  done
  cat certification/invariants/en-fi-01-medical-classification.sql
  echo "ROLLBACK;"
} | docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
