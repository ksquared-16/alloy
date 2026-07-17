#!/usr/bin/env bash
# TM-1 Sprint Manifest — the toolkit knows what a sprint is without a prompt.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

TMP="$(mktemp -d /tmp/alloy-manifest.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

IO="${LOCAL_DEV}/lib/manifest-io.mjs"
M="$TMP/wt1-demo.json"

node "$IO" init "$M" "wt1-demo" 1 >/dev/null 2>&1 \
  && pass "manifest init" || fail "manifest init failed"

# ── Absence is a value ───────────────────────────────────────────────────────
[[ "$(node "$IO" get "$M" stage)" == "undeclared" ]] \
  && pass "an undeclared stage reads 'undeclared', not empty or assumed" \
  || fail "stage default is '$(node "$IO" get "$M" stage)'"

node "$IO" validate "$M" >/dev/null 2>&1 \
  && pass "a fully undeclared manifest is still schema-valid (absence != invalid)" \
  || fail "undeclared manifest failed validation"

node "$IO" gaps "$M" >/dev/null 2>&1 \
  && fail "gaps did not report undeclared fields" \
  || pass "gaps reports undeclared fields (silence is visible)"

# ── Enums are closed ─────────────────────────────────────────────────────────
node "$IO" set "$M" "stage=realisation" >/dev/null 2>&1 \
  && fail "an invalid stage was accepted" \
  || pass "an invalid stage is refused (closed set)"

node "$IO" set "$M" "posture.tenant_class=whatever" >/dev/null 2>&1 \
  && fail "an invalid tenant class was accepted" \
  || pass "an invalid tenant class is refused"

node "$IO" set "$M" "stage=realization" "role=worker" "lane=infrastructure" >/dev/null 2>&1 \
  && pass "valid declarations are accepted" || fail "valid declarations refused"

# ── Posture sets the certification ceiling, mechanically ─────────────────────
node "$IO" set "$M" "posture.mutation=shared-read-only" "posture.tenant_class=shared" >/dev/null 2>&1
[[ "$(node "$IO" get "$M" certification.ceiling)" == "4" ]] \
  && pass "a shared tenant caps certification at L4 (cannot certify execution)" \
  || fail "shared tenant ceiling is '$(node "$IO" get "$M" certification.ceiling)'"

node "$IO" set "$M" "posture.mutation=isolated-mutable" "posture.tenant_class=disposable" >/dev/null 2>&1
[[ "$(node "$IO" get "$M" certification.ceiling)" == "5" ]] \
  && pass "a disposable tenant is L5-eligible" \
  || fail "disposable ceiling is '$(node "$IO" get "$M" certification.ceiling)'"

# The ceiling is derived, never asserted by a caller.
node "$IO" set "$M" "posture.tenant_class=shared" "certification.ceiling=5" >/dev/null 2>&1
[[ "$(node "$IO" get "$M" certification.ceiling)" == "4" ]] \
  && pass "a caller cannot assert a ceiling its posture does not allow" \
  || fail "caller-asserted ceiling survived: $(node "$IO" get "$M" certification.ceiling)"

# ── Inconsistent posture is caught ───────────────────────────────────────────
node "$IO" set "$M" "posture.mutation=isolated-mutable" "posture.tenant_class=shared" >/dev/null 2>&1
# Capture, then match. `gaps` exits 1 by design when gaps exist, and pipefail
# propagates that through a pipe -- masking a successful grep.
gaps="$(node "$IO" gaps "$M" 2>/dev/null)"
if [[ "$gaps" == *"isolated-mutable cannot target a shared tenant"* ]]; then
  pass "inconsistent posture is reported"
else
  fail "inconsistent posture not reported: $gaps"
fi

# ── The move that pays for the sprint ────────────────────────────────────────
# A certification sprint whose plan exceeds its posture is caught at bootstrap,
# not nine deliverables later.
node "$IO" set "$M" "stage=certification" "role=certifier" \
  "posture.mutation=shared-read-only" "posture.tenant_class=shared" \
  "certification.required=5" >/dev/null 2>&1
