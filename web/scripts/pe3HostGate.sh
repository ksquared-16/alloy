#!/usr/bin/env bash
# Quiet-host gate. Run IMMEDIATELY before a measurement window; exit 0 = admissible.
# See docs/sprints/active/runtime-performance-ux-completion/QUIET-HOST-RUNBOOK.md §2.
set -uo pipefail
# `lsof` lives in /usr/sbin, which is NOT on the agent shell's PATH. Without this it does not
# error — it fails silently, and a busy port reads as free. See QUIET-HOST-RUNBOOK §2.
export PATH="/usr/sbin:$PATH"
PORT="${PE3_PORT:-3015}"
FAIL=0
say() { printf "%-20s %-64s %s\n" "$1" "$2" "$3"; }

read -r L1 L5 < <(uptime | sed -E 's/.*load averages?: ([0-9.]+)[, ]+([0-9.]+).*/\1 \2/')
awk -v a="$L1" 'BEGIN{exit !(a<=4)}' && say "load 1-min" "$L1 (<= 4)" "PASS" || { say "load 1-min" "$L1 (<= 4)" "FAIL"; FAIL=1; }
awk -v a="$L1" -v b="$L5" 'BEGIN{exit !(a<=b)}' && say "load trend" "$L1 <= $L5" "PASS" || { say "load trend" "$L1 <= $L5" "FAIL (rising)"; FAIL=1; }

IDLE=$(top -l 3 -n 0 2>/dev/null | grep "CPU usage" | tail -1 | sed -E 's/.*, ([0-9.]+)% idle.*/\1/')
awk -v a="${IDLE:-0}" 'BEGIN{exit !(a>=70)}' && say "CPU idle" "${IDLE}% (>= 70)" "PASS" || { say "CPU idle" "${IDLE}% (>= 70)" "FAIL"; FAIL=1; }

MDS=$(ps -Ao pcpu,comm -r | awk '$2 ~ /mds/ {s+=$1} END{printf "%.1f", s+0}')
awk -v a="$MDS" 'BEGIN{exit !(a<5)}' && say "spotlight" "${MDS}% (< 5)" "PASS" || { say "spotlight" "${MDS}% (< 5)" "FAIL (indexing)"; FAIL=1; }

# A `next-server` process carries NO worktree path on its command line — only "next-server (vX)"
# plus inherited env — so the old `grep -v "wt5-runtime-performance"` filter could never match, and
# this check failed on the measurement server itself. Identify our own server by the PID that owns
# PE3_PORT (plus its children) and exclude exactly that; anything else is a genuine competitor.
MINE=$(lsof -ti tcp:"$PORT" 2>/dev/null | tr '\n' ' ')
MINE_TREE=" $MINE "
for p in $MINE; do MINE_TREE="$MINE_TREE$(pgrep -P "$p" 2>/dev/null | tr '\n' ' ') "; done
OTHER_PIDS=""
for p in $(pgrep -f "next-server|next build|next dev" 2>/dev/null); do
  case "$MINE_TREE" in *" $p "*) continue ;; esac
  OTHER_PIDS="$OTHER_PIDS $p"
done
OTHER=$(printf '%s' "$OTHER_PIDS" | wc -w | tr -d ' ')
[ "${OTHER:-0}" -eq 0 ] && say "competing node" "0 others (ours: ${MINE:-none})" "PASS" || { say "competing node" "$OTHER others:$OTHER_PIDS" "FAIL"; FAIL=1; }

# CONTROL REQUEST — CONTEXT, NOT A GATE.  (Corrected 2026-08-20, by experiment.)
#
# The runbook asserted "the control request is the real gate". That is DISPROVEN on this host.
# Positive control, same server, same route, 20 samples each:
#
#     idle  (load 2.5)                p50  9.1ms   p75/p50 1.24   max/p50 1.49
#     8 busy cores pinned (load 7.2)  p50  5.3ms   p75/p50 1.34   max/p50 2.19
#
# Under FULL CPU saturation the control got FASTER. On Apple Silicon an idle host parks cores and
# drops clocks, so a lone request pays wake-up + frequency ramp; a loaded host is already boosted
# and resident. The statistic therefore tracks CPU frequency state, not contention — it is
# anti-correlated with the thing it claimed to measure, and a min/max spread over ~10ms samples is
# scheduler quantisation besides. It is recorded as environment (rule: "no timing without its
# environment") and no longer decides admissibility.
#
# Admissibility now rests on the COUNTED criteria above (which are not load-sensitive) plus a
# dispersion check on the measurement cell itself — see QUIET-HOST-RUNBOOK.md §2.
CTRL_JSON=$(PE3_PORT="$PORT" node scripts/pe3ControlProbe.mjs 2>/dev/null || echo '{}')
say "control (context)" "$CTRL_JSON" "INFO"

echo
[ "$FAIL" -eq 0 ] && echo "HOST QUALIFIED — timing evidence is admissible." || echo "HOST NOT QUALIFIED — do not start a run; any timing taken now is inadmissible."
exit "$FAIL"
