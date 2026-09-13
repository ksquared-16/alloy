#!/usr/bin/env bash
# =============================================================================
# test-slotless-provisioning — a registered worktree may install dependencies
# without holding a Development Slot.
#
# THE DEFECT THIS PINS. `alloy-worktree-adopt --no-slot` creates a registered,
# owned, dispatchable worktree with no slot and no port — a shape the
# architecture explicitly supports. `alloy-worktree-provision` then refused it
# with "metadata missing ALLOY_WORKTREE_SLOT", so the two halves of the canonical
# path disagreed and a promotion train could not install the dependencies four
# Critical Invariants need.
#
# Installing node_modules starts no server, opens no port, mints no QA identity
# and consumes no provider capacity. The requirement now matches the operation.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL: %s\n' "$1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export ALLOY_METADATA_DIR="$TMP/metadata"
mkdir -p "$ALLOY_METADATA_DIR"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh" 2>/dev/null || true

write_meta() {
  cat > "${ALLOY_METADATA_DIR}/$1.env" <<EOF
ALLOY_WORKTREE_NAME="$1"
ALLOY_WORKTREE_PATH="$TMP/$1"
ALLOY_WORKTREE_BRANCH="promote/$1"
$2
EOF
}

# ── 1/10/11 — the capability gate itself ────────────────────────────────────
write_meta slotless 'ALLOY_WORKTREE_UNSLOTTED="1"'
write_meta slotted 'ALLOY_WORKTREE_SLOT="4"
PORT="3014"
ALLOY_AGENT="claude"'

if ( alloy_load_metadata slotless dependencies ) >/dev/null 2>&1; then
  pass "a slotless registered worktree loads at the dependencies level"
else
  fail "a slotless registered worktree must load at the dependencies level"
fi

if ( alloy_load_metadata slotless runtime ) >/dev/null 2>&1; then
  fail "a slotless worktree must NOT satisfy the runtime level"
else
  pass "a slotless worktree still cannot satisfy the runtime level"
fi

if ( alloy_load_metadata slotted runtime ) >/dev/null 2>&1; then
  pass "a slotted worktree still satisfies the runtime level"
else
  fail "a slotted worktree must still satisfy the runtime level"
fi

# The default must not have moved: every existing caller keeps today's strictness.
if ( alloy_load_metadata slotless ) >/dev/null 2>&1; then
  fail "the DEFAULT capability must remain runtime, so untouched callers are unchanged"
else
  pass "the default capability is still runtime"
fi

if ( alloy_load_metadata nosuchworktree dependencies ) >/dev/null 2>&1; then
  fail "an unregistered worktree must refuse"
else
  pass "an unregistered worktree refuses"
fi

write_meta broken 'ALLOY_WORKTREE_UNSLOTTED="1"'
sed -i '' 's|^ALLOY_WORKTREE_PATH=.*|ALLOY_WORKTREE_PATH=""|' "${ALLOY_METADATA_DIR}/broken.env"
if ( alloy_load_metadata broken dependencies ) >/dev/null 2>&1; then
  fail "a record with no path must refuse even at the dependencies level"
else
  pass "a record with no path refuses at every level"
fi

if ( alloy_load_metadata slotless nonsense ) >/dev/null 2>&1; then
  fail "an unknown capability must refuse rather than silently pick one"
else
  pass "an unknown capability refuses"
fi

# ── 3/4/5/6/7 — what provisioning must NOT do ───────────────────────────────
PROV="${SCRIPT_DIR}/alloy-worktree-provision"
if grep -qE 'alloy_load_metadata "\$name" dependencies' "$PROV"; then
  pass "the provisioner asks for the dependencies level, not runtime"
else
  fail "the provisioner must ask for the dependencies level"
fi

# Asserted on INVOCATION, not on mention: the slotted branch of the closing hint
# tells an operator to run alloy-dev-start next, and a control that banned the
# word would forbid the command from naming the thing it deliberately did not do.
PROV_CODE="$(grep -vE "^\s*#" "$PROV" | grep -vE "printf|echo|cat <<")"
for forbidden in alloy-dev-start alloy_allocate_slot alloy-agent-login mint_qa alloy_acquire_port; do
  if printf '%s' "$PROV_CODE" | grep -qE "(^|[;&|\s(])${forbidden}([\s;&|)]|$)"; then
    fail "the provisioner must not invoke $forbidden"
  else
    pass "the provisioner does not invoke $forbidden"
  fi
done

# ── 14 — no second install path ─────────────────────────────────────────────
if grep -qE '^\s*(npm|pnpm|yarn) (ci|install)' "$PROV"; then
  fail "the provisioner must delegate installation, not run a package manager directly"
else
  pass "installation stays inside the canonical dependency helper"
fi

# The slot guard must survive where it is real.
if grep -q 'alloy_load_metadata' "${SCRIPT_DIR}/alloy-dev-start" 2>/dev/null; then
  if grep -qE 'alloy_load_metadata "[^"]*" dependencies' "${SCRIPT_DIR}/alloy-dev-start" 2>/dev/null; then
    fail "alloy-dev-start starts a server and must keep the runtime requirement"
  else
    pass "alloy-dev-start keeps the runtime requirement"
  fi
fi

printf '\nSlotless provisioning results: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
