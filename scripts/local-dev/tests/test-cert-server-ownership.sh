#!/usr/bin/env bash
# =============================================================================
# test-cert-server-ownership — the certification server must be a production
# server, owned by a session, and stoppable without collateral damage.
#
# THE FOUR FAILURES THIS GUARDS, all measured on the Mac mini.
#
# 1. THE SERVER DIED WITH ITS LAUNCHER. `cmd_serve` started the app as a plain
#    background job, so it stayed in the launcher's process group and session.
#    When the invoking task ended, the server went with it: HTTP 200 right after
#    startup, waitForURL timeouts a little later, then ERR_CONNECTION_REFUSED,
#    and a server log that stopped mid-normal-service with no application error.
#
# 2. TEARDOWN KILLED BY PATTERN. Finding the server by name or by port cannot
#    distinguish two lanes running the same program. A previous Financials run
#    killed THREE unrelated lane wrapper processes that way.
#
# 3. THE TIMEOUT WAS SPENT ON COMPILATION. A cold Turbopack compile of
#    /workspace measured ~220s against a 240s test budget, so promoted evidence
#    was mostly a compile race.
#
# 4. TURBOPACK PANICKED mid-certification ("PostCSS worker died while processing
#    app/globals.css") and the app then served 500 until the dev cache was
#    cleared.
#
# Hermetic: no database, no Supabase, no application server. Process, metadata
# and string behaviour only. Controlled sleep processes stand in for servers so
# nothing here can touch a real lane.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CERTIFY="${SCRIPT_DIR}/certification/alloy-certify"
DETACH="${SCRIPT_DIR}/certification/lib/cert-detach.pl"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

