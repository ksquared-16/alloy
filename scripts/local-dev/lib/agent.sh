#!/usr/bin/env bash
# Phase 2 agent helpers — thin layer over Phase 1 worktree/server primitives.
# shellcheck shell=bash

# Permanent slot identities (defaults). Overrides live in ~/.config/alloy-dev/config.
alloy_slot_role_default() {
  local slot="$1"
  case "$slot" in
    1) printf '%s' "Product implementation" ;;
    2) printf '%s' "Architecture / doctrine" ;;
    3) printf '%s' "Performance" ;;
    4) printf '%s' "UI / UX" ;;
    5) printf '%s' "Refactor / infrastructure" ;;
    6) printf '%s' "Experimental" ;;
    *) printf '%s' "General" ;;
  esac
}

alloy_slot_default_agent_default() {
  local slot="$1"
  case "$slot" in
    1|3|4) printf '%s' "cursor" ;;
    2|5) printf '%s' "claude" ;;
    6) printf '%s' "cursor" ;;
    *) printf '%s' "cursor" ;;
  esac
}

alloy_slot_role() {
  local slot="$1"
  local var="ALLOY_SLOT_${slot}_ROLE"
  local value=""
  eval "value=\"\${${var}-}\""
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    alloy_slot_role_default "$slot"
  fi
}

alloy_slot_default_agent() {
  local slot="$1"
  local var="ALLOY_SLOT_${slot}_DEFAULT_AGENT"
  local value=""
  eval "value=\"\${${var}-}\""
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    alloy_slot_default_agent_default "$slot"
  fi
}

alloy_find_first_free_slot() {
  local i
  for ((i = 1; i <= ALLOY_MAX_AGENTS; i++)); do
    if ! alloy_find_metadata_by_slot "$i" >/dev/null 2>&1; then
      printf '%s\n' "$i"
      return 0
    fi
  done
  return 1
}

# Resolve <worktree-name|slot> → worktree name on stdout.
alloy_resolve_worktree_name() {
  local target="${1:-}"
  [[ -n "$target" ]] || alloy_die "worktree name or slot is required"

  if [[ "$target" =~ ^[1-9][0-9]*$ ]]; then
    alloy_validate_slot "$target"
    local found
    if ! found="$(alloy_find_metadata_by_slot "$target" 2>/dev/null)"; then
      alloy_die "no managed agent in slot $target"
    fi
    printf '%s\n' "$found"
    return 0
  fi

  [[ -f "$(alloy_metadata_path "$target")" ]] || alloy_die "unknown managed agent: $target"
  printf '%s\n' "$target"
}

alloy_instructions_path() {
  local worktree_path="$1"
  printf '%s/.alloy-agent-instructions.md' "$worktree_path"
}

alloy_runtime_instructions_path() {
  local name="$1"
  printf '%s/instructions/%s.md' "$ALLOY_RUNTIME_ROOT" "$name"
}

alloy_ensure_agent_runtime_dirs() {
  alloy_ensure_runtime_dirs
  mkdir -p "${ALLOY_RUNTIME_ROOT}/instructions"
}

alloy_server_state_for() {
  local name="$1"
  local path="$ALLOY_WORKTREE_PATH"
  local port="$PORT"
  local pid_path pid listener

  if [[ ! -d "$path" ]]; then
    printf 'missing-worktree'
    return
  fi

  pid_path="$(alloy_pid_path "$name")"
  if [[ -f "$pid_path" ]]; then
    pid="$(alloy_read_pid_file "$pid_path" || true)"
    if [[ -n "${pid:-}" ]] && alloy_pid_alive "$pid"; then
      if alloy_pid_belongs_to_worktree "$pid" "$path"; then
        printf 'running'
        return
      fi
      printf 'stale'
      return
    fi
  fi

  if listener="$(alloy_port_listener_pid "$port" 2>/dev/null)"; then
    if alloy_pid_belongs_to_worktree "$listener" "$path"; then
      printf 'running'
      return
    fi
    printf 'foreign-port-owner'
    return
  fi

  if [[ -f "$pid_path" ]]; then
    pid="$(alloy_read_pid_file "$pid_path" || true)"
    if [[ -n "${pid:-}" ]] && ! alloy_pid_alive "$pid"; then
      printf 'stale'
      return
    fi
  fi

  printf 'stopped'
}

