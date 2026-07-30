#!/usr/bin/env bash
# Commit-keyed validation result reuse (host-local).
# shellcheck shell=bash

alloy_validate_fingerprint() {
  local web_dir="$1"
  local kind="$2"
  local lock_hash ts_hash
  lock_hash="none"
  if [[ -f "${web_dir}/package-lock.json" ]]; then
    lock_hash="$(openssl dgst -sha256 "${web_dir}/package-lock.json" 2>/dev/null | awk '{print $NF}')"
  elif [[ -f "${web_dir}/../package-lock.json" ]]; then
    lock_hash="$(openssl dgst -sha256 "${web_dir}/../package-lock.json" 2>/dev/null | awk '{print $NF}')"
  fi
  ts_hash="none"
  case "$kind" in
    typecheck|build)
      if [[ -f "${web_dir}/tsconfig.build.json" ]]; then
        ts_hash="$(openssl dgst -sha256 "${web_dir}/tsconfig.build.json" 2>/dev/null | awk '{print $NF}')"
      fi
      ;;
    typecheck:tests)
      if [[ -f "${web_dir}/tsconfig.json" ]]; then
        ts_hash="$(openssl dgst -sha256 "${web_dir}/tsconfig.json" 2>/dev/null | awk '{print $NF}')"
      fi
      ;;
  esac
  printf '%s_%s' "${lock_hash:0:16}" "${ts_hash:0:16}"
}

alloy_validate_result_path() {
  local commit="$1"
  local kind="$2"
  local fp="$3"
  local safe_kind
  safe_kind="${kind//:/_}"
  printf '%s/%s__%s__%s.json' "$(alloy_validate_results_dir)" "${commit:0:40}" "$safe_kind" "$fp"
}

# Prints: HIT|<path>|<exit_code>|<source_kind>  or  MISS
alloy_validate_reuse_lookup() {
  local commit="$1"
  local kind="$2"
  local web_dir="$3"
  local force="${4:-0}"
  [[ "$force" == "1" ]] && { printf 'MISS\n'; return 1; }
  [[ -n "$commit" && "$commit" != "unknown" ]] || { printf 'MISS\n'; return 1; }

  local fp path
  fp="$(alloy_validate_fingerprint "$web_dir" "$kind")"
  path="$(alloy_validate_result_path "$commit" "$kind" "$fp")"
  if [[ -f "$path" ]]; then
    local code src
    code="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("exit_code",1))' "$path" 2>/dev/null || echo 1)"
    src="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("source_kind",""))' "$path" 2>/dev/null || true)"
    printf 'HIT|%s|%s|%s\n' "$path" "$code" "${src:-$kind}"
    return 0
  fi

  # Cross-kind: successful build implies typecheck (production graph only).
  if [[ "$kind" == "typecheck" ]]; then
    local bfp bpath
    bfp="$(alloy_validate_fingerprint "$web_dir" "build")"
    bpath="$(alloy_validate_result_path "$commit" "build" "$bfp")"
    if [[ -f "$bpath" ]]; then
      local bcode
      bcode="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("exit_code",1))' "$bpath" 2>/dev/null || echo 1)"
      if [[ "$bcode" == "0" ]]; then
        printf 'HIT|%s|0|build\n' "$bpath"
        return 0
      fi
    fi
  fi

  printf 'MISS\n'
  return 1
}

alloy_validate_reuse_store() {
  local commit="$1"
  local kind="$2"
  local web_dir="$3"
  local exit_code="$4"
  local worktree="${5:-}"
  local slot="${6:-}"
  [[ -n "$commit" && "$commit" != "unknown" ]] || return 0
  mkdir -p "$(alloy_validate_results_dir)"
  local fp path
  fp="$(alloy_validate_fingerprint "$web_dir" "$kind")"
  path="$(alloy_validate_result_path "$commit" "$kind" "$fp")"
  python3 - "$path" "$commit" "$kind" "$exit_code" "$worktree" "$slot" "$fp" <<'PY'
import json, sys, datetime
path, commit, kind, code, worktree, slot, fp = sys.argv[1:8]
rec = {
  "commit": commit,
  "kind": kind,
  "source_kind": kind,
  "exit_code": int(code),
  "worktree": worktree,
  "slot": slot,
  "fingerprint": fp,
  "finished_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open(path, "w", encoding="utf-8") as f:
  json.dump(rec, f, indent=2)
  f.write("\n")
PY
}
