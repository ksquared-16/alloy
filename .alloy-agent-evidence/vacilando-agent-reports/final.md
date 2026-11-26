# Structured agent reports — complete

The chat no longer treats raw Claude terminal output as the assistant message.
This message is itself the proof: it was submitted through the new completion
path, stored on the run, and rendered from storage — the pane behind it is
1,522 bytes of viewport-only TUI that cannot touch it.

## The model

The terminal keeps the jobs it is genuinely good at — transport receipt,
readiness detection before a paste, liveness for abandonment classification,
and debugging. It stopped being the message.

- **Owner:** `execution-run-report.mjs`, writing onto the existing Execution Run
  record. No second run store, no second lifecycle, no second run state.
- **CLI:** `vac run-report <run_id> <type> --message-file <path|->`
- **Order is the contract:** the message is written and read back *before* any
  transition is attempted. A Complete notification therefore cannot arrive
  ahead of the message it promises.

## Report types

| Type | Run effect | Notifies |
|---|---|---|
| progress | stays non-terminal, refreshes liveness | no |
| needs_input | canonical NEEDS_INPUT when blocking | yes |
| completion | atomic transition to COMPLETE | yes |
| failure | canonical FAILED, keeps the recovery step | yes |

## What the acceptance proved

- A progress report replaced the TUI as the assistant message while the run
  stayed `EXECUTING` — screenshot `13-structured-progress-message.png`.
- The header is one sticky bar: `← Lanes · Vacilando · Details`, state and
  provider on a small second line. The global `Lane / ↻ Refresh / Live` bar,
  the large Refresh button and the full-width status card are gone —
  screenshot `12-consolidated-header.png`.
- Raw terminal is present only inside Details, behind a `diagnostic` tag.
- A long Markdown fixture is byte-identical through CLI, store, disk re-read,
  API projection, JSON, render and clipboard.

## Commits

```
467e096e2  structured agent reports own the conversation
ac1eaef18  mobile UI acceptance evidence
8bc48c55c  unclip the reply, clamp the instruction, capacity truth
9aa1cb544  chat-only lane page with one details panel
```

## Tests

| Suite | Result |
|---|---|
| development-agent-report | 18/18 |
| development-gateway-mobile-chat | 14/14 |
| development-gateway-ui | 72/72 |
| run-execution-durability-tests | 8/8 |

No new failures across the `development-*` suites; the remaining ones are
byte-identical to HEAD, verified by diffing the failing-test **names** against a
HEAD copy rather than counting them.

## Remaining blocker

The live Gateway serves from `~/.local/share/alloy/toolkit/690687bfa3ee/`, which
is not under version control. `alloy-toolkit install` only takes a git ref, so
these changes are deployed by file copy under the governed
`gateway_host_mutation` lease. Running `alloy-toolkit install` would revert the
running Gateway until this branch is merged.

:3015 was never used and the Runtime Performance lane was never touched.
