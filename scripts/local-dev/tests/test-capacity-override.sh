#!/usr/bin/env bash
# AN EXPLICIT OVERRIDE MUST ACTUALLY OVERRIDE — THE SHELL HALF.
#
# MEASURED. The documented way to raise a ceiling for a capacity experiment was
# to export ALLOY_MAX_RUNNING_SERVERS. It never worked. alloy_load_config sources
# alloy-config.example and then ~/.config/alloy-dev/config, both of which assign
# that name UNCONDITIONALLY, so the export was overwritten before sprint-ops'
# `${VAR:-3}` could ever see it. The 3->4->5 staircase set the variable, read 3
# back, and had no way to distinguish an ineffective override from a host
# refusing on merits. alloy_load_config already rescues ALLOY_RUNTIME_ROOT and
# ALLOY_FIRST_AGENT_PORT across that same sourcing, with a comment saying the
# example "otherwise hard-assigns the production default" — the capacity
# ceilings were simply never given that treatment.
#
# The override therefore lives in its own namespace that no config file assigns,
# which is why it survives sourcing without needing a rescue. A bare ALLOY_MAX_*
# export still wins nothing, deliberately.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOY_RUNTIME_ROOT="$(mktemp -d)"
export ALLOY_RUNTIME_ROOT
WORK="$(mktemp -d)"
trap 'rm -rf "$ALLOY_RUNTIME_ROOT" "$WORK"' EXIT

# A host config that chooses 3, exactly like the real one.
cat >"${WORK}/config" <<'CFG'
ALLOY_MAX_ACTIVE_PROVIDERS="3"
ALLOY_MAX_RUNNING_SERVERS="3"
ALLOY_MAX_CONCURRENT_INSTALLS="1"
ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"
CFG
export ALLOY_CONFIG_FILE="${WORK}/config"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=../lib/sprint-ops.sh
source "${SCRIPT_DIR}/lib/sprint-ops.sh"

pass=0; fail=0
ok(){ pass=$((pass+1)); printf 'ok  - %s\n' "$1"; }
no(){ fail=$((fail+1)); printf 'FAIL - %s :: %s\n' "$1" "${2:-}"; }
eq(){ [[ "$2" == "$3" ]] && ok "$1" || no "$1" "expected $3, got $2"; }

