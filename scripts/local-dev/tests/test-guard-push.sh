#!/usr/bin/env bash
# =============================================================================
# test-guard-push — proves the pre-push guard blocks what caused the 2026-08-03
# Vercel incident without blocking ordinary work.
#
# NO NETWORK. Every push in here goes to a LOCAL BARE REPOSITORY, so no preview
# deployment can be triggered. The "application origin" is simulated by pointing
# ALLOY_PUSH_GUARD_APP_PATTERN at the local bare repo's path.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="${SCRIPT_DIR}/hooks/guard-push.sh"
PASS=0; FAIL=0
ZERO=0000000000000000000000000000000000000000

t() { # t <desc> <expected allow|BLOCK> <actual>
  local desc="$1" want="$2" got="$3"
  if [[ "$got" == "$want" ]]; then PASS=$((PASS+1)); printf '  ✓ %s\n' "$desc"
  else FAIL=$((FAIL+1)); printf '  ✗ %s (got=%s want=%s)\n' "$desc" "$got" "$want"; fi
}

# Direct invocation: feed the ref list on stdin exactly as git does.
guard() { # guard <remote-name> <remote-url> <<< reflines
  if "$GUARD" "$1" "$2" >/dev/null 2>&1; then echo allow; else echo BLOCK; fi
}

APP=/app/ksquared-16/alloy.git      # simulated application origin URL
BAK=/backups/alloy-mirror.git       # declared non-application backup
export ALLOY_PUSH_GUARD_APP_PATTERN="ksquared-16/alloy"
export ALLOY_PUSH_GUARD_BACKUP_REMOTES="alloy-mirror"

echo "guard-push"
echo "=========="

# ---------------------------------------------------------------- allowed
echo "ordinary work is not impeded"
t "active sprint branch push" allow \
  "$(guard origin "$APP" <<< "refs/heads/agent/claude/1-x abc123 refs/heads/agent/claude/1-x $ZERO")"
t "sprint branch update (not a creation)" allow \
  "$(guard origin "$APP" <<< "refs/heads/agent/claude/1-x abc123 refs/heads/agent/claude/1-x def456")"
t "staging push unchanged" allow \
  "$(guard origin "$APP" <<< "refs/heads/staging abc123 refs/heads/staging def456")"
t "staging force-ish update still allowed" allow \
  "$(guard origin "$APP" <<< "refs/heads/staging abc123 refs/heads/staging 000000f")"
t "feat/ branch push" allow \
  "$(guard origin "$APP" <<< "refs/heads/feat/thing abc123 refs/heads/feat/thing $ZERO")"
t "tag push" allow \
  "$(guard origin "$APP" <<< "refs/tags/v1 abc123 refs/tags/v1 $ZERO")"
t "branch deletion (local side zero)" allow \
  "$(guard origin "$APP" <<< "(delete) $ZERO refs/heads/agent/claude/old abc123")"
t "exactly 10 new branches (at limit)" allow \
  "$(for i in $(seq 1 10); do echo "refs/heads/b$i abc refs/heads/b$i $ZERO"; done | guard origin "$APP")"

# ---------------------------------------------------------------- namespace
echo "archive/recovery namespace is blocked"
t "refs/heads/archive/*" BLOCK \
  "$(guard origin "$APP" <<< "refs/heads/x abc refs/heads/archive/local-recovery/2026-08-03/foo $ZERO")"
t "refs/archive/*" BLOCK \
  "$(guard origin "$APP" <<< "refs/heads/x abc refs/archive/foo $ZERO")"
t "refs/recovery/*" BLOCK \
  "$(guard origin "$APP" <<< "refs/heads/x abc refs/recovery/2026-08-03/foo $ZERO")"
t "refs/heads/recovery/*" BLOCK \
  "$(guard origin "$APP" <<< "refs/heads/x abc refs/heads/recovery/foo $ZERO")"
t "the exact 2026-08-03 incident refspec" BLOCK \
  "$(guard origin "$APP" <<< "966c74e abc refs/heads/archive/local-recovery/2026-08-03/agent__claude__1-alloy-phase-5 $ZERO")"
t "one bad ref among many good ones" BLOCK \
  "$(printf 'refs/heads/a abc refs/heads/a %s\nrefs/heads/b abc refs/heads/archive/x %s\n' "$ZERO" "$ZERO" | guard origin "$APP")"
t "namespace block applies to UPDATES too, not just creations" BLOCK \
  "$(guard origin "$APP" <<< "refs/heads/x abc refs/heads/archive/foo def456")"

# ---------------------------------------------------------------- fan-out
echo "mass branch creation is blocked"
t "11 new branches blocked" BLOCK \
  "$(for i in $(seq 1 11); do echo "refs/heads/b$i abc refs/heads/b$i $ZERO"; done | guard origin "$APP")"
t "120 new branches (the incident size) blocked" BLOCK \
  "$(for i in $(seq 1 120); do echo "refs/heads/b$i abc refs/heads/b$i $ZERO"; done | guard origin "$APP")"
