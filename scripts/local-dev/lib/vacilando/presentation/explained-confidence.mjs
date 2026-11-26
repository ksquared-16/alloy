/**
 * Director Experience V2 — DX-2 Explained Confidence (presentation only).
 *
 * Explains existing mission / certification confidence outputs.
 * Does NOT change weights, scoring, or computeMissionConfidence.
 */
import { getMissionConfidence, CONFIDENCE_WEIGHTS } from "../mission-confidence.mjs";
import {
  getOpenDeliverableReview,
  deliverableReviewVm,
} from "../deliverable-review.mjs";

/** Presentation grouping only — not engine thresholds. */
const SUPPORTING_MIN = 70;
const CONCERN_MAX = 54;

const FACTOR_META = Object.freeze({
  architecture: {
    label: "Architecture / Mission Brief",
    increaseWhat: "Strengthen the Mission Brief (phases, acceptance criteria, constraints)",
    increaseWhy: "Architecture score reflects how complete and structured the brief is.",
    expectedImprovement: "Raises the architecture factor when the brief is fuller.",
  },
  implementation: {
    label: "Implementation progress",
    increaseWhat: "Accept remaining deliverables",
    increaseWhy: "Implementation score tracks completed vs open assignments.",
    expectedImprovement: "Raises the implementation factor as deliverables complete.",
  },
  evidence: {
    label: "Evidence coverage",
    increaseWhat: "Attach evidence that covers outstanding acceptance criteria",
    increaseWhy: "Evidence score reflects criteria covered by recorded artifacts.",
    expectedImprovement: "Raises the evidence factor as criteria gain coverage.",
  },
  qa: {
    label: "QA / validation",
    increaseWhat: "Add validation runs or QA evidence (tests, typecheck, build, browser)",
    increaseWhy: "QA score reflects validation runs and QA-typed artifacts.",
    expectedImprovement: "Raises the QA factor when validation succeeds.",
  },
  worker_health: {
    label: "Worker health",
    increaseWhat: "Restore unhealthy workers or clear recoveries needing attention",
    increaseWhy: "Worker health score reflects live telemetry status.",
    expectedImprovement: "Raises worker health when attention states clear.",
  },
  dependencies: {
    label: "Dependencies",
    increaseWhat: "Clear blocked/paused work and resolve open decisions",
    increaseWhy: "Dependencies score reflects blocked, paused, waiting work and open decisions.",
    expectedImprovement: "Raises dependencies when the graph is clear.",
  },
});

