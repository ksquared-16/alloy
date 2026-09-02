#!/usr/bin/env bash
# Phase 3 — agent verification bootstrap (env, auth, browser, evidence, ready).
# shellcheck shell=bash

# ── Paths ──────────────────────────────────────────────────────────────────────

alloy_agent_web_env_path() {
  local worktree_path="$1"
  printf '%s/%s/.env.local.agent' "$worktree_path" "${ALLOY_WEB_DIR:-web}"
}

alloy_agent_context_path() {
  local worktree_path="$1"
  printf '%s/.alloy-agent-context.md' "$worktree_path"
}

alloy_auth_slot_dir() {
  local slot="$1"
  printf '%s/auth/slot%s' "$ALLOY_RUNTIME_ROOT" "$slot"
}

alloy_auth_storage_path() {
  local slot="$1"
  printf '%s/storage-state.json' "$(alloy_auth_slot_dir "$slot")"
}

alloy_browser_profile_dir() {
  local slot="$1"
  printf '%s/browser-profiles/slot%s' "$ALLOY_RUNTIME_ROOT" "$slot"
}

alloy_browser_pid_path() {
  local slot="$1"
  printf '%s/browser-pids/slot%s.pid' "$ALLOY_RUNTIME_ROOT" "$slot"
}

alloy_browser_meta_path() {
  local slot="$1"
  printf '%s/browser-pids/slot%s.meta' "$ALLOY_RUNTIME_ROOT" "$slot"
}

alloy_evidence_dir() {
  local name="$1"
  printf '%s/evidence/%s' "$ALLOY_RUNTIME_ROOT" "$name"
}

alloy_ensure_verify_runtime_dirs() {
  alloy_ensure_agent_runtime_dirs
  mkdir -p \
    "${ALLOY_RUNTIME_ROOT}/auth" \
    "${ALLOY_RUNTIME_ROOT}/browser-profiles" \
    "${ALLOY_RUNTIME_ROOT}/browser-pids" \
    "${ALLOY_RUNTIME_ROOT}/evidence"
}

alloy_slot_qa_identity() {
  local slot="$1"
  local var="ALLOY_SLOT_${slot}_QA_IDENTITY"
  local value=""
  eval "value=\"\${${var}-}\""
  printf '%s' "$value"
}

alloy_agent_login_route() {
  printf '%s' "${ALLOY_AGENT_LOGIN_ROUTE:-/login}"
}

alloy_agent_auth_check_route() {
  printf '%s' "${ALLOY_AGENT_AUTH_CHECK_ROUTE:-/workspace}"
}

# Sanitized agent-visible env source (alloy-agent-prepare). Never includes privileged values.
alloy_env_source_path() {
  printf '%s' "${ALLOY_ENV_SOURCE:-${ALLOY_REPO}/web/.env.local}"
}

# Trusted server env source — injected only into toolkit-owned Next process (alloy-dev-start).
# Distinct from ALLOY_ENV_SOURCE. Never copied into the worktree.
alloy_server_env_source_path() {
  printf '%s' "${ALLOY_SERVER_ENV_SOURCE:-${ALLOY_REPO}/web/.env.local}"
}

# Minimal required server-side names proven by Alloy admin paths (createAdminClient).
# Extend via ALLOY_SERVER_ENV_REQUIRED (space-separated). Names only — never values.
alloy_required_server_env_names() {
  local -a names=("SUPABASE_SERVICE_ROLE_KEY")
  local extra
  for extra in ${ALLOY_SERVER_ENV_REQUIRED:-}; do
    [[ -n "$extra" ]] || continue
    names+=("$extra")
  done
  local n
  for n in "${names[@]}"; do
    printf '%s\n' "$n"
  done | sort -u
}

# ── Host allowlist (localhost + optional staging hostnames) ─────────────────

alloy_verify_host_allowed() {
  local url="$1"
  local host
  host="$(python3 -c "import sys, urllib.parse; print(urllib.parse.urlparse(sys.argv[1]).hostname or '')" "$url" 2>/dev/null || true)"
  [[ -n "$host" ]] || return 1

  case "$host" in
    localhost|127.0.0.1|::1|[::1]) return 0 ;;
  esac

  local extra
  for extra in ${ALLOY_VERIFY_ALLOWED_HOSTS:-}; do
    [[ "$host" == "$extra" ]] && return 0
  done

  # Reject obvious production patterns.
  case "$host" in
    *alloy.com|*workwithalloy.com|*vercel.app)
      return 1
      ;;
  esac

  return 1
}

alloy_verify_url_for_slot() {
  local port="$1"
  if [[ -n "${ALLOY_VERIFY_BASE_URL:-}" ]]; then
    printf '%s' "${ALLOY_VERIFY_BASE_URL}"
    return
  fi
  printf 'http://127.0.0.1:%s' "$port"
}

# ── Worktree-local Playwright preflight ─────────────────────────────────────

