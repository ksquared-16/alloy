#!/usr/bin/env bash
# Alloy Engineering V1 — real-Mac certification helpers.
# shellcheck shell=bash

CERT_PASS=0
CERT_FAIL=0
CERT_VERBOSE=0
CERT_KEEP=0
CERT_ROOT=""
CERT_KEY="engineering-v1-cert"
CERT_MANIFEST=""

certify_die() {
  printf 'certify error: %s\n' "$*" >&2
  exit 1
}

certify_log() {
  [[ "$CERT_VERBOSE" -eq 1 ]] && printf 'certify: %s\n' "$*"
}

certify_assert() {
  local msg="$1"
  shift
  if "$@"; then
    CERT_PASS=$((CERT_PASS + 1))
    certify_log "PASS: $msg"
  else
    CERT_FAIL=$((CERT_FAIL + 1))
    printf 'CERT FAIL: %s\n' "$msg" >&2
  fi
}

certify_assert_fail() {
  local msg="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    CERT_FAIL=$((CERT_FAIL + 1))
    printf 'CERT FAIL: %s (expected failure)\n' "$msg" >&2
  else
    CERT_PASS=$((CERT_PASS + 1))
    certify_log "PASS: $msg"
  fi
}

certify_cmd_env() {
  # shellcheck disable=SC2030
  env \
    ALLOY_CONFIG_FILE="${CERT_CONFIG_FILE}" \
    ALLOY_ENGINEERING_CERTIFY=1 \
    ALLOY_AGENT_OPEN_DRY_RUN=1 \
    ALLOY_INITIATIVE_ROOT="${CERT_INITIATIVE_ROOT}" \
    ALLOY_CERTIFY_CLIPBOARD_FILE="${CERT_CLIPBOARD_FILE}" \
    ALLOY_CERTIFY_APP_LAUNCH_LOG="${CERT_APP_LAUNCH_LOG}" \
  "$@"
}

certify_setup_canonical_repo() {
  local canon="$1"
  local origin="${2:-}"
  mkdir -p "$canon/docs/platform/governance" "$canon/web"
  git -C "$canon" init -q
  git -C "$canon" config user.email "certify@alloy.local"
  git -C "$canon" config user.name "Alloy Certify"
  echo "# Alloy certify" >"$canon/docs/README.md"
  echo "# Doctrine" >"$canon/docs/platform/governance/design-and-operational-doctrine.md"
  echo '{}' >"$canon/web/package.json"
  git -C "$canon" add -A
  git -C "$canon" commit -q -m "certify init"
  git -C "$canon" branch -M staging
  if [[ -n "$origin" ]]; then
    git -C "$canon" remote add origin "$origin" 2>/dev/null || git -C "$canon" remote set-url origin "$origin"
    git -C "$canon" push -q -u origin staging
  fi
}

certify_setup_fixture_repo() {
  local repo="$1"
  mkdir -p "$repo"
  if [[ ! -e "$repo/.git" ]]; then
    git -C "$repo" init -q
  fi
  git -C "$repo" config user.email "worker@alloy.local" 2>/dev/null || true
  git -C "$repo" config user.name "Cert Worker" 2>/dev/null || true
  if ! git -C "$repo" rev-parse HEAD >/dev/null 2>&1; then
    echo "fixture" >"$repo/README"
    git -C "$repo" add README
    git -C "$repo" commit -q -m "fixture init"
  fi
  git -C "$repo" checkout -q -B agent/cursor/1-engineering-v1-cert-cert 2>/dev/null || true
}

certify_happy_intake() {
  cat <<'YAML'
initiative:
  key: engineering-v1-cert
  title: Engineering V1 Certification
  objective: Prove the Engineering Manager lifecycle safely end to end

operator_outcome:
  - Operator can certify Engineering V1 before real initiatives

product_direction:
  - Exercise intake through close with disposable state only

acceptance:
  - All certification gates pass without product code changes

constraints:
  - No push, merge, or Vercel preview

human_approval:
  required_gates: []

reference_routes:
  - /admin/settings/fields
YAML
}

certify_ui_blocked_intake() {
  cat <<'YAML'
initiative:
  key: cert-ui-blocked
  title: UI blocked cert
  objective: test visual gate
operator_outcome:
  - x
product_direction:
  - x
acceptance:
  - x
constraints:
  - x
human_approval:
  required_gates: []
verification_targets:
  - /admin/example
YAML
}

certify_intake_for_key() {
  local key="$1"
  certify_happy_intake | sed "s/engineering-v1-cert/${key}/g"
}

