#!/usr/bin/env bash
# =============================================================================
# certify-docker-containment — executable proof that Docker containment holds.
#
# Certifies five claims, each with a negative control so a pass cannot be
# vacuous:
#   CERT-1  hook blocks `supabase start` outside the shared stack
#   CERT-2  sessions SHARE the stack (a second session adds 0 containers)
#   CERT-3  release is safe (stack survives while others hold leases; volumes
#           survive the final stop)
#   CERT-4  reap is safe (previews by default, protects live stacks, never
#           touches the shared stack)
#   CERT-5  alloy-cert reconstructs from committed migrations + seed
#
# Writes evidence to certification/evidence/docker-containment/.
#
# Usage: certification/certify-docker-containment.sh [--skip-reconstruction]
# =============================================================================
set -uo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$CERT_DIR/.." && pwd)"
EVIDENCE="${CERT_DIR}/evidence/docker-containment"
HOOK="${REPO_ROOT}/scripts/local-dev/hooks/guard-supabase-start.sh"
STACK_CMD="$(command -v alloy-stack || echo "$HOME/.local/share/alloy/bin/alloy-stack")"
SHARED="alloy-cert"
SKIP_RECON=0
[[ "${1:-}" == "--skip-reconstruction" ]] && SKIP_RECON=1

mkdir -p "$EVIDENCE"
LOG="${EVIDENCE}/run.log"
: >"$LOG"

# Certify against an ISOLATED lease registry. The lease store is the unit under
# test, and a real session's lease would otherwise make "last one out stops the
# stack" untestable — the first run of this harness failed exactly that way.
# Docker itself is real; only the registry is sandboxed.
export ALLOY_STACK_STATE_DIR="$(mktemp -d -t alloy-cert-leases)"
trap 'rm -rf "$ALLOY_STACK_STATE_DIR"' EXIT

PASS=0; FAIL=0
declare -a RESULTS=()

say()  { printf '%s\n' "$*" | tee -a "$LOG"; }
check() { # check <id> <description> <expected> <actual>
  local id="$1" desc="$2" want="$3" got="$4"
  if [[ "$got" == "$want" ]]; then
    PASS=$((PASS+1)); RESULTS+=("PASS|$id|$desc|$got")
    printf '  ✓ %-10s %s\n' "$id" "$desc" | tee -a "$LOG"
  else
    FAIL=$((FAIL+1)); RESULTS+=("FAIL|$id|$desc|got=$got want=$want")
    printf '  ✗ %-10s %s (got=%s want=%s)\n' "$id" "$desc" "$got" "$want" | tee -a "$LOG"
  fi
}

ctrs() { docker ps -aq --filter "label=com.supabase.cli.project=$1" 2>/dev/null | wc -l | tr -d ' '; }
vol_exists() { docker volume ls -q 2>/dev/null | grep -qx "$1" && echo yes || echo no; }

hook_verdict() { # hook_verdict <command> -> allow|BLOCK
  local payload
  payload="$(python3 -c 'import json,sys;print(json.dumps({"tool_input":{"command":sys.argv[1]}}))' "$1")"
  printf '%s' "$payload" | "$HOOK" >/dev/null 2>&1 && echo allow || echo BLOCK
}

say "Docker containment certification"
say "================================"
say "repo:      $REPO_ROOT"
say "commit:    $(git -C "$REPO_ROOT" rev-parse HEAD)"
say "branch:    $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
say "date(utc): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "hook:      $HOOK"
say "alloy-stack: $STACK_CMD"
say ""

