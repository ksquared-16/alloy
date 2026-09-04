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

**Now fail-closed at both boundaries, independently.**

- Filing refuses with `census_query_required`: a census must name its query.
- `artifactPathFrom()` returns `null`; there is no default query.
- The execution boundary additionally refuses a missing database target
  (`missing_database_target`) rather than defaulting to one, so an old or
  malformed persisted request that reaches the executor is still refused.

Neither boundary may synthesize a default census. There is no safe default:
"which census did you mean" has no answer a machine may choose, and choosing the
most privileged one is the worst guess available.

**No compensating governed action was filed.** The census was read-only; there
is nothing to undo, and inventing a mutable remediation for a read would add
risk rather than remove it.

Regression coverage: `scripts/local-dev/tests/census-fail-closed.test.mjs`.
