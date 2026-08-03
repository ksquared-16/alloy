#!/usr/bin/env bash
# =============================================================================
# guard-push — pre-push guard for the Alloy APPLICATION origin.
#
# Why this exists: pushing 120 recovery/archive branches to the application
# origin triggered 188 Vercel preview deployments (30 of them failing). The
# branches were metadata-perfect and still the wrong thing to do, because the
# application origin has CI attached to its branch namespace. Recovery material
# belongs in a bundle, not in a namespace something watches.
#
# Two rules, both scoped to the APPLICATION origin only:
#
#   1. NAMESPACE — refuse any destination ref in an archive/recovery namespace.
#      No override. This is the exact failure above; there is no legitimate
#      reason to put recovery material on the deployable remote.
#
#   2. FAN-OUT — refuse a push creating more than N (default 10) NEW remote
#      branches in one invocation, unless an explicit override is RECORDED.
#      Deliberately not reachable from ordinary sprint completion: it needs a
#      hand-written override file naming a reason. alloy-sprint-finish pushes
#      exactly one branch and must never set it.
#
# Remotes explicitly classified as non-application backups are exempt entirely.
#
# Invoked by git as: pre-push <remote-name> <remote-url>, with the ref list on
# stdin as: <local ref> <local sha> <remote ref> <remote sha>
#
# Testable directly: feed stdin + the two args, no network required.
# =============================================================================
set -uo pipefail

REMOTE_NAME="${1:-}"
REMOTE_URL="${2:-}"

# Which remote is "the application"? Matched against name and URL.
APP_PATTERN="${ALLOY_PUSH_GUARD_APP_PATTERN:-ksquared-16/alloy}"
# Remotes that are explicitly NOT the application (backup mirrors). Space-separated.
BACKUP_REMOTES="${ALLOY_PUSH_GUARD_BACKUP_REMOTES:-}"
MAX_NEW_BRANCHES="${ALLOY_PUSH_GUARD_MAX_NEW_BRANCHES:-10}"
OVERRIDE_FILE="${ALLOY_PUSH_GUARD_OVERRIDE:-}"

# bash [[ =~ ]] uses ERE. A BRE-style \{40,64\} silently never matches, which
# made the fan-out rule a no-op while every namespace test still passed.
ZERO='^0{40,64}$'

die() {
  printf '\n\033[31mPUSH BLOCKED\033[0m — %s\n\n' "$1" >&2
  shift
  printf '%s\n' "$@" >&2
  printf '\n'
  exit 1
}

# --- remote classification --------------------------------------------------
is_backup_remote() {
  local r
  for r in $BACKUP_REMOTES; do
    [[ "$REMOTE_NAME" == "$r" || "$REMOTE_URL" == *"$r"* ]] && return 0
  done
  return 1
}

is_application_remote() {
  is_backup_remote && return 1
  [[ "$REMOTE_URL" == *"$APP_PATTERN"* || "$REMOTE_NAME" == *"$APP_PATTERN"* ]] && return 0
  return 1
}

# A remote that is neither the application nor a declared backup is left alone:
# this guard protects the deployable remote, it is not a general push policy.
if ! is_application_remote; then
  exit 0
fi

# --- read the ref list ------------------------------------------------------
declare -a BAD_NS=()
new_branches=0
total_refs=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [[ -n "${remote_ref:-}" ]] || continue
  total_refs=$((total_refs + 1))

  # RULE 1 — archive/recovery namespaces are never allowed on the app origin.
  # Checked against the destination ref with and without refs/heads/, so both
  # `archive/x` and `refs/heads/archive/x` forms are caught.
  bare="${remote_ref#refs/heads/}"
  case "$remote_ref" in
    refs/heads/archive/*|refs/archive/*|refs/recovery/*|refs/heads/recovery/*)
      BAD_NS+=("$remote_ref") ;;
    *)
      case "$bare" in
        archive/*|recovery/*) BAD_NS+=("$remote_ref") ;;
      esac
      ;;
  esac

  # RULE 2 — count branch CREATIONS (remote side all-zero = does not exist yet).
  if [[ "$remote_ref" == refs/heads/* ]] && [[ "$remote_sha" =~ $ZERO ]]; then
    new_branches=$((new_branches + 1))
  fi
done

# --- rule 1 -----------------------------------------------------------------
if [[ ${#BAD_NS[@]} -gt 0 ]]; then
  die "archive/recovery refs may not be pushed to the application origin (${REMOTE_NAME})" \
    "Refs rejected:" \
    "$(printf '  %s\n' "${BAD_NS[@]}")" \
    "" \
    "This remote has CI/CD attached to its branch namespace. Pushing recovery" \
    "material here created 188 Vercel preview deployments on 2026-08-03." \
    "" \
    "Recovery material belongs in the verified bundle:" \
    "  ~/alloy-recovery/alloy-recovery-2026-08-03.bundle" \
    "and its off-device copy. There is no override for this rule."
fi

# --- rule 2 -----------------------------------------------------------------
if (( new_branches > MAX_NEW_BRANCHES )); then
  if [[ -n "$OVERRIDE_FILE" && -s "$OVERRIDE_FILE" ]]; then
    printf '\033[33mpush-guard:\033[0m fan-out override accepted (%s new branches)\n' "$new_branches" >&2
    printf '  recorded at: %s\n' "$OVERRIDE_FILE" >&2
    printf '  reason: %s\n' "$(head -1 "$OVERRIDE_FILE")" >&2
  else
    die "this push would create ${new_branches} new remote branches (limit ${MAX_NEW_BRANCHES})" \
      "Each new branch on this remote can trigger a preview deployment." \
      "" \
      "If this is genuinely intended, record an override with a reason:" \
      "  echo 'why this fan-out is necessary' > /tmp/push-override.txt" \
      "  ALLOY_PUSH_GUARD_OVERRIDE=/tmp/push-override.txt git push ..." \
      "" \
      "Ordinary sprint completion pushes ONE branch and never needs this." \
      "If you are finishing a sprint and see this, something is wrong — stop."
  fi
fi

exit 0
