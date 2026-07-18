#!/usr/bin/env bash
# lib/actuation-adapter-supabase.sh — the REAL, allowlisted Supabase/local-Docker adapter.
#
# The only place R3 touches real infrastructure. It constructs ONLY fixed argv and
# validates every interpolated value against a strict code-owned format. It:
#   - acts only on an R3-MINTED namespace (^alloy-r3-...), enforced twice;
#   - creates an ISOLATED project workdir + config (own project_id + own free ports),
#     so it can never collide with or mutate the canonical/shared stack or any other
#     worktree's runtime;
#   - marks ownership DURABLY (a workdir ownership record) and refuses to retire a
#     namespace it has no ownership record for;
#   - DISCARDS provider stdout/stderr (supabase prints anon/service keys) — redaction
#     by construction; only a status token and a short redacted detail are returned;
#   - is bounded in time (no automatic SIGKILL — see alloy_act_run_bounded).
#
# NO shell fragment, command name, Docker arg, compose path, or env var is ever taken
# from an intent, record, Director, or CLI. The two argv shapes are fixed here:
#   supabase start --workdir <validated-dir>
#   supabase stop  --workdir <validated-dir> --no-backup
# shellcheck shell=bash

# Where isolated adapter project dirs live (code-owned; never from a record).
alloy_adapter_supabase_workroot() {
  printf '%s' "${ALLOY_ACT_SUPABASE_WORKROOT:-${ALLOY_RC_RUNTIME_ROOT:-$HOME/.local/state/alloy-dev}/adapter-supabase}"
}
alloy_adapter_supabase_workdir() {
  local ns="$1"; printf '%s/%s' "$(alloy_adapter_supabase_workroot)" "$ns"
}

# Provision timeout (code-owned, bounded).
ALLOY_ADAPTER_SUPABASE_PROVISION_TIMEOUT="${ALLOY_ADAPTER_SUPABASE_PROVISION_TIMEOUT:-420}"
ALLOY_ADAPTER_SUPABASE_RETIRE_TIMEOUT="${ALLOY_ADAPTER_SUPABASE_RETIRE_TIMEOUT:-180}"

# Services excluded to keep an isolated R3 runtime light — leaves the R1 core set
# (postgres/db, kong, gotrue/auth, postgrest/rest). Container names per `supabase start -x`.
ALLOY_ADAPTER_SUPABASE_EXCLUDE="studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta"

# Is a TCP port free? (best-effort; lsof present on macOS/Linux dev machines.)
_alloy_supabase_port_free() {
  local p="$1"
  command -v lsof >/dev/null 2>&1 || return 0
  ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
}

