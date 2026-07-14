#!/usr/bin/env bash
# Focused tests: directory-symlink installer + validator classification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_true() {
  local msg="$1"; shift
  if "$@"; then pass "$msg"; else fail "$msg"; fi
}

assert_false() {
  local msg="$1"; shift
  if "$@"; then fail "$msg"; else pass "$msg"; fi
}

# shellcheck source=../lib/common.sh
source "${ROOT}/lib/common.sh"

TMP="$(mktemp -d /tmp/alloy-local-dev-install.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "== Validator classification =="

assert_true "classify real tsc path" \
  alloy_command_is_active_validator \
  "1234 node --max-old-space-size=4096 /repo/web/node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit"

assert_true "classify real tsc argv0" \
  alloy_command_is_active_validator \
  "/usr/local/bin/tsc -p tsconfig.json --noEmit"

assert_true "classify real vitest" \
  alloy_command_is_active_validator \
  "node /repo/web/node_modules/vitest/vitest.mjs run --maxWorkers=2"

assert_true "classify vitest argv0" \
  alloy_command_is_active_validator \
  "vitest run tests/foo.test.ts"

assert_true "classify next build" \
  alloy_command_is_active_validator \
  "node /repo/web/node_modules/next/dist/bin/next build"

# next build via npm script typically ends up as `next build` in the child argv
assert_true "classify next build tokens" \
  alloy_command_is_active_validator \
  "/repo/web/node_modules/.bin/next build"

assert_true "classify playwright test" \
  alloy_command_is_active_validator \
  "node /repo/web/node_modules/@playwright/test/cli.js test --workers=1"

assert_true "classify playwright test argv" \
  alloy_command_is_active_validator \
  "npx playwright test --workers=1"

assert_true "classify alloy-validate" \
  alloy_command_is_active_validator \
  "bash /repo/scripts/local-dev/alloy-validate wt1-x typecheck"

assert_false "ignore cursor sandbox playwright hostname policy" \
  alloy_command_is_active_validator \
  'Cursor.app/Contents/Resources/helpers/cursorsandbox --policy-json {"networkAllowlist":["playwright.azureedge.net"]}'

assert_false "ignore extension host" \
  alloy_command_is_active_validator \
  "/Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin) --type=extension-host"

assert_false "ignore inspection alloy-health" \
  alloy_command_is_active_validator \
  "bash /repo/scripts/local-dev/alloy-health"

assert_false "ignore grep inspector" \
  alloy_command_is_active_validator \
  "grep playwright /tmp/ps-out.txt"

assert_false "ignore rg inspector" \
  alloy_command_is_active_validator \
  "rg vitest /tmp/ps-out.txt"

assert_false "ignore bare playwright hostname substring" \
  alloy_command_is_active_validator \
  "curl https://playwright.azureedge.net/builds/index.json"

echo "== Installer directory symlink model =="