t "many UPDATES are fine — only creations count" allow \
  "$(for i in $(seq 1 50); do echo "refs/heads/b$i abc refs/heads/b$i def456"; done | guard origin "$APP")"

echo "fan-out override is explicit and recorded"
OV="$(mktemp)"
t "empty override file does NOT unblock" BLOCK \
  "$(ALLOY_PUSH_GUARD_OVERRIDE="$OV" bash -c 'for i in $(seq 1 11); do echo "refs/heads/b$i abc refs/heads/b$i '"$ZERO"'"; done' | ALLOY_PUSH_GUARD_OVERRIDE="$OV" guard origin "$APP")"
echo "bulk import approved by Kelly 2026-08-03" > "$OV"
t "recorded override with a reason unblocks" allow \
  "$(for i in $(seq 1 11); do echo "refs/heads/b$i abc refs/heads/b$i $ZERO"; done | ALLOY_PUSH_GUARD_OVERRIDE="$OV" guard origin "$APP")"
t "override does NOT unblock the namespace rule" BLOCK \
  "$(ALLOY_PUSH_GUARD_OVERRIDE="$OV" guard origin "$APP" <<< "refs/heads/x abc refs/heads/archive/foo $ZERO")"
rm -f "$OV"

# ---------------------------------------------------------------- other remotes
echo "non-application remotes are unaffected"
t "declared backup remote: archive refs allowed" allow \
  "$(guard alloy-mirror "$BAK" <<< "refs/heads/x abc refs/heads/archive/local-recovery/2026-08-03/foo $ZERO")"
t "declared backup remote: 120 new branches allowed" allow \
  "$(for i in $(seq 1 120); do echo "refs/heads/b$i abc refs/heads/b$i $ZERO"; done | guard alloy-mirror "$BAK")"
t "unrelated third-party remote unaffected" allow \
  "$(guard upstream /elsewhere/other.git <<< "refs/heads/x abc refs/heads/archive/foo $ZERO")"

# ---------------------------------------------------------------- end to end
echo "end-to-end against a LOCAL BARE REMOTE (no network, no Vercel)"
T="$(mktemp -d)"
git init -q --bare "$T/ksquared-16/alloy.git" 2>/dev/null || { mkdir -p "$T/ksquared-16"; git init -q --bare "$T/ksquared-16/alloy.git"; }
git init -q "$T/work"
git -C "$T/work" config user.email t@t.invalid
git -C "$T/work" config user.name Test
# This machine sets a GLOBAL core.hooksPath=.githooks, which makes .git/hooks
# inert. The first run of this suite passed its namespace tests while the real
# push hook was never invoked at all. Pin the path explicitly so the end-to-end
# cases genuinely exercise the hook.
git -C "$T/work" config core.hooksPath "$T/work/.git/hooks"
mkdir -p "$T/work/.git/hooks"
cp "$GUARD" "$T/work/.git/hooks/pre-push"
chmod +x "$T/work/.git/hooks/pre-push"
echo hi > "$T/work/f.txt"
git -C "$T/work" add -A && git -C "$T/work" commit -qm c1
git -C "$T/work" branch -M staging
git -C "$T/work" remote add origin "$T/ksquared-16/alloy.git"

export ALLOY_PUSH_GUARD_APP_PATTERN="ksquared-16/alloy"
if git -C "$T/work" push -q origin staging 2>/dev/null; then r=allow; else r=BLOCK; fi
t "REAL push: staging to simulated app origin succeeds" allow "$r"

git -C "$T/work" branch -q archive/local-recovery/2026-08-03/thing
if git -C "$T/work" push -q origin archive/local-recovery/2026-08-03/thing 2>/dev/null; then r=allow; else r=BLOCK; fi
t "REAL push: archive branch to app origin is refused" BLOCK "$r"
t "…and the ref never reached the remote" allow \
  "$([ -z "$(git -C "$T/ksquared-16/alloy.git" for-each-ref --format='%(refname)' 'refs/heads/archive/*')" ] && echo allow || echo BLOCK)"

for i in $(seq 1 12); do git -C "$T/work" branch -q "bulk$i" 2>/dev/null; done
if git -C "$T/work" push -q origin 'refs/heads/bulk*' 2>/dev/null; then r=allow; else r=BLOCK; fi
t "REAL push: 12-branch fan-out is refused" BLOCK "$r"

git init -q --bare "$T/backup-mirror.git"
git -C "$T/work" remote add alloy-mirror "$T/backup-mirror.git"
export ALLOY_PUSH_GUARD_BACKUP_REMOTES="backup-mirror"
if git -C "$T/work" push -q alloy-mirror archive/local-recovery/2026-08-03/thing 2>/dev/null; then r=allow; else r=BLOCK; fi
t "REAL push: archive branch to declared backup remote succeeds" allow "$r"
rm -rf "$T"

echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
