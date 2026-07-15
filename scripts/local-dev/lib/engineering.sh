#!/usr/bin/env bash
# Alloy Engineering V1 — initiative lifecycle over Phase 1–3 local-dev toolkit.
# shellcheck shell=bash

ALLOY_ENGINEERING_IO="${ALLOY_LOCAL_DEV_ROOT}/lib/engineering-io.mjs"

alloy_engineering_require_node() {
  alloy_require_cmd node
  [[ -f "$ALLOY_ENGINEERING_IO" ]] || alloy_die "missing engineering-io.mjs"
}

alloy_engineering_io() {
  alloy_engineering_require_node
  node "$ALLOY_ENGINEERING_IO" "$@"
}

alloy_initiatives_root() {
  if [[ -n "${ALLOY_INITIATIVE_ROOT:-}" ]]; then
    printf '%s' "$ALLOY_INITIATIVE_ROOT"
    return
  fi
  if [[ -n "${ALLOY_INITIATIVES_DIR:-}" ]]; then
    printf '%s' "$ALLOY_INITIATIVES_DIR"
    return
  fi
  printf '%s/initiatives' "${ALLOY_RUNTIME_ROOT:-$(alloy_default_runtime_root)}"
}

alloy_engineering_certify_enabled() {
  [[ "${ALLOY_ENGINEERING_CERTIFY:-0}" == "1" ]]
}

# Shared env for certification nested production commands.
alloy_engineering_certify_env() {
  # shellcheck disable=SC2030
  env \
    ALLOY_CONFIG_FILE="${ALLOY_CONFIG_FILE}" \
    ALLOY_RUNTIME_ROOT="${ALLOY_RUNTIME_ROOT}" \
    ALLOY_METADATA_DIR="${ALLOY_METADATA_DIR}" \
    ALLOY_PIDS_DIR="${ALLOY_PIDS_DIR}" \
    ALLOY_LOGS_DIR="${ALLOY_LOGS_DIR}" \
    ALLOY_LOCKS_DIR="${ALLOY_LOCKS_DIR}" \
    ALLOY_INITIATIVE_ROOT="${ALLOY_INITIATIVE_ROOT:-}" \
    ALLOY_ENGINEERING_CERTIFY="${ALLOY_ENGINEERING_CERTIFY:-0}" \
    ALLOY_PRODUCT_CERTIFY="${ALLOY_PRODUCT_CERTIFY:-0}" \
    ALLOY_TEST_FIXTURE="${ALLOY_TEST_FIXTURE:-0}" \
    ALLOY_FIRST_AGENT_PORT="${ALLOY_FIRST_AGENT_PORT}" \
    ALLOY_AGENT_OPEN_DRY_RUN="${ALLOY_AGENT_OPEN_DRY_RUN:-0}" \
    ALLOY_CERTIFY_CLIPBOARD_FILE="${ALLOY_CERTIFY_CLIPBOARD_FILE:-}" \
    ALLOY_CERTIFY_APP_LAUNCH_LOG="${ALLOY_CERTIFY_APP_LAUNCH_LOG:-}" \
    "$@"
}

