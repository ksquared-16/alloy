#!/usr/bin/env bash
# Trust database certification — the canonical chain.
#
# One command, run identically on a developer machine and in CI, so the two
# cannot drift into certifying different things. Composes the Trust DB suites
# that already exist rather than restating their assertions: each suite still
# owns its own migrations, fixture and invariants, and this script owns only the
# question "did all of them actually run and pass".
#
# Why this exists. Through Phase 2.5 the Trust DB suites were run on a developer
# machine and quoted in PR descriptions. No repository-owned CI job executed
# them. The `Supabase Preview` check is an external, unconfigured integration
# that reported `cancelled` on the one PR that carried a migration, so it was
# never a dependable gate — and a gate nobody owns is not a gate.
#
# Bounded by design. Each composed suite applies the migrations ITS invariants
# need, against a disposable Postgres container. The full 307-migration replay
# (`trust-runtime-v1/run-fullchain.sh`) is deliberately NOT part of this chain:
# it answers a different question — whole-repository migration health — and its
# cost would make this job too slow to run on every pull request, which is
# precisely what lets it be a required check.
#
# Isolation. Every suite provisions and removes its own container on a distinct
# port. Nothing here touches the shared developer Supabase stack; `supabase
# start` is never invoked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ordered oldest-first, so a failure reads as "the foundation broke" rather than
# "something later broke for an unrelated reason".
SUITES=(
    "certification/trust-runtime-v1/run.sh"
    "certification/trust-lifecycle-observations/run.sh"
    "certification/trust-metrics/run.sh"
    "certification/trust-provider-telemetry/run.sh"
    # D-76. The only suite here that migrates over EXISTING data. Every other
    # one provisions an empty database, which is exactly the condition under
    # which the BP lineage backfill's collision with the immutability trigger
    # is invisible. It seeds the live tenant's shape first, then migrates.
    "certification/bp-revision-lineage-upgrade/run.sh"
    # D-94 session-pinned participant Form versions. Replays the real Forms migrations,
    # then the D-94 migration, and asserts the eight transaction-stability properties —
    # including the two immutability refusals, which are trigger-made claims and so are
    # only evidence when a real database refuses the write.
    "certification/enrollment-session-form-version/run.sh"
    # D-95 participant session -> Enrollment process_instance anchor. Proves tenant
    # integrity, immutability, cardinality and FK deletion semantics against a real
    # database, since every one of those is a trigger- or index-made claim.
    "certification/enrollment-process-instance-anchor/run.sh"
    # D-96 process-instance revision pin + D-97 published-revision self-containment.
    # Replays the whole Business Process publication chain and publishes through the REAL
    # publish/rollback RPCs, because the claims are about what publishing does. Every pin
    # invariant is trigger-, index- or FK-made, so each is proven by a write the database
    # accepts or refuses.
    "certification/process-instance-revision-pin/run.sh"
    # Placement/Waitlist invariants. The database is the ONLY enforcement of candidate
    # uniqueness, one-active-pin, cross-tenant refusal and the person_id back-fill the
    # application depends on — and an audit of the whole test tree found zero references to
    # any of those objects by name. Every assertion here is a write a real database accepts
    # or refuses; none of them restates a constraint in test-only logic.
    "certification/placement-invariants/run.sh"
)

if ! command -v docker >/dev/null 2>&1; then
    echo "FAIL: docker is required for Trust DB certification and was not found." >&2
    exit 1
fi

total_pass=0
failed=()

for suite in "${SUITES[@]}"; do
    echo ""
    echo "═══ $suite ═══"
    log="$(mktemp)"

    # `set -e` is disabled around the suite ONLY so its failure can be reported
    # with the others rather than aborting the run. The exit status is captured
    # and honoured below — this is not `|| true`, and a failing suite still
    # fails this script.
    set +e
    bash "$ROOT/$suite" >"$log" 2>&1
    status=$?
    set -e

    # Count the assertions the suite itself reported passing. A suite that exits
    # 0 without executing assertions is treated as a failure: a green job has to
    # mean work happened, not merely that nothing threw.
    passed="$(grep -cE '^psql.*NOTICE:.*[[:space:]]PASS' "$log" || true)"
    total_pass=$((total_pass + passed))

    if [[ $status -ne 0 ]]; then
        echo "--- FAILED (exit $status) ---"
        tail -40 "$log"
        failed+=("$suite")
    elif [[ "$passed" -eq 0 ]]; then
        echo "--- FAILED: exited 0 but reported no assertions ---"
        tail -40 "$log"
        failed+=("$suite (no assertions executed)")
    else
        echo "PASS — $passed assertions"
    fi
    rm -f "$log"
done

echo ""
echo "═══════════════════════════════════════════"
echo "Trust DB certification: $total_pass assertions across ${#SUITES[@]} suites"

if [[ ${#failed[@]} -gt 0 ]]; then
    echo "FAILED SUITES:"
    for f in "${failed[@]}"; do echo "  - $f"; done
    exit 1
fi

echo "ALL TRUST DB CERTIFICATION SUITES PASSED"
