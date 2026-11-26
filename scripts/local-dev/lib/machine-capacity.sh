#!/usr/bin/env bash
# =============================================================================
# machine-capacity — fail-closed preflight for heavy toolkit operations.
#
# Slots already fail closed ("no free slots"). Disk and load had no equivalent:
# sprint-start / typecheck / stack use could proceed into a thrashing host.
# shellcheck shell=bash
# =============================================================================

# Free disk on the data volume (GB). macOS: /System/Volumes/Data; else /
alloy_capacity_free_disk_gb() {
  local vol="${ALLOY_CAPACITY_DISK_VOLUME:-}"
  if [[ -z "$vol" ]]; then
    if [[ -d /System/Volumes/Data ]]; then
      vol="/System/Volumes/Data"
    else
      vol="/"
    fi
  fi
  # df -g (macOS) or df -BG (GNU). Prefer portable parsing of available KiB.
  local avail_k
  avail_k="$(df -k "$vol" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -z "$avail_k" || ! "$avail_k" =~ ^[0-9]+$ ]]; then
    printf 'unknown\n'
    return 1
  fi
  # integer GB
  printf '%s\n' "$((avail_k / 1024 / 1024))"
}

# 1-minute load average (float as string)
alloy_capacity_load_1m() {
  local load
  load="$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')"
  if [[ -z "$load" ]]; then
    load="$(uptime 2>/dev/null | awk -F'load average' '{print $2}' | awk -F',' '{gsub(/^[: ]+/,"",$1); print $1}')"
  fi
  printf '%s\n' "${load:-unknown}"
}

alloy_capacity_ncpu() {
  local n
  n="$(sysctl -n hw.ncpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"
  printf '%s\n' "$n"
}

# Thresholds (overridable). Disk floor matches Vacilando provision hard floor.
ALLOY_CAPACITY_MIN_FREE_GB="${ALLOY_CAPACITY_MIN_FREE_GB:-15}"
# Refuse when 1m load > ncpu * this factor (default 2.0 → sustained overload).
ALLOY_CAPACITY_MAX_LOAD_FACTOR="${ALLOY_CAPACITY_MAX_LOAD_FACTOR:-2.0}"

# alloy_assert_machine_capacity <operation> [min_free_gb]
# Prints evidence lines; returns non-zero when the host should refuse.
alloy_assert_machine_capacity() {
  local op="${1:-heavy-op}"
  local min_gb="${2:-$ALLOY_CAPACITY_MIN_FREE_GB}"
  local free load ncpu
  local -a failures=()

  free="$(alloy_capacity_free_disk_gb 2>/dev/null || echo unknown)"
  load="$(alloy_capacity_load_1m 2>/dev/null || echo unknown)"
  ncpu="$(alloy_capacity_ncpu 2>/dev/null || echo 4)"

  printf 'CAPACITY_OPERATION=%s\n' "$op"
  printf 'CAPACITY_FREE_DISK_GB=%s\n' "$free"
  printf 'CAPACITY_MIN_FREE_GB=%s\n' "$min_gb"
  printf 'CAPACITY_LOAD_1M=%s\n' "$load"
  printf 'CAPACITY_NCPU=%s\n' "$ncpu"
  printf 'CAPACITY_MAX_LOAD_FACTOR=%s\n' "$ALLOY_CAPACITY_MAX_LOAD_FACTOR"

  if [[ "$free" =~ ^[0-9]+$ ]] && (( free < min_gb )); then
    failures+=("free disk ${free} GB is below the ${min_gb} GB floor for ${op}")
  fi

  if [[ "$load" != "unknown" && "$ncpu" =~ ^[0-9]+$ ]]; then
    # awk compare load > ncpu * factor
    local over
    over="$(awk -v L="$load" -v N="$ncpu" -v F="$ALLOY_CAPACITY_MAX_LOAD_FACTOR" 'BEGIN { print (L > (N * F)) ? 1 : 0 }')"
    if [[ "$over" == "1" ]]; then
      failures+=("1-minute load ${load} exceeds ${ncpu}×${ALLOY_CAPACITY_MAX_LOAD_FACTOR} for ${op}")
    fi
  fi

  if [[ ${#failures[@]} -eq 0 ]]; then
    printf 'CAPACITY_VERDICT=pass\n'
    return 0
  fi

  printf 'CAPACITY_VERDICT=fail\n'
  {
    printf '\nMachine capacity BLOCKED — refusing %s:\n\n' "$op"
    local f
    for f in "${failures[@]}"; do printf '  ✗ %s\n' "$f"; done
    printf '\nFree disk / finish merged worktrees, then retry:\n'
    printf '  alloy-worktree-prune-merged --yes\n'
    printf '  alloy-compute reap --confirm\n'
    printf '  alloy-worker-status\n'
  } >&2
  return 1
}
