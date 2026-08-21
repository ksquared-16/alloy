#!/usr/bin/env bash
# Isolated production build for performance certification.
#
# `ALLOY_PROD_CERT_DIST=1` redirects distDir to `.next-prodcert` so this build cannot clobber a
# running dev server's `.next`. Two leaks defeat that isolation unless handled here:
#
#   1. Next REWRITES the tracked `next-env.d.ts` to reference the ACTIVE distDir's routes.d.ts.
#      Committed, that points every dev and CI typecheck at `.next-prodcert/types`, which exists
#      on no other machine. We snapshot and restore it.
#   2. `tsconfig.json` includes `.next/dev/types/**/*.ts`, so a STALE dev-build validator is
#      compiled as part of the production build. One left over from 2026-08-17 referenced
#      `app/adminV2/settings/users-roles/page.js`, a route since deleted, and failed the build
#      with a type error that had nothing to do with the source tree. We clear it first.
#
# Heavy build goes through the validation broker (host-wide lease) — never raw `next build`.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/Users/Kelly/.nvm/versions/node/v22.21.1/bin:/usr/sbin:$PATH"   # arm64 node; x64 breaks prod builds here
export ALLOY_PROD_CERT_DIST=1
export ALLOY_ROUTE_TIMING="${ALLOY_ROUTE_TIMING:-1}"                          # must be set FOR THE BUILD: middleware is Edge, env is inlined
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"              # default heap OOMs (SIGABRT) on this tree

VAC="${VAC_BIN:-/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2/scripts/local-dev/vac}"
SNAP="$(mktemp)"; cp next-env.d.ts "$SNAP"
restore() { cp "$SNAP" next-env.d.ts; rm -f "$SNAP"; }
trap restore EXIT

rm -rf .next/dev/types .next/types
"$VAC" run build
rc=$?

# Spotlight indexes the hundreds of MB a build just wrote, and mds then runs at >100% CPU for
# minutes — which disqualifies the host on the very gate you need to pass to REMEASURE the change
# you just built. `.metadata_never_index` is honoured without sudo. Re-stamped after every build
# because the marker does not survive a distDir that gets recreated.
mkdir -p .next-prodcert .next
touch .next-prodcert/.metadata_never_index .next/.metadata_never_index
[ "$rc" -eq 0 ] && echo "PE3 prod build OK -> .next-prodcert" || echo "PE3 prod build FAILED rc=$rc"
exit "$rc"
