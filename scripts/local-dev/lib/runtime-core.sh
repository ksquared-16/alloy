#!/usr/bin/env bash
# lib/runtime-core.sh — Shared Read Core: runtime discovery & registry primitives.
#
# The single owner of runtime READ interpretation for the toolkit. Docker/runtime
# discovery, registry parsing, reconciliation, and capacity observation live here;
# alloy-ro and (eventually) Director consume these primitives. One owner, one
# truth, many interfaces.
#
# CONSTITUTION (Runtime Resource Orchestration V1 — observe, never control):
#   Pure, deterministic, read-only. This module MUST NOT start, stop, restart,
#   remove, prune, or otherwise mutate any container; it never sources files as
#   shell; it never writes runtime state. Docker is read ONLY via `docker ps`
#   and `docker stats` with a FIELD-RESTRICTED format — never `inspect`, `top`,
#   `logs`, `.Command`, `.Env`, or arbitrary labels — so secrets, keys, JWTs,
#   certs, auth headers, and command payloads are physically unreachable here.
#
# Naming: functions `alloy_rt_*`; resolved config `ALLOY_RT_*`. Registry files
# are parsed with the Shared Read Core safe parser, never sourced.
# shellcheck shell=bash

[[ -n "${ALLOY_RT_CORE_LOADED:-}" ]] && return 0
ALLOY_RT_CORE_LOADED=1

_ALLOY_RT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/read-core.sh
source "${_ALLOY_RT_LIB_DIR}/read-core.sh"

ALLOY_RT_SCHEMA_VERSION=1

# Canonical Supabase service set (observed-vs-expected uses this). CORE services
# are the minimum that must be running for a runtime to read as healthy.
ALLOY_RT_EXPECTED_SERVICES="db kong auth rest realtime storage studio meta analytics vector imgproxy edge-runtime pooler"
ALLOY_RT_CORE_SERVICES="db kong auth rest"

# Field delimiter for the docker format template and all internal row passing.
# A non-whitespace control char (unit separator) so `read` PRESERVES empty
# fields — a whitespace IFS (tab/space) collapses consecutive delimiters and
# would shift columns when e.g. Ports is empty. Container fields never contain it.
ALLOY_RT_SEP=$'\x1f'

# --- config resolution -------------------------------------------------------
alloy_rt_init() {
  [[ "${ALLOY_RT_READY:-0}" == "1" ]] && return 0
  alloy_rc_config_init
  ALLOY_RT_RUNTIME_ROOT="$ALLOY_RC_RUNTIME_ROOT"
  ALLOY_RT_REGISTRY_DIR="$ALLOY_RC_RUNTIME_ROOT/runtimes"
  ALLOY_RT_MAX_ACTIVE="$(alloy_rc_config_get ALLOY_MAX_ACTIVE_RUNTIMES 2>/dev/null || true)"
  [[ "$ALLOY_RT_MAX_ACTIVE" =~ ^[0-9]+$ ]] || ALLOY_RT_MAX_ACTIVE="${ALLOY_RC_DEFAULT_MAX_ACTIVE_RUNTIMES:-2}"
  ALLOY_RT_READY=1
}

# --- docker access (read-only, fixture-injectable for tests) ------------------
#
# Availability. In fixture mode (ALLOY_RT_PS_FIXTURE set) availability is driven
# by the fixture so tests need no Docker. Otherwise: docker present AND daemon
# reachable via a read-only `docker ps`.
alloy_rt_docker_available() {
  if [[ -n "${ALLOY_RT_PS_FIXTURE:-}" ]]; then
    [[ "${ALLOY_RT_DOCKER_UNAVAILABLE:-0}" != "1" ]]
    return
  fi
  command -v docker >/dev/null 2>&1 || return 1
  docker ps >/dev/null 2>&1
}

