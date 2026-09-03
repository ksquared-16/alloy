#!/usr/bin/env bash
# Managed Sprint Operations V1 — pause/resume/status/doctor/finish helpers.
# Extends Phase 1–3 registries (metadata/, pids/, browser-pids/); no parallel registry.
# shellcheck shell=bash

# Git durability gates — a sprint is not finished until its work leaves this
# machine. Sourced here because both alloy-sprint-start and alloy-sprint-finish
# already source this file.
# shellcheck source=lib/git-durability.sh
source "$(dirname "${BASH_SOURCE[0]}")/git-durability.sh"

# --- Capacity precedence: one question, one answer ---
#
# THE DEFECT THIS CLOSES. The documented way to raise a ceiling for an
# experiment was to export ALLOY_MAX_RUNNING_SERVERS. It never worked. Both
# alloy-config.example and ~/.config/alloy-dev/config assign these names
# UNCONDITIONALLY, and alloy_load_config sources both — so an exported value is
# overwritten before the `${VAR:-3}` defaults below are ever consulted, and the
# `:-` can only ever see the config file's value. A capacity experiment could
# set the variable, watch it read back as 3, and conclude the host was refusing
# on merits. alloy_load_config already knows about this hazard: it rescues
# ALLOY_RUNTIME_ROOT and ALLOY_FIRST_AGENT_PORT across the same sourcing, with a
# comment saying the example "otherwise hard-assigns the production default".
# The capacity ceilings were simply never given that treatment.
#
# The fix is NOT to make a bare ALLOY_MAX_* export win. That would turn every
# stray shell export and every inherited environment into a silent production
# ceiling change, which is worse than an override that does nothing. An override
# should be hard to do by accident and impossible to do anonymously.
#
# So precedence is explicit, and the override lives in its own namespace that no
# config file assigns — which is also why it survives config sourcing without
# needing a rescue:
#
#   canonical default   built into alloy-config.example
#   host config         ~/.config/alloy-dev/config
#   scoped override     ALLOY_CAPACITY_OVERRIDE, this process only
#
# Shape:
#   ALLOY_CAPACITY_OVERRIDE="ALLOY_MAX_RUNNING_SERVERS=5,ALLOY_MAX_ACTIVE_PROVIDERS=4"
#   ALLOY_CAPACITY_OVERRIDE_REASON="capacity certification phase 2"
#
# A reason is required: a raised ceiling with no recorded why cannot be audited
# after the fact, and every one of these is raised during an incident or an
# experiment — exactly when nobody remembers. Nothing is persisted, so an
# override cannot outlive the process that set it.

ALLOY_CAPACITY_NAMES="ALLOY_MAX_RUNNING_SERVERS ALLOY_MAX_ACTIVE_PROVIDERS ALLOY_MAX_CONCURRENT_INSTALLS ALLOY_MAX_CONCURRENT_HEAVY_JOBS"

# An override may move a ceiling, never remove it. Servers and providers are
# bounded by the MANAGED SLOTS: there is no seventh place to put one when there
# are six slots, and no thirteenth when there are twelve.
#
# THE SECOND OWNER THIS REMOVES. The bound was the literal 6, while
# capacity-policy.mjs had already been converged onto `managedSlotCount()`. So
# raising ALLOY_MAX_AGENTS moved the derived Node-side ceiling and left the shell
# guard pinned at six — the two owners of "how many slots exist" silently
# disagreed, and the shell one is the guard that actually refuses a start. The
# topology owner is ALLOY_MAX_AGENTS in both runtimes now.
#
# The floor of 1 is deliberate: an unset or nonsense topology must not silently
# become "no capacity at all", which would refuse every start on this host.
# PROVIDERS ARE NOT SERVERS. The old function grouped them behind one literal,
# which made it easy to "parameterize" both onto the slot count and quietly
# invent a coupling that was never measured. A dev server is bound by ports:
# there is no seventh place to put one when there are six slots. A provider is
# bound by the machine — cores and RAM — and capacity-policy.mjs is the owner of
# that operating ceiling (cores/3 floored at 3, versus RAM). What follows is only
# the OVERRIDE bound: how far an operator may move a ceiling, never the ceiling
# a healthy host actually runs at.
alloy_capacity_hard_ceiling() {
  local slots cores
  slots="${ALLOY_MAX_AGENTS:-${ALLOY_RC_DEFAULT_MAX_AGENTS:-6}}"
  [[ "$slots" =~ ^[0-9]+$ ]] && (( slots >= 1 )) || slots=6
  case "$1" in
    # Servers: one per managed port, so the topology owner bounds them.
    ALLOY_MAX_RUNNING_SERVERS) printf '%s' "$slots" ;;
    # Providers: bounded by the host, not by how many slots were configured.
    # A twelve-slot topology on a four-core machine does not gain provider
    # headroom. The floor keeps a small or unreadable host usable.
    ALLOY_MAX_ACTIVE_PROVIDERS)
      cores="$(alloy_rc_cpu_count 2>/dev/null || printf '')"
      [[ "$cores" =~ ^[0-9]+$ ]] && (( cores >= 1 )) || cores=6
      (( cores < 3 )) && cores=3
      printf '%s' "$cores"
      ;;
    # Installs and heavy jobs are bounded by CPU too: a host with twelve slots
    # does not gain cores to compile with.
    ALLOY_MAX_CONCURRENT_INSTALLS|ALLOY_MAX_CONCURRENT_HEAVY_JOBS) printf '4' ;;
    *) printf '0' ;;
  esac
}

alloy_capacity_is_name() {
  case " ${ALLOY_CAPACITY_NAMES} " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# Where did this value come from? Recorded so health can say so out loud.
alloy_capacity_source_var() {
  printf 'ALLOY_CAPACITY_SOURCE_%s' "${1#ALLOY_MAX_}"
}

# Refuse and explain, keeping the canonical value. A malformed override must
# never raise a ceiling, and must never take the host down either: the safe
# direction is always the lower number that was already in force.
alloy_capacity_refuse_override() {
  alloy_warn "capacity override ignored ($2): ${1} — keeping the configured value"
  ALLOY_CAPACITY_OVERRIDE_REFUSALS="${ALLOY_CAPACITY_OVERRIDE_REFUSALS}${ALLOY_CAPACITY_OVERRIDE_REFUSALS:+; }${1} ($2)"
}

alloy_apply_capacity_overrides() {
  ALLOY_CAPACITY_OVERRIDE_ACTIVE=0
  ALLOY_CAPACITY_OVERRIDE_APPLIED=""
  ALLOY_CAPACITY_OVERRIDE_REFUSALS=""
  local spec="${ALLOY_CAPACITY_OVERRIDE:-}"
  [[ -n "$spec" ]] || return 0
  if [[ -z "${ALLOY_CAPACITY_OVERRIDE_REASON:-}" ]]; then
    alloy_capacity_refuse_override "$spec" "ALLOY_CAPACITY_OVERRIDE_REASON is required"
    return 0
  fi
  local entry name value ceiling
  local IFS=','
  for entry in $spec; do
    entry="${entry#"${entry%%[![:space:]]*}"}"
    entry="${entry%"${entry##*[![:space:]]}"}"
    [[ -n "$entry" ]] || continue
    if [[ "$entry" != *=* ]]; then
      alloy_capacity_refuse_override "$entry" "expected NAME=VALUE"
      continue
    fi
    name="${entry%%=*}"
    value="${entry#*=}"
    if ! alloy_capacity_is_name "$name"; then
      alloy_capacity_refuse_override "$entry" "not a capacity name"
      continue
    fi
    if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value < 1 )); then
      alloy_capacity_refuse_override "$entry" "value must be a positive integer"
      continue
    fi
    ceiling="$(alloy_capacity_hard_ceiling "$name")"
    if (( value > ceiling )); then
      alloy_capacity_refuse_override "$entry" "above the hard ceiling of ${ceiling}"
      continue
    fi
    printf -v "$name" '%s' "$value"
    printf -v "$(alloy_capacity_source_var "$name")" '%s' "override"
    export "${name?}" "$(alloy_capacity_source_var "$name")"
    ALLOY_CAPACITY_OVERRIDE_ACTIVE=1
    ALLOY_CAPACITY_OVERRIDE_APPLIED="${ALLOY_CAPACITY_OVERRIDE_APPLIED}${ALLOY_CAPACITY_OVERRIDE_APPLIED:+ }${name}=${value}"
  done
  export ALLOY_CAPACITY_OVERRIDE_ACTIVE ALLOY_CAPACITY_OVERRIDE_APPLIED ALLOY_CAPACITY_OVERRIDE_REFUSALS
  return 0
}

