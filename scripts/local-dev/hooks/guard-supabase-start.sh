#!/usr/bin/env bash
# =============================================================================
# guard-supabase-start — PreToolUse(Bash) hook.
#
# Blocks the one command that caused the container explosion: a session running
# `supabase start` from its own directory, creating its own 8-11 container stack
# that nobody ever stopped. Three sessions produced 35 containers this way; one
# stack was still running two days after its worktree had been deleted.
#
# Sessions SHARE one stack. `alloy-stack use` joins it. This hook makes the
# wrong path impossible rather than merely discouraged, because documentation
# demonstrably did not hold — the repo's own README used to bless per-sprint
# stacks on separate port ranges.
#
# Detection parses the actual subcommand rather than pattern-matching the
# string, so `supabase --workdir /tmp/mine start` cannot slip past.
#
# Contract: reads the hook JSON on stdin, exit 0 to allow, exit 2 to block with
# the reason on stderr (which the agent sees and can act on).
# =============================================================================
set -uo pipefail

SANCTIONED_PROJECT="${ALLOY_STACK_PROJECT:-alloy-cert}"

# Escape hatch for alloy-stack itself, which is the sanctioned starter.
[[ "${ALLOY_STACK_INTERNAL:-0}" == "1" ]] && exit 0

# Read the hook payload BEFORE invoking python — the heredoc below occupies
# python's stdin, so the payload has to travel via the environment.
payload="$(cat 2>/dev/null || true)"

verdict="$(
  ALLOY_SANCTIONED_PROJECT="$SANCTIONED_PROJECT" \
  ALLOY_HOOK_PAYLOAD="$payload" python3 - <<'PY' 2>/dev/null
import json, os, re, shlex, sys

SANCTIONED = os.environ.get("ALLOY_SANCTIONED_PROJECT", "alloy-cert")
# Global flags that consume the following token as their value.
VALUE_FLAGS = {"--workdir", "--dns-resolver", "--network-id", "--output", "-o", "--profile"}

try:
    data = json.loads(os.environ.get("ALLOY_HOOK_PAYLOAD") or "")
except Exception:
    print("ALLOW"); sys.exit(0)

cmd = (data.get("tool_input") or {}).get("command") or ""
if not cmd.strip():
    print("ALLOW"); sys.exit(0)

# alloy-stack is the sanctioned path; never second-guess it.
if re.search(r"\balloy-stack\b", cmd):
    print("ALLOW"); sys.exit(0)

def project_of(workdir):
    cfg = os.path.join(os.path.expanduser(workdir), "supabase", "config.toml")
    try:
        with open(cfg) as fh:
            for line in fh:
                m = re.match(r'\s*project_id\s*=\s*"?([^"\s]+)"?', line)
                if m:
                    return m.group(1)
    except OSError:
        pass
    return None

# Split into command segments so `cd /tmp && supabase start` is inspected.
for segment in re.split(r"(?:\|\||&&|[;&|\n])", cmd):
    try:
        tokens = shlex.split(segment)
    except ValueError:
        tokens = segment.split()
    if not tokens:
        continue

    # Locate the supabase invocation (bare, npx-wrapped, or a path to it).
    idx = None
    for i, tok in enumerate(tokens):
        if tok == "supabase" or tok.endswith("/supabase"):
            idx = i
            break
    if idx is None:
        continue

    # Walk past global flags to the real subcommand.
    j = idx + 1
    workdir = None
    while j < len(tokens):
        tok = tokens[j]
        if tok.startswith("--") and "=" in tok:
            k, v = tok.split("=", 1)
            if k == "--workdir":
                workdir = v
            j += 1
        elif tok.startswith("-"):
            if tok in VALUE_FLAGS and j + 1 < len(tokens):
                if tok == "--workdir":
                    workdir = tokens[j + 1]
                j += 2
            else:
                j += 1
        else:
            break
    subcommand = tokens[j] if j < len(tokens) else None

    if subcommand != "start":
        continue

    # A --workdir naming the shared project is still the one shared stack.
    if workdir and project_of(workdir) == SANCTIONED:
        continue

    print("BLOCK")
    sys.exit(0)

print("ALLOW")
PY
)"

[[ "$verdict" == "BLOCK" ]] || exit 0

cat >&2 <<EOF
BLOCKED: 'supabase start' outside the shared stack.

Sessions share ONE local Supabase stack ('${SANCTIONED_PROJECT}'). Starting your
own creates 8-11 more containers that outlive this session — that is what put
Docker at 35 containers across 4 stacks and stalled progress for everyone.

Use the shared stack instead:

  alloy-stack use        # joins the shared stack (starts it only if down)
  alloy-stack status     # what is running, and who is using it
  alloy-stack release    # when you finish; stops the stack if you are last out

It is already seeded with the full schema and the synthetic tenant, so it is
almost certainly what you wanted anyway.

If you genuinely need an isolated stack (rare — schema-destructive testing),
that is a decision for Kelly, not a workaround: ask before proceeding.
EOF
exit 2
