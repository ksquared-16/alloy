# Process Stage operating-contract — product review package

**Branch:** `fix/process-stage-operating-contract`  
**Starting staging SHA:** `6da1dbe8654f36cf34e1e4a8868a42172227deec` (sync to `origin/staging` at branch tip before local commits)  
**Policy:** Local only — do not push / open PR / merge until approved.

Companion branch (separate deliverable): `fix/current-work-workspace-product-remediation`

## Operational Authoring V2 scope

Stages own explicit outgoing transitions and Outcome Definitions. Tour can be authored as **outcome-led** work with **no Primary Action**; outcomes compose movement, multiple follow-up Work Templates, and attention. Closed status is selected on a transition and derives close semantics — there is no separate Close Record behavior.

## Engineer handoff

**Start here:** [`HANDOFF.md`](./HANDOFF.md) — local commits, key files, validation commands, remaining work, doctrine questions.

## Browser evidence

Populate `evidence/` from a local authenticated Processes → Stages session when available. Unit certification: `web/tests/lifecycle/processStageOperatingContract.test.ts`.
