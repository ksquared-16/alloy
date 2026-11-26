#!/usr/bin/env bash
set -euo pipefail
PROJECT_REF="${SUPABASE_PROJECT_REF:-vslwnntzzgpnmrpjipat}"
echo "Supabase preview branch cleanup for ${PROJECT_REF}"
echo "Protected: main, staging, production"
echo "Run: supabase branches list --project-ref ${PROJECT_REF}"
echo "Then delete stale branches not tied to open PRs via dashboard or:"
echo "  supabase branches delete <branch-id> --project-ref ${PROJECT_REF}"
