#!/usr/bin/env bash
# =============================================================================
# route-heavy-validation — PreToolUse(Bash) hook.
#
# Closes the last validation bypass: a managed provider issuing expensive
# validation directly instead of through the governed broker. Observed live —
# a slot running `npm exec vitest run tests/lifecycle tests/pos`, spawning
# worker forks, entirely outside `vac run`, while S5 held the budget it was
# supposed to be spending.
#
# WHAT IT DOES. Classifies each command segment with the S3 classifier. When the
# classification is AUTHORITATIVE and the segment can be lifted verbatim, the
# unbrokered form is refused and the exact governed form is handed back. The
# provider does not have to remember to prepend `vac run`; it cannot forget,
# because the ungoverned form does not execute.
#
# WHAT IT DELIBERATELY DOES NOT DO. It never rewrites a command it is unsure
# about. A pipeline, a redirection, a substitution, or anything the classifier
# calls best-effort is ALLOWED THROUGH and recorded as a bypass. Breaking a
# correct command is a worse failure than reporting an escape, and a hook that
# guesses at shell semantics is exactly the "broadly rewrite arbitrary shell"
# this must not become.
#
# A raw shell a person opens themselves is out of scope by design: the
# requirement is that Vacilando-MANAGED providers cannot casually bypass their
# own broker, not that no heavy process may ever exist.
#
# Contract: hook JSON on stdin; exit 0 allows, exit 2 blocks with stderr shown
# to the agent.
# =============================================================================
set -uo pipefail

# The broker's own executions must never be re-intercepted.
[[ "${ALLOY_VALIDATE_EXECUTING:-0}" == "1" ]] && exit 0
[[ "${ALLOY_SKIP_VALIDATION_ROUTING:-0}" == "1" ]] && exit 0

HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
ROUTER="${HERE}/../vac-validation-route.mjs"
[[ -f "$ROUTER" ]] || exit 0
command -v node >/dev/null 2>&1 || exit 0

payload="$(cat 2>/dev/null || true)"
[[ -n "$payload" ]] || exit 0

verdict="$(ALLOY_HOOK_PAYLOAD="$payload" node "$ROUTER" 2>/dev/null)" || exit 0
[[ "${verdict%%$'\n'*}" == "BLOCK" ]] || exit 0

printf '%s\n' "${verdict#BLOCK$'\n'}" >&2
exit 2
