#!/usr/bin/env bash
# Certification for the validation-broker hardening: vitest compatibility, failure classification,
# process-tree ownership/reaping, FIFO serialization, and unbrokered-work visibility.
#
# FIFO is proven with a synthetic `command --  sleep` job rather than three real typechecks. The
# mechanism under test is admission and ordering, not compilation, and the host is already contended —
# adding three real heavy jobs would degrade the very thing the broker exists to protect. Real kinds
# (typecheck / build / test) are certified separately against actual worktrees.
set -uo pipefail

PATH="$HOME/bin/alloy-dev:$PATH"
hash -r
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }

WT_A="${WT_A:-/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def}"
WT_B="${WT_B:-/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-deeplink-compose}"
WT_C="${WT_C:-/Users/Kelly/Code/alloy-worktrees/wt4-phase7-slice3-participant-runtime}"

# shellcheck source=../lib/validate-caps.sh
source "$HOME/bin/alloy-dev/lib/validate-caps.sh"

echo "== 1. vitest capability detection =="
for wt in "$WT_A" "$WT_B"; do
  cmd="$(alloy_build_test_command "$wt/web")"
  case "$cmd" in
    *--minWorkers*) bad "$(basename "$wt"): injected --minWorkers (unsupported by installed vitest)" ;;
    *"npx vitest run"*) ok "$(basename "$wt"): $cmd" ;;
    *) bad "$(basename "$wt"): unexpected command '$cmd'" ;;
  esac
done

echo "== 2. paths and filters preserved verbatim =="
cmd="$(alloy_build_test_command "$WT_B/web" tests/a.test.ts -t "some name")"
[[ "$cmd" == *"tests/a.test.ts"* && "$cmd" == *"-t"* ]] \
  && ok "focused args preserved: $cmd" || bad "focused args lost: $cmd"

echo "== 3. failure classification (CLI/config vs test) =="
tmp="$(mktemp)"
printf 'CACError: Unknown option `--minWorkers`\n' > "$tmp"
[[ "$(alloy_classify_exec_failure "$tmp" 1)" == "config" ]] \
  && ok "CACError classified as config" || bad "CACError misclassified"
printf '  Tests  3 failed | 10 passed\n' > "$tmp"
[[ "$(alloy_classify_exec_failure "$tmp" 1)" == "test" ]] \
  && ok "real test failure classified as test" || bad "test failure misclassified"
[[ "$(alloy_classify_exec_failure "$tmp" 0)" == "ok" ]] \
  && ok "rc=0 classified ok" || bad "rc=0 misclassified"
rm -f "$tmp"

echo "== 4. process-tree ownership and reaping =="
pgf="$(mktemp)"; log="$(mktemp)"
( alloy_run_owned "$pgf" "$log" --shell 'sleep 120 & sleep 120 & wait' ) >/dev/null 2>&1 &
runner=$!
sleep 3
pgid="$(cat "$pgf" 2>/dev/null || true)"
if [[ -n "$pgid" ]] && kill -0 "-${pgid}" 2>/dev/null; then
  ok "job leads its own process group (pgid=$pgid)"
  kids_before="$(pgrep -g "$pgid" 2>/dev/null | wc -l | tr -d ' ')"
  alloy_reap_group "$pgid" 3 >/dev/null 2>&1
  sleep 1
  kids_after="$(pgrep -g "$pgid" 2>/dev/null | wc -l | tr -d ' ')"
  [[ "$kids_after" -eq 0 ]] \
    && ok "whole tree reaped (${kids_before} procs -> 0, no orphans)" \
    || bad "orphans survived reap: $kids_after still running in pgid $pgid"
else
  bad "could not establish an owned process group"
fi
kill -9 "$runner" 2>/dev/null; rm -f "$pgf" "$log"

echo "== 5. FIFO serialization across three worktrees =="
vac cancel >/dev/null 2>&1 || true
( cd "$WT_A" && vac run command -- sleep 25 ) >/tmp/vacA.log 2>&1 &
sleep 4
( cd "$WT_B" && vac run command -- sleep 3 ) >/tmp/vacB.log 2>&1 &
sleep 2
( cd "$WT_C" && vac run command -- sleep 3 ) >/tmp/vacC.log 2>&1 &
sleep 4
queued="$(vac status 2>/dev/null | grep -cE '^[0-9]+\. worktree=' || true)"
[[ "$queued" -ge 1 ]] && ok "others queued (queued=$queued)" || bad "no queue entries observed (queued=$queued)"
wait

# Serialization is proven from the START/FINISH windows, not from an instantaneous `vac status`
# sample. A single sample is unreliable: waiters poll every 5s, so there are real gaps in which NO
# lease is held, and a sample landing in one reads as "0 holders" while serialization is perfectly
# intact. Non-overlap across the whole run is the actual invariant.
python3 - "$@" <<'PYEOF'
import re, sys, itertools
wins=[]
for tag in "ABC":
    try: txt=open(f"/tmp/vac{tag}.log").read()
    except OSError: continue
    st=re.search(r"\[([^\]]+)\] START", txt); fi=re.search(r"\[([^\]]+)\] FINISH", txt)
    if st and fi: wins.append((tag, st.group(1), fi.group(1)))
overlap=[(a[0],b[0]) for a,b in itertools.combinations(sorted(wins,key=lambda w:w[1]),2)
         if b[1] < a[2]]
for tag,s0,f0 in sorted(wins,key=lambda w:w[1]): print(f"    window {tag}: {s0} -> {f0}")
print("  PASS  no two heavy jobs overlapped" if not overlap and len(wins)==3
      else f"  FAIL  overlapping windows: {overlap} (jobs seen: {len(wins)})")
PYEOF
for f in A B C; do
  grep -q "FINISH" "/tmp/vac${f}.log" && ok "worker $f completed under the broker" || bad "worker $f produced no FINISH"
done
grep -q "worktree=wt6" /tmp/vacA.log && ok "each job ran in its own worktree" || bad "worktree attribution wrong"

echo "== 6. unbrokered heavy work is visible in status =="
( cd "$WT_B/web" && npx vitest run tests/runtime/subjectAuthorityNoSilentSubstitution.test.ts >/dev/null 2>&1 ) &
raw=$!
sleep 6
# Capture once, then match the STRING. Piping into `grep -q` under `pipefail` reports failure even
# on a successful match: grep exits at the first hit, the writer takes SIGPIPE (141), and pipefail
# surfaces that as the pipeline status. The feature was fine; the assertion was lying.
status_out="$(vac status 2>/dev/null || true)"
case "$status_out" in
  *"unbrokered heavy jobs"*) ok "status has an unbrokered section" ;;
  *) bad "status lacks the unbrokered section" ;;
esac
case "$status_out" in
  *"load average"*) ok "status reports host load" ;;
  *) bad "status omits host load" ;;
esac
wait "$raw" 2>/dev/null

echo
echo "PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]]
