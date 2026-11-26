---
owner: platform
status: proposed-initiative
last_reviewed: 2026-07-19
---

# Runtime Test Hygiene — future initiative (independent of Runtime V1 architecture)

Runtime V1 promotion is **not** blocked on historical runtime test debt. This document records the test
status honestly and scopes a **separate** engineering initiative to modernize the suites. It is not part
of Runtime V1 architecture and must not reopen Runtime implementation.

## Honest test status at freeze

- **Source / behavioral typecheck: clean** for runtime product code (only the long-standing `tests/*`
  baseline and transient `.next/dev/types/*` generated-file errors remain).
- The **runtime test suites** (`tests/runtime/`, `tests/adminV2/runtime/`, comms/tasks runtime tests)
  are **baseline-red** (~79 failures at the start of this initiative). Every behavioral change made
  during Runtime V1 was verified against the browser and did not add net failures (measured
  stash-diffs); the red is pre-existing debt, not caused by V1 work.

## The three buckets of debt

1. **Architecture-cutover assertions** (largest bucket) — tests that assert the *superseded* pre-runtime
   shapes (drawer-VM coupling, per-key composition, the old Current-Work-workspace-in-summary). These
   should be **rewritten to the final contract or deleted**, not "fixed" — they encode behavior the
   runtime deliberately changed.
2. **Brittle source-grep tests** — tests that `readFileSync` a component and assert a string is present
   (e.g. `prefetch={false}`). Replace with behavioral tests.
3. **Cross-file module-cache contamination** — a 3-file combo shows failures that each file passes
   individually (shared module-cache state leaks between files). Add proper `resetXForTests()`
   isolation to the warm caches and shared modules.

Plus: update the D1/D4-style provisioning fixtures for the answer's `focusPanelSummaryDoc` field.

## Scope of the initiative

- **In scope:** triage every red runtime/focus-panel test into rewrite / delete / real-bug; green the
  suites; fix module-cache isolation; replace source-grep tests with behavioral ones.
- **Explicitly out of scope:** any architecture change, any new feature, any V2 concept, any change to
  runtime implementation beyond what a genuine test-exposed bug requires.
- **Definition of done:** the runtime suites are green; every remaining test asserts the final contract.

This is a bounded, self-contained follow-on. It can run any time after promotion; it does not gate
building products on Runtime V1.