alloy_git_state_summary() {
  local path="$1"
  local branch dirty ahead behind base_ref status_line

  if [[ ! -d "$path" ]]; then
    printf 'path-missing'
    return
  fi

  branch="$(alloy_current_branch "$path" 2>/dev/null || echo "?")"
  if alloy_worktree_is_dirty "$path"; then
    dirty="dirty"
  else
    dirty="clean"
  fi

  base_ref="$(alloy_base_ref)"
  ahead="$(alloy_git "$path" rev-list --count "${base_ref}..HEAD" 2>/dev/null || echo "?")"
  behind="$(alloy_git "$path" rev-list --count "HEAD..${base_ref}" 2>/dev/null || echo "?")"
  status_line="$(alloy_git "$path" status --porcelain 2>/dev/null | grep -vE '^\?\? \.env\.local\.agent$|^\?\? \.alloy-agent-instructions\.md$' | wc -l | tr -d ' ')"

  printf 'branch=%s dirty=%s ahead=%s behind=%s changed=%s' \
    "$branch" "$dirty" "$ahead" "$behind" "$status_line"
}

alloy_print_git_summary_detail() {
  local path="$1"
  local branch
  branch="$(alloy_current_branch "$path" 2>/dev/null || echo "?")"

  echo "Git summary"
  echo "  path:    $path"
  echo "  branch:  $branch"
  if alloy_worktree_is_dirty "$path"; then
    echo "  tree:    dirty"
  else
    echo "  tree:    clean"
  fi
  echo "  vs $(alloy_base_ref):"
  echo "    ahead:  $(alloy_git "$path" rev-list --count "$(alloy_base_ref)..HEAD" 2>/dev/null || echo "?")"
  echo "    behind: $(alloy_git "$path" rev-list --count "HEAD..$(alloy_base_ref)" 2>/dev/null || echo "?")"
  echo "  status:"
  local porcelain
  porcelain="$(alloy_git "$path" status --short 2>/dev/null || true)"
  if [[ -n "$porcelain" ]]; then
    printf '%s\n' "$porcelain" | sed 's/^/    /'
  else
    echo "    (clean)"
  fi
  echo "  recent commits:"
  alloy_git "$path" log -5 --oneline 2>/dev/null | sed 's/^/    /' || echo "    (none)"
}

alloy_augment_metadata_agent_fields() {
  local name="$1"
  local role="$2"
  local status="$3"
  local instructions="$4"
  local meta path_meta
  path_meta="$(alloy_metadata_path "$name")"
  [[ -f "$path_meta" ]] || alloy_die "metadata missing for $name"

  # shellcheck disable=SC1090
  source "$path_meta"

  alloy_write_kv_file "$path_meta" \
    "ALLOY_WORKTREE_NAME=\"${ALLOY_WORKTREE_NAME}\"" \
    "ALLOY_WORKTREE_SLOT=\"${ALLOY_WORKTREE_SLOT}\"" \
    "ALLOY_WORKTREE_PATH=\"${ALLOY_WORKTREE_PATH}\"" \
    "ALLOY_WORKTREE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
    "ALLOY_AGENT=\"${ALLOY_AGENT}\"" \
    "PORT=\"${PORT}\"" \
    "NEXT_PUBLIC_APP_URL=\"${NEXT_PUBLIC_APP_URL}\"" \
    "ALLOY_CREATED_AT=\"${ALLOY_CREATED_AT:-$(alloy_iso_now)}\"" \
    "ALLOY_AGENT_ROLE=\"${role}\"" \
    "ALLOY_AGENT_STATUS=\"${status}\"" \
    "ALLOY_AGENT_INSTRUCTIONS=\"${instructions}\"" \
    "ALLOY_AGENT_OPENED_AT=\"${ALLOY_AGENT_OPENED_AT:-}\"" \
    "ALLOY_AGENT_CLOSED_AT=\"${ALLOY_AGENT_CLOSED_AT:-}\""
}

