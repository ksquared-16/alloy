#!/usr/bin/env bash
# The W7 Repair Batch 1 push request, GENERATED rather than frozen.
#
# A committed payload pins `expectedHeadSha` and `expected_commits` to the commit BEFORE the one
# that commits it, so it is stale the instant it lands — and a stale head is `head_drift`, which
# reads like a lane problem rather than a stale file. This composes the payload from git at filing
# time instead. No SHA is ever hand-typed.
set -euo pipefail
cd "$(dirname "$0")/../../.."
BRANCH=agent/financials-11c-slice3
git fetch origin "$BRANCH" >/dev/null 2>&1 || true
python3 - "$BRANCH" <<'PY' > /tmp/w7-push-request.json
import json, subprocess, sys
b = sys.argv[1]
run = lambda c: subprocess.run(c, shell=True, capture_output=True, text=True).stdout.strip()
print(json.dumps({
    "action_key": "repository.push",
    "reason_worker_cannot_execute": "This lane holds no push credential; the remote is writable only from the trusted host.",
    "reason": ("W7 Repair Batch 1, terminal deployed repair. The blank-Accounts repair (a command renders "
               "over the account floor instead of replacing it — measured mounted on 2ec96caaa, guarded with "
               "three plants), the zero-amount charge refused before the commit rather than by a 409, and the "
               "W7 preservation census proving add_charge_honours_review_boundary survived the deploy as "
               "FAIL/PRODUCT_DEFECT with zero pass rows. typecheck and typecheck:tests PASSED."),
    "inputs": {
        "repository": "ksquared-16/alloy",
        "branch": b,
        "expectedHeadSha": run("git rev-parse HEAD"),
        "worktreePath": "/Users/vacilando/Code/alloy-worktrees/financials",
        "base_ref": run(f"git rev-parse origin/{b}"),
        "expected_commits": run(f"git log --format=%H origin/{b}..HEAD").split("\n"),
    },
}, indent=2))
PY
cp /tmp/w7-push-request.json certification/financials/w7-repair-1/.push-request.generated.json
echo "composed → certification/financials/w7-repair-1/.push-request.generated.json"
echo "file it with:"
echo "  vac governed-action --run <erun> --lane lane_b77b3cbb5840 \\"
echo "    --json-file certification/financials/w7-repair-1/.push-request.generated.json"