# Deterministic base port for a namespace, then bump to the next free triple.
# Range 54600-54990 keeps clear of supabase defaults (54321+) and canonical 3000s.
_alloy_supabase_alloc_base() {
  local ns="$1" h base p
  h="$(printf '%s' "$ns" | shasum -a 256 2>/dev/null | tr -dc '0-9' | cut -c1-4)"
  [[ -n "$h" ]] || h=100
  base=$(( 54600 + (10#$h % 380) ))
  # ensure api/db/shadow ports are free; bump by 3 up to a bound
  local tries=0
  while (( tries < 120 )); do
    if _alloy_supabase_port_free "$base" && _alloy_supabase_port_free "$((base+1))" && _alloy_supabase_port_free "$((base+2))"; then
      printf '%s' "$base"; return 0
    fi
    base=$(( base + 3 )); if (( base > 54990 )); then base=54600; fi; tries=$(( tries + 1 ))
  done
  printf '%s' "$base"
}

# Prepare an isolated supabase project at <workdir>: generate a CANONICAL config via
# `supabase init` (schema-correct for the installed CLI), then patch ONLY project_id
# and the api/db/shadow ports to isolated values. Heavy services are dropped at start
# time via --exclude (not by editing the schema), so this stays version-robust.
_alloy_supabase_prepare_project() {
  local ns="$1" workdir="$2" base api_port db_port shadow_port cfg
  base="$(_alloy_supabase_alloc_base "$ns")"
  api_port="$base"; db_port="$((base+1))"; shadow_port="$((base+2))"
  mkdir -p "$workdir"
  supabase init --workdir "$workdir" --force >/dev/null 2>&1 || return 1
  cfg="$workdir/supabase/config.toml"
  [[ -f "$cfg" ]] || return 1
  # Section-aware patch: project_id (top), [api] port, [db] port/shadow_port. No shell
  # fragment or provider value is ever taken from an intent/record — ns is R3-minted
  # and validated, ports are code-computed integers.
  node -e '
    const fs=require("fs");const [p,ns,api,db,shadow]=process.argv.slice(1);
    const lines=fs.readFileSync(p,"utf8").split("\n");let sec="";
    const out=lines.map(l=>{
      const h=l.match(/^\s*\[([^\]]+)\]/); if(h){sec=h[1];return l;}
      if(/^\s*project_id\s*=/.test(l)) return `project_id = "${ns}"`;
      if(sec==="api"    && /^\s*port\s*=/.test(l))        return `port = ${api}`;
      if(sec==="db"     && /^\s*port\s*=/.test(l))        return `port = ${db}`;
      if(sec==="db"     && /^\s*shadow_port\s*=/.test(l)) return `shadow_port = ${shadow}`;
      return l;
    });
    fs.writeFileSync(p,out.join("\n"));
  ' "$cfg" "$ns" "$api_port" "$db_port" "$shadow_port" || return 1
  return 0
}

_alloy_supabase_write_ownership() {
  local ns="$1" workdir="$2"
  # Durable ownership marker; parsed, never sourced. Proves R3 provisioned this ns.
  cat >"$workdir/ownership.env" <<OWN
ALLOY_ADAPTER=supabase
ALLOY_ADAPTER_OWNED_NAMESPACE="${ns}"
ALLOY_ADAPTER_OWNER=runtime-actuator-r3
ALLOY_ADAPTER_MARKED_AT="$(alloy_iso_now 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
OWN
}

alloy_adapter_supabase_has_ownership() {
  local ns="$1" workdir; workdir="$(alloy_adapter_supabase_workdir "$ns")"
  [[ -f "$workdir/ownership.env" ]] || return 1
  local owned; owned="$(alloy_rc_meta_get "$workdir/ownership.env" ALLOY_ADAPTER_OWNED_NAMESPACE 2>/dev/null || true)"
  [[ "$owned" == "$ns" ]]
}

alloy_adapter_supabase_provision() {
  local ns="$1" iso="$2" workdir rc pid
  [[ "$ns" =~ ^alloy-r3-[a-z0-9][a-z0-9-]*$ ]] || { printf 'status=rejected\ndetail=namespace-not-r3-minted\n'; return 2; }
  command -v supabase >/dev/null 2>&1 || { printf 'status=unavailable\ndetail=supabase-cli-absent\n'; return 1; }
  command -v docker   >/dev/null 2>&1 && docker ps >/dev/null 2>&1 || { printf 'status=unavailable\ndetail=docker-unavailable\n'; return 1; }

  workdir="$(alloy_adapter_supabase_workdir "$ns")"
  mkdir -p "$workdir"
  _alloy_supabase_prepare_project "$ns" "$workdir" || { printf 'status=rejected\ndetail=project-prepare-failed\n'; return 1; }
  _alloy_supabase_write_ownership "$ns" "$workdir"

  # Fixed allowlisted argv; provider output DISCARDED (contains keys). Bounded.
  rc=0
  pid="$(alloy_act_run_bounded "$ALLOY_ADAPTER_SUPABASE_PROVISION_TIMEOUT" \
          supabase start --workdir "$workdir" --exclude "$ALLOY_ADAPTER_SUPABASE_EXCLUDE" >/dev/null 2>&1)" || rc=$?
  if [[ "$rc" -eq 124 ]]; then
    printf 'status=timeout\ndetail=provision-exceeded-bound\n'; return 1
  elif [[ "$rc" -ne 0 ]]; then
    printf 'status=rejected\ndetail=supabase-start-nonzero\n'; return 1
  fi
  printf 'status=ok\ndetail=supabase-started\n'; return 0
}

alloy_adapter_supabase_retire() {
  local ns="$1" workdir rc
  [[ "$ns" =~ ^alloy-r3-[a-z0-9][a-z0-9-]*$ ]] || { printf 'status=rejected\ndetail=namespace-not-r3-minted\n'; return 2; }
  # Ownership proof: refuse to retire a namespace this adapter did not provision.
  alloy_adapter_supabase_has_ownership "$ns" || { printf 'status=rejected\ndetail=no-ownership-record\n'; return 2; }
  command -v supabase >/dev/null 2>&1 || { printf 'status=unavailable\ndetail=supabase-cli-absent\n'; return 1; }

  workdir="$(alloy_adapter_supabase_workdir "$ns")"
  rc=0
  alloy_act_run_bounded "$ALLOY_ADAPTER_SUPABASE_RETIRE_TIMEOUT" \
    supabase stop --workdir "$workdir" --no-backup >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -eq 124 ]]; then
    printf 'status=timeout\ndetail=retire-exceeded-bound\n'; return 1
  elif [[ "$rc" -ne 0 ]]; then
    printf 'status=rejected\ndetail=supabase-stop-nonzero\n'; return 1
  fi
  printf 'status=ok\ndetail=supabase-stopped\n'; return 0
}