# Resolve in a subshell so each case starts from the same place — the override
# is process-scoped, and these cases must not contaminate each other.
resolve() {
  local var="$1"; shift
  ( set +u
    unset ALLOY_CAPACITY_OVERRIDE ALLOY_CAPACITY_OVERRIDE_REASON
    while [[ $# -gt 0 ]]; do export "${1?}"; shift; done
    alloy_load_config
    alloy_sprint_ops_defaults
    eval "printf '%s' \"\$${var}\"" )
}
source_of() {
  local var="$1"; shift
  ( set +u
    unset ALLOY_CAPACITY_OVERRIDE ALLOY_CAPACITY_OVERRIDE_REASON
    while [[ $# -gt 0 ]]; do export "${1?}"; shift; done
    alloy_load_config
    alloy_sprint_ops_defaults
    eval "printf '%s' \"\${ALLOY_CAPACITY_SOURCE_${var#ALLOY_MAX_}}\"" ) 2>/dev/null
}

# 1. No override -> the normal config value.
eq "no override gives the configured value" "$(resolve ALLOY_MAX_RUNNING_SERVERS)" "3"
eq "and says where it came from" "$(source_of ALLOY_MAX_RUNNING_SERVERS)" "host-config"

# 2. A bare export still wins nothing — the ambient path stays dead on purpose.
eq "a bare ALLOY_MAX_* export wins nothing" \
  "$(resolve ALLOY_MAX_RUNNING_SERVERS ALLOY_MAX_RUNNING_SERVERS=5)" "3"

# 3. An explicit scoped override wins. This is the whole point.
eq "an explicit scoped override wins" \
  "$(resolve ALLOY_MAX_RUNNING_SERVERS \
      ALLOY_CAPACITY_OVERRIDE=ALLOY_MAX_RUNNING_SERVERS=5 \
      ALLOY_CAPACITY_OVERRIDE_REASON='capacity certification phase 2')" "5"
eq "and records that it was an override" \
  "$(source_of ALLOY_MAX_RUNNING_SERVERS \
      ALLOY_CAPACITY_OVERRIDE=ALLOY_MAX_RUNNING_SERVERS=5 \
      ALLOY_CAPACITY_OVERRIDE_REASON='phase 2')" "override"

# 4. Several names at once.
eq "two ceilings can be moved together" \
  "$(resolve ALLOY_MAX_ACTIVE_PROVIDERS \
      ALLOY_CAPACITY_OVERRIDE='ALLOY_MAX_RUNNING_SERVERS=5,ALLOY_MAX_ACTIVE_PROVIDERS=4' \
      ALLOY_CAPACITY_OVERRIDE_REASON='phase 2')" "4"

# 5. Malformed overrides fail SAFELY: refused, ceiling unmoved, host still up.
for spec in "ALLOY_MAX_RUNNING_SERVERS" "ALLOY_MAX_RUNNING_SERVERS=" \
            "ALLOY_MAX_RUNNING_SERVERS=abc" "ALLOY_MAX_RUNNING_SERVERS=0" \
            "ALLOY_MAX_RUNNING_SERVERS=99" "ALLOY_MAX_AGENTS=9" "garbage"; do
  got="$(resolve ALLOY_MAX_RUNNING_SERVERS \
          "ALLOY_CAPACITY_OVERRIDE=${spec}" \
          "ALLOY_CAPACITY_OVERRIDE_REASON=test" 2>/dev/null)"
  eq "malformed override '${spec}' keeps the configured value" "$got" "3"
done

# 6. An unexplained ceiling change is not a ceiling change.
eq "an override without a reason is refused" \
  "$(resolve ALLOY_MAX_RUNNING_SERVERS ALLOY_CAPACITY_OVERRIDE=ALLOY_MAX_RUNNING_SERVERS=5 2>/dev/null)" "3"

# 7. One bad entry does not discard a good one.
eq "a valid entry survives an invalid neighbour" \
  "$(resolve ALLOY_MAX_RUNNING_SERVERS \
      ALLOY_CAPACITY_OVERRIDE='ALLOY_MAX_AGENTS=9,ALLOY_MAX_RUNNING_SERVERS=5' \
      ALLOY_CAPACITY_OVERRIDE_REASON='phase 2')" "5"

# 8. Scope: nothing is persisted, so nothing leaks into a later session.
( set +u
  export ALLOY_CAPACITY_OVERRIDE=ALLOY_MAX_RUNNING_SERVERS=5
  export ALLOY_CAPACITY_OVERRIDE_REASON="phase 2"
  alloy_load_config; alloy_sprint_ops_defaults ) >/dev/null 2>&1
if grep -q "CAPACITY_OVERRIDE" "${WORK}/config"; then
  no "an override must never be written to the host config"
else ok "an override is never written to the host config"; fi
eq "a later session sees the configured value again" "$(resolve ALLOY_MAX_RUNNING_SERVERS)" "3"

# 9. Health can say an override is active, and why.
status="$( ( set +u
  export ALLOY_CAPACITY_OVERRIDE=ALLOY_MAX_RUNNING_SERVERS=5
  export ALLOY_CAPACITY_OVERRIDE_REASON="capacity certification phase 2"
  alloy_load_config; alloy_capacity_status ) 2>/dev/null )"
grep -q "override=active" <<<"$status" && ok "health reports an active override" \
  || no "health reports an active override" "$status"
grep -q "capacity certification phase 2" <<<"$status" && ok "health reports the reason" \
  || no "health reports the reason" "$status"
quiet="$( ( alloy_load_config; alloy_capacity_status ) 2>/dev/null )"
grep -q "override=none" <<<"$quiet" && ok "and reports none when there is none" \
  || no "and reports none when there is none" "$quiet"

# 10. Dependencies, not a listener, decide server readiness.
# alloy_web_dir_for reads ALLOY_WEB_DIR, which the config supplies; every real
# caller (alloy-dev-start, alloy-dev-status) loads the config first.
alloy_load_config
mkdir -p "${WORK}/wt/web"
eq "a worktree with no manifest is not server-capable" \
  "$(alloy_server_readiness_for_path "${WORK}/wt" || true)" "no_manifest"
printf '{"scripts":{"dev":"next dev"}}' > "${WORK}/wt/web/package.json"
eq "a manifest without node_modules reports dependencies_missing" \
  "$(alloy_server_readiness_for_path "${WORK}/wt" || true)" "dependencies_missing"
mkdir -p "${WORK}/wt/web/node_modules"
eq "an EMPTY node_modules is not installed dependencies" \
  "$(alloy_server_readiness_for_path "${WORK}/wt" || true)" "dependencies_missing"
mkdir -p "${WORK}/wt/web/node_modules/.bin"
eq "dependencies without the binary the dev script needs are not runnable" \
  "$(alloy_server_readiness_for_path "${WORK}/wt" || true)" "dev_binary_missing"
printf '#!/bin/sh\n' > "${WORK}/wt/web/node_modules/.bin/next"
chmod +x "${WORK}/wt/web/node_modules/.bin/next"
eq "a provisioned worktree is ready" \
  "$(alloy_server_readiness_for_path "${WORK}/wt" || true)" "ready"
eq "a missing directory is reported, not assumed ready" \
  "$(alloy_server_readiness_for_path "${WORK}/gone" || true)" "no_worktree"

# The binary check follows the dev script. ALLOY_DEV_COMMAND is configurable, and
# a worktree that does not run Next must not be called unrunnable because a Next
# binary is missing — that is the same mistake pointing the other way, and it is
# what broke the sprint-ops fixture, whose dev script is a plain http listener.
mkdir -p "${WORK}/other/web/node_modules"
printf '{"scripts":{"dev":"node -e \\"require(0)\\""}}' > "${WORK}/other/web/package.json"
printf 'x' > "${WORK}/other/web/node_modules/.installed"
eq "a non-Next dev script does not need a Next binary" \
  "$(alloy_server_readiness_for_path "${WORK}/other" || true)" "ready"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