TMP="$(mktemp -d)"
cleanup() {
    # Only ever the processes this file started, by pid it recorded itself.
    for f in "$TMP"/*.pid; do
        [ -f "$f" ] || continue
        local_pid="$(cat "$f" 2>/dev/null)"
        [ -n "$local_pid" ] && kill -9 "$local_pid" 2>/dev/null
    done
    rm -rf "$TMP"
}
trap cleanup EXIT

# Exercise the real helpers, not a copy. CERT_DIR is redirected so no test can
# read or write a live certification's ownership record.
cert() {
    ALLOY_CERT_TEST_SOURCE=1 bash -c '
        source "'"$CERTIFY"'" >/dev/null 2>&1 || true
        CERT_DIR="'"$TMP"'"
        SERVER_META_FILE="'"$TMP"'/server.json"
        SERVER_PID_FILE="'"$TMP"'/server.pid"
        '"$1"''
}

# ---------------------------------------------------------- A · command selection
got="$(CERT_MODE=production CERT_APP_PORT=3099 cert 'cert_server_command')"
[[ "$got" == *"npm run start"* && "$got" != *"next dev"* ]] \
  && ok "A · production mode selects the canonical production server (npm run start)" \
  || bad "A · production mode did not select npm run start: $got"

got="$(CERT_MODE=dev CERT_APP_PORT=3099 cert 'cert_server_command')"
[[ "$got" == *"next dev"* ]] \
  && ok "A · dev mode remains available for local iteration" \
  || bad "A · dev mode command wrong: $got"

# ---------------------------------------------------------- G · loopback retained
for mode in production dev; do
  got="$(CERT_MODE=$mode CERT_APP_PORT=3099 cert 'cert_server_command')"
  [[ "$got" == *"-H 127.0.0.1"* ]] \
    && ok "G · ${mode} binds loopback explicitly, never the wildcard" \
    || bad "G · ${mode} lost its loopback bind: $got"
done

# ---------------------------------------------------------- K · no dev compile dependency
got="$(CERT_MODE=production CERT_APP_PORT=3099 cert 'cert_server_command')"
[[ "$got" != *"dev"* ]] \
  && ok "K · the promoted path runs no dev bundler, so no first-request compile" \
  || bad "K · production command still mentions dev: $got"
got="$(cert 'echo "$CERT_MODE"')"
[[ "$got" == "production" ]] \
  && ok "K · certification defaults to production rather than next dev" \
  || bad "K · default mode is ${got}, not production"

# ---------------------------------------------------------- B · survives its launcher
# The launcher is a bash -c that EXITS immediately; the server must not.
bash -c "perl '$DETACH' '$TMP/b.log' '$TMP/b.pid' 'exec sleep 120'" || true
sleep 1
bpid="$(cat "$TMP/b.pid" 2>/dev/null | tr -d '[:space:]')"
if [[ -n "$bpid" ]] && kill -0 "$bpid" 2>/dev/null; then
  ok "B · the detached server outlives the shell that launched it (pid $bpid)"
else
  bad "B · detached server did not survive its launcher"
fi

# It must also be its OWN session leader — that is what makes exact teardown
# possible, because its process group then contains nothing else.
if [[ -n "$bpid" ]]; then
  bpgid="$(ps -o pgid= -p "$bpid" 2>/dev/null | tr -d '[:space:]')"
  [[ "$bpgid" == "$bpid" ]] \
    && ok "B · the server leads its own process group (pgid $bpgid == pid)" \
    || bad "B · server pgid ($bpgid) is not its own pid ($bpid) — teardown could reach others"
fi

# ---------------------------------------------------------- C · session metadata
cert "cert_meta_write '$bpid' 3099 'deadbeefcafe' production 'exec npm run start'" >/dev/null 2>&1
for key in session_id worktree sha mode pid port command started_at; do
  v="$(cert "cert_meta_get $key")"
  [[ -n "$v" ]] || { bad "C · metadata is missing ${key}"; break; }
done
[[ "$(cert 'cert_meta_get sha')" == "deadbeefcafe" && "$(cert 'cert_meta_get port')" == "3099" \
   && "$(cert 'cert_meta_get pid')" == "$bpid" ]] \
  && ok "C · the record identifies session, worktree, SHA, mode, PID, port, command and start time" \
  || bad "C · metadata did not round-trip"

# ---------------------------------------------------------- D · reuse only for the exact owner
# Same session + port + SHA + a live pid → ours.
state="$(ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_meta_write '"$bpid"' 3099 deadbeefcafe production "exec sleep 120" >/dev/null
    cert_owned_server_state')"
[[ "$state" == "live" ]] \
  && ok "D · a server matching session, port and SHA is recognised as ours" \
  || bad "D · exact owner was not recognised (state=$state)"

# A different session must never be adopted.
state="$(ALLOY_CERT_SESSION=owner-b CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_owned_server_state')"
[[ "$state" == "foreign" ]] \
  && ok "D · another session's server is foreign, never reused" \
  || bad "D · another session's server reported ${state}, not foreign"

# A different SHA in the same session is also not reusable: it would certify the
# wrong build, which is the defect the staleness check exists to prevent.
state="$(ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo 0000000000; }
    cert_owned_server_state')"
[[ "$state" == "foreign" ]] \
  && ok "D · a server built from another SHA is not reused" \
  || bad "D · a different SHA reported ${state}, not foreign"

# ---------------------------------------------------------- F · stale metadata
dead=$(bash -c 'echo $$')          # a pid that has already exited
state="$(ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_meta_write '"$dead"' 3099 deadbeefcafe production "exec npm run start" >/dev/null
    cert_owned_server_state')"
[[ "$state" == "stale" ]] \
  && ok "F · a record whose process is gone is stale, never live" \
  || bad "F · dead-pid record reported ${state}, not stale"

# A recycled pid now running something else must not be mistaken for the server.
perl -e '$0="totally-unrelated-tool"; sleep 60' &
other=$!; echo "$other" > "$TMP/other.pid"; sleep 1
state="$(ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_meta_write '"$other"' 3099 deadbeefcafe production "exec npm run start" >/dev/null
    cert_owned_server_state')"
[[ "$state" == "stale" ]] \
  && ok "F · a pid now running a different program is stale, not adopted" \
  || bad "F · recycled pid reported ${state}, not stale"

# ---------------------------------------------------------- H · readiness is an answer
# A dead pid can never be ready, whatever the port says.
if cert "cert_http_ready $dead" >/dev/null 2>&1; then
  bad "H · readiness accepted a dead pid"
else
  ok "H · readiness refuses a dead owned pid"
fi
# A live pid with nothing serving the port is not ready either.
if cert "APP_URL=http://127.0.0.1:3099 cert_http_ready $bpid" >/dev/null 2>&1; then
  bad "H · readiness accepted a live pid with no HTTP answer"
else
  ok "H · readiness requires an HTTP answer, not just a live process"
fi

# ---------------------------------------------------------- E/J · teardown is exact
# Session A owns a detached server; Session B is an unrelated process that merely
# looks like one. Stopping A must not touch B.
bash -c "perl '$DETACH' '$TMP/a.log' '$TMP/a.pid' 'exec sleep 120'" || true
sleep 1
apid="$(cat "$TMP/a.pid" 2>/dev/null | tr -d '[:space:]')"
perl -e '$0="node next dev -H 127.0.0.1 -p 3098"; sleep 90' &
bystander=$!; echo "$bystander" > "$TMP/bystander.pid"; sleep 1

stop_out="$(ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_meta_write '"$apid"' 3099 deadbeefcafe production "exec sleep 120" >/dev/null
    cert_assert_port_bindable() { return 0; }
    cmd_app_stop' 2>&1)"

kill -0 "$apid" 2>/dev/null \
  && bad "J · teardown left its own server running (pid $apid)" \
  || ok "J · teardown stops the server it owns"

kill -0 "$bystander" 2>/dev/null \
  && ok "E · an unrelated 'next dev' process is untouched by teardown" \
  || bad "E · teardown killed an unrelated process — the exact collateral damage this closes"

[[ ! -f "$TMP/server.json" ]] \
  && ok "J · the ownership record is removed once the server is stopped" \
  || bad "J · ownership record survived teardown"

# Teardown must refuse a server it does not own, rather than stopping it.
bash -c "perl '$DETACH' '$TMP/c.log' '$TMP/c.pid' 'exec sleep 90'" || true
sleep 1
cpid="$(cat "$TMP/c.pid" 2>/dev/null | tr -d '[:space:]')"
ALLOY_CERT_SESSION=owner-a CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cert_meta_write '"$cpid"' 3099 deadbeefcafe production "exec sleep 90" >/dev/null' >/dev/null 2>&1
if ALLOY_CERT_SESSION=someone-else CERT_APP_PORT=3099 cert '
    cert_head_sha() { echo deadbeefcafe; }
    cmd_app_stop' >/dev/null 2>&1; then
  bad "E · teardown stopped a server belonging to another session"
else
  kill -0 "$cpid" 2>/dev/null \
    && ok "E · another session's server is refused, not stopped" \
    || bad "E · another session's server was killed despite the refusal"
fi
kill -9 "$cpid" 2>/dev/null

# ---------------------------------------------------------- I · required preconditions block the run
# Production refuses to serve an artefact that is not the commit under test —
# the same class of guard as the seed's, one layer down.
grep -q 'rebuild before certifying' "$CERTIFY" \
  && ok "I · production serve refuses a build whose SHA is not the commit being certified" \
  || bad "I · no build/SHA gate before serving"
grep -q 'refusing to certify an empty tenant' "${SCRIPT_DIR}/certification/financials/demo-tenant.sh" \
  && ok "I · a failed representative seed is fatal, never a warning" \
  || bad "I · the seed failure guard is missing"
grep -q 'money seed produced no tally' "${SCRIPT_DIR}/certification/financials/demo-tenant.sh" \
  && ok "I · a seed that prints no tally is not accepted as a pass" \
  || bad "I · the seed tally guard is missing"

# ---------------------------------------------------------- forbidden patterns
if grep -nE 'pkill|killall' "$CERTIFY" >/dev/null 2>&1; then
  bad "E · the certification tool still contains a broad kill pattern"
else
  ok "E · no pkill/killall anywhere in the certification tool"
fi

printf '\npassed=%d failed=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
