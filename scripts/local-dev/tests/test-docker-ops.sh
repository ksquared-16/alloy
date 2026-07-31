#!/usr/bin/env bash
# Hermetic tests for docker-ops (no live Docker Desktop mutation).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/common.sh
source "${ROOT}/lib/common.sh"
# shellcheck source=lib/docker-ops.sh
source "${ROOT}/lib/docker-ops.sh"

pass=0
fail=0
ok() { echo "ok - $*"; pass=$((pass + 1)); }
bad() { echo "not ok - $*"; fail=$((fail + 1)); }

# Transient classifier
alloy_supabase_reset_is_transient "HTTP 502 Bad Gateway from docker proxy" && ok "502 classified transient" || bad "502"
alloy_supabase_reset_is_transient "migration applied successfully" && bad "success false-positive" || ok "success not transient"
alloy_supabase_reset_is_transient "ECONNRESET while pulling" && ok "ECONNRESET transient" || bad "ECONNRESET"

# Bounded hang detection via a sleep shim (no Docker required)
SHIM="$(mktemp -d)"
cat >"${SHIM}/docker" <<'SH'
#!/usr/bin/env bash
sleep 30
SH
chmod +x "${SHIM}/docker"
PATH="${SHIM}:$PATH"
ALLOY_DOCKER_TIMEOUT_SECS=1
rc=0
alloy_docker_bounded 1 -- docker info || rc=$?
[[ "$rc" -eq 2 ]] && ok "hung docker -> status 2 (wedged)" || bad "hung docker rc=$rc"

report="$(alloy_docker_health_report || true)"
grep -q 'DOCKER_STATUS=wedged' <<<"$report" && ok "health report wedged" || bad "health report: $report"

rm -rf "$SHIM"

# Missing docker
PATH="/usr/bin:/bin"
if ! command -v docker >/dev/null 2>&1; then
  report="$(alloy_docker_health_report || true)"
  grep -q 'DOCKER_STATUS=missing' <<<"$report" && ok "missing docker" || bad "missing: $report"
else
  ok "skip missing-docker (docker on PATH in this environment)"
fi

echo "pass=${pass} fail=${fail}"
[[ "$fail" -eq 0 ]]
