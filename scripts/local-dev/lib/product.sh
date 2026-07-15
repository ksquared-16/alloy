#!/usr/bin/env bash
# Alloy Product Runtime V1 — product lifecycle over Engineering Runtime V1.
# shellcheck shell=bash

_PRODUCT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_ALLOY_DEV_ROOT="$(cd "${_PRODUCT_LIB_DIR}/.." && pwd)"
if ! declare -f alloy_die >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "${_ALLOY_DEV_ROOT}/lib/common.sh"
fi
# shellcheck source=engineering.sh
source "${_ALLOY_DEV_ROOT}/lib/engineering.sh"

ALLOY_PRODUCT_IO="${_ALLOY_DEV_ROOT}/lib/product-io.mjs"
ALLOY_PRODUCT_ARTIFACTS="${_ALLOY_DEV_ROOT}/lib/product-artifacts.mjs"

alloy_product_require_node() {
  alloy_require_cmd node
  [[ -f "$ALLOY_PRODUCT_IO" ]] || alloy_die "missing product-io.mjs"
  [[ -f "$ALLOY_PRODUCT_ARTIFACTS" ]] || alloy_die "missing product-artifacts.mjs"
}

alloy_product_io() {
  alloy_product_require_node
  node "$ALLOY_PRODUCT_IO" "$@"
}

alloy_product_artifacts() {
  alloy_product_require_node
  node "$ALLOY_PRODUCT_ARTIFACTS" "$@"
}

alloy_product_dir() {
  local key="$1"
  printf '%s/product' "$(alloy_initiative_dir "$key")"
}

alloy_product_exists() {
  local key="$1"
  [[ -f "$(alloy_product_dir "$key")/state.json" ]]
}

alloy_product_init_dirs() {
  local key="$1"
  local base
  base="$(alloy_product_dir "$key")"
  mkdir -p \
    "$base/audit" \
    "$base/contract" \
    "$base/decisions" \
    "$base/final" \
    "$base/history"
}

alloy_product_state_path() {
  local key="$1"
  printf '%s/state.json' "$(alloy_product_dir "$key")"
}

alloy_product_current_state() {
  local key="$1"
  node -e "console.log(require('$(alloy_product_state_path "$key")').state)"
}

alloy_product_transition() {
  local key="$1" to="$2"
  local from
  from="$(alloy_product_current_state "$key")"
  alloy_product_io validate-transition "$from" "$to"
  node -e "
    const fs = require('fs');
    const p = '$(alloy_product_state_path "$key")';
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    d.state = '$(node -e "console.log(process.argv[1])" "$to")';
    d.updated_at = '$(alloy_iso_now)';
    d.history = d.history || [];
    d.history.push({ at: d.updated_at, from: '${from}', to: '${to}' });
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  "
}

alloy_product_forbidden_patterns_in_content() {
  local content="$1"
  if printf '%s' "$content" | grep -qE '(^|\n)\s*(bash|sh|zsh|curl|wget|rm -rf|sudo|eval)\s'; then
    return 0
  fi
  return 1
}

alloy_product_contract_hash() {
  local key="$1"
  local base contract_dir
  base="$(alloy_product_dir "$key")"
  contract_dir="$base/contract"
  alloy_product_io contract-hash \
    "$contract_dir/product-contract.md" \
    "$contract_dir/product-contract.yaml" \
    "$contract_dir/ux-contract.yaml" \
    "$contract_dir/visual-contract.yaml" \
    "$contract_dir/acceptance.yaml" \
    "$contract_dir/scope.yaml" \
    "$contract_dir/test-data-contract.yaml"
}

alloy_product_blocking_decisions_count() {
  local key="$1"
  local decisions_dir count
  decisions_dir="$(alloy_product_dir "$key")/decisions"
  if [[ ! -d "$decisions_dir" ]]; then
    printf '0'
    return
  fi
  count="$(find "$decisions_dir" -name 'decision-*.yaml' -print 2>/dev/null | while read -r f; do
    if grep -q '^status: "open"' "$f" 2>/dev/null && grep -q '^blocking: true' "$f" 2>/dev/null; then
      echo 1
    elif grep -q '^status: open$' "$f" 2>/dev/null && grep -q '^blocking: true$' "$f" 2>/dev/null; then
      echo 1
    fi
  done | wc -l | tr -d ' ')"
  printf '%s' "${count:-0}"
}

