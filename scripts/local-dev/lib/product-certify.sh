#!/usr/bin/env bash
# Alloy Product Runtime V1 — real-Mac certification helpers.
# shellcheck shell=bash

PRODUCT_CERT_PASS=0
PRODUCT_CERT_FAIL=0
PRODUCT_CERT_VERBOSE=0
PRODUCT_CERT_KEEP=0
PRODUCT_CERT_ROOT=""
PRODUCT_CERT_KEY="product-v1-cert"

product_certify_die() {
  printf 'product-certify error: %s\n' "$*" >&2
  exit 1
}

product_certify_log() {
  [[ "$PRODUCT_CERT_VERBOSE" -eq 1 ]] && printf 'product-certify: %s\n' "$*"
}

product_certify_assert() {
  local msg="$1"
  shift
  if "$@"; then
    PRODUCT_CERT_PASS=$((PRODUCT_CERT_PASS + 1))
    product_certify_log "PASS: $msg"
  else
    PRODUCT_CERT_FAIL=$((PRODUCT_CERT_FAIL + 1))
    printf 'PRODUCT CERT FAIL: %s\n' "$msg" >&2
  fi
}

product_certify_assert_fail() {
  local msg="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    PRODUCT_CERT_FAIL=$((PRODUCT_CERT_FAIL + 1))
    printf 'PRODUCT CERT FAIL: %s (expected failure)\n' "$msg" >&2
  else
    PRODUCT_CERT_PASS=$((PRODUCT_CERT_PASS + 1))
    product_certify_log "PASS: $msg"
  fi
}

product_certify_cmd_env() {
  env \
    ALLOY_CONFIG_FILE="${PRODUCT_CERT_CONFIG}" \
    ALLOY_PRODUCT_CERTIFY=1 \
    ALLOY_ENGINEERING_CERTIFY=1 \
    ALLOY_AGENT_OPEN_DRY_RUN=1 \
    ALLOY_INITIATIVE_ROOT="${PRODUCT_CERT_INITIATIVES}" \
    ALLOY_CERTIFY_CLIPBOARD_FILE="${PRODUCT_CERT_CLIPBOARD}" \
  "$@"
}

product_certify_happy_brief() {
  cat <<'YAML'
product:
  key: product-v1-cert
  title: Product Runtime V1 Certification
  summary: Prove Product Runtime lifecycle from brief through Engineering handoff

problem:
  current_state: No durable local Product Contract workflow exists
  pain_points:
    - Product direction is re-explained to each worker
    - Scope and visual intent are not frozen before implementation

users:
  primary:
    - Platform operator (Kelly)
  secondary:
    - Engineering workers

jobs_to_be_done:
  - Import a ChatGPT Product Brief once
  - Ground references against repository doctrine
  - Approve a Product Contract before Engineering starts

operator_outcomes:
  - Kelly approves one grounded Product Contract per initiative
  - Workers receive immutable product truth in packages

business_outcomes:
  - Fewer product reinterpretation loops during implementation

product_direction:
  - Artifact-driven local Product Runtime with explicit handoff to Engineering

scope:
  in_scope:
    - Product Brief intake and validation
    - Product audit and contract generation
    - Human Decision Queue and approval
    - Engineering handoff artifact
  out_of_scope:
    - Autonomous product strategy
    - Settings Locations implementation
    - Push merge or release automation

acceptance:
  - Valid brief imports and rejects malformed input
  - Approved contract hash reaches Engineering handoff
  - Blocking decisions prevent approval
  - Product Runtime never starts workers

human_approval:
  required_gates:
    - product_contract_approval
    - promotion_approval

visual_basis:
  type: pattern_reference

reference_docs:
  - docs/platform/governance/design-and-operational-doctrine.md

reference_files:
  - docs/README.md

test_data_requirements:
  - Use certification fixture org context only
YAML
}

product_certify_malformed_brief() {
  cat <<'YAML'
product:
  title: missing key field
YAML
}

product_certify_shell_brief() {
  cat <<'YAML'
product:
  key: product-shell-cert
  title: Shell safety test
  summary: Data only

problem:
  current_state: test
  pain_points:
    - "bash rm -rf /tmp"

users:
  primary:
    - tester
  secondary: []

jobs_to_be_done:
  - test

operator_outcomes:
  - test

business_outcomes:
  - test

product_direction:
  - test

scope:
  in_scope:
    - test
  out_of_scope:
    - none

acceptance:
  - test

human_approval:
  required_gates: []

visual_basis:
  type: pattern_reference
YAML
}

product_certify_vague_brief() {
  cat <<'YAML'
product:
  key: product-vague-cert
  title: Vague language test
  summary: Settings UI should feel premium and polished

problem:
  current_state: test
  pain_points:
    - vague direction

users:
  primary:
    - tester
  secondary: []

jobs_to_be_done:
  - test

operator_outcomes:
  - test

business_outcomes:
  - test

product_direction:
  - Deliver a premium polished compact configuration experience

scope:
  in_scope:
    - Settings UI screen
  out_of_scope:
    - none

acceptance:
  - looks good

human_approval:
  required_gates: []
YAML
}