# Raw container rows (tab-separated, redaction-safe fields only). Never emits
# Command/Env/arbitrary labels. Prints nothing when Docker is unavailable.
alloy_rt_ps_rows() {
  if [[ -n "${ALLOY_RT_PS_FIXTURE:-}" ]]; then
    [[ "${ALLOY_RT_DOCKER_UNAVAILABLE:-0}" == "1" ]] && return 0
    [[ -r "$ALLOY_RT_PS_FIXTURE" ]] && cat "$ALLOY_RT_PS_FIXTURE"
    return 0
  fi
  alloy_rt_docker_available || return 0
  local fmt
  fmt='{{.ID}}'"$ALLOY_RT_SEP"'{{.Names}}'"$ALLOY_RT_SEP"'{{.Image}}'"$ALLOY_RT_SEP"'{{.State}}'"$ALLOY_RT_SEP"'{{.Status}}'"$ALLOY_RT_SEP"'{{.Ports}}'"$ALLOY_RT_SEP"'{{.Label "com.supabase.cli.project"}}'"$ALLOY_RT_SEP"'{{.Label "com.docker.compose.project"}}'"$ALLOY_RT_SEP"'{{.Label "com.docker.compose.service"}}'
  docker ps -a --no-trunc --format "$fmt" 2>/dev/null || true
}

# Raw stats rows: id<TAB>memusage<TAB>cpu%. Numbers only; degrades to empty.
alloy_rt_stats_rows() {
  if [[ -n "${ALLOY_RT_STATS_FIXTURE:-}" ]]; then
    [[ -r "$ALLOY_RT_STATS_FIXTURE" ]] && cat "$ALLOY_RT_STATS_FIXTURE"
    return 0
  fi
  alloy_rt_docker_available || return 0
  docker stats --no-stream --format '{{.ID}}'"$ALLOY_RT_SEP"'{{.MemUsage}}'"$ALLOY_RT_SEP"'{{.CPUPerc}}' 2>/dev/null || true
}

