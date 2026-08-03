/**
 * After a Trusted Host Action completes, close the obsolete "run it in Terminal"
 * decision and resume the paused Claude session with structured results.
 */
import { answerDecision, listDecisions, getDecision } from "./decisions.mjs";
import { resumeAssignments } from "./worker-assignment.mjs";
import { resumeAfterDecisionAnswer } from "./assignment-dispatch.mjs";
import { getTrustedHostAction } from "./trusted-host-actions.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { getMission } from "./commands/missions.mjs";

function buildResumeMessage(action) {
  const census = action?.result?.census || {};
  const keys = Object.keys(census).slice(0, 20);
  return [
    "[VACILANDO TRUSTED HOST ACTION COMPLETE]",
    `Action: ${action.actionType}`,
    `Action id: ${action.id}`,
    `Authorization id: ${action.authorizationId}`,
    `Query hash: ${action.inputs?.queryHash}`,
    `Evidence: ${action.result?.evidencePath}`,
    "",
    "Director executed the read-only deployed-database census on the trusted host.",
    "You did NOT receive DATABASE_URL or any privileged credential.",
    "Do not ask the operator to open Terminal, Supabase SQL editor, or paste secrets.",
    "",
    "Census result summary (structured):",
    JSON.stringify({
      census_run_at: census.census_run_at,
      database: census.database,
      org_count: census.org_count,
      q1_handle_new_user_defined: census.q1_handle_new_user_defined,
      q2_principals_without_membership: census.q2_principals_without_membership,
      q3_undefined_membership_rows: census.q3_undefined_membership_rows,
      q4_membership_rows: census.q4_membership_rows,
      q4_distinct_user_org_pairs: census.q4_distinct_user_org_pairs,
      q5_admin_ops_org_role_pairs: census.q5_admin_ops_org_role_pairs,
      q6_restricted_admin_ops_pairs: census.q6_restricted_admin_ops_pairs,
      keys,
    }, null, 2),
    "",
    `Full results are persisted at ${action.result?.evidencePath}.`,
    "Continue Wave 0 closeout and unlock downstream lockout-class workstreams using this evidence.",
    "When done, emit vacilando-report + <<VACILANDO status=completed>>.",
  ].join("\n");
}

/**
 * Close Terminal/Supabase-style open decisions for this mission once THA fulfilled the need.
 */
export function closeManualExecutionDecisions(missionId, { actionId, actor = "director", nowMs } = {}) {
  const closed = [];
  for (const d of listDecisions(missionId, { status: "open" })) {
    const text = `${d.title || ""}\n${d.situation || ""}\n${(d.options || []).map((o) => o.label).join("\n")}`;
    if (!/terminal|Supabase SQL|psql|DATABASE_URL|execution channel|Grant the permissions/i.test(text)) {
      continue;
    }
    const out = answerDecision({
      missionId,
      decisionId: d.decisionId,
      chosenOptionId: "trusted_host_action",
      response: `Superseded: Director fulfilled this via Trusted Host Action ${actionId || ""}. No manual Terminal/Supabase step.`,
      actor,
      resumeAssignments,
      nowMs,
    });
    if (out.ok) closed.push(d.decisionId);
  }
  return closed;
}

export async function resumeMissionAfterTrustedHostAction({
  missionId,
  actionId,
  assignmentId = null,
  actor = "director",
  nowMs,
} = {}) {
  const action = getTrustedHostAction(actionId);
  if (!action || action.state !== "completed") {
    return { ok: false, error: "action_not_completed", actionId };
  }
  const closed = closeManualExecutionDecisions(missionId, { actionId, actor, nowMs });
  const asgIds = assignmentId
    ? [assignmentId]
    : (action.assignmentId ? [action.assignmentId] : []);

  const response = buildResumeMessage(action);
  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Results returned to Claude",
      summary: "Paused work resumed after Trusted Host Action.",
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: actionId, closedDecisions: closed },
      nowMs,
    });
  } catch { /* */ }

  const mission = getMission(missionId);
  const resumed = await resumeAfterDecisionAnswer({
    missionId,
    assignmentIds: asgIds,
    decision: {
      decisionId: closed[0] || "trusted_host_action",
      title: "Trusted Host Action completed",
      situation: "Privileged read fulfilled on the trusted host.",
      recommendation: "Continue with census evidence.",
    },
    chosenOptionId: "trusted_host_action",
    response,
    slot: mission?.worker_slot || 6,
    actor,
    nowMs,
  });

  return {
    ok: true,
    actionId,
    closedDecisions: closed,
    resumed,
    executionSessionId: action.executionSessionId,
  };
}
