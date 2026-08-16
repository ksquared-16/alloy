#!/usr/bin/env bash
# Quiet-host gate. Run IMMEDIATELY before a measurement window; exit 0 = admissible.
# See docs/sprints/active/runtime-performance-ux-completion/QUIET-HOST-RUNBOOK.md §2.
set -uo pipefail
PORT="${PE3_PORT:-3015}"
FAIL=0
say() { printf "%-26s %-28s %s\n" "$1" "$2" "$3"; }

read -r L1 L5 < <(uptime | sed -E 's/.*load averages?: ([0-9.]+)[, ]+([0-9.]+).*/\1 \2/')
awk -v a="$L1" 'BEGIN{exit !(a<=4)}' && say "load 1-min" "$L1 (<= 4)" "PASS" || { say "load 1-min" "$L1 (<= 4)" "FAIL"; FAIL=1; }
awk -v a="$L1" -v b="$L5" 'BEGIN{exit !(a<=b)}' && say "load trend" "$L1 <= $L5" "PASS" || { say "load trend" "$L1 <= $L5" "FAIL (rising)"; FAIL=1; }

IDLE=$(top -l 3 -n 0 2>/dev/null | grep "CPU usage" | tail -1 | sed -E 's/.*, ([0-9.]+)% idle.*/\1/')
awk -v a="${IDLE:-0}" 'BEGIN{exit !(a>=70)}' && say "CPU idle" "${IDLE}% (>= 70)" "PASS" || { say "CPU idle" "${IDLE}% (>= 70)" "FAIL"; FAIL=1; }

MDS=$(ps -Ao pcpu,comm -r | awk '$2 ~ /mds/ {s+=$1} END{printf "%.1f", s+0}')
awk -v a="$MDS" 'BEGIN{exit !(a<5)}' && say "spotlight" "${MDS}% (< 5)" "PASS" || { say "spotlight" "${MDS}% (< 5)" "FAIL (indexing)"; FAIL=1; }

OTHER=$(pgrep -fl "next-server|next build|next dev" 2>/dev/null | grep -vc "wt5-runtime-performance" || true)
[ "${OTHER:-0}" -eq 0 ] && say "competing node" "0 others" "PASS" || { say "competing node" "$OTHER others" "FAIL"; FAIL=1; }

# THE REAL GATE: five control requests must land within +/-15% of each other. This measures
# what the run will actually experience; a load average does not.
CTRL=()
for i in 1 2 3 4 5; do
  T=$(curl -s -o /dev/null -w "%{time_total}" "http://127.0.0.1:${PORT}/login" 2>/dev/null || echo 0)
  CTRL+=("$T"); sleep 1
done
SPREAD=$(printf '%s\n' "${CTRL[@]}" | awk 'NR==1{min=max=$1} {if($1<min)min=$1; if($1>max)max=$1} END{ if(min<=0){print 999} else {printf "%.1f", (max-min)/min*100} }')
awk -v a="$SPREAD" 'BEGIN{exit !(a<=15)}' && say "control spread" "${SPREAD}% (<= 15)" "PASS" || { say "control spread" "${SPREAD}% (<= 15)" "FAIL"; FAIL=1; }
echo "control samples: ${CTRL[*]}"

echo
[ "$FAIL" -eq 0 ] && echo "HOST QUALIFIED — timing evidence is admissible." || echo "HOST NOT QUALIFIED — do not start a run; any timing taken now is inadmissible."
exit "$FAIL"