gaps="$(node "$IO" gaps "$M" 2>/dev/null)"
if [[ "$gaps" == *"intends level 5 but posture allows at most 4"* ]]; then
  pass "a certification sprint on a shared tenant cannot claim execution — caught at bootstrap"
else
  fail "certification-vs-posture check did not fire: $gaps"
fi

node "$IO" set "$M" "posture.mutation=isolated-mutable" "posture.tenant_class=disposable" >/dev/null 2>&1
gaps="$(node "$IO" gaps "$M" 2>/dev/null)"
[[ "$gaps" != *"intends level 5"* ]] \
  && pass "the same plan is allowed once posture can execute it" \
  || fail "disposable tenant still refused an L5 plan: $gaps"

# ── L5 is never self-issued ──────────────────────────────────────────────────
node "$IO" set "$M" "certification.recorded.level=5" >/dev/null 2>&1 \
  && fail "level 5 was recorded with no issuer" \
  || pass "level 5 requires an issuer (never self-issued)"

node "$IO" set "$M" "certification.recorded.level=5" "certification.recorded.issuer=qa-operator" >/dev/null 2>&1 \
  && pass "level 5 is recordable when externally issued" \
  || fail "externally issued level 5 refused"

# ── Gate the silence, not the absence ────────────────────────────────────────
node "$IO" set "$M" "constitutional_basis.type=declared-absent" >/dev/null 2>&1 \
  && fail "declared-absent accepted with no reason" \
  || pass "declaring no Constitution requires a reason (absence is a decision)"

node "$IO" set "$M" "constitutional_basis.type=declared-absent" \
  "constitutional_basis.reason=toolkit sprint, no product surface" >/dev/null 2>&1 \
  && pass "declared-absent is legal WITH a reason" \
  || fail "declared-absent with a reason was refused"

node "$IO" set "$M" "constitutional_basis.type=contract-hash" "constitutional_basis.value=null" >/dev/null 2>&1 \
  && fail "contract-hash accepted with no hash" \
  || pass "contract-hash requires a hash"

# ── Realization must declare a basis ─────────────────────────────────────────
node "$IO" init "$TMP/wt2.json" "wt2-x" 2 >/dev/null 2>&1
node "$IO" set "$TMP/wt2.json" "stage=realization" >/dev/null 2>&1
gaps="$(node "$IO" gaps "$TMP/wt2.json" 2>/dev/null)"
if [[ "$gaps" == *"no declared constitutional basis"* ]]; then
  pass "a realization sprint with no declared basis is reported"
else
  fail "realization sprint basis gap not reported: $gaps"
fi

# ── The join ─────────────────────────────────────────────────────────────────
node "$IO" set "$M" "initiative_key=oe-p1" >/dev/null 2>&1
[[ "$(node "$IO" get "$M" initiative_key)" == "oe-p1" ]] \
  && pass "the manifest names the initiative a slot serves (the missing join)" \
  || fail "initiative_key not recorded"

# ── History ──────────────────────────────────────────────────────────────────
node "$IO" append-history "$M" "handoff" "to engineering-director" >/dev/null 2>&1
node "$IO" show "$M" | grep -q '"event": "handoff"' \
  && pass "manifest records history (the engineering asymmetry, closed here)" \
  || fail "history not recorded"

# ── It is data, not shell ────────────────────────────────────────────────────
printf '{"manifest_version":1,"worktree_name":"x","slot":1,"evil":"$(touch %s/pwned)"}\n' "$TMP" >"$TMP/evil.json"
node "$IO" get "$TMP/evil.json" evil >/dev/null 2>&1
[[ ! -f "$TMP/pwned" ]] \
  && pass "a manifest is data — its contents are never executed (unlike sourced .env metadata)" \
  || fail "manifest content was executed"

printf '\nSprint manifest results: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
