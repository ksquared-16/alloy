/**
 * Vacilando — Mission Context Package (Execution System V2 §5.2).
 *
 * One canonical context for all workers (Cursor and Claude). Bound to an exact
 * Mission Brief version + contentHash. Workers acknowledge before starting.
 */
import { getBrief, getBriefVersion } from "./mission-brief.mjs";
import { getObjectiveByMission } from "./objective.mjs";
import { listDecisions } from "./decisions.mjs";

export const EXECUTION_PROTOCOL_VERSION = "vacilando.worker.protocol.v1";
export const SUPPORTED_PROTOCOL_VERSIONS = new Set([EXECUTION_PROTOCOL_VERSION]);

/**
 * Build the canonical Mission Context Package for a mission / phase.
 */
export function buildMissionContextPackage(missionId, {
  phaseId = null,
  brief = null,
  repository = null,
  environment = null,
} = {}) {
  const b = brief
    || getBrief(missionId)
    || null;
  if (!b) return null;

  const objective = getObjectiveByMission(missionId);
  const phases = (b.plan || []).slice().sort((a, c) => a.order - c.order);
  const activePhase = (phaseId && phases.find((p) => p.phaseId === phaseId))
    || phases.find((p) => {
      const op = (objective?.phases || []).find((x) => x.id === p.phaseId);
      return op && op.status !== "done";
    })
    || phases[0]
    || null;

  const acIds = new Set(activePhase?.acceptanceCriteriaIds || []);
  const relevantAcceptanceCriteria = (b.acceptanceCriteria || []).filter((c) =>
    acIds.size === 0 || acIds.has(c.id));

  const decisions = listDecisions(missionId).filter((d) => d.status === "answered");

  return {
    schema_version: "vacilando.mission_context.v1",
    missionId: b.missionId || missionId,
    missionVersion: b.version,
    missionContentHash: b.contentHash,
    objective: b.objective,
    activePhase,
    globalConstraints: b.constraints || [],
    relevantAcceptanceCriteria,
    requiredDoctrine: b.sourceMaterials || [],
    recordedDecisions: decisions.map((d) => ({
      decisionId: d.decisionId,
      title: d.title,
      chosenOptionId: d.chosen_option_id,
      response: d.response,
      answeredAt: d.answered_at,
    })),
    repository: repository || {
      root: process.env.ALLOY_REPO_ROOT || null,
      mergeTarget: b.executionPreferences?.mergeTarget || "staging",
    },
    environment: environment || {
      runtimeRoot: process.env.ALLOY_RUNTIME_ROOT || null,
      preferVacBroker: true,
    },
    executionProtocolVersion: EXECUTION_PROTOCOL_VERSION,
    outOfScope: b.outOfScope || [],
    title: b.title,
  };
}

/**
 * Validate a worker context acknowledgement against the live brief.
 * Rejects obsolete mission version / hash / unsupported protocol.
 */
export function validateContextAcknowledgement(ack, expectedContext) {
  if (!ack || !expectedContext) {
    return { ok: false, code: "missing_ack_or_context", message: "Acknowledgement and context are required" };
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.has(ack.protocolVersion)) {
    return { ok: false, code: "unsupported_protocol", message: `Protocol ${ack.protocolVersion} is not supported` };
  }
  if (ack.missionId !== expectedContext.missionId) {
    return { ok: false, code: "mission_mismatch", message: "Acknowledgement missionId does not match context" };
  }
  if (Number(ack.missionVersion) !== Number(expectedContext.missionVersion)) {
    return {
      ok: false,
      code: "stale_mission_version",
      message: `Worker acknowledged v${ack.missionVersion}; live brief is v${expectedContext.missionVersion}`,
    };
  }
  if (ack.missionContentHash !== expectedContext.missionContentHash) {
    return {
      ok: false,
      code: "stale_mission_hash",
      message: "contentHash mismatch — worker must refresh context before continuing",
    };
  }
  return { ok: true };
}

/** Require brief version when loading a specific snapshot for workers. */
export function loadBriefForContext(missionId, version = null) {
  if (version != null) return getBriefVersion(missionId, Number(version)) || getBrief(missionId);
  return getBrief(missionId);
}
