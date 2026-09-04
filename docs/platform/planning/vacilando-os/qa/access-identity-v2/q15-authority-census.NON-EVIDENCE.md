---
owner: platform
status: canonical
last_reviewed: 2026-09-04
supersedes: []
---

# UNINTENDED TEST EXECUTION — DO NOT USE AS CERTIFICATION OR PROGRAM EVIDENCE

**Applies to:** `q15-authority-census.results.json` in this directory.

A `database.read_census` execution ran that was not intended as program work.
The artifact it relates to is **preserved deliberately** — audit history is not
rewritten — but it carries no evidential weight.

## The designation

The results of that census **must not** be:

- interpreted, summarised, or quoted;
- used as certification evidence;
- fed into W-0, W-7 or any other workstream;
- used to support a product, security or architecture decision.

Its contents were **not read or interpreted** when this notice was written. The
retained knowledge here is about the **incident and the safety defect**, not
about what the query returned.

## Lineage, preserved

The governed request and trusted-host action records remain in the runtime
store and are not modified. The most recent Q15-named census execution in that
store is request `gar_a1d647be39e8b6` → trusted-host action `tha_45408277e8c257`
(2026-09-04). Earlier Q15-named executions exist in the same store and are
likewise preserved.

## Why the record alone cannot settle intent

This is the part worth remembering. Until the fix described below, a census
request that named **no** query had `[q15-authority-census.json]` substituted
into its `artifact_refs` before storage. The stored record for a substituted
request is therefore **byte-identical** to one where the caller explicitly asked
for the authority census.

That is why the defect could not be audited away after the fact, and why the
correction had to be a refusal at request time rather than better forensics.

## The safety defect, and the fix

**Fail-open, in two places.**

1. **Filing.** `requestGovernedAction` substituted `[Q15_CENSUS_ARTIFACT]` when a
   census carried no `artifact_refs`. An incomplete request silently became a
   complete request to run the most privileged census available.
2. **Path resolution.** `artifactPathFrom()` returned the Q15 artifact as its
   default, so the executor's own `queryArtifactPath required` guard could never
   fire — by the time it looked, the field had been filled in.

**Now fail-closed, promoted in `51ce6788d`.**

- `artifactPathFrom(refs, { fallback = null })` defaults to null, with explicit
  opt-in at the display call sites that legitimately want one.
- `validateInputs` turns an absent query into `missing_query_artifact` before
  any database is touched.
- The database target no longer defaults either. One target exists today, which
  is why that default looked harmless — the moment a second exists, silence
  would pick the privileged one.

There is no safe default census: "which census did you mean" has no answer a
machine may choose, and choosing the most privileged one is the worst guess
available.

**No compensating governed action was filed.** The census was read-only; there
is nothing to undo, and inventing a mutable remediation for a read would add
risk rather than remove it.

Regression coverage lives with that implementation in
`development-census-fail-closed.test.mjs`. `census-fail-closed.test.mjs` adds an
implementation-agnostic guard that the Q15 artifact never reappears as a
fallback VALUE anywhere in the request path, whatever spelling a future fix
uses.