# Does the host config assign this name? Distinguishes "the operator chose 3"
# from "nobody chose anything and the built-in default is 3" — the two read the
# same by the time the config has been sourced.
alloy_capacity_host_config_assigns() {
  local f="${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}"
  [[ -f "$f" ]] || return 1
  grep -Eq "^[[:space:]]*${1}=" "$f"
}

# What is in force, and who said so. Read-only; safe to call from health.
alloy_capacity_status() {
  alloy_sprint_ops_defaults
  local name src
  for name in $ALLOY_CAPACITY_NAMES; do
    src="$(eval "printf '%s' \"\${$(alloy_capacity_source_var "$name")}\"")"
    printf '%s=%s source=%s\n' "$name" "$(eval "printf '%s' \"\${$name}\"")" "${src:-default}"
  done
  if [[ "${ALLOY_CAPACITY_OVERRIDE_ACTIVE:-0}" == "1" ]]; then
    printf 'override=active applied=%s reason=%s\n' \
      "${ALLOY_CAPACITY_OVERRIDE_APPLIED}" "${ALLOY_CAPACITY_OVERRIDE_REASON:-}"
  else
    printf 'override=none\n'
  fi
  [[ -n "${ALLOY_CAPACITY_OVERRIDE_REFUSALS:-}" ]] && \
    printf 'override_refused=%s\n' "$ALLOY_CAPACITY_OVERRIDE_REFUSALS"
  return 0
}

alloy_sprint_ops_defaults() {
  ALLOY_MAX_ACTIVE_PROVIDERS="${ALLOY_MAX_ACTIVE_PROVIDERS:-3}"
  ALLOY_MAX_RUNNING_SERVERS="${ALLOY_MAX_RUNNING_SERVERS:-3}"
  ALLOY_MAX_CONCURRENT_INSTALLS="${ALLOY_MAX_CONCURRENT_INSTALLS:-1}"
  ALLOY_MAX_CONCURRENT_HEAVY_JOBS="${ALLOY_MAX_CONCURRENT_HEAVY_JOBS:-1}"
  local _cap_name
  for _cap_name in $ALLOY_CAPACITY_NAMES; do
    if alloy_capacity_host_config_assigns "$_cap_name"; then
      printf -v "$(alloy_capacity_source_var "$_cap_name")" '%s' "host-config"
    else
      printf -v "$(alloy_capacity_source_var "$_cap_name")" '%s' "default"
    fi
    export "$(alloy_capacity_source_var "$_cap_name")"
  done
  alloy_apply_capacity_overrides
  ALLOY_MEMORY_PRESSURE_THRESHOLD="${ALLOY_MEMORY_PRESSURE_THRESHOLD:-warn}"
  ALLOY_PAUSE_STATE_DIR="${ALLOY_RUNTIME_ROOT}/pause-state"
  ALLOY_FINISHED_META_DIR="${ALLOY_RUNTIME_ROOT}/finished"
  ALLOY_RESOURCE_LOCKS_DIR="${ALLOY_LOCKS_DIR}/resources"
  export ALLOY_MAX_ACTIVE_PROVIDERS ALLOY_MAX_RUNNING_SERVERS \
    ALLOY_MAX_CONCURRENT_INSTALLS ALLOY_MAX_CONCURRENT_HEAVY_JOBS \
    ALLOY_CAPACITY_NAMES \
    ALLOY_MEMORY_PRESSURE_THRESHOLD ALLOY_PAUSE_STATE_DIR \
    ALLOY_FINISHED_META_DIR ALLOY_RESOURCE_LOCKS_DIR
}

alloy_ensure_sprint_ops_dirs() {
  alloy_ensure_agent_runtime_dirs
  alloy_sprint_ops_defaults
  mkdir -p "$ALLOY_PAUSE_STATE_DIR" "$ALLOY_FINISHED_META_DIR" "$ALLOY_RESOURCE_LOCKS_DIR"
}

alloy_pause_state_path() {
  printf '%s/%s.env' "$ALLOY_PAUSE_STATE_DIR" "$1"
}

alloy_provider_pid_path() {
  printf '%s/%s.provider.pid' "$ALLOY_PIDS_DIR" "$1"
}

alloy_provider_meta_path() {
  printf '%s/%s.provider.meta' "$ALLOY_PIDS_DIR" "$1"
}

alloy_continuation_path() {
  local worktree_path="$1"
  printf '%s/.alloy-continuation.md' "$worktree_path"
}

# Rewrite metadata while preserving sprint-ops fields.
alloy_rewrite_metadata_preserving_sprint() {
  local path_meta="$1"
  shift
  # Clear optional fields before sourcing. Without this the "preserve" loop
  # below can carry a value sourced from a DIFFERENT worktree's metadata into
  # this file — writing another slot's sprint name to disk. The status-table
  # leak was the visible symptom of this substrate; this is the writable one.
  alloy_reset_optional_metadata
  # shellcheck disable=SC1090
  source "$path_meta"
  local -a pairs=("$@")
  # Append preserved optional fields when not already supplied.
  local key
  for key in ALLOY_SPRINT_NAME ALLOY_WORKER_LIFECYCLE ALLOY_SPRINT_OBJECTIVE \
    ALLOY_PROVIDER_SESSION_ID ALLOY_PAUSE_RECORDED_AT ALLOY_FINISHED_AT; do
    local found=0 pair
    for pair in "${pairs[@]}"; do
      case "$pair" in
        "${key}="*) found=1; break ;;
      esac
    done
    if [[ "$found" -eq 0 ]]; then
      local val=""
      eval "val=\"\${${key}-}\""
      if [[ -n "$val" ]]; then
        pairs+=("${key}=\"${val}\"")
      fi
    fi
  done
  alloy_write_kv_file "$path_meta" "${pairs[@]}"
}

alloy_set_worker_lifecycle() {
  local name="$1"
  local lifecycle="$2"
  local path_meta
  path_meta="$(alloy_metadata_path "$name")"
  [[ -f "$path_meta" ]] || alloy_die "metadata missing for $name"
  # shellcheck disable=SC1090
  source "$path_meta"
  case "$lifecycle" in
    active|paused|finished) ;;
    *) alloy_die "invalid worker lifecycle: $lifecycle" ;;
  esac
  local finished_at="${ALLOY_FINISHED_AT:-}"
  local paused_at="${ALLOY_PAUSE_RECORDED_AT:-}"
  case "$lifecycle" in
    active) paused_at="" ;;
    paused) paused_at="$(alloy_iso_now)" ;;
    finished) finished_at="$(alloy_iso_now)" ;;
  esac
  alloy_rewrite_metadata_preserving_sprint "$path_meta" \
    "ALLOY_WORKTREE_NAME=\"${ALLOY_WORKTREE_NAME}\"" \
    "ALLOY_WORKTREE_SLOT=\"${ALLOY_WORKTREE_SLOT}\"" \
    "ALLOY_WORKTREE_PATH=\"${ALLOY_WORKTREE_PATH}\"" \
    "ALLOY_WORKTREE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
    "ALLOY_AGENT=\"${ALLOY_AGENT}\"" \
    "PORT=\"${PORT}\"" \
    "NEXT_PUBLIC_APP_URL=\"${NEXT_PUBLIC_APP_URL}\"" \
    "ALLOY_CREATED_AT=\"${ALLOY_CREATED_AT:-}\"" \
    "ALLOY_AGENT_ROLE=\"${ALLOY_AGENT_ROLE:-$(alloy_slot_role "$ALLOY_WORKTREE_SLOT")}\"" \
    "ALLOY_AGENT_STATUS=\"${ALLOY_AGENT_STATUS:-active}\"" \
    "ALLOY_AGENT_INSTRUCTIONS=\"${ALLOY_AGENT_INSTRUCTIONS:-}\"" \
    "ALLOY_AGENT_OPENED_AT=\"${ALLOY_AGENT_OPENED_AT:-}\"" \
    "ALLOY_AGENT_CLOSED_AT=\"${ALLOY_AGENT_CLOSED_AT:-}\"" \
    "ALLOY_SPRINT_NAME=\"${ALLOY_SPRINT_NAME:-}\"" \
    "ALLOY_SPRINT_OBJECTIVE=\"${ALLOY_SPRINT_OBJECTIVE:-}\"" \
    "ALLOY_WORKER_LIFECYCLE=\"${lifecycle}\"" \
    "ALLOY_PROVIDER_SESSION_ID=\"${ALLOY_PROVIDER_SESSION_ID:-}\"" \
    "ALLOY_PAUSE_RECORDED_AT=\"${paused_at}\"" \
    "ALLOY_FINISHED_AT=\"${finished_at}\""
}