# ---------------------------------------------------------------- CERT-1 hook
say "CERT-1  hook blocks unsanctioned 'supabase start'"
check C1.1 "bare 'supabase start' blocked"              BLOCK "$(hook_verdict 'supabase start')"
check C1.2 "npx form blocked"                           BLOCK "$(hook_verdict 'npx supabase start')"
check C1.3 "chained after cd blocked"                   BLOCK "$(hook_verdict 'cd /tmp/s && supabase start')"
check C1.4 "foreign --workdir blocked"                  BLOCK "$(hook_verdict 'supabase start --workdir /tmp/other')"
check C1.5 "foreign --workdir= blocked"                 BLOCK "$(hook_verdict 'supabase --workdir=/tmp/other start')"
check C1.6 "absolute binary path blocked"               BLOCK "$(hook_verdict '/opt/homebrew/bin/supabase start')"
check C1.7 "scratchpad bypass (the objhost case)"       BLOCK "$(hook_verdict 'cd /tmp/x/scratchpad/o && supabase start')"
# Negative controls: the hook must not be a blunt instrument.
check C1.8 "shared --workdir ALLOWED"                   allow "$(hook_verdict "supabase start --workdir $REPO_ROOT/certification")"
check C1.9 "'supabase stop' ALLOWED"                    allow "$(hook_verdict 'supabase stop')"
check C1.10 "'supabase db reset' ALLOWED"               allow "$(hook_verdict 'supabase db reset')"
check C1.11 "'supabase status' ALLOWED"                 allow "$(hook_verdict 'supabase status')"
check C1.12 "unrelated command ALLOWED"                 allow "$(hook_verdict 'npm run build')"
check C1.13 "word 'start' in a string ALLOWED"          allow "$(hook_verdict 'echo "supabase started earlier"')"
check C1.14 "alloy-stack self-invocation ALLOWED"       allow "$(hook_verdict 'alloy-stack use')"
say ""

# ---------------------------------------------------------------- CERT-2 share
say "CERT-2  sessions share the stack"
"$STACK_CMD" use cert-session-a >>"$LOG" 2>&1
BASE="$(ctrs "$SHARED")"
"$STACK_CMD" use cert-session-b >>"$LOG" 2>&1
AFTER="$(ctrs "$SHARED")"
check C2.1 "shared stack is up"                         yes "$([[ "$BASE" -gt 0 ]] && echo yes || echo no)"
check C2.2 "2nd session adds 0 containers"              "$BASE" "$AFTER"
check C2.3 "both leases recorded"                       2 "$("$STACK_CMD" status 2>/dev/null | grep -c 'cert-session-')"
say ""

# ---------------------------------------------------------------- CERT-3 release
say "CERT-3  release is safe"
"$STACK_CMD" release cert-session-b >>"$LOG" 2>&1
check C3.1 "stack survives while a lease remains"       "$BASE" "$(ctrs "$SHARED")"
check C3.2 "released lease is gone"                     1 "$("$STACK_CMD" status 2>/dev/null | grep -c 'cert-session-')"
# Final release must stop the stack but PRESERVE the data volume.
"$STACK_CMD" release cert-session-a >>"$LOG" 2>&1
check C3.3 "last release stops the stack"               0 "$(ctrs "$SHARED")"
check C3.4 "data volume PRESERVED across stop"          yes "$(vol_exists "supabase_db_${SHARED}")"
say ""

# ---------------------------------------------------------------- CERT-4 reap
say "CERT-4  reap is safe"
docker run -d --name cert_reap_probe --label "com.supabase.cli.project=alloy-certprobe" \
  alpine sleep 300 >/dev/null 2>&1
check C4.1 "young stack SKIPPED without --force"        1 "$("$STACK_CMD" reap 2>&1 | grep -c 'SKIP alloy-certprobe')"
check C4.2 "probe survived the skip"                    1 "$(ctrs alloy-certprobe)"
check C4.3 "--force alone only PREVIEWS"                1 "$("$STACK_CMD" reap --force 2>&1 | grep -c 'PREVIEW ONLY')"
check C4.4 "probe survived the preview"                 1 "$(ctrs alloy-certprobe)"
"$STACK_CMD" reap --force --confirm >>"$LOG" 2>&1
check C4.5 "--force --confirm removes it"               0 "$(ctrs alloy-certprobe)"
check C4.6 "shared stack volume untouched by reap"      yes "$(vol_exists "supabase_db_${SHARED}")"
docker rm -f cert_reap_probe >/dev/null 2>&1 || true
say ""

