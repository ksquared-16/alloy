#!/usr/bin/env bash
# Browser-certification lease — capacity 1, wait/refuse, stale recover, override.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT="$(cd "${HERE}/.." && pwd)"
# shellcheck source=lib/browser-cert-lease.sh
source "${TOOLKIT}/lib/browser-cert-lease.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

TESTTMP="${HERE}/.tmp-browser-cert.$$"
export ALLOY_COMPUTE_STATE_DIR="$TESTTMP/state"
mkdir -p "$ALLOY_COMPUTE_STATE_DIR"
trap '[[ "$BASHPID" == "$$" ]] && rm -rf "$TESTTMP"' EXIT

WT_A="$TESTTMP/wt-a"; WT_B="$TESTTMP/wt-b"
mkdir -p "$WT_A" "$WT_B"
(cd "$WT_A" && git init -q .)
(cd "$WT_B" && git init -q .)

echo "browser-certification lease"
echo "==========================="

# 1. First holder acquires.
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_acquire --no-wait --reason "cert A") \
  && ok "1. first holder acquires" || bad "1. first holder acquires"

# 2. Second holder refused without wait.
if (cd "$WT_B" && ALLOY_WORKTREE_PATH="$WT_B" alloy_browser_cert_acquire --no-wait --reason "cert B"); then
  bad "2. second holder must be refused"
else
  ok "2. second holder refused (capacity 1)"
fi

# 3. Owner releases; second can acquire.
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_release)
(cd "$WT_B" && ALLOY_WORKTREE_PATH="$WT_B" alloy_browser_cert_acquire --no-wait --reason "cert B") \
  && ok "3. after release, next holder acquires" || bad "3. after release, next holder acquires"
(cd "$WT_B" && ALLOY_WORKTREE_PATH="$WT_B" alloy_browser_cert_release)

# 4. Idempotent re-acquire.
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_acquire --no-wait --reason "idem")
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_acquire --no-wait --reason "idem") \
  && ok "4. re-acquire by owner is idempotent" || bad "4. re-acquire by owner is idempotent"
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_release)

# 5. Stale permit recovers via alloy-compute acquire path.
D="$ALLOY_COMPUTE_STATE_DIR/browser-certification"; mkdir -p "$D"
sleep 60 & DEAD=$!; kill "$DEAD" 2>/dev/null; wait "$DEAD" 2>/dev/null || true
{ printf 'HOLDER=crashed\nRESOURCE=browser-certification\nWORKTREE=%s\n' "$TESTTMP"
  printf 'PID=%s\nPID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n' "$DEAD"
  printf 'CREATED=2020-01-01T00:00:00Z\n'; } > "$D/crashed.permit"
export ALLOY_COMPUTE_MIN_RECLAIM_AGE=0
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" ALLOY_COMPUTE_MIN_RECLAIM_AGE=0 \
  alloy_browser_cert_acquire --no-wait --reason "after crash") \
  && ok "5. stale/crashed lease recovers" || bad "5. stale/crashed lease recovers"
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_release)
unset ALLOY_COMPUTE_MIN_RECLAIM_AGE

# 6. Explicit override bypasses capacity.
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_acquire --no-wait --reason "base")
if (cd "$WT_B" && ALLOY_WORKTREE_PATH="$WT_B" \
     ALLOY_BROWSER_CERT_OVERRIDE=i-accept-parallel-browser-certification \
     alloy_browser_cert_acquire --no-wait --reason "override"); then
  ok "6. explicit override allows parallel certification"
else
  bad "6. explicit override allows parallel certification"
fi
(cd "$WT_A" && ALLOY_WORKTREE_PATH="$WT_A" alloy_browser_cert_release)

# 7. Classifier recognizes playwright commands.
alloy_command_is_browser_certification "npx playwright test --workers=1" \
  && ok "7. playwright test classified as browser cert" || bad "7. playwright test classified"
alloy_command_is_browser_certification "npx vitest run foo.test.ts" \
  && bad "8. vitest must NOT be classified as browser cert" \
  || ok "8. vitest is not browser cert"

# 9. Node helper mirrors refuse behavior.
node --input-type=module <<EOF
import { acquireBrowserCertLease, releaseBrowserCertLease } from "${TOOLKIT}/lib/browser-cert-lease.mjs";
process.env.ALLOY_COMPUTE_STATE_DIR = "${ALLOY_COMPUTE_STATE_DIR}";
process.env.ALLOY_BROWSER_CERT_HOLDER = "node-a";
const a = acquireBrowserCertLease({ wait: false, reason: "node a", holder: "node-a" });
if (!a.ok) { console.error("node acquire failed", a); process.exit(1); }
process.env.ALLOY_BROWSER_CERT_HOLDER = "node-b";
const b = acquireBrowserCertLease({ wait: false, reason: "node b", holder: "node-b" });
if (b.ok) { console.error("node second acquire should fail", b); process.exit(1); }
releaseBrowserCertLease("node-a");
process.exit(0);
EOF
[[ $? -eq 0 ]] && ok "9. Node helper enforces capacity 1" || bad "9. Node helper enforces capacity 1"

printf '\n==== browser-cert-lease: %s passed, %s failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
