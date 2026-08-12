#!/usr/bin/env bash
# Employment / Add Staff — source-level NEGATIVE CONTROLS.
#
# The vitest suites in tests/employment are only evidence if they would fail
# when the control they claim to prove is removed. This script removes each
# control, asserts the suite goes RED, and restores the file with git checkout.
#
#   bash web/scripts/qa/employmentNegativeControls.sh
#
# NC3 — disable duplicate resolution: the identity gate stops forcing operator
#       choice, so Add Staff silently creates a second Jane Wilson.
# NC4 — let employment grant access: addStaff also writes a user_roles row.
#
# Companion database controls (eligibility revert, org-scope bypass) live in
# supabase/tests/employment/employment_negative_controls.sql.

set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1   # web/

GATE="lib/staff/resolveStaffPersonCandidates.ts"
SERVICE="lib/staff/addStaffService.ts"
SUFFICIENCY="lib/scheduling/supply/staffingSufficiency.ts"
ROSTER="lib/scheduling/roster/buildAssignmentRosterReadModel.ts"
SUITE="tests/employment/addStaffIdentity.test.ts"
SUPPLY_SUITE="tests/employment/staffSupplyProjection.test.ts"

restore() {
    git checkout -- "$GATE" "$SERVICE" "$SUFFICIENCY" "$ROSTER" 2>/dev/null || true
}
trap restore EXIT

run_suite() {
    npx vitest run "$SUITE" >/tmp/employment-nc.log 2>&1
    return $?
}

run_supply_suite() {
    npx vitest run "$SUPPLY_SUITE" >/tmp/employment-nc.log 2>&1
    return $?
}

echo "baseline: the suite must be GREEN before any control is removed"
if ! run_suite; then
    echo "FAIL  baseline is already red — fix that before trusting a negative control"
    tail -30 /tmp/employment-nc.log
    exit 1
fi
echo "PASS  baseline green"

# ---------------------------------------------------------------------------
# NC3 — disable duplicate resolution
# ---------------------------------------------------------------------------
echo
echo "NC3: disabling duplicate resolution (gate always reports no_match)"
perl -0pi -e 's/    if \(matches\.length === 0\) return \{ decision: "no_match", candidates: \[\] \};/    if (true) return { decision: "no_match", candidates: [] }; \/\/ NEGATIVE CONTROL/' "$GATE"
if grep -q "NEGATIVE CONTROL" "$GATE"; then
    if run_suite; then
        echo "FAIL  NC3 — the suite stayed GREEN with duplicate resolution disabled."
        echo "      The identity certification is vacuous."
        exit 1
    fi
    echo "PASS  NC3 — suite went RED, so duplicate protection is load-bearing"
    grep -E "duplicate protection|existing parent|✕|×" /tmp/employment-nc.log | head -8
else
    echo "FAIL  NC3 could not be applied — the gate source has drifted; update this script"
    exit 1
fi
restore

# ---------------------------------------------------------------------------
# NC4 — let employment grant access
# ---------------------------------------------------------------------------
echo
echo "NC4: letting employment grant access (addStaff writes user_roles)"
perl -0pi -e 's/    const employment = await createEmployment\(supabase, \{/    await supabase.from("user_roles").insert({ user_id: personId, org_id: orgId, role: "ops" }); \/\/ NEGATIVE CONTROL\n    const employment = await createEmployment(supabase, {/' "$SERVICE"
if grep -q "NEGATIVE CONTROL" "$SERVICE"; then
    if run_suite; then
        echo "FAIL  NC4 — the suite stayed GREEN while employment granted a role."
        echo "      The access-separation certification is vacuous."
        exit 1
    fi
    echo "PASS  NC4 — suite went RED, so access separation is load-bearing"
    grep -E "access separation|✕|×" /tmp/employment-nc.log | head -8
else
    echo "FAIL  NC4 could not be applied — the service source has drifted; update this script"
    exit 1
fi
restore

# ---------------------------------------------------------------------------
# NC5 — restore hardcoded staffing readiness
# ---------------------------------------------------------------------------
echo
echo "NC5: hardcoding staffing readiness (the old staffReady: true)"
perl -0pi -e 's/    return scheduledStaffCount >= requiredStaff \? "sufficient" : "short";/    return "sufficient"; \/\/ NEGATIVE CONTROL — the old hardcoded staffReady/' "$SUFFICIENCY"
if grep -q "NEGATIVE CONTROL" "$SUFFICIENCY"; then
    if run_supply_suite; then
        echo "FAIL  NC5 — the suite stayed GREEN with readiness hardcoded."
        echo "      An understaffed room would render as staffed."
        exit 1
    fi
    echo "PASS  NC5 — suite went RED, so staffing readiness is derived, not asserted"
    grep -E "short|sufficiency|✕|×" /tmp/employment-nc.log | head -6
else
    echo "FAIL  NC5 could not be applied — sufficiency source has drifted; update this script"
    exit 1
fi
restore

# ---------------------------------------------------------------------------
# NC6 — reinstate the staff-dropping roster bug
# ---------------------------------------------------------------------------
echo
echo "NC6: reinstating the customer_member_id guard that dropped every staff row"
perl -0pi -e 's/        const subjectType = row\.subject_type === "staff" \? "staff" : "child";/        const subjectType = row.subject_type === "staff" ? "staff" : "child";\n        if (!row.customer_member_id) continue; \/\/ NEGATIVE CONTROL — the Phase 0 bug/' "$ROSTER"
if grep -q "NEGATIVE CONTROL" "$ROSTER"; then
    if run_supply_suite; then
        echo "FAIL  NC6 — the suite stayed GREEN while every staff row was dropped."
        echo "      The subject-aware projection certification is vacuous."
        exit 1
    fi
    echo "PASS  NC6 — suite went RED, so staff projection is genuinely covered"
    grep -E "staff|✕|×" /tmp/employment-nc.log | head -6
else
    echo "FAIL  NC6 could not be applied — roster source has drifted; update this script"
    exit 1
fi
restore

echo
echo "======================================================="
echo " source negative controls: all four proven load-bearing"
echo " (files restored via git checkout)"
echo "======================================================="
