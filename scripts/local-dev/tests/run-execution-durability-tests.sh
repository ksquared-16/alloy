#!/usr/bin/env bash
# Execution Run durability suite.
#
# Vacilando's development-*.test.mjs suites had no runner of any kind, so they
# only ever ran when someone invoked node --test by hand. This runs the suites
# that certify Execution Run durability: ABANDONED semantics, liveness,
# ownership-proven recovery, and the Gateway surface for them.
#
# It deliberately does NOT glob every *.test.mjs under tests/ — several unrelated
# suites have pre-existing environment-dependent failures (web-push VAPID keys,
# live control-plane ownership) that would drown a real regression here.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SUITES=(
  "development-execution-abandon-recovery.test.mjs"
  "development-execution-stale.test.mjs"
  "development-execution-run.test.mjs"
  "development-gateway-run-recovery-ui.test.mjs"
  "development-gateway-ui.test.mjs"
  "development-provider-health.test.mjs"
  "development-prompt-readiness.test.mjs"
  "development-agent-report.test.mjs"
  "development-prompt-block-recovery.test.mjs"
  "development-create-lane-chat.test.mjs"
  "development-provider-capacity.test.mjs"
  "development-provider-lifecycle.test.mjs"
  "development-admission-bootstrap.test.mjs"
  "development-lane-folders.test.mjs"
  "development-lane-notifications.test.mjs"
  "development-lane-push-outcome.test.mjs"
  "development-lane-notify.test.mjs"
  "development-lane-attachments.test.mjs"
  "development-brand-assets.test.mjs"
  "development-repository-registry.test.mjs"
  "development-repository-flows.test.mjs"
  "development-copy-control.test.mjs"
  "development-run-cancel.test.mjs"
  "development-screen-answer.test.mjs"
  "development-lane-activity.test.mjs"
  "development-governed-approval.test.mjs"
  "development-run-summary-output.test.mjs"
  "development-checkpoint-safety.test.mjs"
  "development-governed-promotion-chain.test.mjs"
)

PASS=0
FAIL=0
FAILED=()

for suite in "${SUITES[@]}"; do
  path="$HERE/$suite"
  if [[ ! -f "$path" ]]; then
    echo "MISSING $suite"
    FAIL=$((FAIL + 1))
    FAILED+=("$suite (missing)")
    continue
  fi
  echo "== $suite =="
  if node --test "$path"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED+=("$suite")
  fi
  echo
done

echo "Execution Run durability: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  printf 'failed: %s\n' "${FAILED[@]}"
  exit 1
fi