# --- grouping: container row -> (namespace, service) --------------------------
#
# Namespace precedence: supabase-cli label > compose-project label > name parse.
# Returns empty namespace for containers that are not part of a recognizable
# stack (they are reported as "unrelated", never as their own runtime).
alloy_rt_row_namespace() {
  local sup_label="$1" compose_label="$2" name="$3"
  if [[ -n "$sup_label" ]]; then printf '%s' "$sup_label"; return; fi
  # supabase_<service>_<project>
  if [[ "$name" =~ ^supabase[_-][a-z0-9]+[_-](.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"; return
  fi
  # compose project label, only when the container also looks supabase-ish
  if [[ -n "$compose_label" && "$name" == *supabase* ]]; then
    printf '%s' "$compose_label"; return
  fi
  printf ''
}

alloy_rt_row_service() {
  local compose_service="$1" name="$2" image="$3"
  if [[ -n "$compose_service" ]]; then printf '%s' "$compose_service"; return; fi
  if [[ "$name" =~ ^supabase[_-]([a-z0-9]+)[_-] ]]; then printf '%s' "${BASH_REMATCH[1]}"; return; fi
  # image-based last resort (name of the image repo's last path segment)
  local base="${image##*/}"; base="${base%%:*}"
  printf '%s' "$base"
}

# --- registry (parsed, never sourced) ----------------------------------------
alloy_rt_registry_ids() {
  local dir="${ALLOY_RT_REGISTRY_DIR}" f base
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  for f in "$dir"/*.env; do base="$(basename "$f" .env)"; printf '%s\n' "$base"; done
  shopt -u nullglob
}

alloy_rt_registry_path() { printf '%s/%s.env' "${ALLOY_RT_REGISTRY_DIR}" "$1"; }

# Read one registry field safely (Shared Read Core parser; refuses shell-active).
alloy_rt_reg_get() { alloy_rc_meta_get "$1" "$2"; }

# Map a registry basename -> its declared project namespace (for reconciliation).
alloy_rt_registry_namespace() {
  alloy_rt_reg_get "$(alloy_rt_registry_path "$1")" ALLOY_RT_PROJECT_NAMESPACE 2>/dev/null || true
}

# --- conservative association inference ---------------------------------------
#
# Compare a namespace to known managed worktrees. A match is EVIDENCE, not truth:
# it never sets owner; it records associated worktrees + provenance and marks the
# association inferred. Normalizes by lowercasing and stripping alloy-/wtN-/-vN.
alloy_rt_normalize() {
  local s; s="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  s="${s#alloy-}"; s="${s#alloy_}"
  s="${s#wt}"; s="${s#[0-9]-}"; s="${s#[0-9][0-9]-}"
  while [[ "$s" =~ ^[0-9]+- ]]; do s="${s#*-}"; done
  s="${s%-v[0-9]}"; s="${s%-v[0-9][0-9]}"
  printf '%s' "$s"
}

# Prints "worktree_name<TAB>provenance" lines for inferred matches (may be empty).
alloy_rt_infer_worktrees() {
  local ns="$1" nn wt wn
  nn="$(alloy_rt_normalize "$ns")"
  [[ ${#nn} -ge 3 ]] || return 0
  while IFS= read -r wt; do
    [[ -n "$wt" ]] || continue
    wn="$(alloy_rt_normalize "$wt")"
    [[ ${#wn} -ge 3 ]] || continue
    if [[ "$wn" == "$nn" ]]; then
      printf '%s\x1f%s\n' "$wt" "exact-normalized-name-match"
    elif [[ "$wn" == *"$nn"* || "$nn" == *"$wn"* ]]; then
      printf '%s\x1f%s\n' "$wt" "substring-normalized-name-match"
    fi
  done < <(alloy_rc_list_metadata "$ALLOY_RC_METADATA_DIR")
}

# --- memory/size parsing (for capacity aggregation) --------------------------
# "123.4MiB" / "1.2GiB" / "512KiB" / "900B" -> bytes (integer). Unknown -> empty.
alloy_rt_size_to_bytes() {
  local s="$1" num unit
  [[ "$s" =~ ^([0-9]+(\.[0-9]+)?)([KMGT]?i?B)?$ ]] || { printf ''; return 1; }
  num="${BASH_REMATCH[1]}"; unit="${BASH_REMATCH[3]:-B}"
  awk -v n="$num" -v u="$unit" 'BEGIN{
    m=1;
    if(u=="KiB"||u=="KB")m=1024; else if(u=="MiB"||u=="MB")m=1024*1024;
    else if(u=="GiB"||u=="GB")m=1024*1024*1024; else if(u=="TiB"||u=="TB")m=1024*1024*1024*1024;
    printf "%.0f", n*m }'
}

# --- port extraction ---------------------------------------------------------
# "0.0.0.0:54321->8000/tcp, [::]:54321->8000/tcp, 54322/tcp" -> "54321 54322"
alloy_rt_extract_ports() {
  local ports="$1" tok host out=""
  IFS=',' read -ra toks <<<"$ports"
  for tok in "${toks[@]}"; do
    if [[ "$tok" =~ :([0-9]+)-\> ]]; then host="${BASH_REMATCH[1]}"
    elif [[ "$tok" =~ ^[[:space:]]*([0-9]+)/ ]]; then host="${BASH_REMATCH[1]}"
    else continue; fi
    [[ " $out " == *" $host "* ]] || out="${out}${out:+ }${host}"
  done
  # deterministic order
  printf '%s' "$(printf '%s\n' $out | sort -n | tr '\n' ' ' | sed 's/ $//')"
}

# --- discovery: namespaces & reconciliation ----------------------------------
# Sorted unique project namespaces observed in Docker (empty namespaces = the
# unrelated containers, excluded).
alloy_rt_discovered_namespaces() {
  local id name image state status ports sup comp svc ns
  while IFS=$'\x1f' read -r id name image state cstatus ports sup comp svc; do
    [[ -n "$name" ]] || continue
    ns="$(alloy_rt_row_namespace "$sup" "$comp" "$name")"
    [[ -n "$ns" ]] && printf '%s\n' "$ns"
  done < <(alloy_rt_ps_rows) | sort -u
}

# Count of running containers not attributable to any runtime stack (reported,
# never promoted to runtimes of their own).
alloy_rt_unrelated_container_count() {
  local id name image state status ports sup comp svc ns n=0
  while IFS=$'\x1f' read -r id name image state cstatus ports sup comp svc; do
    [[ -n "$name" ]] || continue
    ns="$(alloy_rt_row_namespace "$sup" "$comp" "$name")"
    [[ -z "$ns" ]] && n=$((n+1))
  done < <(alloy_rt_ps_rows)
  printf '%s' "$n"
}

# Registry basename whose declared namespace == <ns>, or "".
alloy_rt_registry_id_for_namespace() {
  local ns="$1" id rns
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    rns="$(alloy_rt_registry_namespace "$id")"
    [[ "$rns" == "$ns" ]] && { printf '%s' "$id"; return 0; }
  done < <(alloy_rt_registry_ids)
  return 1
}

# Union of discovered + registered namespaces, sorted unique.
alloy_rt_all_namespaces() {
  { alloy_rt_discovered_namespaces
    local id rns
    while IFS= read -r id; do
      rns="$(alloy_rt_registry_namespace "$id")"
      [[ -n "$rns" ]] && printf '%s\n' "$rns"
    done < <(alloy_rt_registry_ids)
  } | sort -u
}

# Reconciliation status for a namespace: registered | discovered | orphaned.
#   registered = has a registry entry AND observed containers
#   discovered = observed containers, no registry entry
#   orphaned   = registry entry, no observed containers
alloy_rt_reconcile_status() {
  local ns="$1" has_reg=0 has_containers=0
  alloy_rt_registry_id_for_namespace "$ns" >/dev/null 2>&1 && has_reg=1
  [[ "$(alloy_rt_ns_field "$ns" total_count)" != "0" ]] && has_containers=1
  if [[ "$has_reg" -eq 1 && "$has_containers" -eq 1 ]]; then printf 'registered'
  elif [[ "$has_reg" -eq 0 && "$has_containers" -eq 1 ]]; then printf 'discovered'
  elif [[ "$has_reg" -eq 1 && "$has_containers" -eq 0 ]]; then printf 'orphaned'
  else printf 'unknown'; fi
}

# Is <service> currently running within <ns>?
alloy_rt_service_running() {
  local ns="$1" want="$2" id name image state status ports sup comp svc rns rsvc
  while IFS=$'\x1f' read -r id name image state cstatus ports sup comp svc; do
    [[ -n "$name" ]] || continue
    rns="$(alloy_rt_row_namespace "$sup" "$comp" "$name")"
    [[ "$rns" == "$ns" ]] || continue
    rsvc="$(alloy_rt_row_service "$svc" "$name" "$image")"
    if [[ "$rsvc" == "$want" && "$state" == "running" ]]; then return 0; fi
  done < <(alloy_rt_ps_rows)
  return 1
}

# Per-namespace computed field. field ∈ running_count|exited_count|total_count|
# container_state|health|observed_services|ports|memory_bytes|cpu_percent
alloy_rt_ns_field() {
  local ns="$1" field="$2"
  local id name image state status ports sup comp svc rns rsvc
  local running=0 exited=0 total=0 services="" portset="" ids=""
  while IFS=$'\x1f' read -r id name image state cstatus ports sup comp svc; do
    [[ -n "$name" ]] || continue
    rns="$(alloy_rt_row_namespace "$sup" "$comp" "$name")"
    [[ "$rns" == "$ns" ]] || continue
    total=$((total+1))
    rsvc="$(alloy_rt_row_service "$svc" "$name" "$image")"
    [[ " $services " == *" $rsvc "* ]] || services="${services}${services:+ }${rsvc}"
    if [[ "$state" == "running" ]]; then running=$((running+1)); ids="${ids}${ids:+ }${id:0:12}"
    elif [[ "$state" == "exited" || "$state" == "dead" || "$state" == "created" ]]; then exited=$((exited+1)); fi
    local p; p="$(alloy_rt_extract_ports "$ports")"
    [[ -n "$p" ]] && portset="${portset}${portset:+ }${p}"
  done < <(alloy_rt_ps_rows)

  case "$field" in
    running_count) printf '%s' "$running" ;;
    exited_count)  printf '%s' "$exited" ;;
    total_count)   printf '%s' "$total" ;;
    observed_services) printf '%s' "$services" ;;
    ports) printf '%s' "$(printf '%s\n' $portset | sort -nu | tr '\n' ' ' | sed 's/ $//')" ;;
    container_state)
      if   [[ "$total" -eq 0 ]]; then printf 'absent'
      elif [[ "$running" -gt 0 && "$exited" -eq 0 ]]; then printf 'active'
      elif [[ "$running" -gt 0 ]]; then printf 'partial'
      else printf 'exited'; fi ;;
    health)
      if ! alloy_rt_docker_available; then printf 'unknown'; return; fi
      if [[ "$total" -eq 0 ]]; then printf 'unknown'; return; fi
      local core c core_run=0 core_n=0
      for c in $ALLOY_RT_CORE_SERVICES; do
        core_n=$((core_n+1))
        alloy_rt_service_running "$ns" "$c" && core_run=$((core_run+1))
      done
      if   [[ "$core_run" -eq "$core_n" ]]; then printf 'healthy'
      elif [[ "$running" -gt 0 ]]; then printf 'partial'
      elif [[ "$exited" -gt 0 ]]; then printf 'stopped'
      else printf 'unknown'; fi ;;
    memory_bytes|cpu_percent)
      local sid mem cpu total_mem="" total_cpu="" have=0
      while IFS=$'\x1f' read -r sid mem cpu; do
        [[ -n "$sid" ]] || continue
        [[ " $ids " == *" ${sid:0:12} "* ]] || continue
        have=1
        if [[ "$field" == "memory_bytes" ]]; then
          local used b; used="${mem%% /*}"; used="${used// /}"
          b="$(alloy_rt_size_to_bytes "$used" 2>/dev/null || true)"
          [[ -n "$b" ]] && total_mem="$(( ${total_mem:-0} + b ))"
        else
          local pc; pc="${cpu%\%}"
          total_cpu="$(awk -v a="${total_cpu:-0}" -v b="${pc:-0}" 'BEGIN{printf "%.2f", a+b}')"
        fi
      done < <(alloy_rt_stats_rows)
      if [[ "$have" -eq 0 ]]; then printf 'unknown'; return; fi
      if [[ "$field" == "memory_bytes" ]]; then printf '%s' "${total_mem:-unknown}"; else printf '%s' "${total_cpu:-unknown}"; fi ;;
  esac
}

# Redacted per-container detail for a namespace:
#   short_id<TAB>name<TAB>service<TAB>state<TAB>status<TAB>ports
# NEVER includes command/env — redaction is by construction (fields not read).
alloy_rt_ns_containers() {
  local ns="$1" id name image state status ports sup comp svc rns rsvc sid p
  while IFS=$'\x1f' read -r id name image state cstatus ports sup comp svc; do
    [[ -n "$name" ]] || continue
    rns="$(alloy_rt_row_namespace "$sup" "$comp" "$name")"
    [[ "$rns" == "$ns" ]] || continue
    rsvc="$(alloy_rt_row_service "$svc" "$name" "$image")"
    sid="${id:0:12}"
    p="$(alloy_rt_extract_ports "$ports")"
    printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$sid" "$name" "$rsvc" "$state" "$cstatus" "$p"
  done < <(alloy_rt_ps_rows)
}

# --- capacity ----------------------------------------------------------------
# Count of active runtimes (container_state active or partial).
alloy_rt_active_runtime_count() {
  local ns n=0 st
  while IFS= read -r ns; do
    [[ -n "$ns" ]] || continue
    st="$(alloy_rt_ns_field "$ns" container_state)"
    [[ "$st" == "active" || "$st" == "partial" ]] && n=$((n+1))
  done < <(alloy_rt_discovered_namespaces)
  printf '%s' "$n"
}

alloy_rt_active_container_total() {
  local ns n=0
  while IFS= read -r ns; do
    [[ -n "$ns" ]] || continue
    n=$(( n + $(alloy_rt_ns_field "$ns" running_count) ))
  done < <(alloy_rt_discovered_namespaces)
  printf '%s' "$n"
}

alloy_rt_capacity_memory_bytes() {
  local ns total="" b
  while IFS= read -r ns; do
    [[ -n "$ns" ]] || continue
    b="$(alloy_rt_ns_field "$ns" memory_bytes)"
    [[ "$b" =~ ^[0-9]+$ ]] && total="$(( ${total:-0} + b ))"
  done < <(alloy_rt_discovered_namespaces)
  [[ -n "$total" ]] && printf '%s' "$total" || printf 'unknown'
}