# Fail before opening a browser when <worktree>/web cannot resolve @playwright/test.
# Never installs dependencies; never borrows from another worktree or global.
alloy_require_worktree_playwright() {
  local worktree_path="$1"
  local web_dir pkg helper
  web_dir="$(alloy_web_dir_for "$worktree_path")"
  pkg="${web_dir}/package.json"

  if [[ ! -f "$pkg" ]]; then
    alloy_die "web/package.json missing at ${web_dir} — run: cd ${web_dir} && npm install"
  fi

  helper="${ALLOY_LOCAL_DEV_ROOT}/lib/playwright-from-web.mjs"
  if [[ ! -f "$helper" ]]; then
    alloy_die "Playwright resolution helper missing: $helper"
  fi

  if ! node "$helper" --preflight --web-dir "$web_dir" >/dev/null; then
    alloy_die "@playwright/test not available in this worktree's web package — run: cd ${web_dir} && npm install (do not use a global install or another worktree's node_modules)"
  fi
}

# Human-readable ownership for ready/status (toolkit-owned | foreign-port-owner | stale | stopped | ...).
alloy_server_ownership_label() {
  local name="$1"
  local state
  state="$(alloy_server_state_for "$name")"
  case "$state" in
    running) printf 'toolkit-owned' ;;
    foreign-port-owner) printf 'foreign-port-owner' ;;
    stale) printf 'stale-pid' ;;
    stopped) printf 'stopped' ;;
    *) printf '%s' "$state" ;;
  esac
}

# Refuse unless the assigned port is served by this worktree's toolkit-owned dev server.
alloy_require_toolkit_owned_server() {
  local name="$1"
  local state port
  alloy_load_metadata "$name"
  port="$PORT"
  state="$(alloy_server_state_for "$name")"
  case "$state" in
    running) return 0 ;;
    foreign-port-owner)
      alloy_die "port ${port} has a foreign listener — stop it, then run: alloy-dev-start ${name} (do not run npm run dev directly)"
      ;;
    stale)
      alloy_die "stale dev server PID for ${name} — run: alloy-dev-stop ${name} && alloy-dev-start ${name}"
      ;;
    *)
      alloy_die "dev server not toolkit-owned (${state}) — run: alloy-dev-start ${name} (web/.env.local.agent loads only through alloy-dev-start; do not run npm run dev directly)"
      ;;
  esac
}

# ── Safe environment classification ─────────────────────────────────────────

# True when a variable name matches secret-like deny patterns.
# Denylist always wins over allowlist, configured additions, and prefixes.
alloy_env_name_is_denied() {
  local name="$1"
  [[ -n "$name" ]] || return 1

  local frag
  for frag in SECRET PASSWORD TOKEN PRIVATE SERVICE_ROLE DATABASE_URL API_KEY SIGNING CREDENTIAL; do
    if [[ "$name" == *"$frag"* ]]; then
      return 0
    fi
  done

  case "$name" in
    SUPABASE_SERVICE_ROLE_KEY|PGPASSWORD|POSTGRES_PASSWORD|GITHUB_TOKEN|\
    OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)
      return 0
      ;;
  esac

  case "$name" in
    STRIPE_*|TWILIO_*|RESEND_*|AWS_*)
      return 0
      ;;
  esac

  return 1
}

# Built-in explicit allowlist of known-safe names (not a broad ALLOY_* wildcard).
alloy_env_is_builtin_allowed() {
  local name="$1"
  case "$name" in
    PORT|NODE_ENV|NEXT_PUBLIC_APP_URL|ALLOY_AGENT_ENV)
      return 0
      ;;
  esac
  return 1
}

# stdout: allow | deny | ambiguous
alloy_classify_env_var() {
  local name="$1"
  [[ -n "$name" ]] || return 1

  if alloy_env_name_is_denied "$name"; then
    echo deny
    return 0
  fi

  if alloy_env_is_builtin_allowed "$name"; then
    echo allow
    return 0
  fi

  local allowed
  for allowed in ${ALLOY_ENV_ALLOWLIST:-}; do
    [[ "$name" == "$allowed" ]] && { echo allow; return 0; }
  done

  if [[ "$name" == NEXT_PUBLIC_* ]]; then
    echo allow
    return 0
  fi

  echo ambiguous
}

alloy_parse_env_file_names() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$file" 2>/dev/null \
    | sed 's/=.*//' \
    | sort -u || true
}

alloy_read_env_value() {
  local file="$1"
  local name="$2"
  local line
  line="$(grep -E "^${name}=" "$file" 2>/dev/null | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  printf '%s' "${line#*=}" | sed 's/^["'\'']//; s/["'\'']$//'
}

alloy_is_production_supabase_url() {
  local url="$1"
  [[ -z "$url" ]] && return 1
  case "$url" in
    *localhost*|*127.0.0.1*|*:55321*|*local.supabase*) return 1 ;;
  esac
  # Linked staging/dev project URLs are operator-configured; block only if explicitly flagged.
  if [[ "${ALLOY_BLOCK_REMOTE_SUPABASE:-0}" == "1" ]]; then
    return 0
  fi
  return 1
}

