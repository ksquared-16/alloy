/**
 * Director seam for Trusted Host Actions.
 * When a worker pauses because the managed slot lacks privileged credentials,
 * Director fulfills via a registered Trusted Host Action instead of asking
 * the operator to open Terminal / Supabase / paste secrets.
 */
import { createDecision } from "./decisions.mjs";
import { pauseAssignments } from "./worker-assignment.mjs";
import {
  fulfillDatabaseCensusForMission,
  ACTION_TYPES,
} from "./trusted-host-actions.mjs";
import { resumeMissionAfterTrustedHostAction } from "./trusted-host-resume.mjs";
import { appendTimelineEvent } from "./timeline.mjs";

const MANUAL_EXEC_RE = /DATABASE_URL|privileged credential|managed slot lacks|execution channel|run (it |the .{0,40} )?(in|via) (a )?terminal|Supabase SQL|psql |paste (the |returned )?JSON|Grant the permissions|open Terminal|env\.local|trusted server env/i;

const CENSUS_RE = /census|wave\s*0|authority census|combined_query|read-only.{0,40}(database|deployed)|deployed.?database/i;

export function looksLikeManualPrivilegedExecutionRequest(dreq = {}) {
  const text = [
    dreq.title,
    dreq.situation,
    dreq.whyThisMatters,
    dreq.discovery,
    dreq.recommendation,
    dreq.recommendationReason,
    ...(dreq.options || []).flatMap((o) => [o.label, o.description]),
  ].filter(Boolean).join("\n");
  return MANUAL_EXEC_RE.test(text);
}

export function looksLikeDatabaseCensusRequest(dreq = {}) {
  const text = [
    dreq.title,
    dreq.situation,
    dreq.discovery,
    dreq.currentPlan,
    ...(dreq.options || []).flatMap((o) => [o.label, o.description]),
  ].filter(Boolean).join("\n");
  return CENSUS_RE.test(text) || looksLikeManualPrivilegedExecutionRequest(dreq);
}

/**
 * Attempt to fulfill a credential-boundary pause via Trusted Host Actions.
 * @returns {Promise<object|null>} null if Director should fall through to a normal decision.
 */
export async function tryFulfillViaTrustedHost({
  missionId,
  assignmentId,
  executionSessionId = null,
  dreq = {},
  queryArtifactPath = null,
  worktreePath = null,
  actor = "director",
  nowMs,
} = {}) {
  if (!looksLikeDatabaseCensusRequest(dreq)) return null;

  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Director is running an approved database census",
      summary: "Trusted Host Action — credentials stay on the host; worker never receives them.",
      visibility: "summary",
      actor,
      detail: { assignmentId, via: "trusted_host_director" },
      nowMs,
    });
  } catch { /* */ }

  const out = fulfillDatabaseCensusForMission(missionId, {
    assignmentId,
    executionSessionId,
    queryArtifactPath: queryArtifactPath || undefined,
    worktreePath,
    actor,
    nowMs,
  });

  if (out.ok && out.action?.state === "completed") {
    const resumed = await resumeMissionAfterTrustedHostAction({
      missionId,
      actionId: out.action.id,
      assignmentId,
      actor,
      nowMs,
    });
    return {
      ok: true,
      fulfilled: true,
      via: "trusted_host_action",
      actionId: out.action.id,
      resumed,
      sessionId: executionSessionId,
    };
  }

  if (out.error === "authorization_required" || out.decisionNeeded) {
    const needed = out.decisionNeeded || {};
    createDecision({
      missionId,
      title: needed.title || "Authorize read-only database census for this mission",
      situation: [
        "I stopped because this mission requires a privileged read of the deployed database.",
        "Director can perform it safely without giving credentials to the worker.",
      ].join(" "),
      whyThisMatters: "Managed workers must not receive DATABASE_URL or other privileged credentials.",
      currentPlan: "Run database.read_census through the Trusted Host Action runtime.",
      discovery: "A registered Trusted Host Action can fulfill this request.",
      options: [
        {
          optionId: "authorize_mission_census",
          label: "Authorize read-only database census for this mission",
          description: "Director validates the committed query, runs it on the trusted host, stores evidence, and resumes Claude.",
        },
        {
          optionId: "deny",
          label: "Deny for now",
          description: "Keep the assignment paused. Do not ask for Terminal or Supabase workarounds.",
        },
      ],
      recommendation: "authorize_mission_census",
      recommendationReason: needed.recommendation
        || "Authorize once for this mission; Director executes without exposing credentials.",
      impact: {
        whatDirectorWillDo: needed.whatDirectorWillDo || [
          "validate the committed query",
          "run it through the trusted host",
          "store the result as evidence",
          "resume Claude",
        ],
      },
      affectedAssignments: assignmentId ? [assignmentId] : [],
      actor,
      pauseAssignments,
      nowMs,
    });
    return {
      ok: false,
      fulfilled: false,
      via: "trusted_host_authorization_decision",
      error: "authorization_required",
      actionId: out.action?.id || null,
      sessionId: executionSessionId,
    };
  }

  // Registered capability exists but failed — escalate as product/security, never manual Terminal.
  createDecision({
    missionId,
    title: "Trusted Host Action could not complete",
    situation: `Director attempted ${ACTION_TYPES.DATABASE_READ_CENSUS} but it failed: ${out.error || "unknown"}.`,
    whyThisMatters: "Falling back to Terminal or giving the worker credentials is not allowed.",
    currentPlan: "Repair the trusted host connection or query artifact, then retry.",
    discovery: String(out.action?.failureReason || out.error || ""),
    options: [
      {
        optionId: "retry_trusted_host",
        label: "Retry Trusted Host Action",
        description: "Director retries the registered action on the trusted host.",
      },
      {
        optionId: "pause_investigate",
        label: "Keep paused — investigate host/credential configuration",
        description: "Do not run SQL manually. Fix host readiness inside Vacilando Settings.",
      },
    ],
    recommendation: "retry_trusted_host",
    recommendationReason: "Keep the operator inside Vacilando.",
    affectedAssignments: assignmentId ? [assignmentId] : [],
    actor,
    pauseAssignments,
    nowMs,
  });
  return {
    ok: false,
    fulfilled: false,
    via: "trusted_host_failure_decision",
    error: out.error || "trusted_host_failed",
    sessionId: executionSessionId,
  };
}
