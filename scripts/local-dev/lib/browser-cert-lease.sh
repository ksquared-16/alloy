#!/usr/bin/env bash
# =============================================================================
# browser-cert-lease — machine-bounded Playwright / Chromium certification.
#
# Coding across six slots is parallel-safe. A Playwright fleet is not: two
# concurrent Chromium workloads have OOM-killed certification runs on this host.
#
# This is a thin, fail-closed wrapper over the existing alloy-compute resource
# `browser-certification` (capacity 1). It does not invent a second permit store.
#
#   alloy_browser_cert_acquire [--wait[=secs]] [--reason "..."]
#   alloy_browser_cert_release
#   alloy_browser_cert_run [--wait[=secs]] [--reason "..."] -- <command...>
#
# Override (loud, never set by toolkit commands):
#   ALLOY_BROWSER_CERT_OVERRIDE=i-accept-parallel-browser-certification
# =============================================================================

ALLOY_BROWSER_CERT_RESOURCE="${ALLOY_BROWSER_CERT_RESOURCE:-browser-certification}"
ALLOY_BROWSER_CERT_OVERRIDE_VALUE="i-accept-parallel-browser-certification"

_alloy_browser_cert_bin() {
  local here root
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root="$(cd "${here}/.." && pwd)"
  printf '%s/alloy-compute\n' "$root"
}

_alloy_browser_cert_holder() {
  if [[ -n "${ALLOY_BROWSER_CERT_HOLDER:-}" ]]; then
    printf '%s\n' "$ALLOY_BROWSER_CERT_HOLDER"
    return 0
  fi
  local d="${ALLOY_WORKTREE_PATH:-$PWD}" root
  root="$(cd "$d" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || echo "$d")"
  basename "$root"
}

alloy_browser_cert_override_active() {
  [[ "${ALLOY_BROWSER_CERT_OVERRIDE:-}" == "$ALLOY_BROWSER_CERT_OVERRIDE_VALUE" ]]
}

# Acquire the machine-local browser-certification lease.
# Default: --wait (queue cleanly). Pass --no-wait to refuse immediately.
alloy_browser_cert_acquire() {
  local wait_flag="--wait" reason="browser certification" holder
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --wait) wait_flag="--wait"; shift ;;
      --wait=*) wait_flag="$1"; shift ;;
      --no-wait) wait_flag="--no-wait"; shift ;;
      --reason) reason="${2:-}"; shift 2 ;;
      --reason=*) reason="${1#*=}"; shift ;;
      --holder) holder="${2:-}"; shift 2 ;;
      --holder=*) holder="${1#*=}"; shift ;;
      *) printf 'alloy_browser_cert_acquire: unknown arg: %s\n' "$1" >&2; return 2 ;;
    esac
  done
  holder="${holder:-$(_alloy_browser_cert_holder)}"

  if alloy_browser_cert_override_active; then
    printf '\033[33m!\033[0m browser-cert override in effect — proceeding without exclusive lease\n' >&2
    return 0
  fi

  local bin; bin="$(_alloy_browser_cert_bin)"
  [[ -x "$bin" ]] || { printf 'alloy-compute missing at %s\n' "$bin" >&2; return 127; }

  ALLOY_COMPUTE_HOLDER_PID="${ALLOY_COMPUTE_HOLDER_PID:-$$}" \
    "$bin" acquire "$ALLOY_BROWSER_CERT_RESOURCE" \
      --holder "$holder" \
      $wait_flag \
      --reason "$reason"
}

alloy_browser_cert_release() {
  local holder="${1:-$(_alloy_browser_cert_holder)}"
  if alloy_browser_cert_override_active; then
    return 0
  fi
  local bin; bin="$(_alloy_browser_cert_bin)"
  [[ -x "$bin" ]] || return 0
  "$bin" release "$ALLOY_BROWSER_CERT_RESOURCE" --holder "$holder" >/dev/null 2>&1 || true
}

# Run a command while holding the browser-certification lease.
# Releases on EXIT/INT/TERM even if the command fails.
alloy_browser_cert_run() {
  local wait_flag="--wait" reason="browser certification" holder=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --wait) wait_flag="--wait"; shift ;;
      --wait=*) wait_flag="$1"; shift ;;
      --no-wait) wait_flag="--no-wait"; shift ;;
      --reason) reason="${2:-}"; shift 2 ;;
      --reason=*) reason="${1#*=}"; shift ;;
      --holder) holder="${2:-}"; shift 2 ;;
      --holder=*) holder="${1#*=}"; shift ;;
      --) shift; break ;;
      *) break ;;
    esac
  done
  [[ $# -ge 1 ]] || { printf 'usage: alloy_browser_cert_run [--wait|--no-wait] -- <command...>\n' >&2; return 2; }
  holder="${holder:-$(_alloy_browser_cert_holder)}"

  alloy_browser_cert_acquire $wait_flag --reason "$reason" --holder "$holder" || return $?
  # shellcheck disable=SC2064
  trap "alloy_browser_cert_release '$holder'" EXIT INT TERM HUP
  "$@"
  local rc=$?
  trap - EXIT INT TERM HUP
  alloy_browser_cert_release "$holder"
  return "$rc"
}

# True when a command string is expensive browser certification (not unit tests).
alloy_command_is_browser_certification() {
  local cmd="${1:-}"
  [[ -n "$cmd" ]] || return 1
  case "$cmd" in
    *playwright*test*|*playwright\ test*|*npx\ playwright*|*chromium.launch*|*@playwright/test*)
      return 0
      ;;
  esac
  return 1
}
