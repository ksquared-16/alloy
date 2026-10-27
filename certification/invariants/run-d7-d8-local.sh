#!/usr/bin/env bash
# Documents D7 + D8 invariants on the shared local stack (alloy-cert), rollback-only: the Documents chain D2 → D8 is
# applied inside ONE transaction (D7 and D8 twice each, to prove they re-run), both invariant files run, and everything
# is rolled back. Nothing on the shared stack changes. Usage (from the repository root):
#   certification/invariants/run-d7-d8-local.sh
set -euo pipefail
M=supabase/migrations
{
  echo "BEGIN;"
  for v in 20261208090000 20261209090000 20261209090100 20261209090200 20261210093500 20261212090000 20261213090000 20261213090000 20261214090000 20261214090000; do
    echo "\\echo applying $v"
    cat "$M/${v}"_*.sql
  done
  cat certification/invariants/documents-d7-review-validity.sql
  cat certification/invariants/documents-d8-forms-evidence.sql
  echo "ROLLBACK;"
} | docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
