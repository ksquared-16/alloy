/**
 * DX-5 Evidence Experience — presentation adapters only.
 * Run: node scripts/local-dev/tests/evidence-experience-dx5.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx5-"));

const {
  classifyEvidenceCategory,
  comparisonRole,
  pairBeforeAfter,
  isFixtureOnly,
  executiveEvidenceStripVm,
  evidenceExperienceGalleryVm,
  evidenceExperienceCardVm,
} = await import("../lib/vacilando/presentation/evidence-experience.mjs");
const { composeExecutiveL1 } = await import("../lib/vacilando/presentation/executive-overview.mjs");
const { evidenceGalleryVm, missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");

// --- Pure classification ---
assert.equal(classifyEvidenceCategory({ type: "screenshot" }), "product");
assert.equal(classifyEvidenceCategory({ type: "browser" }), "browser");
assert.equal(classifyEvidenceCategory({ type: "test" }), "tests");
assert.equal(classifyEvidenceCategory({ type: "diff" }), "technical");
assert.equal(classifyEvidenceCategory({ type: "notes" }), "supporting");
assert.equal(classifyEvidenceCategory({ type: "weird_custom" }), "unclassified");
assert.equal(classifyEvidenceCategory({ type: "log", title: "Certification packet" }), "certification");

assert.equal(comparisonRole({ title: "Before: Overview" }), "before");
assert.equal(comparisonRole({ title: "After — Overview" }), "after");
assert.equal(comparisonRole({ comparisonRole: "before" }), "before");
assert.equal(comparisonRole({ title: "Overview screenshot" }), null);

assert.equal(isFixtureOnly({ environment: "fixture" }), true);
assert.equal(isFixtureOnly({ createdBy: "fixture" }), true);
assert.equal(isFixtureOnly({ title: "Live shot", environment: "local" }), false);

const unpaired = pairBeforeAfter([
  { evidenceId: "a", title: "Overview", type: "screenshot" },
  { evidenceId: "b", title: "Other", type: "screenshot" },
]);
assert.equal(unpaired.pairs.length, 0, "no pair without explicit roles");

const paired = pairBeforeAfter([
  { evidenceId: "b1", title: "Before: Executive Overview", type: "screenshot", description: "Prior layout" },
  { evidenceId: "a1", title: "After: Executive Overview", type: "screenshot", description: "Journey strip visible" },
  { evidenceId: "x", title: "Unrelated shot", type: "screenshot" },
]);
assert.equal(paired.pairs.length, 1);
assert.equal(paired.usedIds.size, 2);
assert.match(paired.pairs[0].whatChanged, /Journey strip|Prior|visible|changed/i);

// Filename similarity alone must not pair
const lookalike = pairBeforeAfter([
  { evidenceId: "f1", title: "screen", type: "screenshot", fileUri: "before-overview.png" },
  { evidenceId: "f2", title: "screen", type: "screenshot", fileUri: "after-overview.png" },
]);
assert.equal(lookalike.pairs.length, 0, "filename alone is not enough");

// Explicit pairId + roles
const explicit = pairBeforeAfter([
  { evidenceId: "p1", title: "A", type: "screenshot", comparisonRole: "before", pairId: "ov" },
  { evidenceId: "p2", title: "B", type: "screenshot", comparisonRole: "after", pairId: "ov" },
]);
assert.equal(explicit.pairs.length, 1);
assert.equal(explicit.pairs[0].pairId, "ov");

// --- Integration fixture mission ---
const brief = {
  title: "DX-5 Evidence Experience Fixture",
  objective: "Prove evidence presentation without storage redesign.",
  plan: [{
    phaseId: "p1", order: 1, title: "Discovery",
    objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
  }],
  acceptanceCriteria: [{ id: "AC1", statement: "Evidence is reviewable" }],
  constraints: [],
  sourceMaterials: [],
};
const ingested = ingestMissionBrief(brief, { slot: 2, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 2, actor: "operator" });

const shotDir = join(process.env.ALLOY_RUNTIME_ROOT, "shots");
mkdirSync(shotDir, { recursive: true });
const beforePath = join(shotDir, "before-overview.png");
const afterPath = join(shotDir, "after-overview.png");
// Minimal valid PNG (1x1)
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
writeFileSync(beforePath, png);
writeFileSync(afterPath, png);

attachEvidence({
  missionId, type: "screenshot", title: "Before: Executive Overview",
  description: "Prior overview without journey strip",
  fileUri: beforePath, acceptanceCriteriaIds: ["AC1"], createdBy: "fixture",
  environment: "fixture",
});
attachEvidence({
  missionId, type: "screenshot", title: "After: Executive Overview",
  description: "Overview shows Mission Journey strip",
  fileUri: afterPath, acceptanceCriteriaIds: ["AC1"], createdBy: "fixture",
  environment: "fixture",
});
attachEvidence({
  missionId, type: "test", title: "Focused DX-5 tests",
  description: "Adapter unit tests passed",
  command: "node scripts/local-dev/tests/evidence-experience-dx5.test.mjs",
  exitCode: 0, createdBy: "fixture", environment: "fixture",
});
attachEvidence({
  missionId, type: "diff", title: "Presentation adapter diff",
  description: "evidence-experience.mjs added",
  fileUri: "scripts/local-dev/lib/vacilando/presentation/evidence-experience.mjs",
  createdBy: "fixture", environment: "fixture",
});

// Inject an unknown-type record into the gallery (storage may already hold legacy rows)
{
  const { readFileSync, writeFileSync } = await import("node:fs");
  const galleryPath = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "evidence", missionId, "gallery.json");
  const g = JSON.parse(readFileSync(galleryPath, "utf8"));
  g.artifacts.push({
    schema_version: "vacilando.evidence.v1",
    evidenceId: "ev_unclassified_fixture",
    missionId,
    type: "legacy_blob",
    title: "Odd artifact",
    description: "",
    createdAt: new Date().toISOString(),
    createdBy: "fixture",
    environment: "fixture",
    acceptanceCriteriaIds: [],
  });
  writeFileSync(galleryPath, JSON.stringify(g, null, 2));
}

const strip = executiveEvidenceStripVm(missionId);
assert.equal(strip.kind, "executive_evidence_strip");
assert.ok(strip.kinds.some((k) => /screenshot/i.test(k.label)));
assert.ok(strip.kinds.some((k) => /automated|test/i.test(k.label)));
assert.ok(strip.primaryProof?.title);
assert.equal(strip.hasVisualProof, true);
assert.ok(strip.sufficiency.some((s) => /Visual proof/i.test(s.text)));
assert.ok(strip.sufficiency.some((s) => /Fixture-only/i.test(s.text)));
assert.ok(strip.preview.length >= 1);

const gallery = evidenceExperienceGalleryVm(missionId);
assert.equal(gallery.kind, "evidence_gallery");
assert.ok(gallery.pairs.length >= 1, "before/after pair present");
assert.ok(
  gallery.pairs[0].before?.category === "product" && gallery.pairs[0].after?.category === "product",
  "paired screenshots are product proof",
);
assert.ok(gallery.groups.some((g) => g.id === "tests"));
assert.ok(gallery.groups.some((g) => g.id === "technical"));
assert.ok(gallery.groups.some((g) => g.id === "unclassified"), "unknown type → unclassified");
assert.equal(gallery.primaryProof?.title, strip.primaryProof?.title, "strip and gallery agree on primary");
assert.deepEqual(
  gallery.kinds.map((k) => k.label).sort(),
  strip.kinds.map((k) => k.label).sort(),
);

const card = gallery.artifacts.find((a) => a.type === "screenshot");
assert.ok(card.provenance?.evidenceId);
assert.ok(card.technicalPath);
assert.equal(card.fixtureOnly, true);
assert.ok(card.previewHref?.includes("/api/v2/evidence/file"));

// Alias wrappers
assert.equal(evidenceGalleryVm(missionId).kind, "evidence_gallery");
const l1 = composeExecutiveL1(missionId);
assert.equal(l1.evidence?.kind, "executive_evidence_strip");
assert.ok(l1.journey, "journey still on L1");

const dash = missionDashboardVm(missionId);
assert.equal(dash.executive?.evidence?.kind, "executive_evidence_strip");

// Technical-only mission (no screenshots)
const techBrief = {
  title: "DX-5 Tech-only",
  objective: "Technical evidence only",
  plan: [{ phaseId: "p1", order: 1, title: "Work", objective: "w", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["T1"] }],
  acceptanceCriteria: [{ id: "T1", statement: "Done" }],
  constraints: [], sourceMaterials: [],
};
const techIng = ingestMissionBrief(techBrief, { slot: 2, actor: "operator" });
const techId = techIng.brief.missionId;
approveMissionExecution(techId, techIng.brief.version, { slot: 2, actor: "operator" });
attachEvidence({
  missionId: techId, type: "diff", title: "Code change", description: "Adapter",
  fileUri: "x.mjs", createdBy: "worker",
});
attachEvidence({
  missionId: techId, type: "test", title: "Unit tests", description: "ok",
  exitCode: 0, command: "npm test", createdBy: "worker",
});
const techStrip = executiveEvidenceStripVm(techId);
assert.equal(techStrip.hasVisualProof, false);
assert.ok(techStrip.sufficiency.some((s) => /No screenshot/i.test(s.text)));
assert.ok(techStrip.kinds.every((k) => !/screenshot/i.test(k.label)));

console.log("evidence-experience-dx5: ok", {
  missionId,
  primary: strip.primaryProof?.title,
  pairs: gallery.pairs.length,
  groups: gallery.groups.map((g) => `${g.id}:${g.count}`),
  techPrimary: techStrip.primaryProof?.title,
});
process.exit(0);
