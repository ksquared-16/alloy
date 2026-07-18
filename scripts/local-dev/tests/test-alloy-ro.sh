#!/usr/bin/env bash
# tests/test-alloy-ro.sh — Constitution tests for the Alloy Autonomous
# Inspection Surface V1. Proves, as far as practical, that `alloy-ro` is a single
# read-only trust class safe to grant via `Bash(alloy-ro *)`.
#
# Run:  bash scripts/local-dev/tests/test-alloy-ro.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_DIR="$(cd "$TESTS_DIR/.." && pwd)"
RO="$TOOLKIT_DIR/alloy-ro"

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

# assert_exit <expected> <desc> -- <cmd...>
assert_exit() {
  local want="$1" desc="$2"; shift 3
  "$@" >/dev/null 2>&1; local got=$?
  [[ "$got" -eq "$want" ]] && ok "$desc (exit $got)" || bad "$desc (want exit $want, got $got)"
}

# Isolated sandbox: fake runtime root (intentionally absent) + a throwaway repo.
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
RT="$SANDBOX/runtime"            # deliberately NOT created
CANON="$SANDBOX/canon"
WTS="$SANDBOX/wts"
CANARY="$SANDBOX/CANARY"

mkdir -p "$CANON"
( cd "$CANON" && git init -q && git config user.email t@t && git config user.name t \
    && git commit -q --allow-empty -m init ) >/dev/null 2>&1

# Hostile config: if any value is EXECUTED (sourced), a CANARY file appears.
cat > "$SANDBOX/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTS"
ALLOY_RUNTIME_ROOT="$RT"
ALLOY_EVIL_SUBST="\$(touch $CANARY.subst)"
ALLOY_EVIL_SEMI="x; touch $CANARY.semi"
ALLOY_EVIL_BQ="\`touch $CANARY.bq\`"
ALLOY_WEB_DIR="web && touch $CANARY.and"
EOF
export ALLOY_CONFIG_FILE="$SANDBOX/config"

printf '== 1. unknown verbs fail closed ==\n'
assert_exit 2 "unknown verb 'bogus'"        -- "$RO" bogus
assert_exit 2 "empty-ish junk verb"         -- "$RO" zzz-not-a-verb

printf '== 2. dangerous commands unreachable via alloy-ro ==\n'
for v in clean manifest worktree-remove worktree-create worktree-sync \
         sprint-finish sprint-start dev-start dev-stop agent-login agent-open \
         agent-verify validate cert-leak-clean worker-pause worker-resume \
         worker-doctor initiative-start product-approve; do
  assert_exit 2 "verb '$v' is not routable" -- "$RO" "$v"
done

printf '== 3. mutation-style flags are rejected ==\n'
for f in --refresh --recover --set --confirm --force --all --fetch --write --fix; do
  assert_exit 2 "flag '$f' rejected on worker-status" -- "$RO" worker-status "$f"
done
assert_exit 2 "unknown flag on root"        -- "$RO" root --strict
assert_exit 2 "combined --set after --json"  -- "$RO" agent-status --json --set k=v

printf '== 4. user configuration is PARSED, not executed (adversarial) ==\n'
"$RO" worker-status >/dev/null 2>&1
"$RO" runtime-paths >/dev/null 2>&1
"$RO" root "$CANON" >/dev/null 2>&1
if ls "$CANARY".* >/dev/null 2>&1; then
  bad "hostile config value executed: $(ls "$CANARY".* 2>/dev/null)"
else
  ok "no hostile config value executed (parse-only holds)"
fi

printf '== 5. read invocations do not create runtime directories ==\n'
"$RO" runtime-paths >/dev/null 2>&1
"$RO" worker-status >/dev/null 2>&1
"$RO" agent-status  >/dev/null 2>&1
"$RO" dev-status    >/dev/null 2>&1
if [[ -e "$RT" ]]; then bad "runtime root was created by a read verb: $RT"; else ok "runtime root left absent (no mkdir)"; fi

printf '== 6. read invocations do not modify git state / do not fetch ==\n'
before_head="$(git -C "$CANON" rev-parse HEAD)"
before_status="$(git -C "$CANON" status --porcelain)"
( cd "$CANON" && "$RO" root >/dev/null 2>&1 )
( cd "$CANON" && "$RO" root --json >/dev/null 2>&1 )
after_head="$(git -C "$CANON" rev-parse HEAD)"
after_status="$(git -C "$CANON" status --porcelain)"
[[ "$before_head" == "$after_head" ]] && ok "git HEAD unchanged" || bad "git HEAD changed"
[[ "$before_status" == "$after_status" ]] && ok "git working tree unchanged" || bad "git working tree changed"
[[ -e "$CANON/.git/FETCH_HEAD" ]] && bad "a fetch occurred (FETCH_HEAD created)" || ok "no network fetch (no FETCH_HEAD)"

