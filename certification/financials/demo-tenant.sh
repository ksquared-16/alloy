#!/usr/bin/env bash
# =============================================================================
# THE ONE PLACE THE REPRESENTATIVE FINANCIAL TENANT IS BUILT.
#
# ── THE LIFECYCLE DEFECT THIS FIXES ──
#
# `financials-workspace.cert.sh` opens by deleting every enrolment- and customer-sourced charge and
# payment in the org. That teardown is CORRECT: the Thread 1/4/7 invariant proofs need a clean
# slate, and a cohort assertion against leftovers proves nothing. But it also meant the tenant a
# human opened afterwards had no money in it at all — which is why the Financials screenshots show
# an empty product built on sections that render lists perfectly well. The workspace was never
# broken; the tenant was empty by design and nobody put anything back.
#
# So the ordering is the fix, and it is deliberate:
#
#   teardown (invariant proofs get their clean slate)
#     -> structural demo subjects        (financials-demo-tenant.sql)
#     -> canonical money seed            (demoTenantMoney.seed.test.ts, through the real services)
#     -> verification through RESOLVERS  (not row counts)
#     -> mounted certification
#
# and the certification LEAVES the tenant demo-ready rather than empty, so the next person to open
# Financials — operator, Director, or screenshot — sees the product rather than its skeleton.
#
# ── ONE SEAM, NOT TWO SEED SYSTEMS ──
#
# This script is the only orchestration. `financials-workspace.cert.sh` calls it; it can also be run
# alone to restore a demo-ready tenant without certifying anything:
#
#   certification/financials/demo-tenant.sh
#
# It is repeatable and deterministic: the SQL fixture tears its own rows down innermost-first before
# declaring them, and the money seed rebuilds on top, so running this twice leaves exactly one
# representative tenant rather than two overlapping ones.
#
# ── IT FAILS LOUDLY ──
#
# A seed that half-succeeds produces the empty workspace this whole pass exists to remove, and it
# does it silently. Every step is checked, and the money seed's own assertions run through
# `resolveFinancialPositionCohort` — so "populated" means the resolver the Overview renders says so,
# not that some rows exist.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"

green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
die()   { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# The database client lives in the database — this host has no `psql`. Same seam
# `alloy-certify` and the workspace harness use; see their notes for why.
cert_db_container() { printf 'supabase_db_%s\n' "$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$CERT_DIR/supabase/config.toml" 2>/dev/null | head -1)"; }
cert_db_url_incontainer() { printf '%s\n' "$1" | sed -E 's#^(postgresql://[^@]+@)[^/]+(/.*)$#\1127.0.0.1:5432\2#'; }
pg() {
  if command -v psql >/dev/null 2>&1; then psql "$DB" "$@"; return $?; fi
  docker exec -i "$(cert_db_container)" psql "$(cert_db_url_incontainer "$DB")" "$@"
}

seed_demo_tenant() {
  echo "── installing the representative demo subjects (households, children, agreements, agency)"
  pg -v ON_ERROR_STOP=1 -q -f - < "$CERT_DIR/fixtures/financials-demo-tenant.sql" \
    || die "structural demo fixture failed"
  green "four households across two campuses, a funding agency and an authorization"

  # THROUGH THE CANONICAL SERVICES. A direct INSERT here would seed money the product could never
  # have produced — no posting rules, no journal attribution, no allocation limits — and then
  # certify against it.
  echo "── seeding the money through the canonical services (draft → post → receive → apply)"
  #
  # The exit code is captured from vitest ITSELF, not from a pipeline. Writing to a log and reading
  # `$?` is deliberate: `vitest … | tail` reports tail's status, which is 0 whatever vitest did, and
  # a seed whose failure reads as success is precisely how an empty tenant reaches a certification.
  local seedlog; seedlog="$(mktemp -t alloy-demo-seed)"
  ( cd "$ROOT/web" && CERT_SEED_DEMO=1 ./node_modules/.bin/vitest run \
      tests/financials/live/demoTenantMoney.seed.test.ts >"$seedlog" 2>&1 )
  local seeded=$?
  grep -E "Test Files|Tests " "$seedlog" | tail -2
  if [ "$seeded" -ne 0 ]; then
      tail -30 "$seedlog"
      rm -f "$seedlog"
      die "canonical money seed FAILED — refusing to certify an empty tenant"
  fi
  # A tally must actually have been printed. A run that dies before reporting is not a pass.
  grep -qE "Tests +[0-9]+ passed" "$seedlog" || { tail -20 "$seedlog"; rm -f "$seedlog"; die "money seed produced no tally"; }
  rm -f "$seedlog"
  green "money seeded and verified through resolveFinancialPositionCohort"
}

# Run standalone when invoked directly; when sourced, the caller decides when to seed.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  seed_demo_tenant
  echo
  green "the certification tenant is demo-ready"
fi
