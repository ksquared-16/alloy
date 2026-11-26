#!/usr/bin/env bash
# Docker + local Supabase helpers for managed workers.
# Workers must not invent Docker Desktop force-kills or raw `supabase db reset`
# retry loops — those belong here so every slot gets the same recovery path.
# shellcheck shell=bash

# Bound a docker CLI call. Exit codes:
#   0 = success
#   1 = docker exited non-zero (daemon reachable but command failed)
#   2 = hung / timed out (wedged)
#   3 = docker binary missing
# Usage: alloy_docker_bounded [secs] -- docker args...
#    or: alloy_docker_bounded docker args...   (default secs)
alloy_docker_bounded() {
  local secs="${ALLOY_DOCKER_TIMEOUT_SECS:-8}"
  if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    secs="$1"
    shift
  fi
  if [[ "${1:-}" == "--" ]]; then shift; fi
  if ! alloy_have_cmd docker; then
    return 3
  fi
  # macOS often lacks GNU timeout — use python3.
  # Args after optional secs/-- are the full command (usually: docker info).
  SECS="$secs" python3 - "$@" <<'PY'
import os, subprocess, sys
secs = float(os.environ.get("SECS", "8"))
cmd = sys.argv[1:]
if not cmd:
    sys.exit(3)
try:
    r = subprocess.run(cmd, timeout=secs, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    sys.exit(0 if r.returncode == 0 else 1)
except subprocess.TimeoutExpired:
    sys.exit(2)
except FileNotFoundError:
    sys.exit(3)
PY
}

# Print KEY=value health lines (never secrets).
# DOCKER_STATUS=ok|missing|unreachable|wedged
alloy_docker_health_report() {
  local status="ok" detail=""
  if ! alloy_have_cmd docker; then
    printf 'DOCKER_STATUS=missing\n'
    printf 'DOCKER_DETAIL=docker binary not on PATH\n'
    printf 'DOCKER_RECOVERABLE=no\n'
    return 3
  fi

  local rc=0
  alloy_docker_bounded "${ALLOY_DOCKER_TIMEOUT_SECS:-8}" -- docker info || rc=$?
  case "$rc" in
    0)
      status="ok"
      detail="docker info ok"
      ;;
    2)
      status="wedged"
      detail="docker info hung beyond ${ALLOY_DOCKER_TIMEOUT_SECS:-8}s — daemon likely wedged"
      ;;
    3)
      status="missing"
      detail="docker binary disappeared"
      ;;
    *)
      status="unreachable"
      detail="docker info failed (daemon not ready or Desktop not running)"
      ;;
  esac

  printf 'DOCKER_STATUS=%s\n' "$status"
  printf 'DOCKER_DETAIL=%s\n' "$detail"
  if [[ "$status" == "ok" ]]; then
    printf 'DOCKER_RECOVERABLE=n/a\n'
    return 0
  fi
  if [[ "$(uname -s)" == "Darwin" ]] && { [[ -d "/Applications/Docker.app" ]] || [[ -d "$HOME/Applications/Docker.app" ]]; }; then
    printf 'DOCKER_RECOVERABLE=yes\n'
    printf 'DOCKER_ENGINE=Docker Desktop\n'
  else
    printf 'DOCKER_RECOVERABLE=manual\n'
    printf 'DOCKER_ENGINE=unknown\n'
  fi
  [[ "$status" == "wedged" ]] && return 2
  return 1
}

alloy_docker_is_ok() {
  local report
  report="$(alloy_docker_health_report 2>/dev/null || true)"
  grep -q '^DOCKER_STATUS=ok$' <<<"$report"
}

