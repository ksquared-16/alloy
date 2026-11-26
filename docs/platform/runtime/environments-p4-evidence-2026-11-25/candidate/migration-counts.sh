#!/usr/bin/env bash
# Migration counts per ref, from git objects only (no checkout, no fetch, no database).
# Usage: migration-counts.sh [staging-ref] [main-ref] [candidate-ref]
set -euo pipefail
S=${1:-origin/staging}; M=${2:-origin/main}; C=${3:-refs/candidates/aly-14-p4-staging-to-main}
B=$(git merge-base "$S" "$M")
P=supabase/migrations/
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
list() { git ls-tree --name-only "$1" "$P" | sed "s|^$P||" | sort; }
ver()  { sed 's|_.*||' | sort; }
echo "# refs"
for r in "$S" "$M" "$C"; do echo "$r $(git rev-parse "$r")"; done
echo "merge-base $B"
echo "# files and distinct versions per ref"
for r in "$S" "$M" "$B" "$C"; do
  list "$r" > "$tmp/l"
  echo "$r files=$(wc -l < "$tmp/l" | tr -d ' ') distinct_versions=$(ver < "$tmp/l" | uniq | wc -l | tr -d ' ') head=$(tail -1 "$tmp/l" | sed 's|_.*||')"
done
echo "# duplicate versions on $M (a ledger keys on version, so these cannot all be recorded)"
list "$M" | ver | uniq -c | awk '$1>1{print $2" x"$1}'
echo "# by file name"
list "$S" > "$tmp/s"; list "$M" > "$tmp/m"
echo "in both=$(comm -12 "$tmp/s" "$tmp/m" | wc -l | tr -d ' ') staging-only=$(comm -23 "$tmp/s" "$tmp/m" | wc -l | tr -d ' ') main-only=$(comm -13 "$tmp/s" "$tmp/m" | wc -l | tr -d ' ')"
echo "# by content (git diff -M $M $S)"
git diff --name-status -M "$M" "$S" -- "$P" | awk '{print substr($1,1,1)}' | sort | uniq -c
git diff --name-status -M "$M" "$S" -- "$P" | grep -v '^A' || true
echo "# staging files at or below the hosted-staging ledger head of 2026-10-20 (P3 S7)"
echo "le_20261129090000=$(list "$S" | ver | awk '$1<=20261129090000' | wc -l | tr -d ' ')"
echo "# candidate vs staging under $P"
echo "differing_paths=$(git diff --name-only "$S" "$C" -- "$P" | wc -l | tr -d ' ')"
