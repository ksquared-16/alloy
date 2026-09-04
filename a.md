# DX-5 Evidence Experience — Discovery

Mission `msn_0e24196324d1441ac2` · context v1 · contentHash `4624625b87d59bcce256b0a8746e7b72`
Root: `/Users/vacilando/Code/alloy-worktrees/ui-vac` (managed-worktree, sanctioned) · branch `agent/ui-vac`
Phase: Discovery. **Read-only — no runtime, storage, scoring, certification, or lifecycle code was changed.**

---

## 1. What already exists

DX-5 is not greenfield. The presentation layer is built and wired end to end:

| Layer | Location |
| --- | --- |
| Store (authoritative) | `scripts/local-dev/lib/vacilando/evidence.mjs` (386 lines) |
| Presentation adapters | `scripts/local-dev/lib/vacilando/presentation/evidence-experience.mjs` (651 lines) |
| Operator VM passthrough | `presentation/operator-views.mjs:644` — `evidenceGalleryVm()` is a one-line delegate |
| L1 executive strip | `presentation/executive-overview.mjs:306` → `executiveEvidenceStripVm()` |
| Read route | `v2-api.mjs:1550` `/api/v2/views/mission/evidence` |
| Bytes/text route | `v2-api.mjs:1555` `/api/v2/evidence/file` |
| Write route | `v2-api.mjs:1040` `POST /api/v2/evidence` |
| Gallery render | `apps/vacilando/public/mission-control.js:2517` `V2.viewEvidence` |
| Tests | `scripts/local-dev/tests/evidence-experience-dx5.test.mjs` |

Storage is file-backed, not Postgres: `$ALLOY_RUNTIME_ROOT/vacilando/evidence/<missionId>/gallery.json`
plus `validation-runs.jsonl`. Schema `vacilando.evidence_gallery.v1` / `vacilando.evidence.v1`.

The presentation model is deliberately conservative and that part is sound:

- 7 categories in a fixed product-first hierarchy (`product → browser → certification → tests → technical → supporting → unclassified`); unknown types fall to `unclassified` rather than being invented into a bucket.
- Before/after pairing requires **explicit** role markers on both sides (`comparisonRole`, or `Before:` / `(after)` style prefixes) plus a shared group key. It deliberately refuses to pair on filename similarity — `evidence-experience.mjs:158`.
- `resolveEvidenceFilePath` allow-lists three prefixes (runtime root, worktree root, checkout root) and returns `null` rather than guessing — no path traversal out of the sanctioned roots.
- `evidenceSufficiencyVm` emits **statements, not a score** (`evidence-experience.mjs:377`), which is the right call for an operator surface.

So the question this mission actually has to answer is not "how do we render evidence" — it is **whether what gets rendered is true**.

---

## 2. The central finding: the evidence gate cannot fail

`missingRequiredEvidence()` (`evidence.mjs:206`) defines per-profile required types, and
`submitWorkerCompletion` rejects with `error: "missing_evidence"` when they are absent. That gate is
real. It is also, in the Claude dispatch path, unconditionally defeated.

`assignment-dispatch.mjs:418-433` — after attaching whatever the provider genuinely produced, the
dispatcher synthesises the `execution_session_v1` profile types itself:

```js
for (const type of ["log", "notes", "document"]) {
  const has = (finished.evidence || []).some((e) => e.type === type);
  if (!has) attachEvidence({ ... description: pkg.summary, createdBy: wid, ... });
}
```

Then at `:457`, if completion *still* reports `missing_evidence`, it attaches a stub for each missing
type under the Director's own actor and re-submits. The generic provider path repeats the pattern at
`:761`. The consequence is structural: **a mission's gallery can consist entirely of artifacts that
exist only because the gate demanded them.** The gate reports satisfaction with its own output.

This is the finding the Evidence Experience has to be designed against. Everything downstream —
the L1 strip, sufficiency statements, certification readiness — currently reads those stubs as
indistinguishable from real proof.

### 2b. Acceptance coverage inherits the same defect

`acceptanceEvidenceCoverage()` (`evidence.mjs:183`) computes per-criterion status purely from
`artifact.acceptanceCriteriaIds` membership. The synthesised stubs are attached carrying
`assignment.acceptanceCriteriaIds` verbatim (`assignment-dispatch.mjs:412`, `:428`). Therefore:

1. Stub attached → criterion has ≥1 linked artifact → status `passed`.
2. `evidenceSufficiencyVm` emits `ac_ok` — *"Linked acceptance criteria have attached evidence."*
3. `canCertifyMission()` finds `incomplete.length === 0` → `ready: true`,
   `directorRecommendation: "ready_to_merge"`, `confidence: "high"`.