# Recover a wedged / unreachable Docker Desktop on macOS.
# Safe defaults: quit → wait → reopen → wait for readiness.
# Pass force=1 to SIGKILL Docker Desktop helpers when quit is ignored (the
# operator-observed "force-kill and relaunch" path).
alloy_docker_recover_desktop() {
  local force="${1:-0}"
  local wait_quit="${ALLOY_DOCKER_QUIT_WAIT_SECS:-8}"
  local wait_ready="${ALLOY_DOCKER_READY_WAIT_SECS:-90}"

  [[ "$(uname -s)" == "Darwin" ]] || {
    alloy_warn "automatic Docker recover is macOS/Docker Desktop only — restart the daemon manually"
    return 1
  }

  if alloy_docker_is_ok; then
    alloy_info "Docker already healthy — no recover needed"
    return 0
  fi

  alloy_info "Recovering Docker Desktop (force=${force})…"

  # Prefer graceful quit.
  osascript -e 'quit app "Docker Desktop"' >/dev/null 2>&1 || true
  osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
  sleep "$wait_quit"

  if [[ "$force" == "1" ]]; then
    # Only when still wedged — matches the real cost Kelly hit.
    if ! alloy_docker_bounded 3 -- docker info; then
      alloy_warn "Docker still unresponsive after quit — force-killing Desktop helpers"
      pkill -9 -x "Docker Desktop" 2>/dev/null || true
      pkill -9 -f "Docker Desktop.app" 2>/dev/null || true
      pkill -9 -f "com.docker.backend" 2>/dev/null || true
      pkill -9 -f "com.docker.hyperkit" 2>/dev/null || true
      pkill -9 -f "com.docker.vpnkit" 2>/dev/null || true
      sleep 2
    fi
  fi

  open -a "Docker" 2>/dev/null || open -a "Docker Desktop" 2>/dev/null || {
    alloy_warn "Could not open Docker Desktop — launch it from Applications"
    return 1
  }

  local elapsed=0
  while (( elapsed < wait_ready )); do
    if alloy_docker_is_ok; then
      alloy_info "Docker Desktop ready after ${elapsed}s"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  alloy_warn "Docker Desktop did not become ready within ${wait_ready}s"
  return 1
}

# True when log/output looks like a transient Supabase/Docker gateway failure.
alloy_supabase_reset_is_transient() {
  local text="$1"
  grep -qiE '502|bad gateway|gateway timeout|503|connection reset|ECONNRESET|EOF|i/o timeout|dial tcp|temporary failure|unexpected EOF|context deadline|API error.*(502|503)' <<<"$text"
}

# Resolve workdir for supabase CLI (repo root with supabase/config.toml).
alloy_supabase_resolve_workdir() {
  local hint="${1:-}"
  local cand
  for cand in \
    "$hint" \
    "${ALLOY_WORKTREE_PATH:-}" \
    "${ALLOY_REPO:-}" \
    "$(pwd)"; do
    [[ -n "$cand" ]] || continue
    if [[ -f "${cand}/supabase/config.toml" ]]; then
      printf '%s\n' "$cand"
      return 0
    fi
    if [[ -f "${cand}/../supabase/config.toml" ]]; then
      printf '%s\n' "$(cd "${cand}/.." && pwd)"
      return 0
    fi
  done
  return 1
}

# Fail closed: never reset against a remote/production Supabase URL.
alloy_supabase_assert_local_reset_safe() {
  local workdir="$1"
  local envf="${workdir}/supabase/.env"
  local url=""
  if [[ -f "$envf" ]]; then
    url="$(grep -E '^[[:space:]]*SUPABASE_URL=' "$envf" 2>/dev/null | tail -1 | sed 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//' || true)"
  fi
  # Also check common agent env (should not have privileged DB URL, but guard anyway).
  if [[ -f "${workdir}/web/.env.local" ]]; then
    local u2
    u2="$(grep -E '^[[:space:]]*NEXT_PUBLIC_SUPABASE_URL=' "${workdir}/web/.env.local" 2>/dev/null | tail -1 | sed 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//' || true)"
    [[ -n "$u2" ]] && url="${url:-$u2}"
  fi
  if [[ -n "$url" ]] && type alloy_is_production_supabase_url >/dev/null 2>&1; then
    if alloy_is_production_supabase_url "$url"; then
      alloy_die "refusing supabase db reset — URL looks remote/production: ${url%%\?*} (local disposable stack only)"
    fi
  fi
  # Hard deny obvious hosted hosts even without the helper.
  case "$url" in
    *supabase.co*|*supabase.in*)
      alloy_die "refusing supabase db reset against hosted URL"
      ;;
  esac
}