# Write web/.env.local.agent from classified source. Never prints values.
# Optional second arg: force overwrite (1) after showing planned name diff.
alloy_prepare_agent_env_file() {
  local worktree_path="$1"
  local force="${2:-0}"
  local web_dir target source
  web_dir="$(alloy_web_dir_for "$worktree_path")"
  target="$(alloy_agent_web_env_path "$worktree_path")"
  source="$(alloy_env_source_path)"

  [[ -d "$web_dir" ]] || alloy_die "web directory missing: $web_dir"
  [[ -f "$source" ]] || alloy_die "env source missing: $source (set ALLOY_ENV_SOURCE or create canonical web/.env.local)"

  local -a copied=() excluded=() ambiguous=() denied=()
  local name classification value

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    classification="$(alloy_classify_env_var "$name")"
    case "$classification" in
      allow)
        value="$(alloy_read_env_value "$source" "$name" || true)"
        if [[ "$name" == "NEXT_PUBLIC_SUPABASE_URL" ]] && alloy_is_production_supabase_url "$value"; then
          denied+=("$name (remote Supabase blocked by ALLOY_BLOCK_REMOTE_SUPABASE)")
          continue
        fi
        copied+=("$name")
        ;;
      deny) excluded+=("$name") ;;
      ambiguous) ambiguous+=("$name") ;;
    esac
  done < <(alloy_parse_env_file_names "$source")

  if [[ ${#ambiguous[@]} -gt 0 ]]; then
    alloy_die "ambiguous env variables (fail closed): ${ambiguous[*]}"
  fi

  if [[ -f "$target" && "$force" != "1" ]]; then
    alloy_info "Target exists: $target"
    alloy_info "Planned variable names to write: ${copied[*]:-"(none)"}"
    alloy_info "Excluded (denied): ${excluded[*]:-"(none)"}"
    alloy_die "refusing to overwrite existing agent env without --force (developer-owned values preserved)"
  fi

  mkdir -p "$(dirname "$target")"
  local tmp
  tmp="$(mktemp "${target}.XXXXXX")"
  {
    printf '# Generated by alloy-agent-prepare — safe allowlisted variables only.\n'
    printf '# Values are never printed by toolkit commands. chmod 600.\n'
    printf 'ALLOY_AGENT_ENV=1\n'
    for name in "${copied[@]}"; do
      value="$(alloy_read_env_value "$source" "$name")"
      # shellcheck disable=SC2016
      printf '%s=%s\n' "$name" "$value"
    done
  } >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$target"

  # Git ignore in worktree.
  local git_dir common_dir exclude_file
  git_dir="$(alloy_git "$worktree_path" rev-parse --git-dir 2>/dev/null || true)"
  common_dir="$(alloy_git "$worktree_path" rev-parse --git-common-dir 2>/dev/null || true)"
  if [[ -n "$git_dir" ]]; then
    mkdir -p "${git_dir}/info" "${common_dir}/info"
    for exclude_file in "${git_dir}/info/exclude" "${common_dir}/info/exclude"; do
      if ! grep -Fq '.env.local.agent' "$exclude_file" 2>/dev/null; then
        printf '%s\n' '.env.local.agent' >>"$exclude_file"
      fi
      if ! grep -Fq '.alloy-agent-context.md' "$exclude_file" 2>/dev/null; then
        printf '%s\n' '.alloy-agent-context.md' >>"$exclude_file"
      fi
    done
  fi

  alloy_info "Safe env written: $target (chmod 600)"
  alloy_info "Copied (${#copied[@]}): ${copied[*]:-none}"
  alloy_info "Excluded (${#excluded[@]}): ${excluded[*]:-none}"
  if [[ ${#denied[@]} -gt 0 ]]; then
    alloy_warn "Also blocked: ${denied[*]}"
  fi
}

alloy_agent_env_ready() {
  local worktree_path="$1"
  local target
  target="$(alloy_agent_web_env_path "$worktree_path")"
  [[ -f "$target" ]] || return 1
  local mode
  mode="$(stat -f '%OLp' "$target" 2>/dev/null || stat -c '%a' "$target" 2>/dev/null || echo "")"
  [[ "$mode" == "600" ]] && return 0
  return 1
}

alloy_load_agent_env_exports() {
  local worktree_path="$1"
  local target line key
  target="$(alloy_agent_web_env_path "$worktree_path")"
  [[ -f "$target" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    classification="$(alloy_classify_env_var "$key")"
    [[ "$classification" == "allow" ]] || continue
    export "$line"
  done <"$target"
}

# True when env file has a non-empty assignment for name. Never prints the value.
alloy_env_file_has_nonempty() {
  local file="$1"
  local name="$2"
  local value
  value="$(alloy_read_env_value "$file" "$name" 2>/dev/null || true)"
  [[ -n "${value:-}" ]]
}

# True when agent-visible env lacks privileged / denied names (fail closed for worktree hygiene).
alloy_agent_env_lacks_privileged() {
  local worktree_path="$1"
  local target name
  target="$(alloy_agent_web_env_path "$worktree_path")"
  [[ -f "$target" ]] || return 0
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if alloy_env_name_is_denied "$name"; then
      return 1
    fi
  done < <(alloy_parse_env_file_names "$target")
  return 0
}

# Preflight trusted server source: source exists + required names present (names only).
# Does not load or print values. Exit non-zero with safe remediation.
alloy_trusted_server_env_preflight() {
  local source missing=()
  source="$(alloy_server_env_source_path)"

  if [[ ! -f "$source" ]]; then
    alloy_die "trusted server env source missing: ${source} (set ALLOY_SERVER_ENV_SOURCE to your canonical web/.env.local). Privileged values are injected only into the toolkit-owned server process — never into the worktree."
  fi

  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if ! alloy_env_file_has_nonempty "$source" "$name"; then
      missing+=("$name")
    fi
  done < <(alloy_required_server_env_names)

  if [[ ${#missing[@]} -gt 0 ]]; then
    alloy_die "trusted server env missing required variable names: ${missing[*]} — add them to ${source} (ALLOY_SERVER_ENV_SOURCE). Values are never printed; alloy-dev-start injects them into the owned Next process only."
  fi

  return 0
}

# Report trusted-server readiness as KEY=value lines (names/status only; never values).
alloy_trusted_server_env_status() {
  local worktree_path="${1:-}"
  local source present_names=() missing_names=()
  source="$(alloy_server_env_source_path)"

  if [[ -f "$source" ]]; then
    printf 'TRUSTED_SOURCE=configured\n'
    printf 'TRUSTED_SOURCE_PATH=%s\n' "$source"
  else
    printf 'TRUSTED_SOURCE=missing\n'
    printf 'TRUSTED_SOURCE_PATH=%s\n' "$source"
  fi

  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if [[ -f "$source" ]] && alloy_env_file_has_nonempty "$source" "$name"; then
      present_names+=("$name")
    else
      missing_names+=("$name")
    fi
  done < <(alloy_required_server_env_names)

  printf 'TRUSTED_REQUIRED_PRESENT=%s\n' "${present_names[*]:-}"
  printf 'TRUSTED_REQUIRED_MISSING=%s\n' "${missing_names[*]:-}"
  printf 'TRUSTED_REQUIRED_COUNT=%s\n' "${#present_names[@]}"

  if [[ -n "$worktree_path" ]]; then
    local agent_env
    agent_env="$(alloy_agent_web_env_path "$worktree_path")"
    if [[ -f "$agent_env" ]] && alloy_agent_env_lacks_privileged "$worktree_path"; then
      printf 'TRUSTED_NOT_IN_WORKTREE=yes\n'
    elif [[ -f "$agent_env" ]]; then
      printf 'TRUSTED_NOT_IN_WORKTREE=no\n'
    else
      printf 'TRUSTED_NOT_IN_WORKTREE=n/a\n'
    fi
  fi
}

# Export all assignments from the trusted server source into the current shell only.
# Used solely by alloy-dev-start before spawning the owned Next process.
# Never writes to the worktree, metadata, logs, or stdout. Values are not printed.
alloy_load_trusted_server_env_exports() {
  local source key value count=0
  source="$(alloy_server_env_source_path)"
  [[ -f "$source" ]] || return 1

  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    value="$(alloy_read_env_value "$source" "$key" || true)"
    [[ -n "${value:-}" ]] || continue
    # ALLOY_BLOCK_REMOTE_SUPABASE asserts "this run must not reach a remote Supabase". The
    # agent-env classifier enforces that for the client URL; the server reads the database, so
    # enforce it here too or the guard only covers the half that doesn't do the querying.
    # Fail closed (die, not skip): a silently absent SUPABASE_URL starts an app that looks local
    # while being broken, which is harder to diagnose than a refusal.
    case "$key" in
      *SUPABASE_URL|DATABASE_URL|*DATABASE_URL)
        if alloy_is_production_supabase_url "$value"; then
          alloy_die "trusted server env $key targets a remote host (blocked by ALLOY_BLOCK_REMOTE_SUPABASE)"
        fi
        ;;
    esac
    # Assign without echoing value (export name=value form; value stays in shell memory).
    export "${key}=${value}"
    count=$((count + 1))
  done < <(alloy_parse_env_file_names "$source")

  ALLOY_TRUSTED_ENV_LOADED_COUNT="$count"
  return 0
}

# ── Auth storage state ───────────────────────────────────────────────────────

# Is every cookie in the captured storage past its expiry? Answers the ONE question the word
# "expired" should ever be based on, so a login redirect is never reported as an expiry.
alloy_auth_storage_is_expired() {
  local path="$1"
  [[ -f "$path" ]] || return 0
  python3 - "$path" <<'PYEOF' 2>/dev/null || return 1
import json, sys, time
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
cookies = data.get("cookies") or []
if not cookies:
    sys.exit(0)
now = time.time()
for c in cookies:
    exp = c.get("expires")
    # A session cookie (no positive expiry) never "expires" on the clock.
    if not isinstance(exp, (int, float)) or exp <= 0 or exp > now:
        sys.exit(1)
sys.exit(0)
PYEOF
}

alloy_auth_state_status() {
  local slot="$1"
  local port="$2"
  local web_dir="${3:-}"
  local path
  path="$(alloy_auth_storage_path "$slot")"

  if [[ ! -f "$path" ]]; then
    printf 'missing'
    return
  fi

  local mode
  mode="$(stat -f '%OLp' "$path" 2>/dev/null || stat -c '%a' "$path" 2>/dev/null || echo "")"
  if [[ "$mode" != "600" ]]; then
    printf 'invalid-permissions'
    return
  fi

  # Validate JSON shape without printing contents.
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$path" 2>/dev/null; then
    printf 'invalid'
    return
  fi

  # Optional live check via helper script (sets ALLOY_AUTH_CHECK_RESULT).
  local base url
  base="$(alloy_verify_url_for_slot "$port")"
  url="${base}$(alloy_agent_auth_check_route)"
  if [[ -n "${ALLOY_SKIP_AUTH_LIVE_CHECK:-}" ]]; then
    printf 'present'
    return
  fi

  local check_script="${ALLOY_AGENT_AUTH_CHECK_SCRIPT:-${ALLOY_LOCAL_DEV_ROOT}/lib/agent-auth-check.mjs}"
  if [[ -f "$check_script" ]]; then
    local -a check_args=(--storage "$path" --url "$url")
    if [[ -n "$web_dir" ]]; then
      check_args+=(--web-dir "$web_dir")
    elif [[ -n "${ALLOY_WORKTREE_PATH:-}" ]]; then
      check_args+=(--web-dir "$(alloy_web_dir_for "$ALLOY_WORKTREE_PATH")")
    fi
    ALLOY_AUTH_CHECK_RESULT="$(
      node "$check_script" "${check_args[@]}" 2>/dev/null || echo "failed"
    )" || true
    # ── "EXPIRED" IS A VERDICT, NOT A CATCH-ALL ──
    #
    # `login` and `unauthorized` both used to print `expired`, and every caller repeated that word
    # to the operator. It sent a certification lane hunting a stale session while the storage was
    # 50 seconds old with an hour of runway: the cookies were present, correctly scoped to BOTH
    # localhost and 127.0.0.1, and unexpired -- the app simply did not accept them. Naming the
    # observed state costs nothing and points at the right half of the system.
    #
    # `session_expired` is reserved for a session that genuinely aged out, which the caller can now
    # tell apart from an app that redirected to login for some other reason.
    case "${ALLOY_AUTH_CHECK_RESULT}" in
      ok) printf 'valid'; return ;;
      login)
        if alloy_auth_storage_is_expired "$path"; then printf 'session_expired'; else printf 'login_redirect'; fi
        return ;;
      unauthorized) printf 'unauthorized'; return ;;
    esac
  fi

  printf 'present'
}

# ── Browser ownership ────────────────────────────────────────────────────────

alloy_read_browser_meta() {
  local slot="$1"
  local meta
  meta="$(alloy_browser_meta_path "$slot")"
  [[ -f "$meta" ]] || return 1
  # shellcheck disable=SC1090
  source "$meta"
}

alloy_write_browser_meta() {
  local slot="$1"
  local pid="$2"
  local profile="$3"
  local name="$4"
  alloy_write_kv_file "$(alloy_browser_meta_path "$slot")" \
    "ALLOY_BROWSER_SLOT=\"$slot\"" \
    "ALLOY_BROWSER_PID=\"$pid\"" \
    "ALLOY_BROWSER_PROFILE=\"$profile\"" \
    "ALLOY_BROWSER_WORKTREE=\"$name\"" \
    "ALLOY_BROWSER_STARTED_AT=\"$(alloy_iso_now)\""
  printf '%s' "$pid" >"$(alloy_browser_pid_path "$slot")"
}

alloy_browser_state_for() {
  local slot="$1"
  local pid_path pid profile meta_pid

  pid_path="$(alloy_browser_pid_path "$slot")"
  if [[ ! -f "$pid_path" ]]; then
    printf 'stopped'
    return
  fi

  pid="$(alloy_read_pid_file "$pid_path" || true)"
  if [[ -z "${pid:-}" ]] || ! alloy_pid_alive "$pid"; then
    printf 'stale'
    return
  fi

  if alloy_read_browser_meta "$slot"; then
    if [[ "${ALLOY_BROWSER_PID:-}" == "$pid" ]]; then
      printf 'running'
      return
    fi
  fi

  if alloy_read_browser_meta "$slot"; then
    profile="${ALLOY_BROWSER_PROFILE:-}"
    if [[ -n "$profile" ]] && ! alloy_pid_belongs_to_worktree "$pid" "$profile" 2>/dev/null; then
      local cmd
      cmd="$(alloy_process_command "$pid")"
      if [[ "$cmd" != *"$profile"* && "$cmd" != *chromium* && "$cmd" != *playwright* ]]; then
        printf 'stale'
        return
      fi
    fi
  fi

  printf 'running'
}

alloy_stop_owned_browser() {
  local slot="$1"
  local pid_path pid

  pid_path="$(alloy_browser_pid_path "$slot")"
  if [[ ! -f "$pid_path" ]]; then
    alloy_info "no browser PID for slot $slot"
    return 0
  fi

  pid="$(alloy_read_pid_file "$pid_path" || true)"
  if [[ -z "${pid:-}" ]] || ! alloy_pid_alive "$pid"; then
    rm -f "$pid_path" "$(alloy_browser_meta_path "$slot")"
    alloy_info "removed stale browser PID for slot $slot"
    return 0
  fi

  if ! alloy_read_browser_meta "$slot"; then
    alloy_die "refusing to stop PID $pid — missing browser metadata for slot $slot"
  fi

  alloy_info "Sending SIGTERM to owned browser PID $pid (slot $slot)..."
  if alloy_have_cmd pkill; then
    pkill -TERM -P "$pid" 2>/dev/null || true
  fi
  kill -TERM "$pid" 2>/dev/null || true

  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if ! alloy_pid_alive "$pid"; then
      rm -f "$pid_path" "$(alloy_browser_meta_path "$slot")"
      alloy_info "stopped owned browser for slot $slot"
      return 0
    fi
    sleep 0.5
  done

  alloy_die "owned browser PID $pid still alive after SIGTERM (slot $slot). Inspect manually; toolkit does not SIGKILL globally."
}

alloy_refuse_duplicate_browser() {
  local slot="$1"
  local state
  state="$(alloy_browser_state_for "$slot")"
  if [[ "$state" == "running" ]]; then
    alloy_die "toolkit-owned browser already running for slot $slot. Use alloy-agent-browser-stop $slot first."
  fi
  if [[ "$state" == "stale" ]]; then
    rm -f "$(alloy_browser_pid_path "$slot")" "$(alloy_browser_meta_path "$slot")"
  fi
}

alloy_count_toolkit_browsers() {
  local count=0
  local slot state
  for ((slot = 1; slot <= ALLOY_MAX_AGENTS; slot++)); do
    state="$(alloy_browser_state_for "$slot")"
    if [[ "$state" == "running" ]]; then
      count=$((count + 1))
    fi
  done
  printf '%s' "$count"
}

# ── Evidence ─────────────────────────────────────────────────────────────────

alloy_list_evidence() {
  local name="$1"
  local dir
  dir="$(alloy_evidence_dir "$name")"
  [[ -d "$dir" ]] || return 0
  find "$dir" -type f 2>/dev/null | sort || true
}

# ── Context generation ───────────────────────────────────────────────────────

alloy_generate_agent_context() {
  local name="$1"
  alloy_load_metadata "$name"
  local slot="$ALLOY_WORKTREE_SLOT"
  local role="${ALLOY_AGENT_ROLE:-$(alloy_slot_role "$slot")}"
  local path="$ALLOY_WORKTREE_PATH"
  local port="$PORT"
  local url="${NEXT_PUBLIC_APP_URL:-http://localhost:${port}}"
  local qa="$(alloy_slot_qa_identity "$slot")"
  local env_ready auth_status browser_state staging_sha
  local out

  env_ready="no"
  alloy_agent_env_ready "$path" && env_ready="yes"
  auth_status="$(alloy_auth_state_status "$slot" "$port" "$(alloy_web_dir_for "$path")")"
  browser_state="$(alloy_browser_state_for "$slot")"
  staging_sha="$(alloy_git "$ALLOY_REPO" rev-parse "${ALLOY_BASE_REMOTE}/${ALLOY_BASE_BRANCH}" 2>/dev/null || echo unknown)"

  out="$(alloy_agent_context_path "$path")"
  mkdir -p "$(dirname "$out")"

  cat >"$out" <<EOF
# Alloy agent context — ${name}

## Assignment
| Field | Value |
|-------|-------|
| Initiative | ${name} |
| Slot | ${slot} (${role}) |
| Agent | ${ALLOY_AGENT} |
| Path | ${path} |
| Branch | ${ALLOY_WORKTREE_BRANCH} |
| Port | ${port} |
| URL | ${url} |
| QA identity | ${qa:-"(not configured — set ALLOY_SLOT_${slot}_QA_IDENTITY)"} |

## Git
- Origin staging SHA: \`${staging_sha}\`
- vs staging: $(alloy_git_state_summary "$path")

## Verification readiness
| Check | Status |
|-------|--------|
| Agent-safe env (web/.env.local.agent) | ${env_ready} |
| Trusted server source | configured via ALLOY_SERVER_ENV_SOURCE (injected by alloy-dev-start only; never in worktree) |
| Auth storage | ${auth_status} |
| Owned browser | ${browser_state} |
| Evidence dir | $(alloy_evidence_dir "$name") |

## Environment contract (two-tier)
- Agent-visible: \`web/.env.local.agent\` — public/safe vars only (inspect freely)
- Toolkit-owned server: \`alloy-dev-start\` injects trusted local server vars (e.g. service role) into the Next process only
- Privileged values never enter the worktree, metadata, instructions, or this context file
- \`npm run dev\` bypasses trusted injection and is prohibited

## Auth model (discovered)
- Login route: \`${url}$(alloy_agent_login_route)\` — Supabase email/password (\`/login\`)
- Auth check route: \`${url}$(alloy_agent_auth_check_route)\`
- Storage: \`$(alloy_auth_storage_path "$slot")\` (chmod 600, never commit)
- Manual login only — toolkit does not store passwords

## Documentation load order (concise)
1. \`docs/README.md\`
2. \`docs/platform/foundation/alloy-platform-handbook.md\`
3. Relevant topic under \`docs/platform/**\` for this initiative
4. \`web/README_ADMIN_AUTH.md\` for portal auth semantics

## Expected verification routes
- \`${url}/workspace\` (authenticated home)
- \`${url}/adminV2\` (admin shell)
- Initiative-specific routes under \`/adminV2/**\`

## Allowed commands
\`\`\`bash
alloy-dev-start ${name}              # required — agent-safe + trusted server injection (not npm run dev)
alloy-agent-ready ${slot}
alloy-agent-verify ${slot} authenticated-home
alloy-agent-verify ${slot} route /workspace
alloy-agent-verify ${slot} focused-spec playwright/tests/smoke-field-registry.spec.ts
alloy-validate ${name} playwright   # full suite — serialized global lock
alloy-agent-browser-stop ${slot}
alloy-agent-close ${slot}
\`\`\`

## Prohibited
- \`npm run dev\` directly — bypasses trusted server injection; use \`alloy-dev-start ${name}\` / \`devup\`
- Production URLs, credentials, cookies, tokens, storage-state contents
- Reading or requesting privileged server secrets (service role, DB URLs) from the worktree — they are not there
- Push, merge, worktree removal without explicit human approval
- Claiming UI verification from code inspection alone
- Second dev server or duplicate toolkit browser for this slot
- Full Playwright outside \`alloy-validate\` (use focused verify + lock for heavy)

## UI verification contract
For user-visible changes, report:
- route tested, QA identity alias, steps, expected vs observed
- console errors, failed network requests
- evidence paths (screenshots/traces under evidence dir)
- manual vs automated verification
- any unverified behavior

## CPU model
- One owned interactive browser per slot max
- Focused verify: one worker, screenshots on failure only
- Full Playwright: \`alloy-validate ${name} playwright\` only (serialized)
EOF

  cp "$out" "${ALLOY_RUNTIME_ROOT}/context/${name}.md" 2>/dev/null || \
    mkdir -p "${ALLOY_RUNTIME_ROOT}/context" && cp "$out" "${ALLOY_RUNTIME_ROOT}/context/${name}.md"

  printf '%s\n' "$out"
}

# ── Ready check ──────────────────────────────────────────────────────────────

# Sets ALLOY_READY_STATUS and ALLOY_READY_ISSUES array via stdout-friendly lines.
alloy_agent_ready_evaluate() {
  local name="$1"
  alloy_load_metadata "$name"
  local slot="$ALLOY_WORKTREE_SLOT"
  local path="$ALLOY_WORKTREE_PATH"
  local port="$PORT"
  local issues=()
  local ready=1

  # Git
  local branch dirty ahead behind
  branch="$(alloy_current_branch "$path" 2>/dev/null || echo "?")"
  [[ "$branch" == "$ALLOY_WORKTREE_BRANCH" ]] || issues+=("git: branch mismatch (on $branch, expected $ALLOY_WORKTREE_BRANCH)")
  local dirty_class
  dirty_class="$(alloy_worktree_dirty_classification "$path")"
  case "$dirty_class" in
    clean) ;;
    next-env-only)
      issues+=("git: worktree dirty (Next.js regenerated ${ALLOY_WEB_DIR:-web}/next-env.d.ts after dev) — git restore ${ALLOY_WEB_DIR:-web}/next-env.d.ts")
      ;;
    dirty)
      issues+=("git: worktree dirty")
      ;;
  esac
  ahead="$(alloy_git "$path" rev-list --count "$(alloy_base_ref)..HEAD" 2>/dev/null || echo "?")"
  behind="$(alloy_git "$path" rev-list --count "HEAD..$(alloy_base_ref)" 2>/dev/null || echo "?")"

  # Application — toolkit-owned dev server only (web/.env.local.agent via alloy-dev-start).
  local server ownership
  server="$(alloy_server_state_for "$name")"
  ownership="$(alloy_server_ownership_label "$name")"
  case "$server" in
    running) ;;
    foreign-port-owner)
      issues+=("app: foreign listener on port ${port} — stop foreign process; use alloy-dev-start ${name} (not npm run dev)")
      ;;
    stale)
      issues+=("app: stale dev server PID — alloy-dev-stop ${name} && alloy-dev-start ${name}")
      ;;
    *)
      issues+=("app: dev server not toolkit-owned (${server}) — alloy-dev-start ${name} (not npm run dev)")
      ;;
  esac

  local base url
  base="$(alloy_verify_url_for_slot "$port")"
  url="${base}"
  if [[ -z "${ALLOY_SKIP_URL_CHECK:-}" ]]; then
    if ! curl -sf -o /dev/null --max-time 3 "$url" 2>/dev/null; then
      issues+=("app: URL not reachable at $url")
    fi
  fi

  # Environment — agent-safe worktree file vs trusted server injection source.
  if ! alloy_agent_env_ready "$path"; then
    issues+=("env: web/.env.local.agent missing or wrong permissions — alloy-agent-prepare $slot")
  elif ! alloy_agent_env_lacks_privileged "$path"; then
    issues+=("env: privileged names found in web/.env.local.agent — re-run alloy-agent-prepare $slot --force")
  fi

  local trusted_source
  trusted_source="$(alloy_server_env_source_path)"
  if [[ ! -f "$trusted_source" ]]; then
    issues+=("env: trusted server source missing (${trusted_source}) — set ALLOY_SERVER_ENV_SOURCE")
  else
    local req_name
    while IFS= read -r req_name; do
      [[ -n "$req_name" ]] || continue
      if ! alloy_env_file_has_nonempty "$trusted_source" "$req_name"; then
        issues+=("env: required server variable name missing in trusted source: ${req_name}")
      fi
    done < <(alloy_required_server_env_names)
  fi

  # Auth
  local qa auth
  qa="$(alloy_slot_qa_identity "$slot")"
  [[ -n "$qa" ]] || issues+=("auth: QA identity alias not configured (ALLOY_SLOT_${slot}_QA_IDENTITY)")
  auth="$(alloy_auth_state_status "$slot" "$port" "$(alloy_web_dir_for "$path")")"
  case "$auth" in
    missing) issues+=("auth: storage state missing — alloy-agent-login $slot") ;;
    session_expired|invalid|invalid-permissions) issues+=("auth: storage state $auth — alloy-agent-login $slot") ;;
    # A live-app refusal is NOT a storage problem, and telling an operator to re-capture storage
    # sends them to re-mint a session that was already valid. Name what was actually observed.
    login_redirect) issues+=("auth: storage is valid but the app redirected to /login — session not accepted by the app (auth_origin/session contract), not an expiry") ;;
    unauthorized) issues+=("auth: the app returned unauthorized for a valid, unexpired storage state") ;;
  esac

  # Browser duplicate
  local bstate
  bstate="$(alloy_browser_state_for "$slot")"
  [[ "$bstate" != "running" ]] || issues+=("browser: toolkit browser already running — alloy-agent-browser-stop $slot if finished")

  # Instructions
  if [[ ! -f "$(alloy_instructions_path "$path")" ]]; then
    issues+=("context: instructions missing — alloy-agent-instructions $slot")
  fi

  # Validation lock (informational)
  local lock_msg="free"
  if [[ -d "${ALLOY_VALIDATE_LOCK_DIR}" ]]; then
    lock_msg="held"
  fi

  if [[ ${#issues[@]} -gt 0 ]]; then
    ready=0
  fi

  printf 'READY_STATUS=%s\n' "$([[ "$ready" -eq 1 ]] && echo READY || echo NOT_READY)"
  printf 'GIT_BRANCH=%s\n' "$branch"
  printf 'GIT_AHEAD=%s\n' "$ahead"
  printf 'GIT_BEHIND=%s\n' "$behind"
  printf 'SERVER=%s\n' "$server"
  printf 'SERVER_OWNERSHIP=%s\n' "$ownership"
  # Environment status (names/readiness only — never values).
  if alloy_agent_env_ready "$path"; then
    printf 'AGENT_ENV=present\n'
  else
    printf 'AGENT_ENV=missing\n'
  fi
  if alloy_agent_env_ready "$path" && alloy_agent_env_lacks_privileged "$path"; then
    printf 'AGENT_ENV_PRIVILEGED=absent\n'
  elif alloy_agent_env_ready "$path"; then
    printf 'AGENT_ENV_PRIVILEGED=present\n'
  else
    printf 'AGENT_ENV_PRIVILEGED=n/a\n'
  fi
  if [[ -f "$(alloy_server_env_source_path)" ]]; then
    printf 'TRUSTED_SOURCE=configured\n'
  else
    printf 'TRUSTED_SOURCE=missing\n'
  fi
  local _ts _rn
  _ts="$(alloy_server_env_source_path)"
  if [[ -f "$_ts" ]]; then
    while IFS= read -r _rn; do
      [[ -n "$_rn" ]] || continue
      if alloy_env_file_has_nonempty "$_ts" "$_rn"; then
        printf 'TRUSTED_REQUIRED_OK=%s\n' "$_rn"
      else
        printf 'TRUSTED_REQUIRED_MISSING=%s\n' "$_rn"
      fi
    done < <(alloy_required_server_env_names)
  fi
  printf 'AUTH=%s\n' "$auth"
  printf 'BROWSER=%s\n' "$bstate"
  printf 'VALIDATION_LOCK=%s\n' "$lock_msg"
  local issue
  # bash 3.2 (the macOS system bash) treats "${arr[@]}" on an EMPTY array as an
  # unbound variable under `set -u`, so this loop aborted precisely when issues
  # was empty — that is, exactly when the slot was READY. ${arr[@]+...} is the
  # 3.2-safe idiom.
  for issue in ${issues[@]+"${issues[@]}"}; do
    printf 'ISSUE=%s\n' "$issue"
  done
}
