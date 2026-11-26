#!/usr/bin/env bash
# WHO STOPPED THAT SERVER? PREVIOUSLY: NOBODY COULD SAY.
#
# MEASURED. During capacity certification the server on slot 1 left the
# measurement cohort twice. The report had to say "another lane's agent probably
# stopped it" — inference, not evidence. Every canonical path that starts or
# stops a dev server ran without leaving a durable trace, so the only record of a
# lifecycle action was its side effect: a pid file that was no longer there.
#
# This is an AUDIT LOG over the canonical operations, not a second registry. The
# pid files stay the authority on what IS; this records what HAPPENED. The
# distinction it buys is the one that was missing: a server that stopped WITH a
# matching event was stopped through a sanctioned path, and one that vanished
# with NO event was killed outside the lifecycle. Those were previously
# indistinguishable.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOY_RUNTIME_ROOT="$(mktemp -d)"
export ALLOY_RUNTIME_ROOT
trap 'rm -rf "$ALLOY_RUNTIME_ROOT"' EXIT
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

pass=0; fail=0
ok(){ pass=$((pass+1)); printf 'ok  - %s\n' "$1"; }
no(){ fail=$((fail+1)); printf 'FAIL - %s :: %s\n' "$1" "${2:-}"; }
LOG="$(alloy_server_audit_path)"

# 1. A start is recorded with identity, not just a timestamp.
( ALLOY_WORKTREE_SLOT=1 PORT=3011 VACILANDO_LANE_ID=lane_abc VACILANDO_RUN_ID=erun_xyz \
  alloy_record_server_lifecycle "start" "wt1-work-unit-grade-a" "ok" "operator requested" "" "1234" )
if [[ -s "$LOG" ]]; then ok "a start is recorded"; else no "a start is recorded" "no log written"; fi
line="$(tail -1 "$LOG")"
for field in '"action":"start"' '"worktree":"wt1-work-unit-grade-a"' '"slot":1' '"port":3011' \
             '"new_pid":1234' '"lane_id":"lane_abc"' '"run_id":"erun_xyz"' '"outcome":"ok"'; do
  grep -q "$field" <<<"$line" && ok "records $field" || no "records $field" "$line"
done

# 2. A stop records the pid that WENT AWAY — the field a cohort invalidation needs.
( ALLOY_WORKTREE_SLOT=1 PORT=3011 alloy_record_server_lifecycle "stop" "wt1-work-unit-grade-a" "ok" "lane finished" "1234" "" )
grep -q '"action":"stop"' <<<"$(tail -1 "$LOG")" && ok "a stop is recorded" || no "a stop is recorded"
grep -q '"previous_pid":1234' <<<"$(tail -1 "$LOG")" && ok "the stop names the departing pid" || no "the stop names the departing pid"

# 3. The actor is DERIVED, never guessed.
( VACILANDO_LANE_ID=lane_abc alloy_record_server_lifecycle "stop" "w" "ok" "" "" "" )
grep -q '"actor":"lane-agent"' <<<"$(tail -1 "$LOG")" && ok "a lane run attributes to lane-agent" || no "lane-agent attribution"
( ALLOY_CAPACITY_OVERRIDE="ALLOY_MAX_RUNNING_SERVERS=5" alloy_record_server_lifecycle "start" "w" "ok" "" "" "9" )
grep -q '"actor":"capacity-experiment"' <<<"$(tail -1 "$LOG")" && ok "a capacity experiment attributes to itself" || no "capacity-experiment attribution"
( alloy_record_server_lifecycle "start" "w" "ok" "" "" "9" )
grep -q '"actor":"toolkit"' <<<"$(tail -1 "$LOG")" && ok "an unattributed action says toolkit, not a guess" || no "toolkit attribution"
( ALLOY_SERVER_AUDIT_ACTOR=host-steward alloy_record_server_lifecycle "stop" "w" "ok" "" "1" "" )
grep -q '"actor":"host-steward"' <<<"$(tail -1 "$LOG")" && ok "an explicit actor wins" || no "explicit actor"

# 4. A failed start is recorded as failed, not omitted.
( alloy_record_server_lifecycle "start" "w" "failed" "process did not stay alive" "" "5" )
grep -q '"outcome":"failed"' <<<"$(tail -1 "$LOG")" && ok "a failed start is recorded" || no "failed start recorded"

# 5. Every line is independently parseable JSON — this is evidence, so it must
#    survive being read by something other than grep.
n=$(wc -l < "$LOG" | tr -d ' ')
if python3 -c "
import json,sys
bad=[l for l in open('$LOG') if l.strip() and not _ok(l)] if False else []
for i,l in enumerate(open('$LOG')):
    if l.strip():
        json.loads(l)
sys.exit(0)" 2>/dev/null; then ok "all $n lines are valid JSON"; else no "all lines are valid JSON"; fi

# 6. An audit write must NEVER fail the operation it is describing. A lost log
#    line is a smaller problem than a dev server that would not stop.
if ( ALLOY_RUNTIME_ROOT=/proc/nonexistent/nope alloy_record_server_lifecycle "stop" "w" "ok" "" "" "" ); then
  ok "an unwritable audit path does not fail the caller"
else no "an unwritable audit path does not fail the caller"; fi

# 7. It is an audit log, not a registry: it never becomes the source of truth
#    for what is running.
grep -q "AUDIT LOG over the canonical operations, not a second registry" "${SCRIPT_DIR}/lib/common.sh" \
  && ok "declared as an audit log, not a registry" || no "declared as an audit log"

# 8. Both canonical commands actually call it.
grep -q "alloy_record_server_lifecycle" "${SCRIPT_DIR}/alloy-dev-start" && ok "alloy-dev-start records" || no "alloy-dev-start records"
grep -q "alloy_record_server_lifecycle" "${SCRIPT_DIR}/alloy-dev-stop" && ok "alloy-dev-stop records" || no "alloy-dev-stop records"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