alloy_set_sprint_fields() {
  local name="$1"
  local sprint_name="$2"
  local objective="${3:-}"
  local path_meta
  path_meta="$(alloy_metadata_path "$name")"
  [[ -f "$path_meta" ]] || alloy_die "metadata missing for $name"
  # shellcheck disable=SC1090
  source "$path_meta"
  alloy_rewrite_metadata_preserving_sprint "$path_meta" \
    "ALLOY_WORKTREE_NAME=\"${ALLOY_WORKTREE_NAME}\"" \
    "ALLOY_WORKTREE_SLOT=\"${ALLOY_WORKTREE_SLOT}\"" \
    "ALLOY_WORKTREE_PATH=\"${ALLOY_WORKTREE_PATH}\"" \
    "ALLOY_WORKTREE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
    "ALLOY_AGENT=\"${ALLOY_AGENT}\"" \
    "PORT=\"${PORT}\"" \
    "NEXT_PUBLIC_APP_URL=\"${NEXT_PUBLIC_APP_URL}\"" \
    "ALLOY_CREATED_AT=\"${ALLOY_CREATED_AT:-}\"" \
    "ALLOY_AGENT_ROLE=\"${ALLOY_AGENT_ROLE:-$(alloy_slot_role "$ALLOY_WORKTREE_SLOT")}\"" \
    "ALLOY_AGENT_STATUS=\"${ALLOY_AGENT_STATUS:-active}\"" \
    "ALLOY_AGENT_INSTRUCTIONS=\"${ALLOY_AGENT_INSTRUCTIONS:-}\"" \
    "ALLOY_AGENT_OPENED_AT=\"${ALLOY_AGENT_OPENED_AT:-}\"" \
    "ALLOY_AGENT_CLOSED_AT=\"${ALLOY_AGENT_CLOSED_AT:-}\"" \
    "ALLOY_SPRINT_NAME=\"${sprint_name}\"" \
    "ALLOY_SPRINT_OBJECTIVE=\"${objective}\"" \
    "ALLOY_WORKER_LIFECYCLE=\"${ALLOY_WORKER_LIFECYCLE:-active}\"" \
    "ALLOY_PROVIDER_SESSION_ID=\"${ALLOY_PROVIDER_SESSION_ID:-}\"" \
    "ALLOY_PAUSE_RECORDED_AT=\"${ALLOY_PAUSE_RECORDED_AT:-}\"" \
    "ALLOY_FINISHED_AT=\"${ALLOY_FINISHED_AT:-}\""
}

# --- Provider process registry (toolkit-owned only) ---

alloy_provider_state_for() {
  local name="$1"
  local path="${ALLOY_WORKTREE_PATH:-}"
  local pid_path pid
  pid_path="$(alloy_provider_pid_path "$name")"
  if [[ ! -f "$pid_path" ]]; then
    printf 'stopped'
    return
  fi
  pid="$(alloy_read_pid_file "$pid_path" || true)"
  if [[ -z "${pid:-}" ]] || ! alloy_pid_alive "$pid"; then
    printf 'stale'
    return
  fi
  if [[ -n "$path" ]] && ! alloy_pid_belongs_to_worktree "$pid" "$path"; then
    # Cursor/Claude may have parent cwd elsewhere; accept if meta records worktree.
    local meta
    meta="$(alloy_provider_meta_path "$name")"
    if [[ -f "$meta" ]]; then
      # shellcheck disable=SC1090
      source "$meta"
      if [[ "${ALLOY_PROVIDER_WORKTREE:-}" == "$path" ]]; then
        printf 'running'
        return
      fi
    fi
    printf 'foreign'
    return
  fi
  printf 'running'
}

alloy_register_provider_pid() {
  local name="$1"
  local pid="$2"
  local worktree_path="$3"
  local session_id="${4:-}"
  [[ -n "$pid" ]] || return 0
  printf '%s' "$pid" >"$(alloy_provider_pid_path "$name")"
  alloy_write_kv_file "$(alloy_provider_meta_path "$name")" \
    "ALLOY_PROVIDER_PID=\"${pid}\"" \
    "ALLOY_PROVIDER_WORKTREE=\"${worktree_path}\"" \
    "ALLOY_PROVIDER_SESSION_ID=\"${session_id}\"" \
    "ALLOY_PROVIDER_REGISTERED_AT=\"$(alloy_iso_now)\""
}

alloy_stop_owned_provider() {
  local name="$1"
  local path="$2"
  local pid_path pid meta
  pid_path="$(alloy_provider_pid_path "$name")"
  meta="$(alloy_provider_meta_path "$name")"
  if [[ ! -f "$pid_path" ]]; then
    alloy_info "no registered provider for ${name}"
    return 0
  fi
  pid="$(alloy_read_pid_file "$pid_path" || true)"
  if [[ -z "${pid:-}" ]] || ! alloy_pid_alive "$pid"; then
    rm -f "$pid_path" "$meta"
    alloy_info "removed stale provider PID record for ${name}"
    return 0
  fi
  # Ownership: registered meta worktree must match, or PID cwd/cmd must belong.
  local owned=0
  if [[ -f "$meta" ]]; then
    # shellcheck disable=SC1090
    source "$meta"
    if [[ "${ALLOY_PROVIDER_WORKTREE:-}" == "$path" && "${ALLOY_PROVIDER_PID:-}" == "$pid" ]]; then
      owned=1
    fi
  fi
  if [[ "$owned" -eq 0 ]] && alloy_pid_belongs_to_worktree "$pid" "$path"; then
    owned=1
  fi
  if [[ "$owned" -eq 0 ]]; then
    alloy_die "refusing to kill provider PID $pid — ownership not proven in toolkit registry for $name"
  fi
  alloy_info "Sending SIGTERM to registered provider PID $pid ($name)..."
  if alloy_have_cmd pkill; then
    pkill -TERM -P "$pid" 2>/dev/null || true
  fi
  kill -TERM "$pid" 2>/dev/null || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if ! alloy_pid_alive "$pid"; then
      rm -f "$pid_path" "$meta"
      alloy_info "stopped provider for ${name} (PID $pid)"
      return 0
    fi
    sleep 0.3
  done
  alloy_warn "provider PID $pid still alive after SIGTERM; leaving PID file for doctor"
  return 1
}

# --- Resource guards ---

alloy_count_running_servers() {
  local name count=0
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    (
      alloy_load_metadata "$name"
      local st
      st="$(alloy_server_state_for "$name")"
      [[ "$st" == "running" ]]
    ) && count=$((count + 1)) || true
  done < <(alloy_list_metadata_names)
  printf '%s' "$count"
}

alloy_count_running_providers() {
  local name count=0 st
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    (
      alloy_load_metadata "$name"
      st="$(alloy_provider_state_for "$name")"
      [[ "$st" == "running" ]]
    ) && count=$((count + 1)) || true
  done < <(alloy_list_metadata_names)
  printf '%s' "$count"
}

alloy_macos_memory_pressure_level() {
  # stdout: normal|warn|critical|unknown
  if [[ "$(uname -s)" != "Darwin" ]]; then
    printf 'normal'
    return
  fi
  local out level
  if alloy_have_cmd memory_pressure; then
    out="$(memory_pressure 2>/dev/null || true)"
    if printf '%s' "$out" | grep -qi 'critical'; then
      printf 'critical'
      return
    fi
    if printf '%s' "$out" | grep -qiE 'warn|warning'; then
      printf 'warn'
      return
    fi
    printf 'normal'
    return
  fi
  level="$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo "")"
  case "$level" in
    0|"") printf 'normal' ;;
    1) printf 'warn' ;;
    *) printf 'critical' ;;
  esac
}