A mission can reach "ready to merge / high confidence" without a single artifact a human produced.

Meanwhile the worker's *actual* per-criterion claim — `criterion_evidence: [{criterion_id, status,
evidence_ref}]`, which the worker protocol explicitly requires — is mapped only into a `validation`
field on the completion record (`claude-connector.mjs:348` and `:606`). **It is never converted into
evidence artifacts and never reaches `acceptanceEvidenceCoverage`.** The one honest per-criterion
signal in the protocol is the one the coverage calculation ignores.

---

## 3. Secondary findings

**F3 — Resume path duplicates stub evidence on every resume.**
`assignment-dispatch.mjs:915-928` runs the same `["log", "notes", "document"]` loop as `:418` but
**without** the `const has = …` guard. Each resume of a Claude session therefore appends three more
stub artifacts unconditionally. A mission resumed five times carries fifteen near-identical
"log — <title>" cards. Concrete, mechanical, and cheap to fix.

**F4 — Auto-generated evidence carries no provenance marker.**
`isFixtureOnly()` (`evidence-experience.mjs:91`) detects only `environment` values and free-text
`fixture-only` markers. Gate-satisfying stubs match none of those; they render as ordinary cards
labelled `producedBy: "Director"` or the worker id. There is no `synthesized: true` / `gateFiller`
flag on the artifact schema, so the UI *cannot* distinguish manufactured evidence from real evidence
even if it wanted to. Any fix to §2 needs a schema field first — this is the load-bearing dependency.

**F5 — Text evidence is reachable by API but not linked from the gallery.**
`resolveMissionEvidenceView()` (`evidence-experience.mjs:629`) has a deliberate, good fallback: when
no file exists on disk it serves the stored `description`/`body` as a readable HTML page, explicitly
so "Worker completion notes" never render as raw error JSON. But `evidenceExperienceCardVm` sets
`previewAvailable`/`previewHref` to null for non-media artifacts (`:329-332`), so the gallery card
never offers the link — the prose sits behind the `<details> Technical details` JSON dump instead.
`mission-conversation.mjs:99, 681, 1041` *does* build `/api/v2/evidence/file` links for any evidence
id. So the same artifact is readable from the conversation surface and effectively hidden in the
gallery. Inconsistency, not breakage.

**F6 — Every synthesised stub emits a timeline event.**
`attachEvidence` unconditionally appends an `evidence_added` timeline event (`evidence.mjs:~110`).
Combined with F3, resumes inject noise into the workspace timeline, which
`presentation/workspace-compression.mjs:134` treats as validation-class signal.

---

## 4. What is genuinely solid (do not rework)

- Category classification, hierarchy ranking, and the refusal to invent categories.
- Before/after pairing conservatism.
- Path allow-listing in `resolveEvidenceFilePath`.
- Sufficiency as statements rather than a score.
- The text fallback in `resolveMissionEvidenceView`.

The presentation layer is not the problem. The ingestion and coverage semantics underneath it are.

---

## 5. Recommended shape for the build phase

Ordered by dependency, not by size:

1. **Add a provenance field to `vacilando.evidence.v1`** — e.g. `origin: "provider" | "operator" | "gate_filler"`. Nothing else in this list can be honest without it.
2. **Stop the coverage calculation from counting gate-filler artifacts** toward `passed` in `acceptanceEvidenceCoverage`, and correspondingly stop `canCertifyMission` returning `ready_to_merge` on synthetic coverage.
3. **Ingest `report.criterion_evidence` into real artifacts** so the worker's per-criterion claim is what drives coverage, with `evidence_ref` resolved through the existing `resolveEvidenceFilePath` allow-list.
4. **Add the missing `has` guard on the resume path** (`assignment-dispatch.mjs:915`) — smallest item here, ship it first.
5. **Surface a sufficiency statement for synthetic-only galleries** — the honest counterpart to the existing `fixture_only` statement.
6. **Link text evidence from gallery cards** (F5) — set `previewHref` when `resolveMissionEvidenceView` would return `kind: "text"`.

Items 2 and 3 change certification semantics and will make some currently-"ready" missions
correctly report as unevidenced. That is a product decision for the operator, not a worker call,
and should be escalated before the build phase rather than absorbed silently.

---

## 6. Verification status of this discovery

Every claim above is anchored to a file and line read in this worktree. `evidence-experience-dx5.test.mjs`
exists and covers classification, comparison roles, fixture detection, and card/strip/gallery shape
(48 assertions across a pure-classification section and an integration-fixture section), but
**it was not executed in this session — `node` invocation was declined by the
permission layer.** No test result is claimed here. Nothing in the DX-5 presentation layer was
modified, so the suite's prior status is unchanged.