alloy_product_open_decisions_count() {
  local key="$1"
  local decisions_dir count
  decisions_dir="$(alloy_product_dir "$key")/decisions"
  if [[ ! -d "$decisions_dir" ]]; then
    printf '0'
    return
  fi
  count="$(grep -l '^status: "open"\|^status: open$' "$decisions_dir"/decision-*.yaml 2>/dev/null | wc -l | tr -d ' ')"
  printf '%s' "${count:-0}"
}

alloy_product_user_visible_work() {
  local key="$1"
  local brief_json
  brief_json="$(alloy_product_dir "$key")/brief.json"
  node -e "
    const b = require('${brief_json}');
    const text = [
      ...(b.scope?.in_scope ?? []),
      b.product?.summary ?? '',
    ].join(' ').toLowerCase();
    const ui = /ui|screen|page|panel|modal|drawer|settings|visual|layout|operator/.test(text);
    process.stdout.write(ui ? 'yes' : 'no');
  "
}

alloy_product_validate_visual_basis() {
  local key="$1"
  local vc_path
  vc_path="$(alloy_product_dir "$key")/contract/visual-contract.yaml"
  [[ -f "$vc_path" ]] || return 1
  local basis
  basis="$(grep -E '^  type:' "$vc_path" 2>/dev/null | head -1 | sed 's/.*: //;s/"//g' || true)"
  [[ -n "$basis" && "$basis" != "null" ]]
}

alloy_product_handoff_path() {
  local key="$1"
  printf '%s/final/engineering-handoff.yaml' "$(alloy_product_dir "$key")"
}

alloy_product_approved() {
  local key="$1"
  [[ -f "$(alloy_product_dir "$key")/contract/approval.json" ]]
}

alloy_product_record_decision_log() {
  local key="$1"
  local decisions_dir log_path
  decisions_dir="$(alloy_product_dir "$key")/decisions"
  log_path="$decisions_dir/decision-log.md"
  {
    printf '# Product decision log — %s\n\n' "$key"
    printf 'Updated: %s\n\n' "$(alloy_iso_now)"
    for f in "$decisions_dir"/decision-*.yaml; do
      [[ -f "$f" ]] || continue
      printf '## %s\n\n' "$(basename "$f" .yaml)"
      cat "$f"
      printf '\n'
    done
  } >"$log_path"
}

alloy_product_cost_summary_init() {
  cat <<'JSON'
{
  "chatgpt_product_handoffs": 1,
  "workers_used": 0,
  "worker_roles": [],
  "reviewers_used": 0,
  "remediation_rounds": 0,
  "heavy_validations": 0,
  "ui_verification_runs": 0,
  "pushes": 0,
  "prs": 0,
  "vercel_previews": 0
}
JSON
}

alloy_engineering_product_change_request_dir() {
  local key="$1"
  local dir
  dir="$(alloy_initiative_dir "$key")/product-change-requests"
  mkdir -p "$dir"
  printf '%s' "$dir"
}

alloy_engineering_record_product_change_request() {
  local key="$1" reason="$2" section="$3" requested_change="$4" blocked="${5:-false}"
  local dir id path now
  dir="$(alloy_engineering_product_change_request_dir "$key")"
  id="pcr-$(date +%s)"
  path="$dir/${id}.yaml"
  now="$(alloy_iso_now)"
  cat >"$path" <<EOF
request_id: "$id"
reason: $(node -e "console.log(JSON.stringify(process.argv[1]))" "$reason")
affected_contract_section: $(node -e "console.log(JSON.stringify(process.argv[1]))" "$section")
requested_change: $(node -e "console.log(JSON.stringify(process.argv[1]))" "$requested_change")
implementation_blocked: $blocked
recommendation: "Return to Product Runtime for contract revision and reapproval"
status: open
created_at: "$now"
EOF
  alloy_warn "Product change request recorded: $path"
  printf '%s' "$id"
}

alloy_engineering_has_product_handoff() {
  local key="$1"
  [[ -f "$(alloy_product_handoff_path "$key")" ]] \
    || [[ -f "$(alloy_initiative_dir "$key")/product-handoff.json" ]]
}

alloy_engineering_product_contract_hash() {
  local key="$1"
  local handoff_path state_path
  handoff_path="$(alloy_product_handoff_path "$key")"
  state_path="$(alloy_initiative_dir "$key")/state.json"
  if [[ -f "$state_path" ]]; then
    node -e "
      const d = require('${state_path}');
      process.stdout.write(d.product_contract_hash || d.approved_product_contract_hash || '');
    " 2>/dev/null || true
  elif [[ -f "$handoff_path" ]]; then
    grep -E '^approved_contract_hash:' "$handoff_path" 2>/dev/null | head -1 | sed 's/approved_contract_hash: //;s/"//g' || true
  fi
}
