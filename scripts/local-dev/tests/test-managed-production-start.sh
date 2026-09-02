#!/usr/bin/env bash
# Focused tests for the managed PRODUCTION server mode of alloy-dev-start.
# Uses fixture secrets only — never reads or prints real service-role values.
#
# WHY THIS EXISTS. Production had no managed path: alloy-dev-start always ran the dev command, and a
# hand-run `next start` inherits only the agent-safe file, so server-side auth cannot resolve a
# session and every route 307s to /login. The fix swaps ONLY the command, so what these tests must
# prove is that production reuses the SAME environment owner — not that a second one behaves like it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

TMP="$(mktemp -d /tmp/alloy-prod.XXXXXX)"
RUNTIME=""
cleanup() {
  if [[ -n "${RUNTIME:-}" ]]; then
    for p in "${RUNTIME}/pids"/*.pid; do
      [[ -f "$p" ]] || continue
      kill "$(tr -d '[:space:]' <"$p")" 2>/dev/null || true
    done
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

ORIGIN="$TMP/origin.git"; CANON="$TMP/canon"; WTROOT="$TMP/worktrees"
RUNTIME="$TMP/runtime"; CONFIG_DIR="$TMP/config"
FIXTURE_SECRET="fixture-service-role-never-real-prod"
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR"

git init --bare "$ORIGIN" >/dev/null
git clone "$ORIGIN" "$CANON" >/dev/null 2>&1
git -C "$CANON" checkout -B staging >/dev/null 2>&1
git -C "$CANON" config user.email "prod@test.com"
git -C "$CANON" config user.name "Prod Test"
mkdir -p "$CANON/web"
cat >"$CANON/web/package.json" <<'EOF'
{"name":"fixture-web","private":true,"scripts":{"dev":"node -e \"setTimeout(()=>{},60000)\""}}
EOF
printf 'fixture\n' >"$CANON/README.md"
git -C "$CANON" add . && git -C "$CANON" commit -m base >/dev/null
git -C "$CANON" push -u origin staging >/dev/null

AGENT_SRC="$TMP/agent-source.env"; TRUSTED_SRC="$TMP/trusted-server.env"
cat >"$AGENT_SRC" <<EOF
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-fixture"
SUPABASE_SERVICE_ROLE_KEY="${FIXTURE_SECRET}"
EOF
cat >"$TRUSTED_SRC" <<EOF
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-fixture"
SUPABASE_SERVICE_ROLE_KEY="${FIXTURE_SECRET}"
EOF

PROBE_SCRIPT="$ROOT/tests/fixtures/fake-trusted-env-probe.mjs"
DEV_PROBE="$TMP/dev-probe.txt"; PROD_PROBE="$TMP/prod-probe.txt"

cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_CONFIG_DIR="$CONFIG_DIR"
ALLOY_BIN_DIR="$TMP/bin"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_CANONICAL_PORT="3000"
ALLOY_FIRST_AGENT_PORT="3011"
ALLOY_MAX_AGENTS="6"
ALLOY_PM="npm"
ALLOY_WEB_DIR="web"
ALLOY_DEV_COMMAND="env ALLOY_TEST_PROBE=$DEV_PROBE node ${PROBE_SCRIPT}"
ALLOY_PROD_COMMAND="env ALLOY_TEST_PROBE=$PROD_PROBE node ${PROBE_SCRIPT}"
ALLOY_ENV_SOURCE="$AGENT_SRC"
ALLOY_SERVER_ENV_SOURCE="$TRUSTED_SRC"
ALLOY_SKIP_URL_CHECK=1
EOF
export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export ALLOY_TEST_FIXTURE_SECRET="$FIXTURE_SECRET"
export PATH="$ROOT:$PATH"

env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" prodmode --slot 2 >/dev/null
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 2 >/dev/null 2>&1 || true
WT="$WTROOT/wt2-prodmode"
LOG="$RUNTIME/logs/wt2-prodmode.log"

start() { env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_TEST_FIXTURE_SECRET="$FIXTURE_SECRET" "$ROOT/alloy-dev-start" "$@"; }
stop()  { env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-stop" wt2-prodmode >/dev/null 2>&1 || true; }

# ── MISSING BUILD ────────────────────────────────────────────────────────────────────────────────
# Production must refuse by NAME rather than silently building: a start that quietly builds hides
# which commit is being served, which a performance certification must never guess.
if OUT="$(start --production wt2-prodmode 2>&1)"; then
  fail "production start succeeded without a build"
else
  grep -qi "production build missing" <<<"$OUT" && pass "missing build fails, naming the prerequisite" \
    || { fail "missing-build error not named"; echo "$OUT" | head -3; }
fi
[[ -f "$PROD_PROBE" ]] && fail "process started despite missing build" || pass "no process started without a build"

# ── DEV PARITY ───────────────────────────────────────────────────────────────────────────────────
if start wt2-prodmode >/dev/null 2>&1; then
  sleep 1
  [[ "$(cat "$DEV_PROBE" 2>/dev/null)" == "present" ]] && pass "dev parity: dev command ran with trusted env" || fail "dev parity"
  [[ -f "$PROD_PROBE" ]] && fail "dev start ran the production command" || pass "dev start does not run the production command"
else
  fail "dev start (unchanged behaviour)"
fi
stop; rm -f "$DEV_PROBE" "$PROD_PROBE"

# ── PRODUCTION START ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$WT/web/.next"   # the artifact the precondition requires
if OUT="$(start --production wt2-prodmode 2>&1)"; then
  sleep 1
  [[ "$(cat "$PROD_PROBE" 2>/dev/null)" == "present" ]] \
    && pass "production runs its own command WITH the same trusted env" || fail "production trusted env"
  [[ -f "$DEV_PROBE" ]] && fail "production start ran the dev command" || pass "production does not run the dev command"
  grep -q "mode:     production" <<<"$OUT" && pass "start reports production mode" || fail "mode not reported"
  grep -q "port:     3012" <<<"$OUT" && pass "canonical slot port bound" || fail "canonical port"
  PIDF="$RUNTIME/pids/wt2-prodmode.pid"
  [[ -s "$PIDF" ]] && kill -0 "$(tr -d '[:space:]' <"$PIDF")" 2>/dev/null \
    && pass "toolkit-owned process recorded and alive" || fail "process ownership"
else
  fail "production start"; echo "$OUT" | head -5
fi

# ── SECRET CONTAINMENT ───────────────────────────────────────────────────────────────────────────
grep -RF "$FIXTURE_SECRET" "$WT" >/dev/null 2>&1 && fail "trusted value written into the worktree" || pass "trusted value absent from worktree files"
grep -F "$FIXTURE_SECRET" "$LOG" >/dev/null 2>&1 && fail "trusted value written to the log" || pass "trusted value absent from the log"
grep -F "$FIXTURE_SECRET" "$RUNTIME/metadata/wt2-prodmode.env" >/dev/null 2>&1 && fail "trusted value in metadata" || pass "trusted value absent from metadata"
grep -q "SUPABASE_SERVICE_ROLE_KEY" "$WT/web/.env.local.agent" 2>/dev/null && fail "privileged NAME in agent env" || pass "privileged name absent from agent env"

# ── DUPLICATE START ──────────────────────────────────────────────────────────────────────────────
start --production wt2-prodmode >/dev/null 2>&1 && fail "duplicate production start allowed" || pass "duplicate start refused"

# ── STOP / RESTART ───────────────────────────────────────────────────────────────────────────────
stop
rm -f "$PROD_PROBE"
if start --production wt2-prodmode >/dev/null 2>&1; then
  sleep 1
  [[ "$(cat "$PROD_PROBE" 2>/dev/null)" == "present" ]] && pass "canonical stop/restart works in production mode" || fail "restart probe"
else
  fail "restart after stop"
fi
stop

# ── UNMANAGED LANE / WRONG SLOT ──────────────────────────────────────────────────────────────────
# Both must fail BEFORE any trusted env is loaded or any process is started.
rm -f "$PROD_PROBE"
start --production wt9-does-not-exist >/dev/null 2>&1 && fail "unmanaged worktree accepted" || pass "unmanaged worktree fails closed"
[[ -f "$PROD_PROBE" ]] && fail "process started for unmanaged worktree" || pass "no process for unmanaged worktree"

start --production >/dev/null 2>&1 && fail "missing worktree argument accepted" || pass "missing argument fails closed"
start --bogus wt2-prodmode >/dev/null 2>&1 && fail "unknown flag accepted" || pass "unknown flag fails closed"

echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