function titleCaseFactor(id) {
  return FACTOR_META[id]?.label
    || String(id || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toneForBand(band) {
  if (band === "high" || band === "solid") return "success";
  if (band === "developing") return "caution";
  if (band === "at_risk" || band === "building") return "warning";
  return "neutral";
}

function bandFromPercent(pct) {
  if (pct == null) return { band: "unknown", bandLabel: "—" };
  if (pct >= 85) return { band: "high", bandLabel: "High confidence" };
  if (pct >= 65) return { band: "solid", bandLabel: "Solid" };
  if (pct >= 40) return { band: "developing", bandLabel: "Developing" };
  return { band: "at_risk", bandLabel: "At risk" };
}

/**
 * Map engine factor map → explanation sections.
 * @param {Record<string, { score: number, note?: string }>} factors
 * @param {Record<string, number>} [weights]
 */
export function explainMissionFactors(factors = {}, weights = CONFIDENCE_WEIGHTS) {
  const supporting = [];
  const reducing = [];
  const remainingUncertainty = [];
  const increaseConfidence = [];

  const entries = Object.entries(factors).map(([id, f]) => ({
    id,
    label: titleCaseFactor(id),
    score: Number(f?.score) || 0,
    note: String(f?.note || "").trim() || "No note from confidence engine",
    weightPct: Math.round((weights?.[id] ?? CONFIDENCE_WEIGHTS[id] ?? 0) * 100),
  }));

  // Stable order by engine weight (desc), then id
  entries.sort((a, b) => (b.weightPct - a.weightPct) || a.id.localeCompare(b.id));

  for (const e of entries) {
    const meta = FACTOR_META[e.id] || {
      increaseWhat: `Improve ${e.label.toLowerCase()}`,
      increaseWhy: e.note,
      expectedImprovement: `May raise the ${e.label.toLowerCase()} factor.`,
    };

    if (e.score >= SUPPORTING_MIN) {
      supporting.push({
        id: e.id,
        label: e.label,
        mark: "support",
        score: e.score,
        text: e.note,
      });
      continue;
    }

    reducing.push({
      id: e.id,
      label: e.label,
      mark: e.score <= CONCERN_MAX ? "concern" : "partial",
      score: e.score,
      text: e.note,
    });

    remainingUncertainty.push({
      id: e.id,
      label: e.label,
      text: e.note,
      blocking: e.score <= CONCERN_MAX,
    });

    increaseConfidence.push({
      id: e.id,
      label: e.label,
      what: meta.increaseWhat,
      why: meta.increaseWhy,
      expectedImprovement: meta.expectedImprovement,
      relatedScore: e.score,
    });
  }

  return {
    supporting,
    reducing,
    remainingUncertainty,
    increaseConfidence,
    factorCount: entries.length,
  };
}

function missionRecommendation({ band, percent, decisions = null, certificationReady = false }) {
  if (decisions?.recommended?.buttonLabel) {
    return {
      verb: decisions.recommended.buttonLabel,
      detail: decisions.recommended.whyChoose || decisions.recommended.consequence || null,
      agreesWithDecision: true,
    };
  }
  if (certificationReady && (band === "high" || band === "solid")) {
    return {
      verb: "Ready to review for certification",
      detail: "Mission confidence and certification readiness both look supportive.",
      agreesWithDecision: false,
    };
  }
  if (band === "high" || band === "solid") {
    return {
      verb: "Proceed when ready",
      detail: "Confidence band supports continuing; still read remaining uncertainty.",
      agreesWithDecision: false,
    };
  }
  if (band === "developing") {
    return {
      verb: "Proceed only if you accept remaining uncertainty",
      detail: percent != null
        ? `At ${percent}%, several factors still reduce confidence.`
        : "Several factors still reduce confidence.",
      agreesWithDecision: false,
    };
  }
  return {
    verb: "Resolve uncertainty before treating work as ready",
    detail: "Confidence is at risk — treat unknowns as blocking until addressed.",
    agreesWithDecision: false,
  };
}

/**
 * Full explained confidence VM for L1 (and Depth summary).
 * Primary kind follows DX-1 dual-confidence rule.
 */
export function explainedConfidenceVm(missionId, {
  reviewVm = null,
  missionConfidence = null,
  decisions = null,
} = {}) {
  const open = reviewVm || (getOpenDeliverableReview(missionId) ? deliverableReviewVm(missionId) : null);
  const mc = missionConfidence || getMissionConfidence(missionId);

  // --- Certification primary (deliverable review open) ---
  if (open?.kind === "deliverable_review") {
    const cert = open.certification?.confidence || {};
    const rec = open.directorRecommendation || open.recommendation || {};
    const pct = cert.pct ?? rec.confidencePct ?? null;
    const { band, bandLabel } = bandFromPercent(pct);
    const reasons = Array.isArray(cert.reasons) ? cert.reasons.filter(Boolean) : [];
    const blockers = Array.isArray(open.blockersPlain) ? open.blockersPlain.filter(Boolean) : [];
    const residual = Array.isArray(open.residualRisks) ? open.residualRisks.filter(Boolean) : [];

    const supporting = reasons.map((text, i) => ({
      id: `cert_reason_${i}`,
      label: "Director verification",
      mark: "support",
      score: null,
      text,
    }));

    const remainingUncertainty = [
      ...blockers.map((text, i) => ({
        id: `blocker_${i}`,
        label: "Verification gap",
        text,
        blocking: true,
      })),
      ...residual.map((text, i) => ({
        id: `risk_${i}`,
        label: "Residual risk",
        text,
        blocking: false,
      })),
    ];

    const reducing = remainingUncertainty.map((u) => ({
      id: u.id,
      label: u.label,
      mark: u.blocking ? "concern" : "partial",
      score: null,
      text: u.text,
    }));

    const increaseConfidence = [];
    if (open.stuck || !open.operatorMayApprove) {
      increaseConfidence.push({
        id: "recheck",
        label: "Director re-check",
        what: "Have Director re-check this deliverable",
        why: "Certification confidence waits on Director clearing verification gaps.",
        expectedImprovement: "May unlock Certify when verification passes.",
        relatedScore: null,
      });
    }
    if (blockers.length) {
      increaseConfidence.push({
        id: "clear_blockers",
        label: "Clear verification gaps",
        what: "Address the verification gaps listed above (or request changes)",
        why: "Those gaps are why Certify is unavailable or confidence is reduced.",
        expectedImprovement: "Removes blocking uncertainty on this certification.",
        relatedScore: null,
      });
    }

    const recommendation = open.operatorMayApprove
      ? {
          verb: `Certify ${open.waveLabel || "deliverable"}`,
          detail: rec.summary || rec.detail || rec.headline || null,
          agreesWithDecision: true,
        }
      : {
          verb: open.stuck
            ? "Have Director re-check before certifying"
            : "Wait for Director certification readiness",
          detail: blockers[0] || rec.summary || null,
          agreesWithDecision: false,
        };

    return {
      kind: "explained_confidence",
      schema_version: "vacilando.explained_confidence.v1",
      primaryKind: "certification",
      label: "Certification confidence",
      percent: pct,
      band,
      bandLabel,
      tone: toneForBand(band),
      recommendation,
      supporting: supporting.length ? supporting : [{
        id: "pending",
        label: "Director verification",
        mark: "partial",
        score: null,
        text: "Director has not published certification reasons yet.",
      }],
      reducing,
      remainingUncertainty,
      increaseConfidence,
      blocking: Boolean(open.stuck) || remainingUncertainty.some((u) => u.blocking),
      secondaryNote: mc?.percent != null
        ? `Mission confidence ${mc.percent}% (${mc.bandLabel || "—"}) is under Technical depth.`
        : null,
      // Depth still uses raw mission factors separately
      engineRef: {
        missionPercent: mc?.percent ?? null,
        missionBand: mc?.band ?? null,
        certificationReady: Boolean(mc?.certification_ready),
      },
    };
  }

  // --- Mission confidence primary ---
  const explained = explainMissionFactors(mc.factors || {}, mc.weights || CONFIDENCE_WEIGHTS);
  const band = mc.band || bandFromPercent(mc.percent).band;
  const bandLabel = mc.bandLabel || bandFromPercent(mc.percent).bandLabel;
  const recommendation = missionRecommendation({
    band,
    percent: mc.percent,
    decisions,
    certificationReady: Boolean(mc.certification_ready),
  });

  return {
    kind: "explained_confidence",
    schema_version: "vacilando.explained_confidence.v1",
    primaryKind: "mission",
    label: "Mission confidence",
    percent: mc.percent,
    band,
    bandLabel,
    tone: toneForBand(band),
    recommendation,
    supporting: explained.supporting,
    reducing: explained.reducing,
    remainingUncertainty: explained.remainingUncertainty,
    increaseConfidence: explained.increaseConfidence,
    blocking: band === "at_risk" || explained.remainingUncertainty.some((u) => u.blocking),
    secondaryNote: null,
    engineRef: {
      missionPercent: mc.percent,
      missionBand: mc.band,
      certificationReady: Boolean(mc.certification_ready),
      weights: mc.weights || { ...CONFIDENCE_WEIGHTS },
    },
  };
}

/** @deprecated Prefer explainedConfidenceVm — kept as thin alias for DX-1 call sites. */
export function confidenceGlanceVm(missionId, opts = {}) {
  const full = explainedConfidenceVm(missionId, opts);
  return {
    kind: "confidence_glance",
    primaryKind: full.primaryKind,
    label: full.label,
    bandLabel: full.bandLabel,
    percent: full.percent,
    why: full.supporting.slice(0, 3).map((s) => s.text),
    recommendation: full.recommendation?.verb || null,
    secondaryNote: full.secondaryNote,
    // DX-2 full panel
    explained: full,
  };
}