# Source tree that includes spaces in its path.
SPACE_SRC="$TMP/path with spaces/local-dev"
mkdir -p "$TMP/path with spaces"
cp -R "$ROOT" "$SPACE_SRC"
chmod +x "$SPACE_SRC"/install.sh "$SPACE_SRC"/alloy-* "$SPACE_SRC"/lib/*.sh "$SPACE_SRC"/tests/*.sh

HOME_A="$TMP/home-a"
mkdir -p "$HOME_A/.config/alloy-dev" "$HOME_A/bin"
printf 'PRESERVE_MARKER=1\nALLOY_REPO="/tmp/unused"\n' >"$HOME_A/.config/alloy-dev/config"

# Isolate from any caller-exported ALLOY_CONFIG_FILE (fixture suite).
run_install() {
  local home_dir="$1"
  HOME="$home_dir" env -u ALLOY_CONFIG_FILE bash "$SPACE_SRC/install.sh"
}

OUT_A="$(run_install "$HOME_A")"
echo "$OUT_A" | grep -Fq "Installed toolkit:" && pass "installer prints Installed toolkit header" || fail "missing Installed toolkit header"
echo "$OUT_A" | grep -Fq "${HOME_A}/bin/alloy-dev -> ${SPACE_SRC}" && pass "installer prints source directory symlink" || fail "missing symlink mapping line"

[[ -L "$HOME_A/bin/alloy-dev" ]] && pass "complete source directory is linked" || fail "install path is not a symlink"
TARGET="$(readlink "$HOME_A/bin/alloy-dev")"
[[ "$TARGET" == "$SPACE_SRC" ]] && pass "symlink target is source local-dev" || fail "bad symlink target ($TARGET)"

[[ -e "$HOME_A/bin/alloy-dev/lib/common.sh" ]] && pass "lib/common.sh resolves" || fail "lib/common.sh missing"
[[ -e "$HOME_A/bin/alloy-dev/lib/lock.sh" ]] && pass "lib/lock.sh resolves" || fail "lib/lock.sh missing"
[[ -e "$HOME_A/bin/alloy-dev/lib/agent.sh" ]] && pass "lib/agent.sh resolves" || fail "lib/agent.sh missing"
[[ -e "$HOME_A/bin/alloy-dev/alloy-config.example" ]] && pass "alloy-config.example resolves" || fail "example missing"
[[ -e "$HOME_A/bin/alloy-dev/alloy-agent-create" ]] && pass "alloy-agent-create resolves" || fail "alloy-agent-create missing"
[[ -e "$HOME_A/bin/alloy-dev/shell-aliases.sh" ]] && pass "shell-aliases.sh resolves" || fail "shell-aliases missing"

# Commands start (exit quickly via help / early config load). No network.
if HOME="$HOME_A" env -u ALLOY_CONFIG_FILE "$HOME_A/bin/alloy-dev/alloy-health" >/tmp/alloy-health-install.out 2>/tmp/alloy-health-install.err; then
  pass "alloy-health starts after installation"
else
  # Config may point at missing repo; still counts as started if it progressed past sourcing libs.
  if grep -Eq 'Active validators|Memory / load|error: ALLOY_REPO' /tmp/alloy-health-install.out /tmp/alloy-health-install.err 2>/dev/null; then
    pass "alloy-health starts after installation"
  else
    fail "alloy-health failed to start"
    sed -n '1,40p' /tmp/alloy-health-install.err >&2 || true
  fi
fi

if HOME="$HOME_A" env -u ALLOY_CONFIG_FILE "$HOME_A/bin/alloy-dev/alloy-audit" >/tmp/alloy-audit-install.out 2>/tmp/alloy-audit-install.err; then
  pass "alloy-audit starts after installation"
else
  if grep -Eq 'Mac hardware summary|RAM / memory pressure|error: ALLOY_REPO' /tmp/alloy-audit-install.out /tmp/alloy-audit-install.err 2>/dev/null; then
    pass "alloy-audit starts after installation"
  else
    fail "alloy-audit failed to start"
    sed -n '1,40p' /tmp/alloy-audit-install.err >&2 || true
  fi
fi

# Reinstall idempotent
run_install "$HOME_A" >/tmp/alloy-install-re.out
[[ -L "$HOME_A/bin/alloy-dev" ]] && [[ "$(readlink "$HOME_A/bin/alloy-dev")" == "$SPACE_SRC" ]] \
  && pass "reinstall is idempotent" || fail "reinstall changed install model"
grep -q "PRESERVE_MARKER=1" "$HOME_A/.config/alloy-dev/config" && pass "existing config is preserved" || fail "config overwritten"

# Repair incomplete per-command directory from original installer.
HOME_B="$TMP/home-b"
mkdir -p "$HOME_B/bin/alloy-dev" "$HOME_B/.config/alloy-dev"
for cmd in alloy-worktree-create alloy-worktree-sync alloy-worktree-remove alloy-dev-start alloy-dev-stop \
  alloy-dev-status alloy-validate alloy-health alloy-audit alloy-clean; do
  ln -s "/nonexistent/${cmd}" "$HOME_B/bin/alloy-dev/${cmd}"
done
printf 'KEEP=1\n' >"$HOME_B/.config/alloy-dev/config"
run_install "$HOME_B" >/tmp/alloy-install-repair.out
[[ -L "$HOME_B/bin/alloy-dev" ]] && [[ "$(readlink "$HOME_B/bin/alloy-dev")" == "$SPACE_SRC" ]] \
  && pass "incomplete toolkit directory safely repaired" || fail "failed to repair incomplete install"
[[ -e "$HOME_B/bin/alloy-dev/lib/common.sh" ]] && pass "repaired install resolves lib/common.sh" || fail "repair missing lib"
grep -q "KEEP=1" "$HOME_B/.config/alloy-dev/config" && pass "repair preserves config" || fail "repair overwrote config"

# Refuse unrelated real directory.
HOME_C="$TMP/home-c"
mkdir -p "$HOME_C/bin/alloy-dev" "$HOME_C/.config/alloy-dev"
printf 'unrelated notes\n' >"$HOME_C/bin/alloy-dev/notes.txt"
printf 'SAFE=1\n' >"$HOME_C/.config/alloy-dev/config"
set +e
run_install "$HOME_C" >/tmp/alloy-install-refuse.out 2>/tmp/alloy-install-refuse.err
rc=$?
set -e
[[ "$rc" -ne 0 ]] && pass "unrelated real directory is refused" || fail "unrelated directory was replaced"
[[ -f "$HOME_C/bin/alloy-dev/notes.txt" ]] && pass "unrelated directory not removed" || fail "unrelated directory was deleted"
grep -q "SAFE=1" "$HOME_C/.config/alloy-dev/config" && pass "refuse path preserves config" || fail "refuse overwrote config"
[[ ! -L "$HOME_C/bin/alloy-dev" ]] && pass "refuse left non-symlink directory intact" || fail "refuse unexpectedly symlinked"

# Existing unrelated ~/bin is left alone.
[[ -d "$HOME_A/bin" ]] && pass "existing unrelated ~/bin directory preserved" || fail "~/bin missing after install"

echo
echo "Focused results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