printf '== 7. git wrapper refuses non-read-only subcommands ==\n'
(
  export ALLOY_LOCAL_DEV_ROOT="$TOOLKIT_DIR"
  source "$TOOLKIT_DIR/lib/ro-config.sh"
  source "$TOOLKIT_DIR/lib/ro.sh"
  fails=0
  for sub in fetch pull push checkout commit merge rebase reset clean branch-D; do
    if alloy_ro_git "$CANON" "$sub" >/dev/null 2>&1; then
      echo "  FAIL git subcommand '$sub' was NOT refused"; fails=1
    fi
  done
  # remote/config only in their read-only forms
  alloy_ro_git "$CANON" remote set-url origin x >/dev/null 2>&1 && { echo "  FAIL remote set-url allowed"; fails=1; }
  alloy_ro_git "$CANON" config user.name hacker >/dev/null 2>&1 && { echo "  FAIL config write allowed"; fails=1; }
  exit $fails
) && ok "all mutating git subcommands refused (allowlist holds)" || bad "a mutating git subcommand slipped through"

printf '== 8. non-executing parser rejects shell-active values (unit) ==\n'
(
  export ALLOY_LOCAL_DEV_ROOT="$TOOLKIT_DIR"
  source "$TOOLKIT_DIR/lib/ro-config.sh"
  fails=0
  for bad_v in '$(id)' '`id`' 'a; rm -rf x' 'a | tee' 'a && b' 'a > f' '$HOME/../x/$(x)'; do
    if alloy_ro_expand_value "$bad_v" >/dev/null 2>&1; then
      echo "  FAIL unsafe value accepted: [$bad_v]"; fails=1
    fi
  done
  # Safe values must still resolve.
  alloy_ro_expand_value '/plain/path' >/dev/null || { echo "  FAIL safe literal rejected"; fails=1; }
  ALLOY_RO_REPO=/canon alloy_ro_expand_value '$ALLOY_REPO/web' >/dev/null || { echo "  FAIL whitelisted \$ALLOY_REPO rejected"; fails=1; }
  exit $fails
) && ok "parser accepts safe literals, refuses shell-active values" || bad "parser mis-classified a value"

printf '== 9. --json output is valid JSON for every verb, exit stable ==\n'
json_ok() {
  local desc="$1"; shift
  local out; out="$("$@" 2>/dev/null)"; local code=$?
  if [[ "$code" -ne 0 ]]; then bad "$desc (--json exit $code)"; return; fi
  if printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin)' 2>/dev/null; then
    ok "$desc (valid JSON)"
  else
    bad "$desc (invalid JSON)"
  fi
}
json_ok "root --json"          "$RO" root --json
json_ok "runtime-paths --json" "$RO" runtime-paths --json
json_ok "worker-status --json" "$RO" worker-status --json
json_ok "agent-status --json"  "$RO" agent-status --json
json_ok "dev-status --json"    "$RO" dev-status --json
json_ok "capabilities --json"  "$RO" capabilities --json
json_ok "runtime-policy --json" "$RO" runtime-policy --json

printf '== 10. not-found target yields exit 3 ==\n'
assert_exit 3 "agent-status on absent slot 99"   -- "$RO" agent-status 99
assert_exit 3 "agent-evidence on absent slot 99" -- "$RO" agent-evidence 99

printf '== 11. declared capabilities match the implemented verb set ==\n'
python3 - "$RO" "$TOOLKIT_DIR/lib/ro-capabilities.json" <<'PY'
import json, subprocess, sys
ro, capfile = sys.argv[1], sys.argv[2]
cap = json.load(open(capfile))
sens = ["writes","network","process_control","git_mutation","deletion","arbitrary_execution","credential_access"]
errs = []
# surface posture
for k in sens:
    if cap["surface_capabilities"].get(k) is not False:
        errs.append(f"surface capability {k} is not false")
if cap["surface_capabilities"].get("reads") is not True:
    errs.append("surface reads is not true")
# per verb
impl = {"root","runtime-paths","worker-status","agent-status","dev-status","agent-evidence","capabilities",
        "runtime-list","runtime-status","runtime-capacity","runtime-discover","runtime-containers",
        "runtime-policy","runtime-admission","runtime-intent","runtime-explain"}
declared = set(cap["verbs"].keys())
if impl != declared:
    errs.append(f"verb set mismatch: impl-only={impl-declared} declared-only={declared-impl}")
for v, d in cap["verbs"].items():
    if d.get("reads") is not True:
        errs.append(f"{v}.reads not true")
    for k in sens:
        if d.get(k) is not False:
            errs.append(f"{v}.{k} not false")
if errs:
    print("  FAIL capability mismatch:")
    for e in errs: print("    -", e)
    sys.exit(1)
print("  ok   capability declaration matches implementation and is all-false on mutation keys")
PY
if [[ $? -eq 0 ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

printf '\n==== alloy-ro constitution tests: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