alloy_set_agent_status() {
  local name="$1"
  local status="$2"
  local path_meta now
  path_meta="$(alloy_metadata_path "$name")"
  [[ -f "$path_meta" ]] || alloy_die "metadata missing for $name"
  # shellcheck disable=SC1090
  source "$path_meta"
  now="$(alloy_iso_now)"

  local opened="${ALLOY_AGENT_OPENED_AT:-}"
  local closed="${ALLOY_AGENT_CLOSED_AT:-}"
  case "$status" in
    active)
      opened="$now"
      closed=""
      ;;
    closed)
      closed="$now"
      ;;
  esac

  alloy_write_kv_file "$path_meta" \
    "ALLOY_WORKTREE_NAME=\"${ALLOY_WORKTREE_NAME}\"" \
    "ALLOY_WORKTREE_SLOT=\"${ALLOY_WORKTREE_SLOT}\"" \
    "ALLOY_WORKTREE_PATH=\"${ALLOY_WORKTREE_PATH}\"" \
    "ALLOY_WORKTREE_BRANCH=\"${ALLOY_WORKTREE_BRANCH}\"" \
    "ALLOY_AGENT=\"${ALLOY_AGENT}\"" \
    "PORT=\"${PORT}\"" \
    "NEXT_PUBLIC_APP_URL=\"${NEXT_PUBLIC_APP_URL}\"" \
    "ALLOY_CREATED_AT=\"${ALLOY_CREATED_AT:-}\"" \
    "ALLOY_AGENT_ROLE=\"${ALLOY_AGENT_ROLE:-$(alloy_slot_role "$ALLOY_WORKTREE_SLOT")}\"" \
    "ALLOY_AGENT_STATUS=\"${status}\"" \
    "ALLOY_AGENT_INSTRUCTIONS=\"${ALLOY_AGENT_INSTRUCTIONS:-$(alloy_instructions_path "$ALLOY_WORKTREE_PATH")}\"" \
    "ALLOY_AGENT_OPENED_AT=\"${opened}\"" \
    "ALLOY_AGENT_CLOSED_AT=\"${closed}\""
}

alloy_generate_agent_instructions() {
  local name="$1"
  # Requires metadata globals loaded.
  local slot="$ALLOY_WORKTREE_SLOT"
  local agent="$ALLOY_AGENT"
  local role="${ALLOY_AGENT_ROLE:-$(alloy_slot_role "$slot")}"
  local path="$ALLOY_WORKTREE_PATH"
  local branch="$ALLOY_WORKTREE_BRANCH"
  local port="$PORT"
  local url="${NEXT_PUBLIC_APP_URL:-http://localhost:${port}}"
  local out_wt out_rt tool_line

  out_wt="$(alloy_instructions_path "$path")"
  out_rt="$(alloy_runtime_instructions_path "$name")"
  mkdir -p "$(dirname "$out_rt")"

  case "$agent" in
    cursor) tool_line="You are a Cursor implementation agent." ;;
    claude) tool_line="You are a Claude architecture/implementation agent." ;;
    *) tool_line="You are an Alloy local development agent." ;;
  esac

  cat >"$out_wt" <<EOF
# Alloy agent instructions — ${name}

${tool_line}

## Assignment

| Field | Value |
|-------|-------|
| Slot | ${slot} (permanent identity) |
| Role | ${role} |
| Agent | ${agent} |
| Worktree | ${name} |
| Path | ${path} |
| Branch | ${branch} |
| Port | ${port} |
| URL | ${url} |

## Concrete startup

