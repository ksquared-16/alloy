# Financials — reusable QA setup contract (product → platform handoff)

Machine-readable twin: `FINANCIALS-REUSABLE-QA-SETUP-CONTRACT.json` (same commit). Local and uncertified; nothing
here was run against a certification environment, a browser or live data.

**Candidate.** The commit that adds these two files, a documentation-only child of `f20480fc`. Every pinned
artifact is byte-identical at both. Re-measure from committed bytes; never reuse for a later commit.

**What is shared vs Financials-specific.**

| shared, lane-neutral | Financials only |
|---|---|
| `qaWorkflowVerifier.mjs` + Playwright driver: binding refusals before any browser, GET/HEAD to bound origins only, re-attestation before open, identity check, no caller-named route | `financialsHistoricalDraftUi.ts`: one route (the fixture child's Financials record), four checks |
| `qaWorkflowSetupContract.mjs` + vectors: the smallest setup a workflow may get | `QA_WORKFLOW_SETUPS` entries for `financials_isolated_tests` and `financials_historical_draft` |
| isolated-fixture authority v2 (unchanged, `e25649c2…`) | catalog live proof v2: 3 posted charges + 3 journal entries + 2–4 open billing periods retained, never deleted |

**Platform requests.** `REG-UI-VERIFY`, `ENV-IDENTITY-EMAIL` and `REPIN` are small and mechanical. `SETUP-MINIMAL`
(plan open without `/workspace` renders, extra identities or custom roles) is a platform slice, not done.

**Evidence class.** Fake driver and in-memory store: local logic only. Not a rendered proof and not a live proof.
