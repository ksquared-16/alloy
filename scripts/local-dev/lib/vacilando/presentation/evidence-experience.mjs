/**
 * Director Experience V2 — DX-5 Evidence Experience (presentation only).
 *
 * Deterministic adapters over authoritative evidence gallery records.
 * Does not change storage, scoring, certification, or lifecycle.
 */
import { existsSync } from "node:fs";
import { basename, extname, isAbsolute, join, normalize, resolve } from "node:path";
import os from "node:os";
import { listEvidence, acceptanceEvidenceCoverage, canCertifyMission, listValidationRuns } from "../evidence.mjs";
import { getBrief } from "../mission-brief.mjs";
import { getMission } from "../commands/missions.mjs";
import {
  getOpenDeliverableReview,
  getLatestAcceptedDeliverableReview,
  deliverableReviewVm,
} from "../deliverable-review.mjs";

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function relTime(isoStr) {
  if (!isoStr) return null;
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return String(isoStr);
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

const TYPE_LABELS = {
  screenshot: "Screenshot",
  video: "Recording",
  test: "Test results",
  build: "Build",
  typecheck: "Typecheck",
  browser: "Browser QA",
  database: "Database",
  migration: "Migration",
  diff: "Change summary",
  log: "Log",
  performance: "Performance",
  security: "Security check",
  commit: "Commit",
  document: "Document",
  notes: "Notes",
};

/** Presentation categories (hierarchy order for product-first review). */
export const EVIDENCE_CATEGORIES = [
  { id: "product", label: "Product", priority: 1 },
  { id: "browser", label: "Browser", priority: 2 },
  { id: "certification", label: "Certification", priority: 3 },
  { id: "tests", label: "Tests", priority: 4 },
  { id: "technical", label: "Technical", priority: 5 },
  { id: "supporting", label: "Supporting", priority: 6 },
  { id: "unclassified", label: "Unclassified", priority: 7 },
];

const CATEGORY_BY_TYPE = {
  screenshot: "product",
  video: "product",
  browser: "browser",
  test: "tests",
  typecheck: "tests",
  build: "tests",
  performance: "tests",
  security: "tests",
  diff: "technical",
  log: "technical",
  migration: "technical",
  database: "technical",
  commit: "technical",
  document: "supporting",
  notes: "supporting",
};

function blob(a) {
  return `${a.title || ""} ${a.description || ""} ${a.fileUri || ""} ${a.externalUri || ""} ${a.type || ""}`.toLowerCase();
}

function isImagePath(uri) {
  if (!uri) return false;
  return IMG_EXT.has(extname(String(uri).split("?")[0]).toLowerCase());
}

/** Fixture / non-production markers from environment or provenance text. */
export function isFixtureOnly(artifact) {
  const env = String(artifact.environment || "").toLowerCase();
  const text = blob(artifact);
  if (env.includes("fixture") || env === "test" || env === "ci-fixture") return true;
  if (/\bfixture[-_ ]?only\b/.test(text)) return true;
  if (artifact.createdBy === "fixture" || artifact.fixture === true) return true;
  return false;
}

/**
 * Deterministic category from type + light metadata.
 * Unknown types → unclassified (never invent).
 */
export function classifyEvidenceCategory(artifact) {
  if (!artifact) return "unclassified";
  const explicit = artifact.category || artifact.presentationCategory;
  if (explicit && EVIDENCE_CATEGORIES.some((c) => c.id === explicit)) return explicit;

  const text = blob(artifact);
  // Certification as a category only for narrative/outcome artifacts — never steal product/test types.
  if (
    (artifact.certification === true || /\bcertif(y|ication|ied)\b/.test(text))
    && !["screenshot", "video", "test", "browser", "typecheck", "build"].includes(artifact.type)
  ) {
    return "certification";
  }
  if (artifact.type === "browser" || /\bbrowser\b.*\b(qa|cert|check)/.test(text)) {
    return "browser";
  }
  const byType = CATEGORY_BY_TYPE[artifact.type];
  if (byType) return byType;
  if (isImagePath(artifact.fileUri || artifact.externalUri)) return "product";
  return "unclassified";
}

/**
 * Before/after role — only from explicit fields or explicit markers.
 * Does NOT pair on filename similarity alone.
 */
export function comparisonRole(artifact) {
  const role = String(
    artifact.comparisonRole || artifact.role || artifact.comparison_role || "",
  ).toLowerCase().trim();
  if (role === "before" || role === "after") return role;

  const title = String(artifact.title || "");
  const desc = String(artifact.description || "");
  const markers = [
    [/\bbefore\s*[—\-:]/i, "before"],
    [/\bafter\s*[—\-:]/i, "after"],
    [/^\s*before\b/i, "before"],
    [/^\s*after\b/i, "after"],
    [/\(before\)/i, "before"],
    [/\(after\)/i, "after"],
    [/\[before\]/i, "before"],
    [/\[after\]/i, "after"],
  ];
  for (const [re, r] of markers) {
    if (re.test(title) || re.test(desc)) return r;
  }
  return null;
}

export function comparisonGroupKey(artifact) {
  const explicit = artifact.pairId || artifact.comparisonGroup || artifact.comparison_id;
  if (explicit) return String(explicit);

  // Pair by shared stem when BOTH sides carry explicit before/after roles.
  const role = comparisonRole(artifact);
  if (!role) return null;
  const title = String(artifact.title || "")
    .replace(/\b(before|after)\s*[—\-:]?\s*/gi, " ")
    .replace(/\((before|after)\)/gi, " ")
    .replace(/\[(before|after)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (title.length >= 4) return `title:${title}`;
  const assignment = artifact.assignmentId || "";
  if (assignment) return `asg:${assignment}:${artifact.type || "shot"}`;
  return null;
}

/**
 * Pair before/after only when both roles are explicit and share a group key.
 */
export function pairBeforeAfter(artifacts = []) {
  const withRole = artifacts
    .map((a) => ({ a, role: comparisonRole(a), group: comparisonGroupKey(a) }))
    .filter((x) => x.role && x.group);

  const byGroup = new Map();
  for (const row of withRole) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, { before: [], after: [] });
    byGroup.get(row.group)[row.role].push(row.a);
  }

  const pairs = [];
  const used = new Set();
  for (const [group, sides] of byGroup) {
    const before = sides.before[0];
    const after = sides.after[0];
    if (!before || !after) continue;
    used.add(before.evidenceId);
    used.add(after.evidenceId);
    const change =
      after.description && before.description && after.description !== before.description
        ? after.description
        : after.description || before.description || "Product appearance changed between captures.";
    pairs.push({
      kind: "before_after_pair",
      pairId: group,
      title: String(after.title || before.title || "Before / After")
        .replace(/\b(before|after)\s*[—\-:]?\s*/gi, "")
        .replace(/\((before|after)\)/gi, "")
        .trim() || "Before / After",
      whatChanged: change,
      beforeId: before.evidenceId,
      afterId: after.evidenceId,
    });
  }
  return { pairs, usedIds: used };
}

function resultState(artifact) {
  if (artifact.exitCode == null) {
    if (artifact.type === "screenshot" || artifact.type === "video" || artifact.type === "document") {
      return { id: "informational", label: "Informational" };
    }
    return { id: "recorded", label: "Recorded" };
  }
  if (Number(artifact.exitCode) === 0) return { id: "passed", label: "Passed" };
  return { id: "failed", label: "Failed" };
}

function provesText(artifact) {
  if (artifact.description && String(artifact.description).trim()) {
    return String(artifact.description).trim();
  }
  if (artifact.acceptanceCriteriaIds?.length) {
    return `Supports ${artifact.acceptanceCriteriaIds.join(", ")}`;
  }
  const label = TYPE_LABELS[artifact.type] || artifact.type || "evidence";
  return `Documents ${label}`;
}

function hierarchyRank(artifact, category) {
  // Product proof → outcome/cert → behavioral → technical
  const catBoost = {
    product: 0,
    browser: 10,
    tests: 15,
    certification: 25,
    technical: 40,
    supporting: 50,
    unclassified: 60,
  }[category] ?? 70;
  const typeBoost = artifact.type === "screenshot" ? 0
    : artifact.type === "browser" ? 2
      : artifact.type === "test" ? 5
        : 8;
  const role = comparisonRole(artifact);
  const roleBoost = role === "before" ? 1 : role === "after" ? 0 : 0;
  return catBoost + typeBoost + roleBoost;
}

/**
 * Resolve a readable absolute path for an artifact fileUri (presentation only).
 * Returns null when unsafe or missing — never invents.
 */
export function resolveEvidenceFilePath(artifact, {
  missionWorktree = null,
  checkoutRoot = process.cwd(),
} = {}) {
  const uri = artifact?.fileUri || artifact?.externalUri;
  if (!uri || String(uri).startsWith("http://") || String(uri).startsWith("https://")) {
    return null;
  }
  const runtimeRoot = process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(os.homedir(), ".local", "state", "alloy-dev");
  const worktreeRoot = join(os.homedir(), "Code", "alloy-worktrees");
  const candidates = [];
  if (isAbsolute(uri)) candidates.push(normalize(uri));
  else {
    if (missionWorktree) candidates.push(join(worktreeRoot, missionWorktree, uri));
    candidates.push(join(checkoutRoot, uri));
    candidates.push(join(runtimeRoot, "evidence", uri));
  }
  const allowPrefixes = [
    normalize(runtimeRoot) + "/",
    normalize(worktreeRoot) + "/",
    normalize(checkoutRoot) + "/",
  ];
  for (const full of candidates) {
    const resolved = resolve(full);
    if (!allowPrefixes.some((p) => resolved.startsWith(p))) continue;
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

export function evidenceExperienceCardVm(artifact, {
  missionId = null,
  missionWorktree = null,
} = {}) {
  const category = classifyEvidenceCategory(artifact);
  const catMeta = EVIDENCE_CATEGORIES.find((c) => c.id === category) || EVIDENCE_CATEGORIES.at(-1);
  const path = artifact.fileUri || artifact.externalUri || null;
  const role = comparisonRole(artifact);
  const fixture = isFixtureOnly(artifact);
  const result = resultState(artifact);
  const media = artifact.type === "screenshot" || artifact.type === "video" || isImagePath(path);
  const resolved = media ? resolveEvidenceFilePath(artifact, { missionWorktree }) : null;

  return {
    kind: "evidence_card",
    evidenceId: artifact.evidenceId,
    missionId: missionId || artifact.missionId || null,
    type: artifact.type,
    typeLabel: TYPE_LABELS[artifact.type] || artifact.type || "Evidence",
    category: category,
    categoryLabel: catMeta.label,
    title: artifact.title || TYPE_LABELS[artifact.type] || "Evidence",
    proves: provesText(artifact),
    result: result.id,
    resultLabel: result.label,
    acceptanceCriteriaIds: artifact.acceptanceCriteriaIds || [],
    producedBy: artifact.createdBy === "operator" ? "You"
      : artifact.createdBy === "director" ? "Director"
        : artifact.createdBy === "fixture" ? "Fixture"
          : artifact.createdBy || "Worker",
    when: artifact.createdAt || null,
    whenLabel: relTime(artifact.createdAt),
    environment: artifact.environment || artifact.branch || null,
    commit: artifact.repositorySha ? String(artifact.repositorySha).slice(0, 8) : null,
    comparisonRole: role,
    fixtureOnly: fixture,
    presentation: media ? "media" : (artifact.type === "test" || artifact.type === "browser" ? "result" : "document"),
    previewAvailable: Boolean(resolved) || Boolean(artifact.externalUri && /^https?:/i.test(artifact.externalUri)),
    previewHref: resolved && missionId && artifact.evidenceId
      ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(artifact.evidenceId)}`
      : (artifact.externalUri && /^https?:/i.test(artifact.externalUri) ? artifact.externalUri : null),
    technicalPath: path,
    command: artifact.command || null,
    exitCode: artifact.exitCode ?? null,
    hierarchyRank: hierarchyRank(artifact, category),
    provenance: {
      evidenceId: artifact.evidenceId,
      type: artifact.type,
      createdBy: artifact.createdBy || null,
      createdAt: artifact.createdAt || null,
      fileUri: artifact.fileUri || null,
      externalUri: artifact.externalUri || null,
      assignmentId: artifact.assignmentId || null,
    },
  };
}

function countByCategory(cards) {
  const counts = {};
  for (const c of EVIDENCE_CATEGORIES) counts[c.id] = 0;
  for (const card of cards) counts[card.category] = (counts[card.category] || 0) + 1;
  return counts;
}

function kindSummary(cards, pairs = []) {
  const lines = [];
  const shots = cards.filter((c) => c.type === "screenshot" || c.presentation === "media").length;
  const tests = cards.filter((c) => c.category === "tests").length;
  const browser = cards.filter((c) => c.category === "browser").length;
  const tech = cards.filter((c) => c.category === "technical").length;
  if (shots) lines.push({ kind: "screenshots", count: shots, label: `${shots} screenshot${shots === 1 ? "" : "s"}` });
  if (pairs.length) lines.push({ kind: "comparisons", count: pairs.length, label: `${pairs.length} before/after pair${pairs.length === 1 ? "" : "s"}` });
  if (browser) lines.push({ kind: "browser", count: browser, label: `${browser} browser check${browser === 1 ? "" : "s"}` });
  if (tests) lines.push({ kind: "tests", count: tests, label: `${tests} automated check${tests === 1 ? "" : "s"}` });
  if (tech) lines.push({ kind: "technical", count: tech, label: `${tech} technical record${tech === 1 ? "" : "s"}` });
  if (!lines.length && cards.length) {
    lines.push({ kind: "artifacts", count: cards.length, label: `${cards.length} evidence record${cards.length === 1 ? "" : "s"}` });
  }
  return lines;
}

/**
 * Sufficiency statements — truthful against present artifact types only.
 * Not a score.
 */
export function evidenceSufficiencyVm(cards, {
  coverage = [],
  certification = null,
  openReview = null,
  acceptedReview = null,
  validationRuns = [],
} = {}) {
  const statements = [];
  const hasShot = cards.some((c) => c.type === "screenshot" || (c.presentation === "media" && c.type !== "video"));
  const hasBrowser = cards.some((c) => c.type === "browser" || c.category === "browser");
  const hasTests = cards.some((c) => c.category === "tests") || validationRuns.some((r) => r.ok);
  const hasFailTest = cards.some((c) => c.category === "tests" && c.result === "failed")
    || validationRuns.some((r) => r.ok === false);
  const fixtureOnly = cards.length > 0 && cards.every((c) => c.fixtureOnly);
  const covered = coverage.filter((c) => c.statusLabel === "Covered" || c.status === "passed").length;
  const outstanding = coverage.filter((c) => c.statusLabel === "Outstanding" || c.status === "missing").length;

  if (hasShot) statements.push({ id: "visual_proof", tone: "ok", text: "Visual proof available" });
  else statements.push({ id: "no_screenshot", tone: "warn", text: "No screenshot evidence" });

  if (hasBrowser || hasTests) {
    statements.push({
      id: "behavior",
      tone: hasFailTest ? "warn" : "ok",
      text: hasFailTest ? "Behavior checks recorded (some failed)" : "Behavior verified",
    });
  }

  if (acceptedReview || certification?.ok) {
    statements.push({ id: "certification", tone: "ok", text: "Certification recorded" });
  } else if (openReview) {
    statements.push({ id: "cert_pending", tone: "attention", text: "Certification review open" });
  }

  if (fixtureOnly) {
    statements.push({ id: "fixture_only", tone: "warn", text: "Fixture-only evidence" });
  }

  const prodEnv = cards.some((c) => /prod|production|staging|live/i.test(String(c.environment || "")));
  if (hasShot && !prodEnv && !fixtureOnly) {
    statements.push({ id: "env_unverified", tone: "info", text: "Production environment not verified" });
  }

  if (outstanding > 0) {
    statements.push({
      id: "ac_gap",
      tone: "warn",
      text: `${outstanding} acceptance criterion area${outstanding === 1 ? "" : "s"} still unverified`,
    });
  } else if (covered > 0) {
    statements.push({ id: "ac_ok", tone: "ok", text: "Linked acceptance criteria have attached evidence" });
  }

  return {
    kind: "evidence_sufficiency",
    statements,
    hasVisualProof: hasShot,
    hasBehavioralProof: hasBrowser || hasTests,
    certificationRecorded: Boolean(acceptedReview || certification?.ok),
    fixtureOnly,
  };
}

function missionWorktreeName(missionId) {
  const mission = getMission(missionId);
  const wt = mission?.worktree || mission?.worktree_name || null;
  if (!wt) return null;
  return String(wt).split("/").pop();
}

/**
 * Executive L1 evidence strip — kinds, strongest proof, visual availability.
 */
export function executiveEvidenceStripVm(missionId, { previewLimit = 3 } = {}) {
  const raw = listEvidence(missionId);
  const worktree = missionWorktreeName(missionId);
  const cards = raw.map((a) => evidenceExperienceCardVm(a, { missionId, missionWorktree: worktree }));
  const { pairs } = pairBeforeAfter(raw);
  const ranked = [...cards].sort((a, b) => a.hierarchyRank - b.hierarchyRank || String(b.when || "").localeCompare(String(a.when || "")));
  const primary = ranked[0] || null;
  const kinds = kindSummary(cards, pairs);
  const openReview = getOpenDeliverableReview(missionId);
  const accepted = getLatestAcceptedDeliverableReview(missionId);
  const coverage = acceptanceEvidenceCoverage(missionId).map((c) => ({
    id: c.id,
    statement: c.statement,
    status: c.status,
    statusLabel: c.status === "passed" ? "Covered" : c.status === "failed" ? "Failed" : "Outstanding",
  }));
  const certification = canCertifyMission(missionId);
  const sufficiency = evidenceSufficiencyVm(cards, {
    coverage,
    certification,
    openReview,
    acceptedReview: accepted,
    validationRuns: listValidationRuns(missionId, { limit: 50 }),
  });

  // Certification as an outcome-proof line when present
  if (accepted) {
    kinds.unshift({
      kind: "certification",
      count: 1,
      label: `1 certification record (${accepted.wave_label || "deliverable"})`,
    });
  }

  return {
    kind: "executive_evidence_strip",
    missionId,
    empty: cards.length === 0 && !accepted,
    totalCount: cards.length,
    kinds,
    counts: countByCategory(cards),
    hasVisualProof: sufficiency.hasVisualProof,
    primaryProof: primary
      ? {
          evidenceId: primary.evidenceId,
          title: primary.title,
          proves: primary.proves,
          typeLabel: primary.typeLabel,
          category: primary.category,
          previewHref: primary.previewHref,
        }
      : accepted
        ? {
            evidenceId: accepted.review_id || accepted.id || null,
            title: `Certified ${accepted.wave_label || "deliverable"}`,
            proves: "Director certification recorded for this deliverable",
            typeLabel: "Certification",
            category: "certification",
            previewHref: null,
          }
        : null,
    preview: ranked.filter((c) => c.presentation === "media").slice(0, previewLimit),
    sufficiency: sufficiency.statements,
    galleryHref: `evidence/${missionId}`,
    reviewLabel: "Review evidence",
  };
}

/**
 * Full Evidence tab gallery VM.
 */
export function evidenceExperienceGalleryVm(missionId) {
  const brief = getBrief(missionId);
  const raw = listEvidence(missionId);
  const worktree = missionWorktreeName(missionId);
  const cards = raw.map((a) => evidenceExperienceCardVm(a, { missionId, missionWorktree: worktree }));
  const { pairs, usedIds } = pairBeforeAfter(raw);
  const pairVms = pairs.map((p) => {
    const before = cards.find((c) => c.evidenceId === p.beforeId);
    const after = cards.find((c) => c.evidenceId === p.afterId);
    return {
      ...p,
      before,
      after,
    };
  });

  const unpaired = cards.filter((c) => !usedIds.has(c.evidenceId));
  const groups = EVIDENCE_CATEGORIES.map((cat) => {
    const items = unpaired
      .filter((c) => c.category === cat.id)
      .sort((a, b) => a.hierarchyRank - b.hierarchyRank);
    return {
      id: cat.id,
      label: cat.label,
      count: items.length,
      items,
    };
  }).filter((g) => g.count > 0);

  const coverage = acceptanceEvidenceCoverage(missionId).map((c) => ({
    id: c.id,
    statement: c.statement,
    status: c.status,
    statusLabel: c.status === "passed" ? "Covered" : c.status === "failed" ? "Failed" : "Outstanding",
  }));
  const openReview = getOpenDeliverableReview(missionId);
  const accepted = getLatestAcceptedDeliverableReview(missionId);
  const certification = canCertifyMission(missionId);
  const sufficiency = evidenceSufficiencyVm(cards, {
    coverage,
    certification,
    openReview,
    acceptedReview: accepted,
    validationRuns: listValidationRuns(missionId, { limit: 50 }),
  });

  const stripKinds = kindSummary(cards, pairs);
  if (accepted) {
    stripKinds.unshift({
      kind: "certification",
      count: 1,
      label: `1 certification record (${accepted.wave_label || "deliverable"})`,
    });
  }

  const ranked = [...cards].sort((a, b) => a.hierarchyRank - b.hierarchyRank || String(b.when || "").localeCompare(String(a.when || "")));
  const primary = ranked[0] || null;

  return {
    kind: "evidence_gallery",
    missionId,
    title: brief?.title || missionId,
    empty: cards.length === 0,
    emptyMessage: "Director is waiting on proof artifacts",
    totalCount: cards.length,
    kinds: stripKinds,
    primaryProof: primary
      ? {
          evidenceId: primary.evidenceId,
          title: primary.title,
          proves: primary.proves,
          typeLabel: primary.typeLabel,
          category: primary.category,
          previewHref: primary.previewHref,
        }
      : accepted
        ? {
            evidenceId: accepted.review_id || accepted.id || null,
            title: `Certified ${accepted.wave_label || "deliverable"}`,
            proves: "Director certification recorded for this deliverable",
            typeLabel: "Certification",
            category: "certification",
            previewHref: null,
          }
        : null,
    hasVisualProof: sufficiency.hasVisualProof,
    sufficiency,
    pairs: pairVms,
    groups,
    artifacts: ranked,
    coverage,
    certification,
    filters: EVIDENCE_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  };
}

/** Resolve artifact bytes path for /api/v2/evidence/file */
export function resolveMissionEvidenceFile(missionId, evidenceId) {
  const art = listEvidence(missionId).find((a) => a.evidenceId === evidenceId);
  if (!art) return null;
  return resolveEvidenceFilePath(art, { missionWorktree: missionWorktreeName(missionId) });
}

/**
 * Operator-facing evidence view: file bytes when present, otherwise the stored
 * description/body (notes, logs, commit messages). Never return a bare error JSON
 * for "Worker completion notes" that already has prose in the evidence record.
 */
export function resolveMissionEvidenceView(missionId, evidenceId) {
  const art = listEvidence(missionId).find((a) => a.evidenceId === evidenceId);
  if (!art) return null;
  const filePath = resolveEvidenceFilePath(art, { missionWorktree: missionWorktreeName(missionId) });
  const title = String(art.title || art.type || "Evidence").replace(/^Present\s+/i, "").trim();
  const body = String(art.description || art.body || art.content || art.text || "").trim();
  if (filePath) {
    return { kind: "file", title, filePath, type: art.type || null, body: body || null };
  }
  if (body) {
    return { kind: "text", title, body, type: art.type || null, filePath: null };
  }
  // Last resort: still give the operator something readable.
  const fallback = [
    title,
    art.type ? `Type: ${art.type}` : null,
    art.fileUri ? `Referenced path: ${art.fileUri} (not found on disk in this worktree)` : null,
    art.createdBy ? `Produced by: ${art.createdBy}` : null,
    art.createdAt ? `At: ${art.createdAt}` : null,
  ].filter(Boolean).join("\n");
  return { kind: "text", title, body: fallback || "No file or notes were stored for this evidence item.", type: art.type || null, filePath: null };
}