alloy_memory_pressure_blocks_heavy() {
  local level threshold
  level="$(alloy_macos_memory_pressure_level)"
  threshold="${ALLOY_MEMORY_PRESSURE_THRESHOLD:-warn}"
  case "$threshold" in
    off|never) return 1 ;;
    critical)
      [[ "$level" == "critical" ]]
      ;;
    warn|*)
      [[ "$level" == "warn" || "$level" == "critical" ]]
      ;;
  esac
}

alloy_refuse_if_memory_pressure_heavy() {
  local kind="${1:-heavy work}"
  if alloy_memory_pressure_blocks_heavy; then
    local level
    level="$(alloy_macos_memory_pressure_level)"
    alloy_die "macOS memory pressure is '${level}'; refusing to start ${kind}. Pause other workers or free memory, then retry. Healthy workers were not killed."
  fi
}

alloy_resource_lock_dir() {
  local kind="$1"
  printf '%s/%s.lock' "$ALLOY_RESOURCE_LOCKS_DIR" "$kind"
}

alloy_count_resource_locks() {
  local kind="$1"
  local dir base count=0 f
  dir="$(alloy_resource_lock_dir "$kind")"
  [[ -d "$dir" ]] || { printf '0'; return; }
  shopt -s nullglob
  for f in "$dir"/*.env; do
    # shellcheck disable=SC1090
    source "$f"
    if [[ -n "${ALLOY_RESOURCE_PID:-}" ]] && alloy_pid_alive "$ALLOY_RESOURCE_PID"; then
      count=$((count + 1))
    else
      rm -f "$f"
    fi
  done
  shopt -u nullglob
  printf '%s' "$count"
}

alloy_acquire_resource_slot() {
  local kind="$1"
  local max="$2"
  local owner="$3"
  local dir count lock
  alloy_ensure_sprint_ops_dirs
  dir="$(alloy_resource_lock_dir "$kind")"
  mkdir -p "$dir"
  count="$(alloy_count_resource_locks "$kind")"
  if (( count >= max )); then
    alloy_die "resource limit: ${kind} already at ${count}/${max} (owner request: ${owner}). Six assigned worktrees must not all run ${kind} at once."
  fi
  lock="${dir}/$$.${owner}.env"
  alloy_write_kv_file "$lock" \
    "ALLOY_RESOURCE_KIND=\"${kind}\"" \
    "ALLOY_RESOURCE_OWNER=\"${owner}\"" \
    "ALLOY_RESOURCE_PID=\"$$\"" \
    "ALLOY_RESOURCE_STARTED=\"$(alloy_iso_now)\""
  printf '%s' "$lock"
}

alloy_release_resource_slot() {
  local lock="${1:-}"
  [[ -n "$lock" && -f "$lock" ]] || return 0
  rm -f "$lock"
}

alloy_guard_server_start() {
  local name="$1"
  alloy_sprint_ops_defaults
  local running
  running="$(alloy_count_running_servers)"
  # Allow restart of already-running owned server for same name.
  (
    alloy_load_metadata "$name"
    [[ "$(alloy_server_state_for "$name")" == "running" ]]
  ) && return 0
  if (( running >= ALLOY_MAX_RUNNING_SERVERS )); then
    alloy_die "server limit: ${running}/${ALLOY_MAX_RUNNING_SERVERS} servers already running. Start was refused for ${name}. Pause or stop another server first."
  fi
}

alloy_guard_provider_start() {
  local name="$1"
  alloy_sprint_ops_defaults
  local running
  running="$(alloy_count_running_providers)"
  (
    alloy_load_metadata "$name"
    [[ "$(alloy_provider_state_for "$name")" == "running" ]]
  ) && return 0
  if (( running >= ALLOY_MAX_ACTIVE_PROVIDERS )); then
    alloy_die "provider limit: ${running}/${ALLOY_MAX_ACTIVE_PROVIDERS} providers already active. Refusing to open another for ${name}."
  fi
}

alloy_guard_heavy_job() {
  local name="$1"
  local kind="$2"
  alloy_sprint_ops_defaults
  alloy_refuse_if_memory_pressure_heavy "$kind"
  local count
  count="$(alloy_count_resource_locks heavy)"
  if (( count >= ALLOY_MAX_CONCURRENT_HEAVY_JOBS )); then
    alloy_die "heavy-job limit: ${count}/${ALLOY_MAX_CONCURRENT_HEAVY_JOBS} already running. Deferring ${kind} for ${name}."
  fi
}

# --- Boundary / health checks ---

alloy_validate_worktree_boundary() {
  local path="$1"
  local resolved root_resolved
  [[ -d "$path" ]] || alloy_die "worktree path missing: $path"
  resolved="$(alloy_realpath "$path")"
  root_resolved="$(alloy_realpath "$ALLOY_WORKTREE_ROOT")"
  case "$resolved" in
    "$root_resolved"/*) ;;
    *) alloy_die "repository boundary: worktree $resolved is outside ALLOY_WORKTREE_ROOT ($root_resolved)" ;;
  esac
  local canon
  canon="$(alloy_realpath "$ALLOY_REPO")"
  if [[ "$resolved" == "$canon" ]]; then
    alloy_die "repository boundary: refusing to operate on canonical checkout as a managed worktree"
  fi
}

alloy_slot_health_summary() {
  local name="$1"
  alloy_load_metadata "$name"
  local server provider browser env_ok auth git_class lifecycle
  server="$(alloy_server_state_for "$name")"
  provider="$(alloy_provider_state_for "$name")"
  browser="$(alloy_browser_state_for "$ALLOY_WORKTREE_SLOT" 2>/dev/null || echo stopped)"
  env_ok="no"
  if declare -F alloy_agent_env_ready >/dev/null 2>&1; then
    alloy_agent_env_ready "$ALLOY_WORKTREE_PATH" && env_ok="yes" || true
  elif [[ -f "$(alloy_web_dir_for "$ALLOY_WORKTREE_PATH")/.env.local.agent" ]]; then
    env_ok="yes"
  fi
  auth="n/a"
  if declare -F alloy_auth_state_status >/dev/null 2>&1; then
    auth="$(alloy_auth_state_status "$ALLOY_WORKTREE_SLOT" "$PORT" "$(alloy_web_dir_for "$ALLOY_WORKTREE_PATH")")"
  fi
  git_class="$(alloy_worktree_dirty_classification "$ALLOY_WORKTREE_PATH" 2>/dev/null || echo "?")"
  lifecycle="${ALLOY_WORKER_LIFECYCLE:-${ALLOY_AGENT_STATUS:-active}}"
  local health="ok"
  case "$server" in
    stale|foreign-port-owner) health="unhealthy" ;;
  esac
  case "$provider" in
    stale|foreign) health="unhealthy" ;;
  esac
  if [[ ! -d "$ALLOY_WORKTREE_PATH" ]]; then
    health="unhealthy"
  fi
  printf 'lifecycle=%s server=%s provider=%s browser=%s env=%s auth=%s git=%s health=%s' \
    "$lifecycle" "$server" "$provider" "$browser" "$env_ok" "$auth" "$git_class" "$health"
}

alloy_refuse_unhealthy_slot_assignment() {
  local slot="$1"
  local existing
  if existing="$(alloy_find_metadata_by_slot "$slot" 2>/dev/null)"; then
    alloy_load_metadata "$existing"
    local summary health
    summary="$(alloy_slot_health_summary "$existing")"
    health="$(printf '%s' "$summary" | sed -n 's/.*health=\([^ ]*\).*/\1/p')"
    if [[ "$health" != "ok" ]]; then
      alloy_die "slot $slot is occupied by unhealthy worker ${existing} (${summary}). Fail closed — free or doctor the slot first."
    fi
    alloy_die "slot $slot is already assigned to ${existing}"
  fi
  local port path_guess
  port="$(alloy_slot_to_port "$slot")"
  if alloy_port_in_use "$port"; then
    local owner
    owner="$(alloy_port_owner "$port")"
    if [[ "$owner" == "unknown" ]]; then
      alloy_die "slot $slot port $port could not be proven free (listener probe unavailable). Fail closed."
    fi
    alloy_die "port ownership conflict: slot $slot port $port is in use by PID ${owner#owned } (no managed metadata). Fail closed."
  fi
}

