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
  "development-lane-worktree-lifetime.test.mjs"
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
  "development-merge-grant-binding.test.mjs"
  "development-input-contract-convergence.test.mjs"
  "development-mission-delegation.test.mjs"
  "development-mission-delegation-prose.test.mjs"
  "development-delegation-scope-lifecycle.test.mjs"
  "development-mission-delegation-integration.test.mjs"
  "development-notification-count.test.mjs"
  "development-control-plane-truth.test.mjs"
  "development-gateway-rail.test.mjs"
  "development-run-summary-output.test.mjs"
  "development-completion-summary-last.test.mjs"
  "development-cursor-transport-readiness.test.mjs"
  "development-checkpoint-safety.test.mjs"
  "development-governed-promotion-chain.test.mjs"
  "development-certification-fixture.test.mjs"
  "development-browser-auth.test.mjs"
  "development-process-attribution.test.mjs"
  "development-health.test.mjs"
  "development-workload-classification.test.mjs"
  "development-capacity-policy.test.mjs"
  "development-validation-admission.test.mjs"
  "development-run-wait.test.mjs"
  "development-resource-reconciliation.test.mjs"
  "development-reconciliation-apply.test.mjs"
  "development-provider-seat-state.test.mjs"
  "development-governed-dependency.test.mjs"
  "development-toolkit-retention.test.mjs"
  "development-governed-dependency-runtime.test.mjs"
  "development-validation-convergence.test.mjs"
  "development-executor-authority.test.mjs"
  "development-memory-capacity.test.mjs"
  "development-governed-approval-ui.test.mjs"
  "development-approval-discoverability.test.mjs"
  "development-director-authority.test.mjs"
  "development-director-certification.test.mjs"
  "development-exact-authorization.test.mjs"
  "development-authorization-lifecycle.test.mjs"
  "development-director-execution-bridge.test.mjs"
  "development-governed-run-wait.test.mjs"
  "development-repository-housekeeping.test.mjs"
  "development-worktree-retirement.test.mjs"
  "development-certification-sha-reachability.test.mjs"
  "development-host-steward.test.mjs"
  "development-host-steward-automation.test.mjs"
  "development-decision-delivery.test.mjs"
  "development-provider-governed-bridge.test.mjs"
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
