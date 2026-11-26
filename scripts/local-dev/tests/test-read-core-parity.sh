#!/usr/bin/env bash
# tests/test-read-core-parity.sh — Shared Read Core parity & drift guards.
#
# Proves the Shared Read Core is the SINGLE implementation of read interpretation
# and that both runtimes (mutation via common.sh, inspection via ro.sh/alloy-ro)
# consume it. Most parity is by construction (both call the same function); these
# checks (a) assert the duplicated logic now lives in exactly one file, and (b)
# assert schema/default/capability data is single-sourced.
#
# Run:  bash scripts/local-dev/tests/test-read-core-parity.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TESTS_DIR/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

# Files that may legitimately CONSUME a primitive (interfaces), vs the ONE file
# that may implement it.
CORE="$ROOT/lib/read-core.sh"

printf '== 1. the unified read boundary re-implements nothing (delegates to read-core) ==\n'
# Scope: the files this sprint unified (the review-identified alloy-ro <-> common
# boundary, plus alloy-root). Each historically-duplicated primitive must NOT be
# re-implemented in any of them — only consumed. (Distinct sibling rules deeper
# in the mutation runtime — e.g. alloy_sprint_dirty_classification — are a
# broader ignore-set and are documented as remaining, not asserted here.)
UNIFIED="$ROOT/lib/common.sh $ROOT/lib/ro.sh $ROOT/lib/ro-config.sh $ROOT/alloy-ro $ROOT/alloy-root"
# shellcheck disable=SC2086
assert_not_inlined() {
  local desc="$1" pattern="$2" hits
  hits="$(grep -lE "$pattern" $UNIFIED 2>/dev/null || true)"
  [[ -z "$hits" ]] && ok "$desc not re-implemented in unified boundary" \
                   || bad "$desc still inlined in: ${hits//$'\n'/ }"
}
assert_in_core() {
  local desc="$1" pattern="$2"
  grep -qE "$pattern" "$CORE" && ok "$desc lives in read-core.sh" || bad "$desc missing from read-core.sh"
}
assert_not_inlined "port listener (lsof)"        'lsof -nP -iTCP:'
assert_not_inlined "human-bytes IEC table"       'split\("B KB MB GB TB'
assert_not_inlined "basic dirty agent-marker filter" "grep -vE .\\^..\\? .env.local.agent"
assert_not_inlined "metadata nullglob glob loop" 'for f in "\$[A-Z_]*"/\*\.env'
assert_not_inlined "inline root elif-chain"      '== "\$canon" \]\]; then'
# The probe binary is resolved rather than named, so the literal `lsof -nP` no
# longer appears — asserting on it would pin the defect, not the contract. What
# must live in exactly one place is the OWNER of listener interpretation.
assert_in_core "port listener"          '\-nP \-iTCP:'
assert_in_core "lsof resolver"          'alloy_rc_lsof_bin\(\)'
assert_in_core "three-state port owner" 'alloy_rc_port_owner\(\)'
assert_not_inlined "lsof resolver" 'for candidate in /usr/sbin/lsof'
assert_in_core "human-bytes"    'split\("B KB MB GB TB'
assert_in_core "classify_root"  'alloy_rc_classify_root\(\)'
# Both root commands must call the shared classifier.
grep -q 'alloy_rc_classify_root' "$ROOT/alloy-root" && grep -q 'alloy_rc_classify_root' "$ROOT/alloy-ro" \
  && ok "alloy-root and alloy-ro both call the shared classifier" || bad "a root command does not use the shared classifier"

printf '== 2. metadata schema is single-sourced (D7) ==\n'
(
  export ALLOY_LOCAL_DEV_ROOT="$ROOT"
  source "$ROOT/lib/common.sh"
  [[ "$ALLOY_OPTIONAL_METADATA_FIELDS" == "$ALLOY_RC_METADATA_OPTIONAL_FIELDS" ]] || { echo "  optional-fields mismatch"; exit 1; }
  # Required schema names all present in the core declaration.
  for f in ALLOY_WORKTREE_NAME ALLOY_WORKTREE_PATH ALLOY_WORKTREE_BRANCH ALLOY_WORKTREE_SLOT PORT ALLOY_AGENT; do
    case " $ALLOY_RC_METADATA_REQUIRED_FIELDS " in *" $f "*) : ;; *) echo "  missing required field $f"; exit 1 ;; esac
  done
) && ok "common.sh optional fields == read-core; required schema complete" || bad "metadata schema drift"

printf '== 3. default constants are single-sourced (D5) ==\n'
(
  export ALLOY_LOCAL_DEV_ROOT="$ROOT"
  # Use a throwaway config so operator overrides do not mask the defaults.
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  : >"$TMP/config"
  export ALLOY_CONFIG_FILE="$TMP/config"
  source "$ROOT/lib/common.sh"
  alloy_load_config
  [[ "$ALLOY_MAX_AGENTS"       == "$ALLOY_RC_DEFAULT_MAX_AGENTS" ]]       || { echo "  MAX_AGENTS drift"; exit 1; }
  [[ "$ALLOY_FIRST_AGENT_PORT" == "$ALLOY_RC_DEFAULT_FIRST_AGENT_PORT" ]] || { echo "  FIRST_PORT drift"; exit 1; }
  [[ "$ALLOY_BASE_BRANCH"      == "$ALLOY_RC_DEFAULT_BASE_BRANCH" ]]      || { echo "  BASE_BRANCH drift"; exit 1; }
  [[ "$ALLOY_WEB_DIR"          == "$ALLOY_RC_DEFAULT_WEB_DIR" ]]          || { echo "  WEB_DIR drift"; exit 1; }
) && ok "mutation runtime defaults derive from read-core constants" || bad "default-constant drift"

