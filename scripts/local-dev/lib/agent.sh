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

# BEING IN THE RIGHT DIRECTORY IS NOT BEING THE RIGHT PROCESS.
#
# THE DEFECT THIS CLOSES. Port 3013 — the Communications slot — was held for
# more than seventeen hours by
#
#   node -e require("http").createServer((q,s)=>{s.end("ok")}).listen(...)
#
# a PPID-1 test fixture that answers "ok" to everything. It was started with its
# cwd inside the lane's worktree, so `alloy_pid_belongs_to_worktree` said yes on
# the cwd test alone, `alloy_server_state_for` returned `running`, the 3-server
# limit counted it, and a real lane was refused a dev server because a dead
# fixture held the slot. Any naive health probe would have read HTTP 200 and
# agreed the lane's server was up.
#
# Location was being accepted as identity. A toolkit-owned dev server is started
# through `alloy-dev-start`, which runs the package script — so the process, or
# something in its subtree, must actually LOOK like a Next dev server. This is
# deliberately a shape test and not a version test: it must keep passing when
# Next changes, and must keep failing for anything that merely listens.
alloy_process_is_dev_server() {
  local pid="$1"
  local cmd child
  [[ -n "$pid" ]] || return 1
  cmd="$(alloy_process_command "$pid" 2>/dev/null || true)"
  case "$cmd" in
    *"npm run dev"*|*"next dev"*|*next-server*|*"node_modules/.bin/next"*) return 0 ;;
  esac
  # The recorded PID is usually the npm wrapper; the server itself is a child.
  # One generation of descent is enough and keeps this cheap.
  while read -r child; do
    [[ -n "$child" ]] || continue
    cmd="$(alloy_process_command "$child" 2>/dev/null || true)"
    case "$cmd" in
      *"next dev"*|*next-server*|*"node_modules/.bin/next"*) return 0 ;;
    esac
    local grandchild
    while read -r grandchild; do
      [[ -n "$grandchild" ]] || continue
      cmd="$(alloy_process_command "$grandchild" 2>/dev/null || true)"
      case "$cmd" in
        *"next dev"*|*next-server*|*"node_modules/.bin/next"*) return 0 ;;
      esac
    done < <(pgrep -P "$child" 2>/dev/null || true)
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  return 1
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
        # OWNERSHIP AND IDENTITY, NOT OWNERSHIP ALONE.
        if alloy_process_is_dev_server "$pid"; then
          printf 'running'
        else
          # Recorded, alive, in the right worktree — and not a dev server. It
          # holds the slot and answers the port; it is not this lane's server.
          printf 'unattributable-owner'
        fi
        return
      fi
      printf 'stale'
      return
    fi
  fi

  if listener="$(alloy_port_listener_pid "$port" 2>/dev/null)"; then
    if alloy_pid_belongs_to_worktree "$listener" "$path"; then
      if alloy_process_is_dev_server "$listener"; then
        printf 'running'
      else
        printf 'unattributable-owner'
      fi
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
    "ALLOY_AGENT_CLOSED_AT=\"${ALLOY_AGENT_CLOSED_AT:-}\"" \
    ${ALLOY_SPRINT_NAME:+ALLOY_SPRINT_NAME=\"${ALLOY_SPRINT_NAME}\"} \
    ${ALLOY_SPRINT_OBJECTIVE:+ALLOY_SPRINT_OBJECTIVE=\"${ALLOY_SPRINT_OBJECTIVE}\"} \
    ${ALLOY_WORKER_LIFECYCLE:+ALLOY_WORKER_LIFECYCLE=\"${ALLOY_WORKER_LIFECYCLE}\"} \
    ${ALLOY_PROVIDER_SESSION_ID:+ALLOY_PROVIDER_SESSION_ID=\"${ALLOY_PROVIDER_SESSION_ID}\"} \
    ${ALLOY_PAUSE_RECORDED_AT:+ALLOY_PAUSE_RECORDED_AT=\"${ALLOY_PAUSE_RECORDED_AT}\"} \
    ${ALLOY_FINISHED_AT:+ALLOY_FINISHED_AT=\"${ALLOY_FINISHED_AT}\"}
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
    "ALLOY_AGENT_CLOSED_AT=\"${closed}\"" \
    ${ALLOY_SPRINT_NAME:+ALLOY_SPRINT_NAME=\"${ALLOY_SPRINT_NAME}\"} \
    ${ALLOY_SPRINT_OBJECTIVE:+ALLOY_SPRINT_OBJECTIVE=\"${ALLOY_SPRINT_OBJECTIVE}\"} \
    ${ALLOY_WORKER_LIFECYCLE:+ALLOY_WORKER_LIFECYCLE=\"${ALLOY_WORKER_LIFECYCLE}\"} \
    ${ALLOY_PROVIDER_SESSION_ID:+ALLOY_PROVIDER_SESSION_ID=\"${ALLOY_PROVIDER_SESSION_ID}\"} \
    ${ALLOY_PAUSE_RECORDED_AT:+ALLOY_PAUSE_RECORDED_AT=\"${ALLOY_PAUSE_RECORDED_AT}\"} \
    ${ALLOY_FINISHED_AT:+ALLOY_FINISHED_AT=\"${ALLOY_FINISHED_AT}\"}
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

- Read \`docs/platform/governance/managed-sprint-operations.md\` for the full sprint contract.
- Work ONLY in \`${path}\`. Do not edit other worktrees or the canonical checkout unless explicitly told.
- Use ONLY branch \`${branch}\`.
- Use ONLY port \`${port}\` / \`${url}\`.
- Do NOT push.
- Do NOT merge.
- Do NOT rebase onto staging unless Kelly explicitly authorizes promotion sync.
- Do NOT delete branches.
- Do NOT remove worktrees.
- Do NOT stash/reset/clean user work.
- “Commit” never implies “push.” Commit coherent changes locally when asked / appropriate (multiple local commits expected).
- Prefer focused checks (single-file Vitest, lint of touched files).
- Heavy checks ONLY via package scripts (brokered) or vac:
  - \`cd web && npm run typecheck|typecheck:tests|build|test\`
  - \`vac run typecheck|typecheck:tests|build|test|playwright|imports\`
  - \`alloy-validate ${name} <kind>\`
  These take a host-wide validation lease — do NOT run raw \`tsc\` / \`next build\` / full \`vitest run\`.
- Focused Vitest stays unlocked: \`npx vitest run path/to/file.test.ts\`
- Do NOT background heavy checks.
- Check lease/queue: \`vac status\`
- Do NOT start a second dev server. Use \`alloy-dev-start ${name}\` / \`alloy-dev-stop ${name}\` only — **never** \`npm run dev\` directly (two-tier env: agent-safe \`web/.env.local.agent\` + trusted server injection; privileged values never enter the worktree).
- Ensure \`npm install\` has been run in **this** worktree's \`web/\` — login/verify use that worktree-local Playwright only.
- Overnight: \`alloy-worker-pause ${slot}\`. Morning: \`alloy-worker-resume ${slot}\`. Finish: \`alloy-sprint-finish ${slot}\`.
- Before finishing, report any processes left running.
- **Local Docker / supabase db reset (mandatory toolkit path):**
  - Never invent Docker Desktop force-kill / relaunch loops.
  - Never hammer raw \`supabase db reset\` when you see 502 / Bad Gateway / hung \`docker info\`.
  - Diagnose: \`alloy-docker-doctor\`
  - Recover: \`alloy-docker-doctor --recover\` (add \`--force\` only if still wedged after quit).
  - Reset local disposable DB: \`alloy-db-reset --recover-docker\` (retries transient 502s; uses \`--debug\` on the last attempt).
  - Refuse hosted/production resets — the toolkit fails closed.

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

  # Inject the canonical Worker Operating Policy (forward progress + command budgets).
  # ONE source, shared with the mission-runtime TURN PROTOCOL, so every managed slot
  # worker — Claude or Cursor, Director-started or opened directly — is governed the
  # same way: it owns forward progress and never ends a turn on "still running".
  local policy_file="${ALLOY_LOCAL_DEV_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/vacilando/worker-operating-policy.md"
  if [[ -f "$policy_file" ]]; then
    printf '\n' >>"$out_wt"
    cat "$policy_file" >>"$out_wt"
  fi

  cp "$out_wt" "$out_rt"

  # Auto-DELIVER the instructions (incl. Worker Operating Policy) to a freshly opened
  # worker, and GUARD against a passive-wait turn-end. A directly-opened Claude loads
  # CLAUDE.md but NOT .alloy-agent-instructions.md — so without this it never receives
  # the policy (a file on disk is not consumption). A SessionStart hook injects the
  # instructions as context; a Stop hook refuses a turn that ends on "still running".
  # Both are thin wrappers over the tested command-budget.mjs; idempotent; any hooks the
  # operator authored themselves in .claude/settings.local.json are preserved.
  local cb_path settings_dir settings_file
  cb_path="${path}/scripts/local-dev/lib/vacilando/command-budget.mjs"
  settings_dir="${path}/.claude"
  settings_file="${settings_dir}/settings.local.json"
  if [[ -f "$cb_path" ]] && alloy_have_cmd node; then
    mkdir -p "$settings_dir"
    ALLOY_HOOK_CB="$cb_path" ALLOY_HOOK_INSTR="$out_wt" ALLOY_HOOK_SETTINGS="$settings_file" node - <<'NODE'
const fs = require('fs');
const cb = process.env.ALLOY_HOOK_CB, instr = process.env.ALLOY_HOOK_INSTR, file = process.env.ALLOY_HOOK_SETTINGS;
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
s.hooks = (s.hooks && typeof s.hooks === 'object' && !Array.isArray(s.hooks)) ? s.hooks : {};
const sessionCmd = `node ${JSON.stringify(cb)} session-start ${JSON.stringify(instr)}`;
const stopCmd = `node ${JSON.stringify(cb)} stop-guard`;
const isAlloyGroup = (g) => g && Array.isArray(g.hooks) && g.hooks.some(h => h && typeof h.command === 'string' && h.command.includes('command-budget.mjs'));
const ensure = (event, command) => {
  const arr = Array.isArray(s.hooks[event]) ? s.hooks[event] : [];
  const kept = arr.filter(g => !isAlloyGroup(g)); // idempotent: replace our hook, keep the operator's
  kept.push({ hooks: [{ type: 'command', command }] });
  s.hooks[event] = kept;
};
ensure('SessionStart', sessionCmd);
ensure('Stop', stopCmd);
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
NODE
  fi

  # Cursor delivery: a directly-opened Cursor worker loads .cursor/rules/*.mdc — not
  # .alloy-agent-instructions.md — so without this it never receives the policy either.
  # Render the SAME canonical policy into an always-applied Cursor rule (generated, not a
  # committed duplicate: ONE source of truth in worker-operating-policy.md). Cursor has no
  # governed-runner/Stop-hook equivalent, so this is DELIVERY parity, not runtime enforcement.
  if [[ -f "$policy_file" ]]; then
    local cursor_rules_dir cursor_rule
    cursor_rules_dir="${path}/.cursor/rules"
    cursor_rule="${cursor_rules_dir}/worker-operating-policy.mdc"
    mkdir -p "$cursor_rules_dir"
    {
      printf -- '---\n'
      printf 'description: Worker Operating Policy — forward progress + command budgets (auto-generated from scripts/local-dev/lib/vacilando/worker-operating-policy.md; do not edit here)\n'
      printf 'alwaysApply: true\n'
      printf -- '---\n\n'
      cat "$policy_file"
    } >"$cursor_rule"
  fi

  # Ignore instructions file + generated local settings/rules in git (same pattern as .env.local.agent).
  local git_dir common_dir exclude_file ignore_entry
  git_dir="$(alloy_git "$path" rev-parse --git-dir)"
  common_dir="$(alloy_git "$path" rev-parse --git-common-dir)"
  mkdir -p "${git_dir}/info" "${common_dir}/info"
  for exclude_file in "${git_dir}/info/exclude" "${common_dir}/info/exclude"; do
    for ignore_entry in '.alloy-agent-instructions.md' '.claude/settings.local.json' '.cursor/rules/worker-operating-policy.mdc'; do
      if ! grep -Fq "$ignore_entry" "$exclude_file" 2>/dev/null; then
        printf '%s\n' "$ignore_entry" >>"$exclude_file"
      fi
    done
  done

  printf '%s\n' "$out_wt"
}

alloy_open_tool_for_agent() {
  local agent="$1"
  local path="$2"

  if [[ -n "${ALLOY_CERTIFY_APP_LAUNCH_LOG:-}" ]]; then
    printf 'OPEN %s %s\n' "$agent" "$path" >>"$ALLOY_CERTIFY_APP_LAUNCH_LOG"
    return 0
  fi

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
  if [[ -n "${ALLOY_CERTIFY_CLIPBOARD_FILE:-}" ]]; then
    printf '%s' "$text" >"$ALLOY_CERTIFY_CLIPBOARD_FILE"
    return 0
  fi
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
