#!/usr/bin/env bash
# Commit-keyed validation result reuse (host-local).
#
# RESULT IDENTITY — why it is this wide.
#   Reuse was keyed on (commit, kind, lockfile, tsconfig). That does not identify WHAT QUESTION was
#   answered, and it produced a false green in practice: a focused single-file `vac run test <path>`
#   stored exit 0 under the same key as the FULL suite, and the next full-suite request reused it and
#   reported zero failures. A partial pass answering for the whole suite is worse than no cache,
#   because it looks like success.
#
#   Identity now includes SCOPE (which tests were asked for) and TOOL VERSION (which binary answered);
#   the normalized command is recorded and re-checked on same-kind hits. A focused result gets its own
#   key and is reusable, while being structurally unable to satisfy the full suite.
# shellcheck shell=bash

# Normalize the caller's scope (test paths / filters) into a stable identity component.
# Order-insensitive and whitespace-collapsed, so `a b` and `b a` are the same question.
alloy_validate_scope_id() {
    if [[ $# -eq 0 ]]; then printf 'full'; return 0; fi
    printf '%s\n' "$@" \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
        | grep -v '^$' \
        | LC_ALL=C sort \
        | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
}

# Version of the tool that will actually answer this kind — a dependency bump must invalidate results.
alloy_validate_tool_version() {
    local web_dir="$1" kind="$2" pkg=""
    case "$kind" in
        test) pkg="${web_dir}/node_modules/vitest/package.json" ;;
        typecheck|typecheck:tests|build) pkg="${web_dir}/node_modules/typescript/package.json" ;;
        *) printf 'na'; return 0 ;;
    esac
    [[ -f "$pkg" ]] || { printf 'none'; return 0; }
    node -e 'try{process.stdout.write(require(process.argv[1]).version)}catch(e){process.stdout.write("none")}' "$pkg" 2>/dev/null
}

# Is the worktree dirty? A commit SHA identifies COMMITTED code; if the tree has uncommitted changes,
# the SHA no longer identifies what was actually validated.
#
# This bit us for real: a build failed, its failure was cached against the commit, the source was then
# fixed WITHOUT committing, and the next two runs returned the stale FAILURE from cache — reporting a
# broken build for code that was already repaired. The mirror image (a stale PASS masking a real break)
# is the dangerous direction. So a dirty tree neither reuses nor stores.
alloy_validate_tree_dirty() {
    local web_dir="$1" root
    root="$(cd "$web_dir" && git rev-parse --show-toplevel 2>/dev/null)" || return 1
    [[ -n "$(cd "$root" && git status --porcelain 2>/dev/null)" ]]
}

alloy_validate_cmd_id() {
    printf '%s' "${1:-}" | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//' \
        | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
}

alloy_validate_fingerprint() {
  local web_dir="$1"
  local kind="$2"
  local scope_id="${3:-full}"
  local lock_hash ts_hash tool_v
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
  tool_v="$(alloy_validate_tool_version "$web_dir" "$kind")"
  printf '%s_%s_%s_%s' "${lock_hash:0:16}" "${ts_hash:0:16}" "${tool_v}" "${scope_id}"
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
  local scope_id="${5:-full}"
  local cmd="${6:-}"
  # A dirty tree means the commit no longer identifies the code that would be validated.
  if alloy_validate_tree_dirty "$web_dir"; then printf 'MISS\n'; return 1; fi
  [[ "$force" == "1" ]] && { printf 'MISS\n'; return 1; }
  [[ -n "$commit" && "$commit" != "unknown" ]] || { printf 'MISS\n'; return 1; }

  local fp path
  fp="$(alloy_validate_fingerprint "$web_dir" "$kind" "$scope_id")"
  path="$(alloy_validate_result_path "$commit" "$kind" "$fp")"
  if [[ -f "$path" ]]; then
    local code src rec_cmd
    code="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("exit_code",1))' "$path" 2>/dev/null || echo 1)"
    src="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("source_kind",""))' "$path" 2>/dev/null || true)"
    rec_cmd="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("command_id",""))' "$path" 2>/dev/null || true)"
    # Same-kind reuse additionally requires the same normalized command: a different command is a
    # different question even at identical scope.
    if [[ -n "$cmd" && -n "$rec_cmd" && "$rec_cmd" != "$(alloy_validate_cmd_id "$cmd")" ]]; then
      printf 'MISS\n'
      return 1
    fi
    printf 'HIT|%s|%s|%s\n' "$path" "$code" "${src:-$kind}"
    return 0
  fi

  # Cross-kind: successful build implies typecheck (production graph only).
  # Deliberately scoped to `full` on both sides — a partial anything may never imply a whole anything.
  # The command check is skipped here by design: the two kinds necessarily run different commands.
  if [[ "$kind" == "typecheck" && "$scope_id" == "full" ]]; then
    local bfp bpath
    bfp="$(alloy_validate_fingerprint "$web_dir" "build" "full")"
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
  local scope_id="${7:-full}"
  local cmd="${8:-}"
  local outcome="${9:-unknown}"
  [[ -n "$commit" && "$commit" != "unknown" ]] || return 0

  # Only a real execution outcome is a result. A command that never ran (config error) or was
  # cancelled by infrastructure says nothing about the code, and caching it poisons the commit.
  case "$outcome" in
    ok|test) : ;;
    *) return 0 ;;
  esac
  # A dirty tree means the commit does not identify what ran; recording it would poison the SHA.
  if alloy_validate_tree_dirty "$web_dir"; then return 0; fi

  mkdir -p "$(alloy_validate_results_dir)"
  local fp path cmd_id tool_v
  fp="$(alloy_validate_fingerprint "$web_dir" "$kind" "$scope_id")"
  path="$(alloy_validate_result_path "$commit" "$kind" "$fp")"
  cmd_id="$(alloy_validate_cmd_id "$cmd")"
  tool_v="$(alloy_validate_tool_version "$web_dir" "$kind")"
  python3 - "$path" "$commit" "$kind" "$exit_code" "$worktree" "$slot" "$fp" "$scope_id" "$cmd_id" "$cmd" "$tool_v" "$outcome" <<'PY'
import json, sys, datetime
(path, commit, kind, code, worktree, slot, fp, scope_id, cmd_id, cmd, tool_v, outcome) = sys.argv[1:13]
rec = {
  "commit": commit,
  "kind": kind,
  "source_kind": kind,
  "exit_code": int(code),
  "outcome": outcome,
  "scope_id": scope_id,
  "command_id": cmd_id,
  "command": cmd,
  "tool_version": tool_v,
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
