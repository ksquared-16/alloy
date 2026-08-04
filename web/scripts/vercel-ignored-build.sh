#!/usr/bin/env bash
# Vercel Ignored Build Step helper.
# Exit 0 → skip this deployment. Exit 1 → proceed with build.
#
# Policy: only staging/main (production lane) auto-deploy.
# Feature / agent / hotfix branches do not create Preview deploys on every push.
# Promote work via PR → staging (or an explicit checkpoint Kelly authorizes).
set -euo pipefail

ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  staging|main|master)
    echo "vercel-ignored-build: proceed for protected ref '$ref'"
    exit 1
    ;;
  "")
    # Manual/cli deploy without a git ref — allow (operator-initiated).
    echo "vercel-ignored-build: no VERCEL_GIT_COMMIT_REF; proceed (manual deploy)"
    exit 1
    ;;
  *)
    echo "vercel-ignored-build: skip auto-deploy for branch '$ref'"
    echo "  Feature branches deploy only after merge to staging (or an explicit checkpoint)."
    exit 0
    ;;
esac
