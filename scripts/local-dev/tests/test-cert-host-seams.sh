#!/usr/bin/env bash
# =============================================================================
# test-cert-host-seams — certification must not depend on tools the host lacks,
# nor choose a port it cannot bind.
#
# TWO FAILURES THIS GUARDS, both measured on the Mac mini.
#
# 1. THE SEED HAD NO CLIENT. Every seed step shelled out to a host `psql`. This
#    host has none — not on PATH, not in Homebrew, no Postgres.app — so the
#    representative seed failed on every run, and `ensure_seeded` returned 0
#    anyway, so certification proceeded against a database it had never seeded.
#    The client it needed was inside the stack the whole time.
#
# 2. THE PORT HAD AN INVISIBLE OWNER. Certification defaults to 3011, inside the
#    managed slot range that Tailscale Serve publishes. Serve holds each mapped
#    port on the tailnet interface, so a WILDCARD bind fails EADDRINUSE while
#    127.0.0.1 stays free — and `lsof -ti tcp:PORT` shows no listener, so the
#    pre-flight declared the port free and `next dev` then died against an owner
#    nothing had named.
#
# Touches no database, starts no server. String and bind behaviour only.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CERTIFY="${SCRIPT_DIR}/certification/alloy-certify"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

# Exercise the real helpers, not a copy of them.
cert() { ALLOY_CERT_TEST_SOURCE=1 bash -c 'source "'"$CERTIFY"'" >/dev/null 2>&1 || true; '"$1"''; }

# ------------------------------------------------------ seed client seam
got="$(cert 'cert_db_url_incontainer "postgresql://postgres:postgres@127.0.0.1:54422/postgres"')"
[[ "$got" == "postgresql://postgres:postgres@127.0.0.1:5432/postgres" ]] \
  && ok "in-container URL keeps credentials and database, retargets the container's own postgres" \
  || bad "in-container URL wrong: $got"

got="$(cert 'cert_db_url_incontainer "postgresql://alice:s3cret@127.0.0.1:9999/certdb"')"
[[ "$got" == "postgresql://alice:s3cret@127.0.0.1:5432/certdb" ]] \
  && ok "nothing is hardcoded that the stack could change (user/password/db preserved)" \
  || bad "credentials or db name not preserved: $got"

got="$(cert 'cert_db_container')"
[[ "$got" == "supabase_db_alloy-cert" ]] \
  && ok "db container is derived from the sanctioned project id" \
  || bad "container name wrong: $got"

# The regression that started it: no seed step may call a host psql directly.
body="$(sed -n '/^cmd_seed() {/,/^}/p' "$CERTIFY")"
grep -q 'psql "$db"' <<<"$body" \
  && bad "cmd_seed still calls a host psql directly" \
  || ok "cmd_seed routes every statement through the client seam"

grep -q 'docker exec' <<<"$(sed -n '/^cert_psql_f() {/,/^}/p' "$CERTIFY")" \
  && ok "the seam falls back to the client inside the sanctioned container" \
  || bad "no container fallback in cert_psql_f"

# ------------------------------------------------------ port ownership
grep -q 'next dev -H 127.0.0.1' "$CERTIFY" \
  && ok "certification binds loopback explicitly, never the wildcard" \
  || bad "next dev still binds the wildcard"

# A free port is bindable.
free_port="$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})' 2>/dev/null)"
if [[ -n "$free_port" ]]; then
  cert "cert_assert_port_bindable $free_port" >/dev/null 2>&1 \
    && ok "a free port passes the pre-flight" \
    || bad "a free port was rejected ($free_port)"
fi

# An occupied loopback port is refused — the case lsof could not see is now the
# case that is actually tested: we hold the port ourselves and ask.
# Hold a port from this shell, read the port it printed, then probe it.
tmpf="$(mktemp)"
node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);});setTimeout(()=>process.exit(0),8000);' >"$tmpf" 2>/dev/null &
holder_pid=$!
sleep 1
p="$(head -1 "$tmpf" 2>/dev/null)"
if [[ -n "$p" ]]; then
  cert "cert_assert_port_bindable $p" >/dev/null 2>&1 \
    && bad "an occupied port passed the pre-flight ($p)" \
    || ok "an occupied port is refused before the server is started"
else
  bad "could not establish a held port for the negative control"
fi
# `disown` first, or the shell prints a Terminated line that reads like a failure.
disown "$holder_pid" 2>/dev/null || true
kill "$holder_pid" 2>/dev/null; wait "$holder_pid" 2>/dev/null; rm -f "$tmpf"

printf '\npassed=%d failed=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