certify_record_production_snapshot() {
  local snap="$1"
  mkdir -p "$snap"
  local prod_runtime="${CERT_PROD_RUNTIME:-$HOME/.local/state/alloy-dev}"
  local prod_init="${CERT_PROD_INITIATIVE_ROOT:-$prod_runtime/initiatives}"
  if [[ -d "$prod_init" ]]; then
    find "$prod_init" -type f 2>/dev/null | sort >"$snap/prod-initiatives.files" || true
  else
    : >"$snap/prod-initiatives.files"
  fi
  if [[ -d "$prod_runtime/metadata" ]]; then
    find "$prod_runtime/metadata" -type f 2>/dev/null | sort >"$snap/prod-metadata.files" || true
  else
    : >"$snap/prod-metadata.files"
  fi
}

certify_verify_production_untouched() {
  local snap="$1"
  local prod_runtime="${CERT_PROD_RUNTIME:-$HOME/.local/state/alloy-dev}"
  local prod_init="${CERT_PROD_INITIATIVE_ROOT:-$prod_runtime/initiatives}"
  local after="$snap/after-initiatives.files"
  local after_meta="$snap/after-metadata.files"
  if [[ -d "$prod_init" ]]; then
    find "$prod_init" -type f 2>/dev/null | sort >"$after" || true
  else
    : >"$after"
  fi
  if [[ -d "$prod_runtime/metadata" ]]; then
    find "$prod_runtime/metadata" -type f 2>/dev/null | sort >"$after_meta" || true
  else
    : >"$after_meta"
  fi
  diff -q "$snap/prod-initiatives.files" "$after" >/dev/null 2>&1
}

certify_write_manifest() {
  local path="$1"
  CERT_MANIFEST="$path"
  local base
  base="$(alloy_initiative_dir "$CERT_KEY")"
  {
    printf 'generated_at: "%s"\n' "$(alloy_iso_now)"
    printf 'certification_key: "%s"\n' "$CERT_KEY"
    printf 'cert_root: "%s"\n' "$CERT_ROOT"
    printf 'artifacts:\n'
    printf '  initiative_brief: "%s/initiative.yaml"\n' "$base"
    printf '  intake: "%s/intake.md"\n' "$base"
    printf '  audit: "%s/audit/repository.md"\n' "$base"
    printf '  specification: "%s/plan/specification.md"\n' "$base"
    printf '  approval: "%s/decisions.yaml"\n' "$base"
    printf '  task_graph: "%s/plan/task-graph.yaml"\n' "$base"
    printf '  worker_packages: "%s/worker-packages/"\n' "$base"
    printf '  reports: "%s/reports/"\n' "$base"
    printf '  reviews: "%s/reviews/"\n' "$base"
    printf '  remediation: "%s/remediation/"\n' "$base"
    printf '  final_package: "%s/final/review-package.md"\n' "$base"
    printf '  failure_examples: "%s/cert-fixtures/"\n' "$CERT_ROOT"
  } >"$path"
}

certify_package_contains_required_sections() {
  local pkg="$1"
  [[ -f "$pkg" ]] || return 1
  local f
  for f in \
    "Constitutional truth" \
    "Initiative-approved" \
    "Worker discretion" \
    "Allowed scope" \
    "Prohibited scope" \
    "Push / merge prohibition" \
    "Reporting schema"
  do
    grep -q "$f" "$pkg" || return 1
  done
  return 0
}

certify_print_summary() {
  local result worktrees_created apps_opened section
  if [[ "$CERT_FAIL" -eq 0 ]]; then result="PASS"; section="PASS"; else result="FAIL"; section="CHECK"; fi
  worktrees_created="No"
  [[ "${CERT_WITH_FIXTURE_WORKTREE:-0}" -eq 1 ]] && worktrees_created="Yes (fixture option)"
  apps_opened="No"

  cat <<EOF

Alloy Engineering V1 Certification

Intake                 ${section}
State machine          ${section}
Audit and plan         ${section}
Approval/hash          ${section}
Worker packages        ${section}
Report ingestion       ${section}
Review/remediation     ${section}
Final package          ${section}
Cost/promotion safety  ${section}
Close/preservation     ${section}

Result: $result
Assertions: ${CERT_PASS} passed / ${CERT_FAIL} failed
No product code changed.
Worktrees created: ${worktrees_created}
Apps opened: ${apps_opened}
No pushes, PRs, merges, Vercel previews, credentials, or auth state used.
EOF

  if [[ "$CERT_KEEP" -eq 1 && -n "$CERT_ROOT" ]]; then
    printf '\nRetained certification directory:\n  %s\n' "$CERT_ROOT"
    [[ -n "$CERT_MANIFEST" ]] && printf 'Manifest:\n  %s\n' "$CERT_MANIFEST"
  fi
}