# --- Continuation records ---

alloy_write_continuation_record() {
  local name="$1"
  local reason="$2" # pause|provider-exit|finish
  local next_action="${3:-Resume with alloy-worker-resume <slot>}"
  alloy_load_metadata "$name"
  local path="$ALLOY_WORKTREE_PATH"
  local out head branch dirty changed checks issues session
  out="$(alloy_continuation_path "$path")"
  head="$(alloy_git "$path" rev-parse HEAD 2>/dev/null || echo unknown)"
  branch="$(alloy_current_branch "$path" 2>/dev/null || echo "?")"
  dirty="$(alloy_worktree_dirty_classification "$path")"
  changed="$(alloy_git "$path" status --short 2>/dev/null | grep -vE '^\?\? \.env\.local\.agent$|^\?\? \.alloy-agent-instructions\.md$|^\?\? \.alloy-continuation\.md$' | head -40 || true)"
  session="${ALLOY_PROVIDER_SESSION_ID:-}"
  if [[ -f "$(alloy_provider_meta_path "$name")" ]]; then
    # shellcheck disable=SC1090
    source "$(alloy_provider_meta_path "$name")"
    session="${ALLOY_PROVIDER_SESSION_ID:-$session}"
  fi
  checks="${ALLOY_CONTINUATION_CHECKS:-"(none recorded)"}"
  issues="${ALLOY_CONTINUATION_ISSUES:-"(none recorded)"}"

  cat >"$out" <<EOF
# Alloy continuation record — ${name}

| Field | Value |
|-------|-------|
| Written | $(alloy_iso_now) |
| Reason | ${reason} |
| Sprint | ${ALLOY_SPRINT_NAME:-"(unnamed)"} |
| Objective | ${ALLOY_SPRINT_OBJECTIVE:-"(not set)"} |
| Slot | ${ALLOY_WORKTREE_SLOT} |
| Provider | ${ALLOY_AGENT} |
| Worktree | ${name} |
| Path | ${path} |
| Branch | ${branch} |
| HEAD | ${head} |
| Git state | ${dirty} |
| Port | ${PORT} |
| Lifecycle | ${ALLOY_WORKER_LIFECYCLE:-active} |

## Changed files

\`\`\`
${changed:-"(none)"}
\`\`\`

## Completed checks

${checks}

## Unresolved issues

${issues}

## Exact next action

${next_action}

## Resumable session metadata

| Field | Value |
|-------|-------|
| Provider session id | ${session:-"(none)"} |
| Pause state file | $(alloy_pause_state_path "$name") |
| Pre-pause server | see pause-state |
| Pre-pause provider | see pause-state |
| Pre-pause browser | see pause-state |

Do not push, merge, rebase, or open a PR from this record alone.
EOF

  # Ensure local exclude
  local git_dir common_dir exclude_file
  git_dir="$(alloy_git "$path" rev-parse --git-dir)"
  common_dir="$(alloy_git "$path" rev-parse --git-common-dir)"
  mkdir -p "${git_dir}/info" "${common_dir}/info"
  for exclude_file in "${git_dir}/info/exclude" "${common_dir}/info/exclude"; do
    if ! grep -Fq '.alloy-continuation.md' "$exclude_file" 2>/dev/null; then
      printf '%s\n' '.alloy-continuation.md' >>"$exclude_file"
    fi
  done
  printf '%s\n' "$out"
}

alloy_record_pause_state() {
  local name="$1"
  alloy_load_metadata "$name"
  local server provider browser
  server="$(alloy_server_state_for "$name")"
  provider="$(alloy_provider_state_for "$name")"
  browser="$(alloy_browser_state_for "$ALLOY_WORKTREE_SLOT" 2>/dev/null || echo stopped)"
  local provider_pid="" session=""
  if [[ -f "$(alloy_provider_pid_path "$name")" ]]; then
    provider_pid="$(alloy_read_pid_file "$(alloy_provider_pid_path "$name")" || true)"
  fi
  if [[ -f "$(alloy_provider_meta_path "$name")" ]]; then
    # shellcheck disable=SC1090
    source "$(alloy_provider_meta_path "$name")"
    session="${ALLOY_PROVIDER_SESSION_ID:-}"
  fi
  alloy_write_kv_file "$(alloy_pause_state_path "$name")" \
    "ALLOY_PAUSE_AT=\"$(alloy_iso_now)\"" \
    "ALLOY_PAUSE_SERVER_WAS=\"${server}\"" \
    "ALLOY_PAUSE_PROVIDER_WAS=\"${provider}\"" \
    "ALLOY_PAUSE_BROWSER_WAS=\"${browser}\"" \
    "ALLOY_PAUSE_PROVIDER_PID=\"${provider_pid}\"" \
    "ALLOY_PAUSE_PROVIDER_SESSION=\"${session}\"" \
    "ALLOY_PAUSE_WORKTREE=\"${ALLOY_WORKTREE_PATH}\"" \
    "ALLOY_PAUSE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
    "ALLOY_PAUSE_PORT=\"${PORT}\"" \
    "ALLOY_PAUSE_SLOT=\"${ALLOY_WORKTREE_SLOT}\""
}

alloy_load_pause_state() {
  local name="$1"
  local path
  path="$(alloy_pause_state_path "$name")"
  [[ -f "$path" ]] || alloy_die "no pause state for $name — nothing to resume (or never paused)"
  # shellcheck disable=SC1090
  source "$path"
}

# --- Pause / resume one worker ---

alloy_worker_pause_one() {
  local target="$1"
  local name
  name="$(alloy_resolve_worktree_name "$target")"
  alloy_load_metadata "$name"
  local path="$ALLOY_WORKTREE_PATH"
  local slot="$ALLOY_WORKTREE_SLOT"

  alloy_validate_worktree_boundary "$path"
  alloy_record_pause_state "$name"
  alloy_write_continuation_record "$name" "pause" \
    "alloy-worker-resume ${slot}" >/dev/null

  # Stop only registry-owned processes.
  if [[ "$(alloy_provider_state_for "$name")" == "running" ]]; then
    alloy_stop_owned_provider "$name" "$path" || true
  fi
  env ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
    "${ALLOY_LOCAL_DEV_ROOT}/alloy-dev-stop" "$name" || true
  if declare -F alloy_stop_owned_browser >/dev/null 2>&1; then
    alloy_stop_owned_browser "$slot" || true
  else
    env ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
      "${ALLOY_LOCAL_DEV_ROOT}/alloy-agent-browser-stop" "$slot" 2>/dev/null || true
  fi

  alloy_set_worker_lifecycle "$name" "paused"
  alloy_set_agent_status "$name" "closed" 2>/dev/null || true
  # Re-assert paused lifecycle (set_agent_status may not know about it).
  alloy_set_worker_lifecycle "$name" "paused"

  alloy_info "Paused worker ${name} (slot ${slot}). Worktree, branch, changes, auth, env, port, and logs preserved."
}

alloy_worker_resume_one() {
  local target="$1"
  local open_provider="${2:-1}"
  local name
  name="$(alloy_resolve_worktree_name "$target")"
  alloy_load_metadata "$name"
  local path="$ALLOY_WORKTREE_PATH"
  local slot="$ALLOY_WORKTREE_SLOT"
  local port="$PORT"

  alloy_validate_worktree_boundary "$path"
  alloy_load_pause_state "$name"

  # Conflict detection before restart
  if [[ "${ALLOY_PAUSE_PORT:-}" != "$port" ]]; then
    alloy_die "resume conflict: pause recorded port ${ALLOY_PAUSE_PORT:-?} but metadata port is ${port}"
  fi
  if [[ "${ALLOY_PAUSE_WORKTREE:-}" != "$path" ]]; then
    alloy_die "resume conflict: pause recorded worktree ${ALLOY_PAUSE_WORKTREE:-?} but metadata path is ${path}"
  fi
  if [[ "${ALLOY_PAUSE_BRANCH:-}" != "$ALLOY_WORKTREE_BRANCH" ]]; then
    alloy_warn "branch changed since pause (${ALLOY_PAUSE_BRANCH:-?} → ${ALLOY_WORKTREE_BRANCH})"
  fi

  # Port ownership: if something else holds the port and we need the server, fail.
  local want_server=0
  case "${ALLOY_PAUSE_SERVER_WAS:-}" in
    running) want_server=1 ;;
  esac
  if [[ "$want_server" -eq 1 ]]; then
    if alloy_port_in_use "$port"; then
      local listener
      listener="$(alloy_port_listener_pid "$port" 2>/dev/null || echo "?")"
      if ! alloy_pid_belongs_to_worktree "$listener" "$path"; then
        alloy_die "resume conflict: port $port owned by foreign PID $listener"
      fi
    fi
    alloy_guard_server_start "$name"
    env ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
      "${ALLOY_LOCAL_DEV_ROOT}/alloy-dev-start" "$name"
  else
    alloy_info "Pre-pause server was ${ALLOY_PAUSE_SERVER_WAS:-stopped}; not restarting server."
  fi

  # Restore provider session metadata into registry when present.
  if [[ -n "${ALLOY_PAUSE_PROVIDER_SESSION:-}" ]]; then
    local path_meta
    path_meta="$(alloy_metadata_path "$name")"
    # shellcheck disable=SC1090
    source "$path_meta"
    ALLOY_PROVIDER_SESSION_ID="$ALLOY_PAUSE_PROVIDER_SESSION"
    alloy_set_sprint_fields "$name" "${ALLOY_SPRINT_NAME:-}" "${ALLOY_SPRINT_OBJECTIVE:-}"
    # reload and set session via rewrite
    alloy_load_metadata "$name"
    alloy_rewrite_metadata_preserving_sprint "$(alloy_metadata_path "$name")" \
      "ALLOY_WORKTREE_NAME=\"${ALLOY_WORKTREE_NAME}\"" \
      "ALLOY_WORKTREE_SLOT=\"${ALLOY_WORKTREE_SLOT}\"" \
      "ALLOY_WORKTREE_PATH=\"${ALLOY_WORKTREE_PATH}\"" \
      "ALLOY_WORKTREE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
      "ALLOY_AGENT=\"${ALLOY_AGENT}\"" \
      "PORT=\"${PORT}\"" \
      "NEXT_PUBLIC_APP_URL=\"${NEXT_PUBLIC_APP_URL}\"" \
      "ALLOY_CREATED_AT=\"${ALLOY_CREATED_AT:-}\"" \
      "ALLOY_AGENT_ROLE=\"${ALLOY_AGENT_ROLE:-}\"" \
      "ALLOY_AGENT_STATUS=\"active\"" \
      "ALLOY_AGENT_INSTRUCTIONS=\"${ALLOY_AGENT_INSTRUCTIONS:-}\"" \
      "ALLOY_AGENT_OPENED_AT=\"$(alloy_iso_now)\"" \
      "ALLOY_AGENT_CLOSED_AT=\"\"" \
      "ALLOY_SPRINT_NAME=\"${ALLOY_SPRINT_NAME:-}\"" \
      "ALLOY_SPRINT_OBJECTIVE=\"${ALLOY_SPRINT_OBJECTIVE:-}\"" \
      "ALLOY_WORKER_LIFECYCLE=\"active\"" \
      "ALLOY_PROVIDER_SESSION_ID=\"${ALLOY_PAUSE_PROVIDER_SESSION}\"" \
      "ALLOY_PAUSE_RECORDED_AT=\"\"" \
      "ALLOY_FINISHED_AT=\"\""
  fi

  alloy_set_worker_lifecycle "$name" "active"
  alloy_set_agent_status "$name" "active" 2>/dev/null || true
  alloy_set_worker_lifecycle "$name" "active"

  local cont
  cont="$(alloy_continuation_path "$path")"
  if [[ "${ALLOY_PAUSE_PROVIDER_WAS:-}" == "running" && "$open_provider" -eq 1 ]]; then
    alloy_guard_provider_start "$name"
    if [[ -n "${ALLOY_PAUSE_PROVIDER_SESSION:-}" ]]; then
      alloy_info "Resumable provider session: ${ALLOY_PAUSE_PROVIDER_SESSION}"
    else
      alloy_info "No resumable session id — using continuation brief: ${cont}"
    fi
    # Launch provider in worktree; register best-effort PID.
    local launch_pid=""
    if [[ "${ALLOY_AGENT_OPEN_DRY_RUN:-0}" == "1" ]]; then
      alloy_info "[dry-run] would resume ${ALLOY_AGENT} on ${path}"
    else
      alloy_open_tool_for_agent "$ALLOY_AGENT" "$path"
      # Best-effort: record most recent matching process (optional; registry may stay empty).
      launch_pid="$(pgrep -n -f "${path}" 2>/dev/null | head -1 || true)"
      if [[ -n "$launch_pid" ]]; then
        alloy_register_provider_pid "$name" "$launch_pid" "$path" \
          "${ALLOY_PAUSE_PROVIDER_SESSION:-}"
      fi
    fi
  else
    alloy_info "Pre-pause provider was ${ALLOY_PAUSE_PROVIDER_WAS:-stopped}; not relaunching provider."
    if [[ -f "$cont" ]]; then
      alloy_info "Continuation brief available: ${cont}"
    fi
  fi

  alloy_info "Resumed worker ${name} on port ${port} path ${path}"
}

# --- Status table ---

alloy_worker_status_table() {
  if [[ -f "${ALLOY_LOCAL_DEV_ROOT}/lib/manifest.sh" ]] && ! declare -F alloy_manifest_exists >/dev/null 2>&1; then
    # shellcheck source=/dev/null
    source "${ALLOY_LOCAL_DEV_ROOT}/lib/manifest.sh"
  fi
  # Ensure verify helpers when available
  if [[ -f "${ALLOY_LOCAL_DEV_ROOT}/lib/verify.sh" ]]; then
    # shellcheck source=/dev/null
    source "${ALLOY_LOCAL_DEV_ROOT}/lib/verify.sh"
    alloy_ensure_verify_runtime_dirs 2>/dev/null || true
    export ALLOY_SKIP_AUTH_LIVE_CHECK=1
  fi

  # Name the base the A/B column is measured against, and how stale it is.
  # An unqualified ahead/behind is the toolkit's own "HEALTHY" verdict.
  printf 'root: %s\n' "${ALLOY_REPO:-(ALLOY_REPO unset)}"
  printf 'base: %s\n' "$(alloy_base_ref_status)"
  printf 'A/B is relative to the base above; alloy-worker-status --refresh fetches first.\n'
  printf '\n'
  printf '%-4s %-20s %-7s %-13s %-18s %-24s %-7s %-8s %-9s %-8s %-5s %-7s\n' \
    "SLOT" "SPRINT" "PROV" "STAGE" "POSTURE" "WORKTREE" "GIT" "A/B" "AGENT" "SERVER" "PORT" "HEALTH"
  printf '%s\n' "$(printf '%.0s-' {1..160})"

  local i found name sprint prov branch git_state ahead behind lifecycle server port auth health path
  for ((i = 1; i <= ALLOY_MAX_AGENTS; i++)); do
    port="$(alloy_slot_to_port "$i")"
    if ! found="$(alloy_find_metadata_by_slot "$i" 2>/dev/null)"; then
      printf '%-4s %-20s %-7s %-13s %-18s %-24s %-7s %-8s %-9s %-8s %-5s %-7s\n' \
        "$i" "-" "-" "-" "-" "(free)" "-" "-" "-" "stopped" "$port" "ok"
      continue
    fi
    name="$found"
    alloy_load_metadata "$name"
    sprint="${ALLOY_SPRINT_NAME:-${name#wt*-}}"
    prov="$ALLOY_AGENT"
    path="$ALLOY_WORKTREE_PATH"
    branch="$ALLOY_WORKTREE_BRANCH"
    if [[ -d "$path" ]]; then
      git_state="$(alloy_worktree_dirty_classification "$path")"
      ahead="$(alloy_git "$path" rev-list --count "$(alloy_base_ref)..HEAD" 2>/dev/null || echo "?")"
      behind="$(alloy_git "$path" rev-list --count "HEAD..$(alloy_base_ref)" 2>/dev/null || echo "?")"
    else
      git_state="missing"
      ahead="?"
      behind="?"
    fi
    lifecycle="${ALLOY_WORKER_LIFECYCLE:-${ALLOY_AGENT_STATUS:-active}}"
    server="$(alloy_server_state_for "$name")"
    auth="n/a"
    if declare -F alloy_auth_state_status >/dev/null 2>&1; then
      auth="$(alloy_auth_state_status "$i" "$PORT" "$(alloy_web_dir_for "$path")")"
    fi
    local summary
    summary="$(alloy_slot_health_summary "$name")"
    health="$(printf '%s' "$summary" | sed -n 's/.*health=\([^ ]*\).*/\1/p')"
    # Declarations from the manifest. A worktree without one reads "unknown" --
    # never a guess. Absence is a value.
    local stage posture_m posture_t posture_s
    stage="unknown"; posture_s="unknown"
    if declare -F alloy_manifest_exists >/dev/null 2>&1 && alloy_manifest_exists "$name"; then
      stage="$(alloy_manifest_get "$name" stage)"
      posture_m="$(alloy_manifest_get "$name" posture.mutation)"
      posture_t="$(alloy_manifest_get "$name" posture.tenant_class)"
      posture_s="${posture_m}/${posture_t}"
    fi

    # Truncate long fields for table
    sprint="${sprint:0:20}"
    name="${name:0:24}"
    stage="${stage:0:13}"
    posture_s="${posture_s:0:18}"
    printf '%-4s %-20s %-7s %-13s %-18s %-24s %-7s %-8s %-9s %-8s %-5s %-7s\n' \
      "$i" "$sprint" "$prov" "$stage" "$posture_s" "$name" "$git_state" "${ahead}/${behind}" \
      "$lifecycle" "$server" "$port" "$health"
  done
}

# --- Doctor (read-only by default) ---

alloy_worker_doctor_one() {
  local target="$1"
  local recover="${2:-0}"
  local name
  name="$(alloy_resolve_worktree_name "$target")"
  alloy_load_metadata "$name"
  local path="$ALLOY_WORKTREE_PATH"
  local slot="$ALLOY_WORKTREE_SLOT"
  local port="$PORT"
  local issues=0

  echo "Doctor slot ${slot} (${name})"
  echo "----------------------------"

  # Stale server PID
  local pid_path pid
  pid_path="$(alloy_pid_path "$name")"
  if [[ -f "$pid_path" ]]; then
    pid="$(alloy_read_pid_file "$pid_path" || true)"
    if [[ -n "${pid:-}" ]] && ! alloy_pid_alive "$pid"; then
      echo "ISSUE: stale server PID file ($pid)"
      issues=$((issues + 1))
      if [[ "$recover" -eq 1 ]]; then
        rm -f "$pid_path"
        echo "  recovered: removed $pid_path"
      fi
    fi
  fi

  # Dead provider
  local pst
  pst="$(alloy_provider_state_for "$name")"
  if [[ "$pst" == "stale" ]]; then
    echo "ISSUE: stale provider PID"
    issues=$((issues + 1))
    if [[ "$recover" -eq 1 ]]; then
      rm -f "$(alloy_provider_pid_path "$name")" "$(alloy_provider_meta_path "$name")"
      echo "  recovered: cleared provider PID records"
    fi
  fi

  # Orphaned / foreign port
  if listener="$(alloy_port_listener_pid "$port" 2>/dev/null)"; then
    if ! alloy_pid_belongs_to_worktree "$listener" "$path"; then
      local server_st
      server_st="$(alloy_server_state_for "$name")"
      if [[ "$server_st" != "running" ]]; then
        echo "ISSUE: orphaned/foreign port $port owned by PID $listener (server state=$server_st)"
        issues=$((issues + 1))
      fi
    fi
  fi

  # Unreachable registered server
  if [[ -f "$pid_path" ]]; then
    pid="$(alloy_read_pid_file "$pid_path" || true)"
    if [[ -n "${pid:-}" ]] && alloy_pid_alive "$pid" && alloy_pid_belongs_to_worktree "$pid" "$path"; then
      if ! curl -sf -o /dev/null --max-time 2 "http://localhost:${port}/" 2>/dev/null; then
        echo "ISSUE: registered server PID $pid alive but localhost:${port} unreachable"
        issues=$((issues + 1))
      fi
    fi
  fi

  # Duplicate worktree ownership
  local other other_path
  while IFS= read -r other; do
    [[ -n "$other" && "$other" != "$name" ]] || continue
    (
      alloy_load_metadata "$other"
      [[ "$ALLOY_WORKTREE_PATH" == "$path" ]]
    ) && {
      echo "ISSUE: duplicate worktree ownership — ${other} shares path ${path}"
      issues=$((issues + 1))
    }
  done < <(alloy_list_metadata_names)

  # Missing deps / auth / env
  local web_dir
  web_dir="$(alloy_web_dir_for "$path")"
  if [[ ! -d "${web_dir}/node_modules" ]]; then
    echo "ISSUE: missing worktree-local node_modules (${web_dir}/node_modules)"
    issues=$((issues + 1))
  fi
  if [[ ! -f "${web_dir}/.env.local.agent" ]]; then
    echo "ISSUE: missing agent env (${web_dir}/.env.local.agent)"
    issues=$((issues + 1))
  fi

  # Docker host health (shared resource — wedged Desktop blocks every slot)
  local dock_status=""
  if dock_status="$(alloy_docker_health_report 2>/dev/null | grep '^DOCKER_STATUS=' | head -1 | cut -d= -f2-)"; then
    :
  else
    dock_status="unknown"
  fi
  case "$dock_status" in
    ok) echo "OK: Docker healthy" ;;
    wedged)
      echo "ISSUE: Docker wedged (docker info hung) — run: alloy-docker-doctor --recover --force"
      issues=$((issues + 1))
      ;;
    unreachable|missing)
      echo "ISSUE: Docker ${dock_status} — run: alloy-docker-doctor --recover"
      issues=$((issues + 1))
      ;;
    *) echo "NOTE: Docker status=${dock_status}" ;;
  esac

  # Generated-file noise
  local dirty_class
  dirty_class="$(alloy_worktree_dirty_classification "$path")"
  if [[ "$dirty_class" == "next-env-only" ]]; then
    echo "NOTE: generated-file noise only (web/next-env.d.ts)"
  elif [[ "$dirty_class" == "dirty" ]]; then
    echo "NOTE: worktree has uncommitted changes"
  fi

  # Registry drift: metadata branch vs actual
  if [[ -d "$path" ]]; then
    local cur
    cur="$(alloy_current_branch "$path" 2>/dev/null || echo "")"
    if [[ -n "$cur" && "$cur" != "$ALLOY_WORKTREE_BRANCH" ]]; then
      echo "ISSUE: registry drift — metadata branch ${ALLOY_WORKTREE_BRANCH} vs actual ${cur}"
      issues=$((issues + 1))
    fi
    local expected_port
    expected_port="$(alloy_slot_to_port "$slot")"
    if [[ "$PORT" != "$expected_port" ]]; then
      echo "ISSUE: registry drift — metadata PORT ${PORT} != permanent slot port ${expected_port}"
      issues=$((issues + 1))
    fi
  else
    echo "ISSUE: worktree path missing: $path"
    issues=$((issues + 1))
  fi

  if [[ "$issues" -eq 0 ]]; then
    echo "OK: no issues detected"
  else
    echo "Found ${issues} issue(s). Re-run with --recover to apply safe fixes (stale PID cleanup only)."
  fi
  return 0
}

alloy_worker_doctor_all() {
  local recover="${1:-0}"
  local i found
  for ((i = 1; i <= ALLOY_MAX_AGENTS; i++)); do
    if found="$(alloy_find_metadata_by_slot "$i" 2>/dev/null)"; then
      alloy_worker_doctor_one "$found" "$recover"
      echo
    else
      local port
      port="$(alloy_slot_to_port "$i")"
      echo "Doctor slot ${i} (free)"
      if alloy_port_in_use "$port"; then
        echo "ISSUE: free slot but port $port is occupied"
      else
        echo "OK: free"
      fi
      echo
    fi
  done
}

# --- Finish ---

alloy_sprint_dirty_classification() {
  # Like alloy_worktree_dirty_classification, but also ignores toolkit marker files.
  local path="$1"
  local web_rel="${ALLOY_WEB_DIR:-web}/next-env.d.ts"
  local agent_env_rel="${ALLOY_WEB_DIR:-web}/.env.local.agent"
  local out line file_path
  out="$(alloy_git "$path" status --porcelain 2>/dev/null || true)"
  out="$(printf '%s\n' "$out" | grep -vE \
    '^\?\? \.env\.local\.agent$|^\?\? '"${ALLOY_WEB_DIR:-web}"'/\.env\.local\.agent$|^\?\? \.alloy-agent-instructions\.md$|^\?\? \.alloy-continuation\.md$' \
    || true)"
  if [[ -z "$out" ]]; then
    printf 'clean'
    return
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    file_path="${line:3}"
    if [[ "$file_path" == "$web_rel" || "$file_path" == "$agent_env_rel" ]]; then
      continue
    fi
    # Also ignore modified (not just untracked) toolkit markers.
    case "$file_path" in
      .env.local.agent|.alloy-agent-instructions.md|.alloy-continuation.md|"$agent_env_rel"|node_modules|node_modules/*|"${ALLOY_WEB_DIR:-web}/node_modules"|"${ALLOY_WEB_DIR:-web}/node_modules"/*)
        continue
        ;;
    esac
    # Trailing-slash untracked dirs from git status --porcelain
    case "$file_path" in
      node_modules/|"${ALLOY_WEB_DIR:-web}/node_modules/")
        continue
        ;;
    esac
    printf 'dirty'
    return
  done <<<"$out"
  printf 'next-env-only'
}

# Locate the alloy-stack command. It is installed to a stable path outside any
# worktree precisely so sprint teardown keeps working after the worktree that
# once hosted the toolkit is deleted.
alloy_stack_cmd() {
  local cand
  for cand in \
    "$(command -v alloy-stack 2>/dev/null || true)" \
    "$HOME/.local/share/alloy/bin/alloy-stack" \
    "${ALLOY_LOCAL_DEV_ROOT:-}/alloy-stack"; do
    [[ -n "$cand" && -x "$cand" ]] && { printf '%s\n' "$cand"; return 0; }
  done
  return 1
}

# Drop this worktree's lease on the shared stack, then show what is still
# unaccounted for. Never fails a sprint finish — teardown is best-effort.
alloy_stack_release_for_worktree() {
  local name="$1" path="${2:-}"
  local cmd
  if ! cmd="$(alloy_stack_cmd)"; then
    alloy_warn "alloy-stack not installed — skipping shared-stack release"
    return 0
  fi
  ALLOY_WORKTREE_PATH="$path" "$cmd" release "$name" 2>&1 | sed 's/^/  /' || true
  # Preview only: never destroy another session's stack during a finish.
  "$cmd" reap 2>&1 | sed 's/^/  /' || true
  return 0
}

alloy_sprint_finish_one() {
  local target="$1"
  local ack_dirty="${2:-0}"
  local name
  name="$(alloy_resolve_worktree_name "$target")"
  alloy_load_metadata "$name"
  local path="$ALLOY_WORKTREE_PATH"
  local slot="$ALLOY_WORKTREE_SLOT"

  alloy_validate_worktree_boundary "$path"

  local dirty_class
  dirty_class="$(alloy_sprint_dirty_classification "$path")"
  if [[ "$dirty_class" == "dirty" && "$ack_dirty" -ne 1 ]]; then
    alloy_die "sprint finish blocked: uncommitted work in ${path}. Commit locally, or pass --acknowledge-uncommitted."
  fi

  # Stop managed processes (registry-owned only)
  alloy_stop_owned_provider "$name" "$path" 2>/dev/null || true
  env ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
    "${ALLOY_LOCAL_DEV_ROOT}/alloy-dev-stop" "$name" || true
  env ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
    "${ALLOY_LOCAL_DEV_ROOT}/alloy-agent-browser-stop" "$slot" 2>/dev/null || true

  # Release this sprint's claim on the shared local Supabase stack. Finishing a
  # sprint used to stop the dev server and the browser but leave Docker running
  # forever — that is how 3 sessions accumulated 35 containers. If this was the
  # last session holding a lease, the shared stack stops here. Data volumes are
  # kept, so the next `alloy-stack use` restarts it with its data intact.
  alloy_stack_release_for_worktree "$name" "$path"

  # Durability gate. Fails closed: archiving a slot whose branch never left this
  # machine is how 880 local-only commits accumulated across 79 branches while
  # every sprint reported "finished".
  local durability_evidence
  if ! durability_evidence="$(alloy_assert_sprint_finishable "$name" "$path")"; then
    printf '%s\n' "$durability_evidence" >&2
    alloy_die "sprint finish blocked: work is not durable (see above)"
  fi
  printf '%s\n' "$durability_evidence" | sed 's/^/  /'

  alloy_write_continuation_record "$name" "finish" \
    "Human review only — do not push/merge/PR from toolkit finish." >/dev/null

  # Preserve evidence: archive metadata, keep logs
  alloy_ensure_sprint_ops_dirs
  local meta_path archive_path
  meta_path="$(alloy_metadata_path "$name")"
  archive_path="${ALLOY_FINISHED_META_DIR}/${name}.env"
  cp "$meta_path" "$archive_path"
  alloy_set_worker_lifecycle "$name" "finished"
  # Reload and re-copy after lifecycle stamp
  cp "$(alloy_metadata_path "$name")" "$archive_path"

  # Free the slot: remove active metadata (worktree preserved on disk)
  rm -f "$meta_path"
  rm -f "$(alloy_pid_path "$name")" "$(alloy_provider_pid_path "$name")" "$(alloy_provider_meta_path "$name")"
  rm -f "$(alloy_pause_state_path "$name")"

  cat <<EOF
Sprint finished (slot freed, worktree preserved)
  slot:     ${slot}
  worktree: ${name}
  path:     ${path}
  archived: ${archive_path}
  logs:     $(alloy_log_path "$name")

Did NOT: delete worktree, push, merge, rebase, or create a PR.
EOF
}

# --- Install deps with concurrency guard ---

alloy_sprint_install_deps() {
  local path="$1"
  local name="$2"
  local web_dir lock
  web_dir="$(alloy_web_dir_for "$path")"
  [[ -d "$web_dir" ]] || alloy_die "web dir missing: $web_dir"
  if [[ -d "${web_dir}/node_modules" && "${ALLOY_SPRINT_FORCE_INSTALL:-0}" != "1" ]]; then
    alloy_info "node_modules already present in ${web_dir} (skipping install)"
    return 0
  fi
  # Refuse symlinked node_modules from another worktree
  if [[ -L "${web_dir}/node_modules" ]]; then
    alloy_die "refusing symlinked node_modules in ${web_dir} (worktree-local dependencies only)"
  fi
  alloy_sprint_ops_defaults
  alloy_refuse_if_memory_pressure_heavy "dependency install"
  lock="$(alloy_acquire_resource_slot install "$ALLOY_MAX_CONCURRENT_INSTALLS" "$name")"
  # shellcheck disable=SC2064
  trap "alloy_release_resource_slot '$lock'" RETURN
  alloy_info "Installing worktree-local dependencies in ${web_dir}..."
  (
    cd "$web_dir"
    ${ALLOY_PM} install
  )
  alloy_release_resource_slot "$lock"
  trap - RETURN
}

alloy_print_readiness_summary() {
  local name="$1"
  alloy_load_metadata "$name"
  local summary
  summary="$(alloy_slot_health_summary "$name")"
  cat <<EOF

Readiness summary
  sprint:      ${ALLOY_SPRINT_NAME:-$name}
  slot:        ${ALLOY_WORKTREE_SLOT}
  provider:    ${ALLOY_AGENT}
  worktree:    ${name}
  path:        ${ALLOY_WORKTREE_PATH}
  branch:      ${ALLOY_WORKTREE_BRANCH}
  port:        ${PORT}
  lifecycle:   ${ALLOY_WORKER_LIFECYCLE:-active}
  state:       ${summary}
  instructions:${ALLOY_AGENT_INSTRUCTIONS:-$(alloy_instructions_path "$ALLOY_WORKTREE_PATH")}

EOF
}
