#!/usr/bin/env bash
# THE VALIDATION HEARTBEAT MUST PROVE LIVENESS, OR SAY IT CANNOT.
#
# MEASURED. During a real brokered typecheck the shell printed
#   lock.sh: line 167: .../locks/validate.lock/heartbeat: No such file or directory
# every fifteen seconds, and the typecheck still exited 0. `alloy-validate` had
# moved to the S5 broker as the single capacity authority and stopped taking the
# validate mutex — "One decision, not two" — but a heartbeat loop from the old
# mutex model survived it, writing into a lock directory that is never created.
# A writer with no reader, failing silently, inside the one mechanism whose job
# is to prove a lease is alive.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOY_RUNTIME_ROOT="$(mktemp -d)"
export ALLOY_RUNTIME_ROOT
trap 'rm -rf "$ALLOY_RUNTIME_ROOT"' EXIT
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=../lib/lock.sh
source "${SCRIPT_DIR}/lib/lock.sh"
alloy_ensure_runtime_dirs 2>/dev/null || true

pass=0; fail=0
ok(){ pass=$((pass+1)); printf 'ok  - %s\n' "$1"; }
no(){ fail=$((fail+1)); printf 'FAIL - %s\n' "$1"; }

# 1. No lease -> refuse, rather than writing into a directory that is not there.
if alloy_validate_write_heartbeat 2>/dev/null; then
  no "a heartbeat with no lease must be refused"
else ok "a heartbeat with no lease is refused"; fi

# 2. Holding the lease -> the write succeeds and is readable.
mkdir -p "$ALLOY_VALIDATE_LOCK_DIR"
printf 'ALLOY_VALIDATE_PID="%s"\n' "$$" > "$(alloy_validate_owner_file)"
if alloy_validate_lock_held_by_self; then ok "the holder recognises its own lease"; else no "the holder did not recognise its own lease"; fi
if alloy_validate_write_heartbeat && [[ -s "$(alloy_validate_heartbeat_file)" ]]; then
  ok "the holder's heartbeat is written and readable"
else no "the holder's heartbeat was not written"; fi

# 3. A live lease must never be reclaimed.
if alloy_validate_lock_stale; then no "a live lease was read as stale"; else ok "a live lease is not stale"; fi

# 4. An abandoned lease must still be reclaimable — the fix must not weaken this.
printf 'ALLOY_VALIDATE_PID="999999"\n' > "$(alloy_validate_owner_file)"
if alloy_validate_lock_stale; then ok "a dead holder leaves a reclaimable lease"; else no "an abandoned lease was not reclaimable"; fi

# 5. A stopped heartbeat is staleness even when the PID is still alive.
printf 'ALLOY_VALIDATE_PID="%s"\n' "$$" > "$(alloy_validate_owner_file)"
echo 1 > "$(alloy_validate_heartbeat_file)"
if alloy_validate_lock_stale; then ok "an expired heartbeat is stale"; else no "an expired heartbeat was not detected"; fi

# 6. Nobody else may keep our lease looking alive.
printf 'ALLOY_VALIDATE_PID="999999"\n' > "$(alloy_validate_owner_file)"
if alloy_validate_write_heartbeat 2>/dev/null; then
  no "a foreign process refreshed someone else's heartbeat"
else ok "a foreign process cannot refresh another lease's heartbeat"; fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
