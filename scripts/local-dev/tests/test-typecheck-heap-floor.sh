#!/usr/bin/env bash
# The full typecheck's heap is a broker resource contract, not a config
# preference. An installed config that drifts below the floor must be raised,
# not honoured: this host's config was pinned at 4096 while the repo's example
# and web/package.json both declared 8192, so `vac run typecheck` died with
# SIGABRT (classified as class=config) while typecheck:tests passed at 8192.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${HERE}/../lib/common.sh"

PASS=0
FAIL=0
check() {
  local name="$1" want="$2" got="$3"
  if [[ "$got" == "$want" ]]; then
    PASS=$((PASS + 1)); echo "ok  - $name"
  else
    FAIL=$((FAIL + 1)); echo "FAIL - $name"; echo "      want: $want"; echo "      got:  $got"
  fi
}

TSC="node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit"

check "an undersized configured heap is raised to the floor" \
  "node --max-old-space-size=8192 $TSC" \
  "$(alloy_apply_heap_floor "node --max-old-space-size=4096 $TSC" 2>/dev/null)"

check "a heap at the floor is left alone" \
  "node --max-old-space-size=8192 $TSC" \
  "$(alloy_apply_heap_floor "node --max-old-space-size=8192 $TSC" 2>/dev/null)"

check "a heap ABOVE the floor is never lowered" \
  "node --max-old-space-size=16384 $TSC" \
  "$(alloy_apply_heap_floor "node --max-old-space-size=16384 $TSC" 2>/dev/null)"

check "a node command declaring no heap gets the floor" \
  "node --max-old-space-size=8192 $TSC" \
  "$(alloy_apply_heap_floor "node $TSC" 2>/dev/null)"

check "a non-node command is left untouched" \
  "npx tsc --noEmit" \
  "$(alloy_apply_heap_floor "npx tsc --noEmit" 2>/dev/null)"

check "an empty command is left untouched" "" "$(alloy_apply_heap_floor "" 2>/dev/null)"

# The floor is overridable upward by an operator, never silently downward.
check "an operator may raise the floor" \
  "node --max-old-space-size=12288 $TSC" \
  "$(ALLOY_TYPECHECK_MIN_HEAP_MB=12288 alloy_apply_heap_floor "node --max-old-space-size=4096 $TSC" 2>/dev/null)"

# Raising the heap must say so on stderr, so a surprising number is traceable.
raised_note="$(alloy_apply_heap_floor "node --max-old-space-size=4096 $TSC" 2>&1 >/dev/null)"
if [[ "$raised_note" == *"4096"* && "$raised_note" == *"8192"* ]]; then
  PASS=$((PASS + 1)); echo "ok  - raising the heap is announced with both values"
else
  FAIL=$((FAIL + 1)); echo "FAIL - raising the heap is announced with both values ($raised_note)"
fi

# The canonical example config must not itself sit below the floor.
example="${HERE}/../alloy-config.example"
declared="$(sed -n "s/^ALLOY_TYPECHECK_COMMAND=.*--max-old-space-size=\([0-9]*\).*/\1/p" "$example")"
if [[ -n "$declared" ]] && (( declared >= ALLOY_TYPECHECK_MIN_HEAP_MB )); then
  PASS=$((PASS + 1)); echo "ok  - alloy-config.example declares at least the floor (${declared}MB)"
else
  FAIL=$((FAIL + 1)); echo "FAIL - alloy-config.example declares ${declared:-none}MB, floor is ${ALLOY_TYPECHECK_MIN_HEAP_MB}MB"
fi

echo
echo "typecheck heap floor: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