\`\`\`bash
cd ${path}
pwd
git branch --show-current
git status --short
\`\`\`

Expected:
- cwd: \`${path}\`
- branch: \`${branch}\`
- port for any local app server: \`${port}\` (never invent another)

## Hard constraints

- Work ONLY in \`${path}\`. Do not edit other worktrees or the canonical checkout unless explicitly told.
- Use ONLY branch \`${branch}\`.
- Use ONLY port \`${port}\` / \`${url}\`.
- Do NOT push.
- Do NOT merge.
- Do NOT delete branches.
- Do NOT remove worktrees.
- Do NOT stash/reset/clean user work.
- Commit coherent changes locally when asked / appropriate.
- Prefer focused checks (single-file Vitest, lint of touched files).
- Heavy checks only via: \`alloy-validate ${name} typecheck|test|build|playwright|imports\`
- Do NOT background heavy checks.
- Do NOT start a second dev server. Use \`alloy-dev-start ${name}\` / \`alloy-dev-stop ${name}\` only — **never** \`npm run dev\` directly (two-tier env: agent-safe \`web/.env.local.agent\` + trusted server injection; privileged values never enter the worktree).
- Ensure \`npm install\` has been run in **this** worktree's \`web/\` — login/verify use that worktree-local Playwright only.
- Before finishing, report any processes left running.

## Operator shortcuts

\`\`\`bash
awt ${slot}                 # cd into this slot's worktree
devup                       # start this worktree's owned server (from inside it)
alloy-agent-prepare ${slot}
alloy-agent-login ${slot}
alloy-agent-ready ${slot}
alloy-agent-verify ${slot} authenticated-home
alloy-agent-context ${slot} --copy
alloy-agent-browser-stop ${slot}
alloy-agent-status
alloy-agent-close ${slot}   # stop server + git summary; never removes worktree
\`\`\`

## UI verification (required for user-visible changes)

- Use assigned localhost \`${url}\` only — never production.
- Use QA identity for slot ${slot} only (configure \`ALLOY_SLOT_${slot}_QA_IDENTITY\`).
- Perform real browser verification; never claim UI verified from code inspection alone.
- Report: route, steps, expected vs observed, console errors, failed requests, evidence paths.
- Focused checks: \`alloy-agent-verify ${slot} route /path\`
- Full Playwright: \`alloy-validate ${name} playwright\` only (serialized).
- Never expose cookies, tokens, or storage-state contents.
- Stop temporary browsers: \`alloy-agent-browser-stop ${slot}\`

## Role focus (${role})

Stay in the lane of slot ${slot}: **${role}**.
Ask before expanding into another slot's specialty.
EOF

  cp "$out_wt" "$out_rt"

  # Ignore instructions file in git (same pattern as .env.local.agent).
  local git_dir common_dir exclude_file
  git_dir="$(alloy_git "$path" rev-parse --git-dir)"
  common_dir="$(alloy_git "$path" rev-parse --git-common-dir)"
  mkdir -p "${git_dir}/info" "${common_dir}/info"
  for exclude_file in "${git_dir}/info/exclude" "${common_dir}/info/exclude"; do
    if ! grep -Fq '.alloy-agent-instructions.md' "$exclude_file" 2>/dev/null; then
      printf '%s\n' '.alloy-agent-instructions.md' >>"$exclude_file"
    fi
  done

  printf '%s\n' "$out_wt"
}

alloy_open_tool_for_agent() {
  local agent="$1"
  local path="$2"

  if [[ "${ALLOY_AGENT_OPEN_DRY_RUN:-0}" == "1" ]]; then
    alloy_info "[dry-run] would open ${agent} on ${path}"
    return 0
  fi

  case "$agent" in
    cursor)
      if alloy_have_cmd cursor; then
        cursor "$path" >/dev/null 2>&1 &
        return 0
      fi
      if alloy_have_cmd code; then
        code "$path" >/dev/null 2>&1 &
        return 0
      fi
      if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Cursor.app" ]]; then
        open -a "Cursor" "$path"
        return 0
      fi
      alloy_warn "Cursor CLI not found. Open this folder manually in Cursor:"
      alloy_info "  ${path}"
      return 0
      ;;
    claude)
      if alloy_have_cmd claude; then
        (
          cd "$path"
          nohup claude >/dev/null 2>&1 &
        )
        return 0
      fi
      if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Claude.app" ]]; then
        open -a "Claude" "$path"
        return 0
      fi
      alloy_warn "Claude CLI not found. Open this folder manually in Claude Desktop:"
      alloy_info "  ${path}"
      return 0
      ;;
    *)
      alloy_die "unsupported agent for open: $agent"
      ;;
  esac
}

# Count processes whose command line matches a regex. Always prints one integer
# (including 0). Safe under `set -o pipefail` when grep finds no matches —
# callers must not append a second `|| echo 0`.
alloy_count_matching_processes() {
  local pattern="$1"
  local count=0
  local line cmd

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    cmd="${line#* }"
    # Never count the AI-health inspection process itself.
    case "$cmd" in
      *alloy-ai-health*|*alloy_count_matching_processes*)
        continue
        ;;
    esac
    if printf '%s\n' "$cmd" | grep -Eq "$pattern"; then
      count=$((count + 1))
    fi
  done < <(ps axo pid=,command= 2>/dev/null || true)

  printf '%s' "$count"
}

# Count only argument-aware Playwright test runners (see common.sh classifier).
alloy_count_playwright_test_runners() {
  local count=0
  local line cmd

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    cmd="${line#* }"
    if alloy_command_is_playwright_test_runner "$cmd"; then
      count=$((count + 1))
    fi
  done < <(ps axo pid=,command= 2>/dev/null || true)

  printf '%s' "$count"
}

alloy_copy_to_clipboard() {
  local text="$1"
  if alloy_have_cmd pbcopy; then
    printf '%s' "$text" | pbcopy
    return 0
  fi
  if alloy_have_cmd xclip; then
    printf '%s' "$text" | xclip -selection clipboard
    return 0
  fi
  alloy_die "--copy requires pbcopy (macOS) or xclip"
}
