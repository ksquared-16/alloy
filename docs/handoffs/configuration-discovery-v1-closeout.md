# Configuration Discovery V1 — closeout and Participant Runtime handoff

**Status: CLOSED / FROZEN + product QA complete** · updated 2026-07-31 · branch
`agent/claude/4-phase7-slice3-participant-runtime`

Worktree `wt4-phase7-slice3-participant-runtime`. **62 commits, rebased onto origin/staging (0
behind), committed and NOT pushed.** Kelly is testing on localhost before any merge.

Local: `alloy-dev-start wt4-phase7-slice3-participant-runtime` → http://localhost:3014 (staging DB).
Isolated cert stack: `CERT_APP_PORT=3018 certification/alloy-certify serve` — **never run both from
this worktree at once**; two dev servers share one `.next` and corrupt each other's Turbopack graph.

Read first: [certification record](../platform/core/data/configuration-discovery-v1-certification.md)
· [canonical architecture](../platform/core/data/relationship-model.md).

## Product QA pass (after certification)

Three operator blockers plus a follow-on round, all fixed and committed:

| Defect | Root cause |
|---|---|
| Import stuck on "Reading your document" 20+ min | `busy` was both set inside an effect and in its dep array → the effect cancelled its own in-flight request; no polling could recover |
| Detailed Questions showed an empty canvas | native-layout detection discarded geometry the extractor already computed, so `hasRegions` was always false |
| Review Questions panel would not scroll | `WorkspaceZonePanel` body was a BLOCK, so every consumer's `flex-1` child was inert and clipped |
| Guardian "Name" always "Form field only" | intent inferred from the LABEL alone; a bare "Name:" under "Parent or Guardian #1" has no subject |
| Names captured as one field | `defaultNameRepresentation` defaulted to `full_name` |
| Sunscreen PDF failed the whole import | Postgres `jsonb` rejects NUL (SQLSTATE 22P05); that PDF carries NULs in its text layer |
| Concept review and generation described names differently | names bound to `display_name`/`full_name`, which are NOT registered system fields; generation built the registered first/last pair |

Name bindings are now anchored on `OPERATIONAL_FORM_SYSTEM_FIELDS` in both layers, and
`tests/pos/nameBindingAlignment.test.ts` pins the agreement in both directions so they cannot drift.

**Pre-existing RED baselines on origin/staging — verify against staging before diagnosing as yours:**
`tests/workspace` 8 files / 12 tests · `tests/forms` **13 files / 24 tests** · `tests/pos`
`formDraft.test.ts` · `vac run typecheck:tests` 6 errors in `queueRowVariantResolve.test.ts`.
Production `vac run typecheck` is clean.

Also: source PDF now renders with synchronized detection highlights (via the pdf.js already bundled
in `unpdf` — no new dependency), concept review condensed + pinned apply bar + Review action, and the
workspace frame (header rule, queue rails, +20% operational health) converged onto shared tokens so
Processing, Communications, Work Items and Scheduling move together.

---

## What shipped

One architectural claim, proven end to end on a live stack:

> A collection is ONE projection of the canonical Relationship Model.

```
Relationship Definitions → Collection Projection → Forms → public submission
    → Processing proposals → approval → guarded canonical execution → normalized read
```

No layer keeps a per-role allowlist. Adding Physician is one definition row — no provider, Forms,
Discovery, Processing or execution change. That is asserted by
`web/tests/fields/relationshipDefinitionSmellTest.test.ts`, so reintroducing an allowlist fails a test.

**Certified: 16/16 journey tests, twice consecutively from a clean fixture**, including a nine-case
live security matrix that also proves no refused request wrote anything.

## State at freeze

| | |
|---|---|
| Journey | 16/16, repeatable |
| Unit | 66/66 relationship + commit suites; 18 new regression tests |
| Production typecheck | broker `rc=0` |
| Pushed | **no** |

**Known pre-existing, not mine — verified by running the same tests at `origin/staging`:**

- `vac run typecheck:tests` fails with 6 errors in
  `web/tests/presentation/runtime/queueRowVariantResolve.test.ts` (Queue Row Builder V2 fixtures
  drifted from `QueueRecordFieldConfig`). Production typecheck is clean.
- A wider `tests/pos tests/fields` sweep shows 10 failures across 8 files
  (`canonicalDataProviderRegistry`, `childcareFieldCatalogDoctrine`, `dataModelConfigurationDoctrine`,
  `dataModelFieldConceptClarification`, `dataModelFinishPass`,
  `surfaceOperationalFieldConsumerConvergence`, `formDraft`, `questionResolutionModel`).

Both were reproduced at `origin/staging` with **identical** counts — 8 files, 10 failures — so this
branch introduces zero unit regressions. Neither was fixed here: both are outside the frozen scope and
outside this sprint's subsystem. Tasks were spun off.

## The lesson worth carrying forward

Every defect that mattered here was **silent** — it produced a successful-looking empty result:

- Person hydration selected a non-existent column and discarded the error → every child in every org
  appeared to have no family.
- One unresolvable row erased a child's whole family.
- The teardown's completion marker reported 0 residue while leaving exactly the rows that broke the
  next run.
- An omission proof passed by comparing two empty snapshots.

None were caught by unit tests or inspection. All were caught by asserting **specific identities on a
live stack, from a clean fixture, twice**. A single passing run demonstrates nothing about
repeatability. Counts are not evidence.

## Deliberate boundaries (decisions, not oversights)

- **Guardian storage stays in `customer_member_contacts`** — certified compatibility boundary;
  `persists_to` is the seam that makes convergence a config change plus a backfill.
- **Omission never deletes.** No deletion workflow exists in V1.
- **`POST /api/admin/relationship-actions/execute`** still reaches the executor directly. Spoofing half
  closed; structural seam deferred.
- **Conformance ledger gaps 7, 9–12 remain open.** Gap 9 — a second hand-authored registry in
  `focusPanel/household/householdRelationshipSectionDefinitions.ts` — is the one to watch: it is
  precisely the second-canonical-registry shape this architecture forbids.

## Participant Runtime — resuming

Participant Runtime was **paused** for this work and is the natural next slice. It inherits a clean
seam and should consume it rather than rebuild it.

**Consume, do not re-derive:**

- `relationshipDefinitionForRole/ForRef/ForCommandKey`, `collectableRelationshipDefinitions()` — the
  accessor seam. Definitions move to a `relationship_definitions` table later with no consumer change.
- `listPersonChildRelationships` — the normalized read. One row per canonical Person, roles unioned
  across both stores, storage invisible. Never read `person_child_relationships` or
  `customer_member_contacts` directly.
- `verifyRelationshipCommitAuthorization` + `executeRelationshipProposalCommit` — the only way a
  configured relationship commit should execute.

**Rules that must not be relaxed:**

1. Never assert role, command, entities or destination from the client — they are server-derived.
2. The relationship anchor is explicit; never infer a child from a household, never expand a missing
   anchor to all children.
3. The resolved Processing Case is the household authority; never back-fill
   `form_submissions.customer_id`.
4. Recognise relationships by IDENTITY (`provider_ref` → definition), never by label or id parsing.
5. Provenance stays in `metadata`; storage must never become a product-level distinction.

**Open UI QA** (deferred from V1, no code written): the operator-facing concept-review experience for
Configuration Discovery was never product-QA'd. The API chain is certified; the review UX is not.

## Reproducing

```bash
CERT_APP_PORT=3018 certification/alloy-certify serve
```

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3018 npx playwright test playwright/tests/configuration-discovery-proving-journey.spec.ts
```

Teardown must report `0` across all six residue counts, and two consecutive runs must both pass.