# Run local supabase db reset with Docker gate + transient 502 retries.
# Args: [workdir] [--recover-docker] [--force-docker] [--retries N] [--debug]
alloy_supabase_db_reset() {
  # DEFENCE IN DEPTH. `alloy-db-reset` guards its entry point, but this function is
  # reachable by anything that sources this library, and guarding only the CLI would
  # leave that door open. The guard is idempotent, so passing through both is fine.
  if [[ -z "${ALLOY_CERT_GUARD_APPLIED:-}" ]]; then
    local _cog="${BASH_SOURCE[0]%/*}/cert-ownership.sh"
    if [[ -f "$_cog" ]]; then
      # shellcheck source=cert-ownership.sh
      source "$_cog"
      alloy_cert_guard destroy-db "database reset" || return 1
    else
      printf '\033[31m✗ certification ownership guard missing; refusing database reset\033[0m\n' >&2
      return 1
    fi
  fi

  local workdir="" recover_docker=0 force_docker=0 retries="${ALLOY_DB_RESET_RETRIES:-3}" debug=0
  local -a passthrough=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --recover-docker) recover_docker=1; shift ;;
      --force-docker) force_docker=1; recover_docker=1; shift ;;
      --retries) retries="$2"; shift 2 ;;
      --debug) debug=1; shift ;;
      --) shift; passthrough+=("$@"); break ;;
      -*)
        # Allow unknown flags through to supabase after our options.
        passthrough+=("$1"); shift ;;
      *)
        if [[ -z "$workdir" ]]; then workdir="$1"; shift; else passthrough+=("$1"); shift; fi
        ;;
    esac
  done

  alloy_require_cmd supabase
  workdir="$(alloy_supabase_resolve_workdir "$workdir")" \
    || alloy_die "supabase/config.toml not found — pass worktree/repo root"
  alloy_supabase_assert_local_reset_safe "$workdir"

  if ! alloy_docker_is_ok; then
    alloy_warn "Docker not healthy before db reset"
    alloy_docker_health_report || true
    if [[ "$recover_docker" -eq 1 ]]; then
      alloy_docker_recover_desktop "$force_docker" || alloy_die "Docker recover failed — cannot db reset"
    else
      alloy_die "Docker not healthy. Run: alloy-docker-doctor --recover   (add --force if wedged)"
    fi
  fi

  local attempt=1 rc=0 log
  log="$(mktemp -t alloy-db-reset.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$log'" RETURN

  while (( attempt <= retries )); do
    alloy_info "supabase db reset (attempt ${attempt}/${retries}) workdir=${workdir}"
    local -a cmd=(supabase db reset --workdir "$workdir")
    # Last attempt (or explicit) uses --debug — this is what unblocked the 502 streak.
    if [[ "$debug" -eq 1 || "$attempt" -eq "$retries" ]]; then
      cmd+=(--debug)
    fi
    if [[ ${#passthrough[@]} -gt 0 ]]; then
      cmd+=("${passthrough[@]}")
    fi

    set +e
    "${cmd[@]}" >"$log" 2>&1
    rc=$?
    set -e

    if [[ "$rc" -eq 0 ]]; then
      alloy_info "supabase db reset succeeded on attempt ${attempt}"
      # Keep last lines for evidence without dumping secrets-heavy debug.
      tail -n 20 "$log" >&2 || true
      return 0
    fi

    local body
    body="$(cat "$log")"
    if alloy_supabase_reset_is_transient "$body" && (( attempt < retries )); then
      local sleep_s=$(( attempt * 8 ))
      alloy_warn "transient failure (likely 502/gateway) — retrying in ${sleep_s}s"
      # If docker flipped wedged mid-reset, recover before retry.
      if ! alloy_docker_is_ok && [[ "$recover_docker" -eq 1 ]]; then
        alloy_docker_recover_desktop "$force_docker" || true
      fi
      sleep "$sleep_s"
      attempt=$((attempt + 1))
      continue
    fi

    alloy_warn "supabase db reset failed (rc=${rc})"
    tail -n 40 "$log" >&2 || true
    return "$rc"
  done
  return 1
}
