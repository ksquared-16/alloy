#!/usr/bin/env bash
# Sprint Manifest — shell surface over lib/manifest-io.mjs.
#
# The manifest answers, without a prompt restating any of it: role, authority,
# phase, execution posture, canonical root, inputs, outputs, handoff target,
# certification requirement, promotion requirement.
#
# Manifests are additive. A worktree created before this existed has none, and
# every reader must render that as "unknown" rather than guessing -- absence is a
# value (see alloy_reset_optional_metadata for what guessing cost us).

alloy_manifest_dir() {
  printf '%s/manifests' "${ALLOY_RUNTIME_ROOT}"
}

alloy_manifest_path() {
  printf '%s/%s.json' "$(alloy_manifest_dir)" "$1"
}

alloy_manifest_io() {
  local script="${ALLOY_LOCAL_DEV_ROOT:-$SCRIPT_DIR}/lib/manifest-io.mjs"
  node "$script" "$@"
}

alloy_manifest_exists() {
  [[ -f "$(alloy_manifest_path "$1")" ]]
}

alloy_manifest_init() {
  local name="$1" slot="$2"
  mkdir -p "$(alloy_manifest_dir)"
  alloy_manifest_io init "$(alloy_manifest_path "$name")" "$name" "$slot" >/dev/null
}

alloy_manifest_set() {
  local name="$1"
  shift
  alloy_manifest_io set "$(alloy_manifest_path "$name")" "$@" >/dev/null
}

alloy_manifest_get() {
  local name="$1" key="$2"
  alloy_manifest_exists "$name" || { printf 'unknown'; return 0; }
  local v
  v="$(alloy_manifest_io get "$(alloy_manifest_path "$name")" "$key" 2>/dev/null || true)"
  [[ -n "$v" ]] && printf '%s' "$v" || printf 'unknown'
}

alloy_manifest_append_history() {
  local name="$1" event="$2" detail="${3:-}"
  alloy_manifest_exists "$name" || return 0
  alloy_manifest_io append-history "$(alloy_manifest_path "$name")" "$event" "$detail" >/dev/null
}

alloy_manifest_validate() {
  alloy_manifest_io validate "$(alloy_manifest_path "$1")"
}

# Declaration gaps, printed. Reported by default; refused only when
# ALLOY_SPRINT_REQUIRE_MANIFEST=1.
#
# Migration rule R1 from the accepted plan: record -> display -> refuse. A
# refusal and its concept never land in the same change, because a gate on a
# field nothing has yet populated strands live work.
alloy_manifest_gaps() {
  alloy_manifest_exists "$1" || return 0
  alloy_manifest_io gaps "$(alloy_manifest_path "$1")" 2>/dev/null || true
}

alloy_manifest_enforce_or_warn() {
  local name="$1"
  local gaps
  gaps="$(alloy_manifest_gaps "$name")"
  [[ -z "$gaps" ]] && return 0

  if [[ "${ALLOY_SPRINT_REQUIRE_MANIFEST:-0}" == "1" ]]; then
    printf '%s\n' "$gaps" >&2
    alloy_die "sprint manifest is incomplete (ALLOY_SPRINT_REQUIRE_MANIFEST=1)"
  fi
  alloy_warn "sprint manifest has undeclared fields:"
  printf '%s\n' "$gaps" | while IFS= read -r g; do
    [[ -n "$g" ]] && printf '  - %s\n' "$g" >&2
  done
  alloy_warn "set ALLOY_SPRINT_REQUIRE_MANIFEST=1 to refuse instead of warn"
  return 0
}

# Record which root and toolkit a sprint was cut from.
alloy_manifest_record_root() {
  local name="$1"
  local base sha
  base="$(alloy_base_ref)"
  sha="$(git -C "${ALLOY_REPO}" rev-parse "$base" 2>/dev/null || echo "unknown")"
  alloy_manifest_set "$name" \
    "root.canonical=${ALLOY_REPO}" \
    "root.base_ref=${base}" \
    "root.base_sha=${sha}" \
    "root.toolkit=${ALLOY_LOCAL_DEV_ROOT:-unknown}"
}

# The card. One place a sprint's authority is answerable from.
alloy_manifest_card() {
  local name="$1"
  if ! alloy_manifest_exists "$name"; then
    printf 'Manifest:  none — this worktree predates the sprint manifest\n'
    printf '           its stage, role, and posture are unknown, not assumed\n'
    return 0
  fi
  printf 'Stage:     %s\n' "$(alloy_manifest_get "$name" stage)"
  printf 'Role:      %s\n' "$(alloy_manifest_get "$name" role)"
  printf 'Lane:      %s\n' "$(alloy_manifest_get "$name" lane)"
  printf 'Posture:   %s on a %s tenant\n' \
    "$(alloy_manifest_get "$name" posture.mutation)" \
    "$(alloy_manifest_get "$name" posture.tenant_class)"
  printf 'Cert:      max level %s — %s\n' \
    "$(alloy_manifest_get "$name" certification.ceiling)" \
    "$(alloy_manifest_get "$name" certification.ceiling_reason)"
  printf 'Basis:     %s\n' "$(alloy_manifest_get "$name" constitutional_basis.type)"
  printf 'Initiative: %s\n' "$(alloy_manifest_get "$name" initiative_key)"
  printf 'Handoff:   %s\n' "$(alloy_manifest_get "$name" handoff_target)"
  printf 'Promotion: %s\n' "$(alloy_manifest_get "$name" promotion.target)"
}
