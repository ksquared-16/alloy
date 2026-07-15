#!/usr/bin/env bash
# Focused tests: evidence file size reporting (BSD + GNU stat paths).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"

TMP="$(mktemp -d /tmp/alloy-ev-size.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# Known-size file — marker must not appear in evidence output.
FILE="$TMP/verify-fixture.json"
python3 -c "open('$FILE','wb').write(b'EVIDENCE_BYTES_SHOULD_NOT_APPEAR' + b'x'*2000)"
chmod 600 "$FILE"

BYTES="$(alloy_file_byte_size "$FILE")"
[[ "$BYTES" =~ ^[0-9]+$ && "$BYTES" -gt 2000 ]] && pass "BSD stat byte size ($BYTES)" || fail "BSD bytes ($BYTES)"

SIZE="$(alloy_path_size_human "$FILE")"
[[ "$SIZE" != "missing" && "$SIZE" != "unknown" ]] && pass "file size human-readable ($SIZE)" || fail "file size ($SIZE)"
echo "$SIZE" | grep -qiE '^[0-9.]+[BKMGTP]?B?$|^[0-9]+B$' && pass "size format plausible" || fail "size format ($SIZE)"

# Directory still works
DIR="$TMP/evidence-dir"
mkdir -p "$DIR"
cp "$FILE" "$DIR/"
DIR_SIZE="$(alloy_path_size_human "$DIR")"
[[ "$DIR_SIZE" != "missing" && "$DIR_SIZE" != "unknown" ]] && pass "directory size ($DIR_SIZE)" || fail "dir size"

# Evidence dir + metadata (before config load below)
EVIDENCE_ROOT="$TMP/runtime/evidence/wt-fixture"
mkdir -p "$EVIDENCE_ROOT" "$TMP/runtime/metadata"
cp "$FILE" "$EVIDENCE_ROOT/verify-fixture.json"
cat >"$TMP/runtime/metadata/wt-fixture.env" <<EOF
ALLOY_WORKTREE_NAME="wt-fixture"
ALLOY_WORKTREE_PATH="$TMP/wt"
ALLOY_WORKTREE_SLOT="1"
ALLOY_WORKTREE_BRANCH="main"
ALLOY_AGENT="cursor"
ALLOY_AGENT_STATUS="active"
PORT="3011"
EOF
mkdir -p "$TMP/wt"

# alloy-agent-evidence integration (metadata + config)
cat >"$TMP/config" <<EOF
ALLOY_REPO="$TMP/wt"
ALLOY_RUNTIME_ROOT="$TMP/runtime"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_CONFIG_DIR="$TMP/config"
ALLOY_WEB_DIR="web"
ALLOY_MAX_AGENTS="6"
ALLOY_FIRST_AGENT_PORT="3011"
EOF
export ALLOY_CONFIG_FILE="$TMP/config"
alloy_load_config
alloy_ensure_runtime_dirs

OUT="$(env ALLOY_CONFIG_FILE="$TMP/config" "$ROOT/alloy-agent-evidence" wt-fixture 2>&1)"
echo "$OUT" | grep -q 'verify-fixture.json' && pass "evidence lists file" || fail "evidence list ($OUT)"
echo "$OUT" | grep 'verify-fixture.json' | grep -q 'missing' && fail "evidence shows missing for file" || pass "evidence file size not missing"
echo "$OUT" | grep -q 'EVIDENCE_BYTES_SHOULD_NOT_APPEAR' && fail "evidence printed file contents" || pass "evidence never prints contents"

# GNU stat mock (-c %s) — force BSD path to fail so GNU branch is exercised.
GNU_FILE="$TMP/gnu-file.bin"
printf 'abcd' >"$GNU_FILE"
FAKEBIN="$TMP/fakebin"
mkdir -p "$FAKEBIN"
REAL_STAT="$(command -v stat)"
cat >"$FAKEBIN/stat" <<STATSH
#!/usr/bin/env bash
if [[ "\${1:-}" == "-f" ]]; then
  exit 1
fi
if [[ "\${1:-}" == "-c" && "\${2:-}" == "%s" ]]; then
  echo 4096
  exit 0
fi
exec "$REAL_STAT" "\$@"
STATSH
chmod +x "$FAKEBIN/stat"
GNU_BYTES="$(PATH="$FAKEBIN:$PATH" bash -c "source '$ROOT/lib/common.sh'; alloy_file_byte_size '$GNU_FILE'")"
[[ "$GNU_BYTES" == "4096" ]] && pass "GNU stat mock byte size" || fail "GNU mock ($GNU_BYTES)"

# Missing file → unknown
[[ "$(alloy_path_size_human "$TMP/no-such-file")" == "unknown" ]] && pass "missing file reports unknown" || fail "missing file"

echo
echo "Evidence size results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