printf '== 4. capability declaration is single-sourced (verb set) ==\n'
python3 - "$ROOT" <<'PY'
import json, re, sys, subprocess
root = sys.argv[1]
# read-core canonical list
core = subprocess.run(["bash","-c",
  f'source "{root}/lib/read-core.sh"; printf "%s" "$ALLOY_RC_RO_VERBS"'],
  capture_output=True, text=True).stdout.split()
manifest = set(json.load(open(f"{root}/lib/ro-capabilities.json"))["verbs"].keys())
# dispatcher routed verbs (the case arms that call verb_* functions)
disp_src = open(f"{root}/alloy-ro").read()
routed = set(re.findall(r'^\s{4}([a-z-]+)\)\s+verb_', disp_src, re.M))
errs = []
if set(core) != manifest: errs.append(f"core!=manifest core-only={set(core)-manifest} manifest-only={manifest-set(core)}")
if set(core) != routed:   errs.append(f"core!=dispatcher core-only={set(core)-routed} disp-only={routed-set(core)}")
if errs:
    print("  FAIL", *errs); sys.exit(1)
print(f"  ok   verb set single-sourced across read-core / manifest / dispatcher ({len(core)} verbs)")
PY
[[ $? -eq 0 ]] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

printf '== 5. interpretation parity by construction (dirty rule) ==\n'
SBX="$(mktemp -d)"; trap 'rm -rf "$SBX"' EXIT
R="$SBX/repo"
mkdir -p "$R/web"
# Track web/ (a committed file) so a later untracked web/next-env.d.ts appears as
# its own porcelain entry rather than being collapsed into an untracked "web/".
( cd "$R" && git init -q && git config user.email t@t && git config user.name t \
    && echo base >web/index.ts && git add web/index.ts && git commit -q -m init ) >/dev/null 2>&1
(
  export ALLOY_LOCAL_DEV_ROOT="$ROOT"; export ALLOY_WEB_DIR=web
  source "$ROOT/lib/common.sh"     # brings in read-core + delegating wrappers
  # clean
  c1="$(alloy_rc_dirty_classification "$R" web)"; c2="$(alloy_worktree_dirty_classification "$R")"
  [[ "$c1" == "clean" && "$c2" == "clean" ]] || { echo "  clean mismatch: rc=$c1 common=$c2"; exit 1; }
  # only next-env.d.ts dirty -> next-env-only (rule), and inspection maps -> clean
  echo x >"$R/web/next-env.d.ts"
  c1="$(alloy_rc_dirty_classification "$R" web)"; c2="$(alloy_worktree_dirty_classification "$R")"
  [[ "$c1" == "next-env-only" && "$c2" == "next-env-only" ]] || { echo "  next-env mismatch: rc=$c1 common=$c2"; exit 1; }
  # a real change -> dirty everywhere
  echo y >"$R/web/app.ts"
  c1="$(alloy_rc_dirty_classification "$R" web)"; c2="$(alloy_worktree_dirty_classification "$R")"
  [[ "$c1" == "dirty" && "$c2" == "dirty" ]] || { echo "  dirty mismatch: rc=$c1 common=$c2"; exit 1; }
) && ok "mutation runtime and read core classify identically (same fn)" || bad "dirty-rule parity broke"

printf '== 6. formatting & classification value parity ==\n'
(
  export ALLOY_LOCAL_DEV_ROOT="$ROOT"
  source "$ROOT/lib/read-core.sh"
  [[ "$(alloy_rc_human_bytes 0)" == "0B" ]] || { echo "  human_bytes(0) wrong: $(alloy_rc_human_bytes 0)"; exit 1; }
  alloy_rc_human_bytes "not-a-number" >/dev/null 2>&1 && { echo "  human_bytes non-numeric should fail"; exit 1; }
  [[ "$(alloy_rc_classify_root "" a b c)" == "outside" ]]           || { echo "  classify outside"; exit 1; }
  [[ "$(alloy_rc_classify_root /repo /repo /wt '')" == "canonical" ]] || { echo "  classify canonical"; exit 1; }
  [[ "$(alloy_rc_classify_root /wt/x /repo /wt '')" == "managed-worktree" ]] || { echo "  classify managed"; exit 1; }
  [[ "$(alloy_rc_classify_root /other /repo /wt '')" == "unmanaged" ]] || { echo "  classify unmanaged"; exit 1; }
) && ok "human-bytes contract + root classification values correct" || bad "formatting/classification value drift"

printf '\n==== read-core parity tests: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