# Certification-only: bind fixture git repo + metadata as managed workers (no alloy-agent-create).
alloy_engineering_certify_fixture_bind() {
  local key="$1"
  local fixture_repo="$2"
  alloy_engineering_certify_enabled || alloy_die "certify fixture bind requires ALLOY_ENGINEERING_CERTIFY=1"

  alloy_resolve_runtime_paths "${ALLOY_RUNTIME_ROOT:-}"
  local prod_root meta_path
  prod_root="$(alloy_default_runtime_root)"
  if [[ "$ALLOY_RUNTIME_ROOT" == "$prod_root" ]] || [[ "$ALLOY_METADATA_DIR" == "${prod_root}/metadata" ]]; then
    alloy_die "certify fixture bind refused: ALLOY_RUNTIME_ROOT resolves to production ($ALLOY_RUNTIME_ROOT)"
  fi
  if ! alloy_runtime_is_fixture; then
    alloy_die "certify fixture bind refused: runtime root is not a fixture tree ($ALLOY_RUNTIME_ROOT)"
  fi

  [[ -d "$fixture_repo/.git" || -f "$fixture_repo/.git" ]] || alloy_die "fixture repo missing: $fixture_repo"
  alloy_ensure_runtime_dirs

  local base worker_plan staging_sha assignments count i
  base="$(alloy_initiative_dir "$key")"
  worker_plan="$base/plan/worker-plan.yaml"
  [[ -f "$worker_plan" ]] || alloy_die "worker plan missing"
  staging_sha="$(alloy_staging_sha)"

  assignments="$(node -e "
    const fs = require('fs');
    const yaml = fs.readFileSync('${worker_plan}','utf8');
    const lines = yaml.split('\\n');
    let cur = null; const out = [];
    for (const line of lines) {
      const m = line.match(/^  - task_id: (.+)$/);
      if (m) {
        if (cur) out.push(cur);
        cur = { task_id: m[1].trim().replace(/^['\"]|['\"]$/g, '') };
        continue;
      }
      if (!cur) continue;
      const s = line.match(/^    (?:selected_slot|slot): (\\d+)/); if (s) cur.slot = +s[1];
      const a = line.match(/^    agent: (\\S+)/); if (a) cur.agent = a[1].replace(/^['\"]|['\"]$/g, '');
      const r = line.match(/^    role: \"(.+)\"/); if (r) cur.role = r[1];
    }
    if (cur) out.push(cur);
    console.log(JSON.stringify(out));
  ")"

  count="$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$assignments")"
  i=0
  while [[ $i -lt $count ]]; do
    local task_id slot agent role name branch port
    task_id="$(node -e "console.log(JSON.parse(process.argv[1])[process.argv[2]].task_id)" "$assignments" "$i")"
    slot="$(node -e "console.log(JSON.parse(process.argv[1])[process.argv[2]].slot)" "$assignments" "$i")"
    agent="$(node -e "const a=JSON.parse(process.argv[1])[process.argv[2]]; console.log(a.agent||'cursor')" "$assignments" "$i")"
    role="$(node -e "const a=JSON.parse(process.argv[1])[process.argv[2]]; console.log(a.role||'Product implementation')" "$assignments" "$i")"
    name="cert-${key}-slot${slot}"
    branch="$(alloy_branch_name "$agent" "$slot" "${key}-cert")"
    port="$(alloy_slot_to_port "$slot")"

    meta_path="$(alloy_metadata_path "$name")"
    case "$meta_path" in
      "${prod_root}/metadata"/*)
        alloy_die "certify fixture bind refused: metadata path is production ($meta_path)"
        ;;
    esac
    case "$meta_path" in
      "${ALLOY_METADATA_DIR}"/*) ;;
      *)
        alloy_die "certify fixture bind refused: metadata path outside fixture metadata dir ($meta_path)"
        ;;
    esac

    alloy_write_kv_file "$meta_path" \
      "ALLOY_WORKTREE_NAME=\"$name\"" \
      "ALLOY_WORKTREE_SLOT=\"$slot\"" \
      "ALLOY_WORKTREE_PATH=\"$fixture_repo\"" \
      "ALLOY_WORKTREE_BRANCH=\"$branch\"" \
      "ALLOY_AGENT=\"$agent\"" \
      "PORT=\"$port\"" \
      "NEXT_PUBLIC_APP_URL=\"http://localhost:${port}\"" \
      "ALLOY_CREATED_AT=\"$(alloy_iso_now)\"" \
      "ALLOY_AGENT_ROLE=\"$role\"" \
      "ALLOY_AGENT_STATUS=\"active\"" \
      "ALLOY_AGENT_INSTRUCTIONS=\"\"" \
      "ALLOY_CERT_FIXTURE=\"1\""

    alloy_engineering_set_worker_assignment "$key" "$task_id" "$slot" \
      "$name" "$branch" "$fixture_repo" "$port" "$agent" "$role" "$staging_sha"

    alloy_engineering_certify_env \
      "${ALLOY_LOCAL_DEV_ROOT}/alloy-worker-package" "$key" "$task_id"

    alloy_engineering_update_task_status "$key" "$task_id" "assigned"
    i=$((i + 1))
  done

  local state
  state="$(alloy_initiative_current_state "$key")"
  if [[ "$state" == "assigning" || "$state" == "approved" ]]; then
    alloy_initiative_transition "$key" "implementing" 2>/dev/null || true
  fi
}

alloy_initiative_dir() {
  local key="$1"
  printf '%s/%s' "$(alloy_initiatives_root)" "$key"
}

alloy_initiative_key_valid() {
  local key="$1"
  [[ "$key" =~ ^[a-z0-9]+([_-][a-z0-9]+)*$ ]]
}

alloy_initiative_exists() {
  local key="$1"
  [[ -f "$(alloy_initiative_dir "$key")/state.json" ]]
}

alloy_initiative_lock_dir() {
  local key="$1"
  printf '%s/locks/initiative-%s.lock' "${ALLOY_RUNTIME_ROOT}" "$key"
}

alloy_initiative_acquire_lock() {
  local key="$1"
  local lock_dir poll
  lock_dir="$(alloy_initiative_lock_dir "$key")"
  poll="${ALLOY_INITIATIVE_LOCK_POLL_SECONDS:-2}"
  alloy_ensure_runtime_dirs
  mkdir -p "${ALLOY_RUNTIME_ROOT}/locks"
  while true; do
    if mkdir "$lock_dir" 2>/dev/null; then
      # shellcheck disable=SC2064
      trap 'rmdir "'"$lock_dir"'" 2>/dev/null || true' EXIT INT TERM HUP
      return 0
    fi
    alloy_info "initiative lock held for ${key}; waiting ${poll}s..."
    sleep "$poll" || exit 130
  done
}

alloy_initiative_release_lock() {
  local key="$1"
  rmdir "$(alloy_initiative_lock_dir "$key")" 2>/dev/null || true
}

alloy_yaml_to_json() {
  local yaml_path="$1"
  local json_path="$2"
  if alloy_have_cmd ruby; then
    ruby -ryaml -rjson -e '
      data = YAML.load_file(ARGV[0])
      File.write(ARGV[1], JSON.pretty_generate(data))
    ' "$yaml_path" "$json_path"
    return 0
  fi
  if alloy_have_cmd python3; then
    python3 - "$yaml_path" "$json_path" <<'PY'
import json, sys
try:
    import yaml
except ImportError:
    sys.stderr.write("error: PyYAML or ruby required for YAML intake\n")
    sys.exit(1)
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
with open(sys.argv[2], "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
    return 0
  fi
  alloy_die "YAML intake requires ruby or python3 with PyYAML"
}

alloy_initiative_read_state_field() {
  local key="$1"
  local field="$2"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  [[ -f "$state_path" ]] || alloy_die "initiative not found: $key"
  alloy_engineering_io read-json-field "$state_path" "$field"
}

alloy_initiative_current_state() {
  alloy_initiative_read_state_field "$1" "state"
}

alloy_initiative_transition() {
  local key="$1"
  local to="$2"
  local from state_path state_json
  from="$(alloy_initiative_current_state "$key")"
  alloy_engineering_io validate-transition "$from" "$to"
  state_path="$(alloy_initiative_dir "$key")/state.json"
  state_json="$(cat "$state_path")"
  state_json="$(printf '%s' "$state_json" | node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync(0,'utf8'));
    d.state = process.argv[1];
    d.updated_at = process.argv[2];
    process.stdout.write(JSON.stringify(d, null, 2) + '\n');
  " "$to" "$(alloy_iso_now)")"
  alloy_engineering_io write-json "$state_path" "$state_json"
}

alloy_initiative_init_dirs() {
  local key="$1"
  local base
  base="$(alloy_initiative_dir "$key")"
  mkdir -p \
    "$base/audit" \
    "$base/plan" \
    "$base/tasks" \
    "$base/worker-packages" \
    "$base/reports" \
    "$base/reviews" \
    "$base/remediation" \
    "$base/evidence" \
    "$base/final"
}

alloy_staging_sha() {
  alloy_verify_canonical_repo
  alloy_repo_fetch "$ALLOY_REPO" 2>/dev/null || true
  alloy_git "$ALLOY_REPO" rev-parse "$(alloy_base_ref)" 2>/dev/null \
    || alloy_die "cannot resolve $(alloy_base_ref)"
}

# Canonical platform docs for audit manifest (priority order).
alloy_engineering_canonical_docs() {
  cat <<'EOF'
docs/README.md
docs/platform/foundation/alloy-platform-handbook.md
docs/platform/foundation/system-overview.md
docs/platform/foundation/platform-capabilities.md
docs/platform/core/business-process-system.md
docs/platform/core/entity-model.md
docs/platform/core/record-system.md
docs/platform/core/status-and-state-system.md
docs/platform/operator/queue-system.md
docs/platform/operator/drawer-system.md
docs/platform/modules/documents-and-forms.md
docs/platform/modules/actions-and-workflows.md
docs/platform/modules/configuration-platform.md
docs/platform/governance/design-and-operational-doctrine.md
docs/platform/governance/documentation-governance.md
docs/platform/governance/agent-repo-boundaries.md
docs/system/adminv2-runtime-performance-doctrine.md
EOF
}

alloy_engineering_doc_exists_in_repo() {
  local rel="$1"
  [[ -f "${ALLOY_REPO}/${rel}" ]]
}

alloy_engineering_write_documentation_manifest() {
  local key="$1"
  local out known_docs intake_json manifest_path rel
  manifest_path="$(alloy_initiative_dir "$key")/audit/documentation-manifest.yaml"
  intake_json="$(alloy_initiative_dir "$key")/initiative.json"
  {
    printf 'generated_at: "%s"\n' "$(alloy_iso_now)"
    printf 'staging_sha: "%s"\n' "$(alloy_staging_sha)"
    printf 'priority_layers:\n'
    printf '  - constitutional_platform\n'
    printf '  - owner_doc\n'
    printf '  - module_operator\n'
    printf '  - implementation_references\n'
    printf 'canonical:\n'
    while IFS= read -r rel; do
      [[ -n "$rel" ]] || continue
      if alloy_engineering_doc_exists_in_repo "$rel"; then
        printf '  - path: "%s"\n    layer: constitutional_platform\n    status: present\n' "$rel"
      else
        printf '  - path: "%s"\n    layer: constitutional_platform\n    status: missing\n' "$rel"
      fi
    done < <(alloy_engineering_canonical_docs)
    if [[ -f "$intake_json" ]]; then
      printf 'initiative_known_docs:\n'
      node -e "
        const d = require('${intake_json}');
        const docs = d.known_docs || [];
        for (const p of docs) console.log('  - \"' + p.replace(/\"/g,'') + '\"');
      " 2>/dev/null || true
    fi
    printf 'conflicts: []\n'
    printf 'notes:\n'
    printf '  - Historical sprint docs must not override canonical platform doctrine.\n'
  } >"$manifest_path"
  printf '%s\n' "$manifest_path"
}

alloy_engineering_slot_for_role() {
  local role="$1"
  case "$role" in
    *Product*|*product*) printf '1' ;;
    *Architecture*|*doctrine*) printf '2' ;;
    *Performance*|*performance*) printf '3' ;;
    *UI*|*UX*|*ui*) printf '4' ;;
    *Refactor*|*infrastructure*) printf '5' ;;
    *Experimental*|*QA*) printf '6' ;;
    *) printf '1' ;;
  esac
}

alloy_engineering_worker_package_md_path() {
  local worktree_path="$1"
  printf '%s/.alloy-worker-package.md' "$worktree_path"
}

alloy_engineering_worker_task_yaml_path() {
  local worktree_path="$1"
  printf '%s/.alloy-worker-task.yaml' "$worktree_path"
}

alloy_engineering_copy_to_clipboard() {
  alloy_copy_to_clipboard "$1"
}

alloy_engineering_list_initiatives() {
  local root dir
  root="$(alloy_initiatives_root)"
  [[ -d "$root" ]] || return 0
  for dir in "$root"/*; do
    [[ -d "$dir" ]] || continue
    [[ -f "$dir/state.json" ]] || continue
    basename "$dir"
  done
}

alloy_engineering_human_decisions_count() {
  local key="$1"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const d = require('${state_path}');
    const q = (d.human_decisions || []).filter(x => x.status !== 'resolved');
    process.stdout.write(String(q.length));
  "
}

alloy_engineering_record_human_decision() {
  local key="$1"
  local question="$2"
  local why="$3"
  local options="$4"
  local recommendation="$5"
  local affected="$6"
  local parallel_ok="$7"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync('${state_path}','utf8'));
    d.human_decisions = d.human_decisions || [];
    d.human_decisions.push({
      id: 'decision-' + String(d.human_decisions.length + 1).padStart(3,'0'),
      question: process.argv[1],
      why_it_matters: process.argv[2],
      options: process.argv[3].split('|'),
      recommendation: process.argv[4],
      affected_tasks: process.argv[5].split(',').filter(Boolean),
      parallel_work_ok: process.argv[6] === 'true',
      status: 'open',
      created_at: process.argv[7]
    });
    d.updated_at = process.argv[7];
    fs.writeFileSync('${state_path}', JSON.stringify(d, null, 2) + '\n');
  " "$question" "$why" "$options" "$recommendation" "$affected" "$parallel_ok" "$(alloy_iso_now)"
}

alloy_engineering_task_path() {
  local key="$1"
  local task_id="$2"
  printf '%s/tasks/%s.yaml' "$(alloy_initiative_dir "$key")" "$task_id"
}

alloy_engineering_report_path() {
  local key="$1"
  local task_id="$2"
  printf '%s/reports/%s-result.json' "$(alloy_initiative_dir "$key")" "$task_id"
}

alloy_engineering_worker_initiative_field() {
  local key="$1"
  local field="$2"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const d = require('${state_path}');
    const w = d.workers || {};
    const v = w[process.argv[1]];
    if (!v) process.exit(2);
    if (typeof v[process.argv[2]] === 'undefined') process.exit(3);
    const val = v[process.argv[2]];
    if (typeof val === 'object') process.stdout.write(JSON.stringify(val));
    else process.stdout.write(String(val));
  " "$field" 2>/dev/null || return 1
}

alloy_engineering_set_worker_assignment() {
  local key="$1"
  local task_id="$2"
  local slot="$3"
  local worktree_name="$4"
  local branch="$5"
  local path="$6"
  local port="$7"
  local agent="$8"
  local role="$9"
  local base_sha="${10}"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync('${state_path}','utf8'));
    d.workers = d.workers || {};
    d.workers['${task_id}'] = {
      task_id: '${task_id}',
      slot: ${slot},
      worktree_name: '${worktree_name}',
      branch: '${branch}',
      path: '${path}',
      port: ${port},
      agent: '${agent}',
      role: '${role}',
      base_sha: '${base_sha}',
      assigned_at: process.argv[1]
    };
    d.updated_at = process.argv[1];
    fs.writeFileSync('${state_path}', JSON.stringify(d, null, 2) + '\n');
  " "$(alloy_iso_now)"
}

alloy_engineering_constitutional_truth() {
  cat <<'EOF'
- Scope tenant reads and writes by org_id.
- Prefer persons + customer_persons for human identity.
- Queues are preview/selection only — authoritative detail from entity GET / record responders.
- Configuration steers; code owns invariants.
- Fields have canonical owners.
- No direct Supabase service-role or privileged writes from client code.
- Do not bypass state machines, permissions, audit logs, or workflow events.
- AdminV2 runtime reveal gates are protected infrastructure — UI-only changes may not alter payload readiness or queue empty semantics.
EOF
}

alloy_engineering_forbidden_patterns_in_content() {
  local content="$1"
  # Reject content that looks like executable shell injection attempts in intake.
  if printf '%s' "$content" | grep -qE '(^|\n)\s*(bash|sh|zsh|curl|wget|rm -rf|sudo|eval)\s'; then
    return 0
  fi
  return 1
}

alloy_engineering_sanitize_text() {
  local text="$1"
  # Strip patterns that must never appear in packages (secrets).
  printf '%s' "$text" | sed -E \
    -e 's/(password|token|cookie|service.role|secret|private.key)[[:space:]]*[:=][[:space:]]*[^[:space:]]+/[REDACTED]/gi' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._-]+/Bearer [REDACTED]/g'
}

alloy_engineering_task_has_ui_work() {
  local task_yaml="$1"
  grep -qE 'ui_verification:|required:[[:space:]]*true' "$task_yaml" 2>/dev/null \
    && grep -q 'required: true' "$task_yaml" 2>/dev/null
}

alloy_engineering_open_worker_app() {
  local agent="$1"
  local path="$2"
  alloy_open_tool_for_agent "$agent" "$path"
}

alloy_engineering_validation_fingerprint_record() {
  local key="$1"
  local kind="$2"
  local commit="$3"
  local command="$4"
  local result="$5"
  local state_path fp_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const fs = require('fs');
    const crypto = require('crypto');
    const d = JSON.parse(fs.readFileSync('${state_path}','utf8'));
    d.validation = d.validation || { fingerprints: [] };
    const fp = crypto.createHash('sha256').update('${kind}|${commit}|${command}').digest('hex');
    const existing = d.validation.fingerprints.find(x => x.fingerprint === fp);
    if (!existing) {
      d.validation.fingerprints.push({
        fingerprint: fp,
        kind: '${kind}',
        commit: '${commit}',
        command: '${command}',
        result: '${result}',
        recorded_at: process.argv[1]
      });
      d.updated_at = process.argv[1];
      fs.writeFileSync('${state_path}', JSON.stringify(d, null, 2) + '\n');
      process.stdout.write('new');
    } else {
      process.stdout.write('duplicate');
    }
  " "$(alloy_iso_now)"
}

alloy_engineering_cost_increment() {
  local key="$1"
  local field="$2"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync('${state_path}','utf8'));
    d.cost_summary = d.cost_summary || {};
    const f = process.argv[1];
    d.cost_summary[f] = (d.cost_summary[f] || 0) + 1;
    d.updated_at = process.argv[2];
    fs.writeFileSync('${state_path}', JSON.stringify(d, null, 2) + '\n');
  " "$field" "$(alloy_iso_now)"
}

alloy_engineering_approval_hash() {
  local key="$1"
  local spec_path
  spec_path="$(alloy_initiative_dir "$key")/plan/specification.md"
  [[ -f "$spec_path" ]] || alloy_die "specification.md missing — run alloy-initiative-plan first"
  alloy_engineering_io sha256-file "$spec_path"
}

alloy_engineering_write_task_yaml() {
  local path="$1"
  shift
  local tmp
  tmp="$(mktemp "${path}.XXXXXX")"
  printf '%s\n' "$@" >"$tmp"
  mv "$tmp" "$path"
}

alloy_engineering_yaml_quote() {
  local s="$1"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}

alloy_engineering_list_tasks() {
  local key="$1"
  local f
  shopt -s nullglob
  for f in "$(alloy_initiative_dir "$key")"/tasks/*.yaml; do
    basename "$f" .yaml
  done
  shopt -u nullglob
}

alloy_engineering_task_status() {
  local task_yaml="$1"
  grep -E '^status:' "$task_yaml" | head -1 | sed 's/^status:[[:space:]]*//;s/"//g'
}

alloy_engineering_task_field() {
  local task_yaml="$1"
  local field="$2"
  grep -E "^${field}:" "$task_yaml" | head -1 | sed "s/^${field}:[[:space:]]*//;s/^\"//;s/\"$//"
}

alloy_engineering_dependencies_blocking() {
  local key="$1"
  local task_id="$2"
  local task_yaml dep deps status
  task_yaml="$(alloy_engineering_task_path "$key" "$task_id")"
  deps="$(grep -A20 '^dependencies:' "$task_yaml" | grep '^\s*-' | sed 's/^\s*-\s*//' | tr -d '"' || true)"
  while IFS= read -r dep; do
    [[ -n "$dep" ]] || continue
    status="$(alloy_engineering_task_status "$(alloy_engineering_task_path "$key" "$dep")" 2>/dev/null || echo blocked)"
    if [[ "$status" != "complete" ]]; then
      return 0
    fi
  done <<<"$deps"
  return 1
}

alloy_engineering_update_task_status() {
  local key="$1"
  local task_id="$2"
  local new_status="$3"
  local task_yaml tmp
  task_yaml="$(alloy_engineering_task_path "$key" "$task_id")"
  [[ -f "$task_yaml" ]] || alloy_die "task not found: $task_id"
  tmp="$(mktemp)"
  sed "s/^status:.*/status: ${new_status}/" "$task_yaml" >"$tmp"
  mv "$tmp" "$task_yaml"
}

alloy_engineering_free_slot_for_task() {
  local key="$1"
  local preferred_slot="$2"
  if ! alloy_find_metadata_by_slot "$preferred_slot" >/dev/null 2>&1; then
    printf '%s\n' "$preferred_slot"
    return 0
  fi
  # Slot occupied — check if it belongs to this initiative
  local name meta_path initiative_workers
  name="$(alloy_find_metadata_by_slot "$preferred_slot")"
  meta_path="$(alloy_metadata_path "$name")"
  # shellcheck disable=SC1090
  source "$meta_path"
  local state_path
  state_path="$(alloy_initiative_dir "$key")/state.json"
  if [[ -f "$state_path" ]]; then
    local match
    match="$(node -e "
      const d = require('${state_path}');
      const w = Object.values(d.workers || {});
      const hit = w.find(x => x.slot === ${preferred_slot});
      process.stdout.write(hit ? 'owned' : '');
    ")"
    if [[ "$match" == "owned" ]]; then
      alloy_die "slot ${preferred_slot} already assigned to this initiative worker"
    fi
  fi
  alloy_die "slot ${preferred_slot} is occupied by unrelated worktree: ${name}"
}

alloy_engineering_gitignore_worker_files() {
  local worktree_path="$1"
  local git_dir common_dir exclude_file
  git_dir="$(alloy_git "$worktree_path" rev-parse --git-dir 2>/dev/null || return 0)"
  common_dir="$(alloy_git "$worktree_path" rev-parse --git-common-dir 2>/dev/null || echo "$git_dir")"
  if [[ "$git_dir" != /* ]]; then git_dir="${worktree_path}/${git_dir}"; fi
  if [[ "$common_dir" != /* ]]; then common_dir="${worktree_path}/${common_dir}"; fi
  [[ -d "$git_dir" ]] || return 0
  [[ -d "$common_dir" ]] || common_dir="$git_dir"
  mkdir -p "${git_dir}/info" "${common_dir}/info" 2>/dev/null || return 0
  for exclude_file in "${git_dir}/info/exclude" "${common_dir}/info/exclude"; do
    for pat in .alloy-worker-package.md .alloy-worker-task.yaml; do
      if ! grep -Fq "$pat" "$exclude_file" 2>/dev/null; then
        printf '%s\n' "$pat" >>"$exclude_file"
      fi
    done
  done
}
