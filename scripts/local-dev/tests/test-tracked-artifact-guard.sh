#!/usr/bin/env bash
# =============================================================================
# test-tracked-artifact-guard — no dependency artifact, and no cross-worktree
# symlink, may be tracked in Git.
#
# The failure this guards: `web/node_modules` was committed to staging as a
# symlink into wt4-phase7-slice3-participant-runtime. Every fresh worktree then
# checked out a dependency path pointing at ANOTHER worktree — which crashed
# Turbopack and made new checkouts silently depend on a sibling's install.
#
# It slipped in because .gitignore carried `node_modules/` and `**/node_modules/`
# — trailing slashes match DIRECTORIES only, and a symlink is not a directory,
# so `git add -A` picked it up.
#
# The guard is deliberately narrow: it fails on dependency artifacts and on
# symlinks resolving into a managed worktree. It does NOT fail on ordinary
# relative source symlinks (certification/supabase/migrations is legitimate) or
# on absolute links to system paths.
# =============================================================================
set -uo pipefail

REPO="${1:-$(git rev-parse --show-toplevel)}"
WORKTREE_ROOT="${ALLOY_WORKTREE_ROOT:-$HOME/Code/alloy-worktrees}"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

# --- the guard itself -------------------------------------------------------
# Prints one violation per line. Empty output = clean.
tracked_artifact_violations() {
  local repo="$1" ref="${2:-}"
  local list
  if [[ -n "$ref" ]]; then list="$(git -C "$repo" ls-tree -r --name-only "$ref")"
  else list="$(git -C "$repo" ls-files)"; fi

  # 1. any tracked path NAMED node_modules, or 2. beneath one
  printf '%s\n' "$list" | grep -E '(^|/)node_modules(/|$)' \
    | sed 's/^/tracked-dependency-path: /'

  # 3. symlinks resolving into a managed worktree
  local mode path target
  while read -r mode _ _ path; do
    [[ "$mode" == "120000" ]] || continue
    if [[ -n "$ref" ]]; then target="$(git -C "$repo" show "${ref}:${path}" 2>/dev/null)"
    else target="$(readlink "${repo}/${path}" 2>/dev/null)"; fi
    case "$target" in
      "$WORKTREE_ROOT"/*|*/alloy-worktrees/*|*/.claude/worktrees/*)
        printf 'cross-worktree-symlink: %s -> %s\n' "$path" "$target" ;;
    esac
  done < <(if [[ -n "$ref" ]]; then git -C "$repo" ls-tree -r "$ref"; else git -C "$repo" ls-files -s | awk '{print $1" x x "$4}'; fi)
}

echo "tracked artifact guard"
echo "======================"

# ---------------------------------------------------------------- real repo
echo "the actual repository"
V="$(tracked_artifact_violations "$REPO")"
if [[ -z "$V" ]]; then ok "working tree is clean of tracked dependency paths and cross-worktree symlinks"
else bad "violations found:"; printf '%s\n' "$V" | sed 's/^/      /'; fi

# ---------------------------------------------------------------- fixtures
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkfix() { # mkfix <name> -> repo path
  local d="$T/$1"; mkdir -p "$d/web"; git init -q "$d"
  git -C "$d" config user.email t@t.invalid; git -C "$d" config user.name T
  echo hi > "$d/web/app.ts"; git -C "$d" add -A; git -C "$d" commit -qm base
  printf '%s\n' "$d"
}

echo "NEGATIVE CONTROLS — must FAIL the guard"

R="$(mkfix nm-symlink)"
ln -sfn "$WORKTREE_ROOT/wt4-something/web/node_modules" "$R/web/node_modules"
git -C "$R" add -f web/node_modules >/dev/null 2>&1
V="$(tracked_artifact_violations "$R")"
[[ -n "$V" ]] && ok "tracked web/node_modules symlink → caught" || bad "tracked web/node_modules symlink → MISSED"

R="$(mkfix nm-file)"
mkdir -p "$R/web/node_modules/left-pad"; echo x > "$R/web/node_modules/left-pad/index.js"
git -C "$R" add -f web/node_modules >/dev/null 2>&1
V="$(tracked_artifact_violations "$R")"
[[ -n "$V" ]] && ok "tracked dependency file under node_modules → caught" || bad "tracked file under node_modules → MISSED"

R="$(mkfix abs-symlink)"
ln -sfn "$WORKTREE_ROOT/wt6-other/web/lib/thing.ts" "$R/web/borrowed.ts"
git -C "$R" add -f web/borrowed.ts >/dev/null 2>&1
V="$(tracked_artifact_violations "$R")"
[[ -n "$V" ]] && ok "absolute symlink into another worktree → caught" || bad "cross-worktree symlink → MISSED"

echo "POSITIVE CONTROLS — must PASS the guard"

R="$(mkfix untracked-nm)"
mkdir -p "$R/web/node_modules/left-pad"; echo x > "$R/web/node_modules/left-pad/index.js"
printf 'node_modules\nnode_modules/\n' > "$R/.gitignore"
git -C "$R" add .gitignore >/dev/null 2>&1; git -C "$R" commit -qm ignore
V="$(tracked_artifact_violations "$R")"
[[ -z "$V" ]] && ok "ordinary UNTRACKED local node_modules → allowed" || bad "untracked node_modules wrongly flagged"

R="$(mkfix rel-symlink)"
mkdir -p "$R/supabase/migrations" "$R/certification/supabase"
echo m > "$R/supabase/migrations/1.sql"
ln -sfn "../../supabase/migrations" "$R/certification/supabase/migrations"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -qm rel
V="$(tracked_artifact_violations "$R")"
[[ -z "$V" ]] && ok "legitimate RELATIVE source symlink → allowed" || bad "relative source symlink wrongly flagged"

R="$(mkfix sys-symlink)"
ln -sfn "/usr/local/bin/python3" "$R/web/python3"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -qm sys
V="$(tracked_artifact_violations "$R")"
[[ -z "$V" ]] && ok "absolute symlink to a SYSTEM path (not a worktree) → allowed" || bad "system symlink wrongly flagged"

R="$(mkfix plain)"
V="$(tracked_artifact_violations "$R")"
[[ -z "$V" ]] && ok "ordinary repository files → allowed" || bad "plain repo wrongly flagged"

echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
