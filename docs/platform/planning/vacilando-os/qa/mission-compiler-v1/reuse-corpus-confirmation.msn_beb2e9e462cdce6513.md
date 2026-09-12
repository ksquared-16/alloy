---
owner: platform
status: findings
last_reviewed: 2026-09-11
supersedes: []
---

# Confirm reused specification corpus — findings

**Mission.** `msn_beb2e9e462cdce6513` v1, contentHash `282eace8ea5a991546ba9e8b1c19fc7e`, titled
"Brief Spine Mission". Assignment `asg_b306e5ed73e6f0`, phase `p_reuse_only`.

**Objective as dispatched.** *"No new discovery deliverables remain — confirm accepted artifacts
cover the Mission Brief."*

**Verdict.** The first clause is **confirmed**. The second clause is **not confirmable as posed**,
and for the brief that generated this phase it is **false**. Details below. This phase should not
be accepted as a mission closeout until F1 and F2 are settled by the Director.

---

## What was checked, and how

This phase is not hand-authored. Its title and objective are string literals in
[`scripts/local-dev/lib/vacilando/mission-compiler.mjs`](../../../../../scripts/local-dev/lib/vacilando/mission-compiler.mjs)
lines 255–256, emitted by `synthesizeAccessIdentityPhases()` on exactly one branch: an Access &
Identity brief for which **every** entry in `ACCESS_IDENTITY_DELIVERABLE_CATALOG` (12 entries,
line 74) resolved to an existing artifact, leaving zero `to_execute` deliverables.

So "confirming the corpus" means two separate questions:

1. Do the 12 catalog artifacts actually exist and carry substance in this worktree?
2. Does that corpus satisfy the Mission Brief the phase was compiled from?

Confirmation was done by reading the compiler, the catalog, the acceptance manifest and the
artifacts on disk. The compiler could **not** be executed to reproduce the compilation: running a
script is blocked by this session's Bash permission gate, and `compileMissionBrief()` persists
(`saveCompiledMission`, `updateMission`, `appendTimelineEvent`, lines 605–633), so it must not be
run against live mission state regardless. Every claim below is therefore sourced to committed
code, committed artifacts, or `ls`/`grep` output — not to a re-run.

---

## C1 — Catalog coverage: confirmed (12/12)

All 12 catalog deliverables resolve in this worktree, each far above the 200-byte floor
`artifactPresent()` enforces (line 189).

| Deliverable | Resolved artifact | Bytes |
|---|---|---|
| `d1_existing_state` | `planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| `d2_surface_catalog` | `vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md` | 48,992 |
| `d3_identity_model` | `planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| `d4_authentication` | `vacilando-os/qa/access-identity-v2/04-authentication-model.md` | 79,634 |
| `d5_effective_access` | `planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| `d6_product_ia` | `vacilando-os/qa/access-identity-v2/06-product-ia-and-flows.md` | 88,243 |
| `d7_security_matrix` | `planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| `d8_gap_analysis` | `planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| `d9_decisions` | `planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| `d10_sequence` | `planning/access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |
| `d11_acceptance_rubric` | `vacilando-os/qa/access-identity-v2/07-director-acceptance-rubric.md` | 94,044 |
| `d12_qa_evidence` | `planning/access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |

**"No new discovery deliverables remain" is true of the catalog.** Twelve deliverables are backed
by **seven distinct files**; the aliasing is intentional and, where spot-checked, sound —
`01-existing-state-inventory.md` genuinely carries the threat/enforcement matrix and the gap
analysis as Parts II and III (48 `threat|enforcement matrix` matches; corroborated by the folder
README's document table), so `d7`/`d8` sharing it is defensible.

---

## F1 — The brief's own acceptance criteria are discarded (blocking)

For any Access & Identity brief, `compileMissionBrief()` **does not carry the brief's acceptance
criteria into the compiled mission**. Lines 473–488:

- If `ai` is true, compiled acceptance criteria are synthesized *only* from `to_execute`
  deliverables.
- When there are none — this mission's case — the compiler pushes exactly one criterion,
  `AC_reuse_confirmed`: *"Operator confirms accepted Access & Identity artifacts satisfy the
  Mission Brief without new discovery."*
- The `else` branch (lines 489–505) that copies `brief.acceptanceCriteria` through is reached
  **only for non-A&I briefs**.

Two consequences:

1. **The phase objective is unfalsifiable as dispatched.** "Confirm accepted artifacts cover the
   Mission Brief" is checked against a criterion whose content is "the operator confirms it is
   covered". There is no surviving statement from the brief to test coverage against. That is why
   this assignment arrived with **empty Scope and empty Acceptance criteria** — the synthesized
   `p_reuse_only` phase (lines 252–260) carries neither `acceptanceCriteriaIds` nor
   `requiredOutputs`, unlike the `to_execute` phases (lines 266–276), which carry both.
2. **The tautological-acceptance guard is dead for every A&I brief.** The
   `unfalsifiable_acceptance` error (lines 492–496) lives in the non-A&I branch only.

---

## F2 — A "ship it" brief compiled to a documentation phase, with no conflict raised (blocking)

The mission title "Brief Spine Mission" occurs exactly once in the repository, as a unit-test
fixture override at
[`scripts/local-dev/tests/mission-runtime.test.mjs:1639`](../../../../../scripts/local-dev/tests/mission-runtime.test.mjs),
applied to `sampleBriefBody()` (line 1569). That fixture brief is:

- **objective:** `"Ship Access & Identity V2 from the operator-owned plan"`
- **plan:** `p0` "Catalog integrity" → `requiredOutputs: ["migration"]`; `p1` "Audit trail" →
  `requiredOutputs: ["code"]`
- **acceptanceCriteria:** `AC1` *permission_definitions is canonical*; `AC2` *mutations write audit
  events*
- **constraints:** `C1` *"No push without approval"*

The dispatched assignment's sole constraint is `C1` verbatim, and its Scope and Acceptance criteria
are empty — the thin-tuple signature of a fixture brief reaching live dispatch.

Tracing this brief through the compiler:

- `isAccessIdentityBrief()` (line 198) matches on the objective's "Access & Identity" — `ai` is true.
- `forbidsImplementation()` (line 203) is **false**: "Ship … from the operator-owned plan" matches
  none of its patterns.
- Line 520 routes to `synthesizeAccessIdentityPhases()` on `ai` **alone**, discarding the
  operator's two-phase plan regardless of intent.
- Because `noImplement` is false, the `conflicting_implement_vs_specify` warning and the
  `conflicting_instructions` ambiguity (lines 440–462) **never fire**.
- With zero `to_execute` deliverables and one synthesized AC, the `missing_acceptance_criteria`
  error (line 506) does not fire either.
- Result: `status: "ready"`, `readyToExecute: true`, elevated confidence (lines 561–568).

**A brief asking to ship a migration and audit-event code compiles to a single
documentation-confirmation phase and reports itself ready, silently** — no warning, no ambiguity,
no compilation decision. `AC1` and `AC2` cannot be satisfied by any document; they are schema and
runtime outcomes.

Contrast the accepted reference compilation,
[`compilation-report.msn_2d054741a54698fa4c.json`](compilation-report.msn_2d054741a54698fa4c.json):
that brief **did** forbid implementation (`"forbidsImplementation": true`) and **did** record the
conflict and the truncated-plan warning. Its reuse-only outcome was correct and evidenced. This
mission reaches the same outcome with none of that reasoning recorded.

**This branch is untested.** The only compiler test,
[`mission-compiler-brief.test.mjs`](../../../../../scripts/local-dev/tests/mission-compiler-brief.test.mjs),
seeds just 4 artifacts so that `to_execute` deliverables remain (lines 63–66) and uses a brief that
forbids implementation (line 38). It exercises the *partial*-reuse path. Nothing covers
`p_reuse_only`, and nothing covers an A&I brief that does not forbid implementation.

---

## F3 — The acceptance manifest's content hashes are stale

[`../runtime-v1-closeout/access-identity-artifact-manifest.json`](../runtime-v1-closeout/access-identity-artifact-manifest.json)
is the authoritative acceptance record. For `01`, `02` and `03` it asserts a **single**
`content_hash` shared by both the product-source copy and the retained QA original:

| Document | Manifest hash | product-source | QA original | Status |
|---|---|---|---|---|
| `01-existing-state-inventory.md` | `b7161eea…` | 201,334 B | 34,402 B | **stale** |
| `02-canonical-access-identity-model.md` | `a5c55bb3…` | 200,740 B | 43,952 B | **stale** |
| `03-implementation-qa-sequence.md` | `cda42839…` | 424,091 B | 457,511 B | **stale** |
| `authority-path-inventory.md` | `cd8f0477…` | 26,473 B | 26,473 B | consistent |

Files of different lengths cannot share a SHA-256, so for the first three rows the manifest hash
can match **at most one** of the two paths — no hashing needed to establish it. The folder README
explains why: the manifest was written 2026-07-30, copies were taken 2026-08-10, and both sides
kept moving afterwards. The divergence is known and mostly benign (README records `X-3` as closed —
the product-source `03` is now the live plan of record and the QA copy the frozen historical
record), but **the reuse confirmation is being made against files that no longer match what was
accepted**, and nothing in the compile path detects this. `artifactPresent()` checks existence and
size only; it never consults the manifest.

---

## F4 — Corpus-integrity caveats (non-blocking)

- **`partialOk` is dead configuration.** `d2_surface_catalog` and `d7_security_matrix` are declared
  partial coverage (lines 93, 137), but `partialOk` is read nowhere in `scripts/local-dev/` — the
  only two occurrences are the definitions themselves. Both count as full coverage.
- **Open Director decision `X-2`.** Five of the corpus's eight numbered documents
  (`00`, `04`, `05`, `06`, `07`) exist **only** under the QA path; the README states that where
  canonical artifacts live is a Director decision, still open. The catalog resolves `d2`, `d4`,
  `d6` and `d11` to those QA paths — i.e. this "reuse confirmation" depends on the very question
  `X-2` leaves unanswered.
- **Reuse is not pinned to the executing checkout.** `resolveRepoPath()` (lines 54–71) falls back
  to `ALLOY_REPO_ROOT`/`VACILANDO_CHECKOUT` and `<worktree>/scripts/local-dev` whenever
  `ALLOY_WORKTREE` is unset, so a reuse confirmation can be satisfied by files in a *different*
  checkout. The in-code comment at lines 55–56 names this risk for the isolated case. All 12
  artifacts resolve locally in this worktree, so it did not bite here — but the confirmation
  carries no record of which root answered.

---

## Recommended disposition

1. **Do not record this phase as mission closeout.** Accepting it would register "the accepted
   corpus satisfies the Mission Brief" for a brief that asked for a migration and audit-event code.
2. **Director decision required:** is `msn_beb2e9e462cdce6513` a fixture-derived mission that
   should be withdrawn, or a real Access & Identity mission? The fixture provenance (F2) points to
   the former; either way the compiler defect stands.
3. **Compiler fixes**, independent of that answer:
   - Carry `brief.acceptanceCriteria` into the compiled mission on the `ai` path, or record
     explicitly which brief criteria the synthesized phase does **not** cover (F1).
   - Gate the A&I catalog substitution on `forbidsImplementation()` rather than on `ai` alone, or
     raise a compilation decision when an A&I brief requests implementation and the compiler
     intends to emit reuse-only (F2, line 520).
   - Add coverage for `p_reuse_only` and for an A&I brief that does not forbid implementation.
   - Consult the acceptance manifest — or drop its hashes — so reuse is not asserted against
     artifacts that have moved (F3).
   - Either honour `partialOk` or remove it (F4).