# ---------------------------------------------------------------- CERT-5 rebuild
if [[ "$SKIP_RECON" -eq 1 ]]; then
  say "CERT-5  reconstruction SKIPPED (--skip-reconstruction)"
else
  say "CERT-5  alloy-cert reconstructs from committed migrations + seed"
  # Destroy the data volume outright — this is the real test.
  docker volume rm "supabase_db_${SHARED}" >/dev/null 2>&1 || true
  docker volume rm "supabase_storage_${SHARED}" >/dev/null 2>&1 || true
  check C5.1 "data volume destroyed before rebuild"     no "$(vol_exists "supabase_db_${SHARED}")"
  T0=$(date +%s)
  ALLOY_STACK_INTERNAL=1 "$STACK_CMD" use cert-rebuild >>"$LOG" 2>&1
  T1=$(date +%s)
  check C5.2 "stack rebuilt and running"                yes "$([[ "$(ctrs "$SHARED")" -gt 0 ]] && echo yes || echo no)"
  say "        rebuild took $((T1-T0))s"
  DB="$(docker ps -q --filter "name=supabase_db_${SHARED}" | head -1)"
  # Schema present?
  TBLS="$(docker exec "$DB" psql -U postgres -tAc \
    "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d ' \r')"
  check C5.3 "public schema restored (>100 tables)"     yes "$([[ "${TBLS:-0}" -gt 100 ]] && echo yes || echo no)"
  say "        public tables: ${TBLS:-unknown}"
  # Seeded tenant present?
  ORG="$(docker exec "$DB" psql -U postgres -tAc \
    "select count(*) from public.orgs where slug='northwind-early-learning'" 2>/dev/null | tr -d ' \r')"
  check C5.4 "synthetic tenant reseeded"                1 "${ORG:-0}"
  # Migration ledger applied?
  MIG="$(docker exec "$DB" psql -U postgres -tAc \
    "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null | tr -d ' \r')"
  check C5.5 "migration ledger populated (>250)"        yes "$([[ "${MIG:-0}" -gt 250 ]] && echo yes || echo no)"
  say "        migrations applied: ${MIG:-unknown}"
  "$STACK_CMD" release cert-rebuild --keep-running >>"$LOG" 2>&1
fi
say ""

# ---------------------------------------------------------------- report
say "Result: ${PASS} passed, ${FAIL} failed"
{
  echo "# Docker containment — certification evidence"
  echo
  echo "| field | value |"
  echo "|---|---|"
  echo "| commit | \`$(git -C "$REPO_ROOT" rev-parse HEAD)\` |"
  echo "| branch | \`$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)\` |"
  echo "| date (UTC) | $(date -u +%Y-%m-%dT%H:%M:%SZ) |"
  echo "| host | $(uname -srm) |"
  echo "| result | **${PASS} passed, ${FAIL} failed** |"
  echo
  echo "Each claim carries a negative control, so a pass cannot be vacuous:"
  echo "CERT-1 proves the hook blocks the bad path *and* still allows stop/reset/status;"
  echo "CERT-4 proves reap removes a stack *and* refuses to without \`--confirm\`."
  echo
  echo "| id | result | check | detail |"
  echo "|---|---|---|---|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st id desc det <<<"$r"
    icon=$([[ "$st" == PASS ]] && echo "✅" || echo "❌")
    echo "| \`$id\` | $icon $st | $desc | \`$det\` |"
  done
  echo
  echo "Raw log: [\`run.log\`](run.log)"
} > "${EVIDENCE}/CERTIFICATION.md"

say "evidence: ${EVIDENCE}/CERTIFICATION.md"
[[ "$FAIL" -eq 0 ]]
