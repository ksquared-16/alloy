/**
 * Vacilando V2 HTTP handlers — Mission Brief execution surface.
 * Kept as one module so vacilando-server stays a thin dispatcher.
 */
import {
  ingestMissionBrief,
  reviewMissionReadiness,
  approveMissionExecution,
  getKickoffState,
} from "./mission-kickoff.mjs";
import { hostname as osHostname } from "node:os";
import { getBrief, getBriefVersion, listBriefVersions, proposeBriefRevision, createBrief } from "./mission-brief.mjs";
import { readTimelineSummary, summarizeFromTimeline, readTimeline } from "./timeline.mjs";
import {
  listAssignments,
  getAssignment,
  buildAssignmentPackage,
  acknowledgeWorkerContext,
  submitWorkerStartReport,
  reportWorkerProgress,
  reportWorkerBlocker,
  submitWorkerCompletion,
  validateAssignmentCompletion,
  pauseAssignments,
  resumeAssignments,
  invalidateWorkerContexts,
  assignmentDependencyGraph,
} from "./worker-assignment.mjs";
import {
  createDecision,
  answerDecision,
  listDecisions,
  getDecision,
  classifyIssue,
} from "./decisions.mjs";
import {
  createCollaborationEntry,
  updateCollaborationStatus,
  listCollaboration,
  COLLABORATION_TYPES,
  COLLABORATION_STATUSES,
} from "./mission-collaboration.mjs";
import {
  attachEvidence,
  listEvidence,
  listValidationRuns,
  recordValidationRun,
  acceptanceEvidenceCoverage,
  canCertifyMission,
  certifyMissionCompletion,
  rejectMissionCompletion,
  buildMissionCompletionPackage,
  listAllEvidenceGalleries,
} from "./evidence.mjs";
import {
  claimResource,
  releaseResource,
  listResourceClaims,
  hasBuildLockConflict,
} from "./resource-claims.mjs";
import {
  recordHeartbeat,
  getWorkerTelemetry,
  listWorkerTelemetry,
  recoverWorker,
  detectStaleWorkers,
} from "./worker-health.mjs";
import {
  buildDirectorSummary,
  listMissionsV2,
  getMissionDetailProjection,
} from "./director-summary.mjs";
import { buildMissionContextPackage } from "./mission-context.mjs";
import {
  missionsHomeVm,
  missionDashboardVm,
  missionOutcomeVm,
  directorSummaryVm,
  timelinePageVm,
  evidenceGalleryVm,
  workersHomeVm,
  workerDetailVm,
  decisionCardVm,
  decisionDetailVm,
  listNeedsYou,
  kickoffVm,
} from "./presentation/operator-views.mjs";
import {
  getMissionConfidence, recordMissionConfidence,
} from "./mission-confidence.mjs";
import {
  getPlatformResources,
  recordPlatformResourcesSnapshot,
  listPlatformResourceHistory,
} from "./platform-resources.mjs";
import {
  recordUsageEvent,
  listUsageEvents,
  summarizeUsage,
  recordUsageFromTelemetry,
} from "./usage-ledger.mjs";
import { submitOperatorDirectorMessage, listDirectorMessages } from "./director-comms.mjs";
import {
  createDeliverableReview,
  ensureDeliverableReviewsForMission,
  listDeliverableReviews,
  getDeliverableReview,
  getOpenDeliverableReview,
  acceptDeliverableReview,
  requestDeliverableChanges,
  askDirectorAboutDeliverable,
  shareContextWithDirector,
  recheckDeliverableReview,
  deliverableReviewVm,
} from "./deliverable-review.mjs";
import {
  captureImprovement,
  listImprovements,
  getImprovement,
  updateImprovement,
  improvementsHomeVm,
  improvementDetailVm,
  purgeMissionRuntime,
  IMPROVEMENT_CATEGORIES,
  IMPROVEMENT_SEVERITIES,
} from "./improvements.mjs";
import {
  authorizeV2Request,
  pathRequiresV2Auth,
  getVacilandoApiToken,
  apiAuthRequired,
  tokenFingerprint,
  isPublicApiPath,
  gatewayRemoteMode,
} from "./vacilando-api-auth.mjs";
import { RECHECK_SEMANTICS, CERTIFY_NOTE_SEMANTICS } from "./deliverable-director-loop.mjs";

function authGate(path, method, headers) {
  if (!apiAuthRequired()) return { ok: true };
  if (gatewayRemoteMode()) {
    if (isPublicApiPath(path, method)) return { ok: true };
    const auth = authorizeV2Request(headers || {}, { mutation: method === "POST" });
    if (!auth.ok) return { ok: false, status: auth.status, body: { ok: false, error: auth.error } };
    return { ok: true, actor: auth.actor };
  }
  const protectedDeliverable = path.startsWith("/api/v2/deliverable-reviews")
    || path.startsWith("/api/v2/director/messages");
  if (!protectedDeliverable) return { ok: true };
  const auth = authorizeV2Request(headers || {}, { mutation: method === "POST" });
  if (!auth.ok) return { ok: false, status: auth.status, body: { ok: false, error: auth.error } };
  return { ok: true, actor: auth.actor };
}

/** Slot from a worktree path, for a lane whose binding has not recorded one. */
function laneSlotFromPath(lane) {
  const m = String(lane?.binding?.worktree_path || "").match(/\/wt(\d)-/);
  return m ? Number(m[1]) : null;
}

function gatewayHostLabel() {
  try { return osHostname(); } catch { return "the Gateway host"; }
}

/**
 * Whether the Director is reading this UI ON the Gateway host.
 *
 * Judged from the Host header, because that is what separates a loopback visit
 * from a tailnet one: the Gateway answers at both 127.0.0.1:3020 and
 * <machine>.<tailnet>.ts.net:3020, and only the first can see a window that
 * opens on this machine's screen. Returns null when it cannot tell, so the copy
 * stays honest instead of asserting the wrong one.
 */
function requestIsFromGatewayHost(headers = {}) {
  const host = String(headers.host || headers.Host || "").trim().toLowerCase();
  if (!host) return null;
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

export async function handleV2Post(path, body, { headers = {} } = {}) {
  const v = body || {};
  const gate = authGate(path, "POST", headers);
  if (!gate.ok) return { status: gate.status, body: gate.body };
  const actorDefault = gate.actor || v.actor || "operator";
  const idempotencyKey = v.idempotency_key || v.idempotencyKey || headers["x-idempotency-key"] || headers["X-Idempotency-Key"] || null;

  // Browser-session recovery. THE AGENT MAY START A SIGN-IN AND MAY ABANDON ONE;
  // IT MAY NEVER COMPLETE ONE. A person types the password into a browser this
  // opens on the slot's own loopback base. Nothing typed reaches the agent, the
  // request, the response or any durable record — the only thing that crosses
  // this boundary is a state name.
  if (path === "/api/v2/browser-auth/status"
    || path === "/api/v2/browser-auth/sign-in"
    || path === "/api/v2/browser-auth/verify") {
    const {
      validateBrowserAuthRequest, readSlotAuthStatus, verifyBrowserAuth,
      beginBrowserAuthCapture, recordSlotVerification, publicAuthOutcome,
      qaIdentityForSlot, BROWSER_AUTH_STATES,
    } = await import("./browser-auth.mjs");
    const { getDurableLane } = await import("./development-lane.mjs");
    const laneId = v.lane_id || v.laneId;
    const lane = laneId ? getDurableLane(laneId) : null;
    if (!lane) return { status: 404, body: { ok: false, error: "lane_not_registered" } };
    const slot = v.slot ?? lane.binding?.slot ?? null;
    const validated = validateBrowserAuthRequest({
      lane,
      slot,
      expectedIdentity: qaIdentityForSlot(slot ?? laneSlotFromPath(lane)),
    });
    if (!validated.ok) return { status: 409, body: validated };

    const status = readSlotAuthStatus(validated.slot);
    if (path === "/api/v2/browser-auth/status") {
      return { status: 200, body: publicAuthOutcome({ validated, state: status.state, status, detail: status.detail }) };
    }
    if (path === "/api/v2/browser-auth/verify") {
      const verdict = await verifyBrowserAuth(validated);
      recordSlotVerification(validated.slot, {
        state: verdict.state, expectedIdentity: validated.expected_identity,
        actualIdentity: verdict.actual_identity, detail: verdict.detail,
      });
      return {
        status: verdict.ok ? 200 : 409,
        body: publicAuthOutcome({ validated, state: verdict.state, status, detail: verdict.detail }),
      };
    }
    // sign-in: START the capture and answer immediately.
    //
    // WHY THIS DOES NOT WAIT. The capture is only finished when a person has
    // typed a password, which can be minutes away. Awaiting it held the HTTP
    // response open for the whole capture window, so the button sat on
    // "Waiting for you to sign in…" with no other signal and looked broken —
    // and any proxy between the operator and the Gateway would time the request
    // out before the person ever finished.
    //
    // WHERE THE BROWSER APPEARS. On the Gateway HOST, because that is where the
    // Playwright profile and the loopback base live. A Director reading this UI
    // from a phone or another machine over the tailnet will see nothing happen,
    // which is exactly what "the sign in link did not navigate anywhere" was.
    // The response now says whose screen to look at, and whether this request
    // came from that machine.
    const capture = beginBrowserAuthCapture(validated, {
      timeoutMs: Number.isFinite(Number(v.timeout_ms)) ? Number(v.timeout_ms) : undefined,
    });
    // Never let an abandoned capture surface as an unhandled rejection.
    capture.catch(() => {});
    const outcome = publicAuthOutcome({
      validated,
      state: BROWSER_AUTH_STATES.AWAITING_OPERATOR,
      status,
    });
    const local = requestIsFromGatewayHost(headers);
    return {
      status: 202,
      body: {
        ...outcome,
        capture_started: true,
        browser_opens_on: gatewayHostLabel(),
        viewer_is_on_host: local,
        next_step: local === true
          ? "A browser window is opening on this machine. Sign in there, then press Re-check."
          : local === false
            ? `The browser opens on ${gatewayHostLabel()}, not on this device. Sign in at that machine's screen, then press Re-check here.`
            : `The browser opens on ${gatewayHostLabel()}. Sign in at that machine's screen, then press Re-check here.`,
      },
    };
  }
  if (path === "/api/v2/lanes/create" || path === "/api/v2/lane/create") {
    const { createNewLaneRequest } = await import("./lane-identity-api.mjs");
    return createNewLaneRequest(v, { actor: actorDefault });
  }
  if (path === "/api/v2/lanes/connect" || path === "/api/v2/lane/connect") {
    const { connectExistingWorkRequest } = await import("./lane-identity-api.mjs");
    return connectExistingWorkRequest(v, { actor: actorDefault });
  }
  if (path === "/api/v2/lane/rename" || path === "/api/v2/lanes/rename") {
    const id = v.lane_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { renameLaneRequest } = await import("./lane-identity-api.mjs");
    return renameLaneRequest(id, v, { actor: actorDefault });
  }
  if (path === "/api/v2/lane/mission/bind" || path === "/api/v2/lanes/mission/bind") {
    const id = v.lane_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const missionId = v.mission_id || v.missionId;
    if (!missionId) return { status: 400, body: { ok: false, error: "missing_mission_id" } };
    const { bindLaneMission, publicDurableLane } = await import("./development-lane.mjs");
    const out = bindLaneMission(id, missionId, {
      origin: "operator",
      requireExisting: v.require_existing !== false,
    });
    const status = out.ok ? 200 : (out.error === "lane_not_found" || out.error === "mission_not_found" ? 404 : 400);
    return { status, body: { ...out, lane: out.lane ? publicDurableLane(out.lane) : null } };
  }
  if (path === "/api/v2/development-resources/exclusive/release") {
    const { emergencyReleaseExclusive } = await import("./execution-exclusive.mjs");
    const out = emergencyReleaseExclusive({
      confirm: v.confirm === true,
      actor: actorDefault,
      origin: "operator",
    });
    const status = out.ok ? 200 : (out.error === "confirm_required" || out.error === "no_exclusive_window" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/lane/admission/prioritize" || path === "/api/v2/lanes/admission/prioritize") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { admissionForLane, prioritizeAdmission } = await import("./execution-admission.mjs");
    const rec = admissionForLane(laneId);
    if (!rec) return { status: 404, body: { ok: false, error: "admission_not_found" } };
    const out = prioritizeAdmission(rec.admission_id, { origin: "operator", expectedLaneId: laneId });
    const status = out.ok ? 200 : (out.error === "not_queued" || out.error === "lane_mismatch" ? 409 : 400);
    return { status, body: out };
  }
  if (path === "/api/v2/lane-folders/create") {
    const { createLaneFolder } = await import("./lane-folders.mjs");
    const out = createLaneFolder({ name: v.name });
    return { status: out.ok ? 200 : (out.error === "folder_limit_reached" ? 409 : 400), body: out };
  }
  if (path === "/api/v2/lane-folders/rename") {
    const id = v.folder_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_folder_id" } };
    const { renameLaneFolder } = await import("./lane-folders.mjs");
    const out = renameLaneFolder(id, v.name);
    return { status: out.ok ? 200 : (out.error === "folder_not_found" ? 404 : 400), body: out };
  }
  if (path === "/api/v2/lane-folders/delete") {
    const id = v.folder_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_folder_id" } };
    const { deleteLaneFolder } = await import("./lane-folders.mjs");
    const out = deleteLaneFolder(id);
    return { status: out.ok ? 200 : (out.error === "folder_not_found" ? 404 : 400), body: out };
  }
  if (path === "/api/v2/lane/folder" || path === "/api/v2/lanes/folder") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { assignLaneToFolder } = await import("./lane-folders.mjs");
    const out = assignLaneToFolder(laneId, v.folder_id ?? null);
    const status = out.ok ? 200 : ((out.error === "lane_not_found" || out.error === "folder_not_found") ? 404 : 400);
    return { status, body: out };
  }
  if (path === "/api/v2/lane/preferred-provider" || path === "/api/v2/lanes/preferred-provider") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { setLanePreferredProvider } = await import("./development-lane.mjs");
    const out = setLanePreferredProvider(laneId, v.provider);
    return { status: out.ok ? 200 : (out.error === "lane_not_found" ? 404 : 400), body: out };
  }
  if (path === "/api/v2/lane/instruction" || path === "/api/v2/lanes/instruction") {
    const id = v.lane_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const forbidden = ["session", "pane", "pane_id", "paneId", "target", "tmux_target", "command", "argv", "cwd", "executable", "keys", "key_sequence"];
    const extra = forbidden.filter((k) => v[k] != null && v[k] !== "");
    if (extra.length) return { status: 400, body: { ok: false, error: "unexpected_control_field", fields: extra } };
    const { deliverManagedLaneInstruction, laneInstructionHttpStatus } = await import("./execution-run-send.mjs");
    const out = await deliverManagedLaneInstruction(id, v.instruction, {
      actor: actorDefault,
      provider: v.provider,
      attachmentIds: v.attachment_ids,
    });
    return { status: laneInstructionHttpStatus(out), body: out };
  }

  if (path === "/api/v2/lane/run/close-stale" || path === "/api/v2/lanes/run/close-stale") {
    const id = v.lane_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { closeStaleExecutionRun } = await import("./execution-stale.mjs");
    const { activeRunForLane } = await import("./execution-run.mjs");
    const runId = v.run_id || v.runId || activeRunForLane(id)?.run_id;
    if (!runId) return { status: 404, body: { ok: false, error: "run_not_found" } };
    const out = closeStaleExecutionRun(runId, { origin: "operator" });
    const status = out.ok ? 200 : (out.error === "run_still_active" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/lane/run/recover" || path === "/api/v2/lanes/run/recover") {
    const id = v.lane_id || v.id;
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { recoverExecutionRun, listExecutionRunsForLane } = await import("./execution-run.mjs");
    const runId = v.run_id || v.runId
      || listExecutionRunsForLane(id).find((r) => r.state === "ABANDONED")?.run_id;
    if (!runId) return { status: 404, body: { ok: false, error: "run_not_found" } };
    const out = recoverExecutionRun(runId, { laneId: id, origin: "operator", reason: "operator_continued_run" });
    const status = out.ok
      ? 200
      : (["lane_has_active_run", "run_irreversible"].includes(out.error) ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/lane/run/report" || path === "/api/v2/lanes/run/report") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { reportRunState, activeRunForLane } = await import("./execution-run.mjs");
    const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
    if (!found.ok) {
      const status = found.error === "invalid_lane_id" ? 400 : 404;
      return { status, body: { ok: false, error: found.error } };
    }
    const runId = v.run_id || v.runId || activeRunForLane(laneId)?.run_id;
    if (!runId) return { status: 404, body: { ok: false, error: "run_not_found" } };
    const out = reportRunState(runId, v.state, {
      reason: v.reason || null,
      summary: v.summary || null,
      resource: v.resource || null,
      resource_event: v.resource_event || v.resourceEvent || null,
      origin: "agent",
      cwd: found.lane?.worktree?.path || null,
      expectedLaneId: laneId,
      checkpoint_ready: v.checkpoint_ready,
      checkpoint_summary: v.checkpoint_summary || null,
    });
    const status = out.ok ? 200 : (out.error === "illegal_transition" || out.error === "worktree_mismatch" || out.error === "lane_mismatch" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/director/refresh" || path === "/api/v2/control-plane/refresh") {
    const { refreshDirectorCapabilities } = await import("./director-capability-freshness.mjs");
    const { recoverMisclassifiedStaleGovernedRequests, tickGovernedActions } = await import("./governed-action-request.mjs");
    const out = await refreshDirectorCapabilities({
      reason: v.reason || "operator_refresh_director",
    });
    const recovered = recoverMisclassifiedStaleGovernedRequests();
    tickGovernedActions();
    return {
      status: out.ok ? 200 : 409,
      body: {
        ok: out.ok,
        refreshing: out.scheduled || out.mode === "test_handler",
        mode: out.mode,
        recovered: recovered.length,
        operator_action: out.operator_action || null,
      },
    };
  }

  if (path === "/api/v2/lane/governed-action" || path === "/api/v2/lanes/governed-action" || path === "/api/v2/governed-actions") {
    const { requestGovernedAction } = await import("./governed-action-request.mjs");
    const laneId = v.lane_id || v.laneId || v.id;
    const out = requestGovernedAction({
      ...v,
      lane_id: laneId,
      mission_id: v.mission_id || v.missionId,
      run_id: v.run_id || v.runId,
      action_key: v.action_key || v.actionKey,
    }, { processNow: true });
    const status = out.ok ? 200 : (out.error === "request_not_found" ? 404 : 409);
    return { status, body: out };
  }
  if (path === "/api/v2/governed-actions/approve") {
    const { approveGovernedAction, pendingGovernedActionForMission, pendingGovernedActionForLane } = await import("./governed-action-request.mjs");
    const id = v.request_id || v.requestId;
    // A repository-authorized request has no mission, so the mission lookup
    // cannot find it. The lane always can.
    const pending = id
      ? null
      : (pendingGovernedActionForMission(v.mission_id || v.missionId)
        || pendingGovernedActionForLane(v.lane_id || v.laneId));
    try {
      const out = await Promise.resolve(approveGovernedAction(id || pending?.request_id, { actor: actorDefault }));
      return { status: out.ok ? 200 : 409, body: out };
    } catch (e) {
      return {
        status: 409,
        body: { ok: false, error: "approve_failed", detail: String(e && e.message || e) },
      };
    }
  }
  if (path === "/api/v2/governed-actions/deny") {
    const { denyGovernedAction, pendingGovernedActionForMission, pendingGovernedActionForLane } = await import("./governed-action-request.mjs");
    const id = v.request_id || v.requestId;
    const pending = id
      ? null
      : (pendingGovernedActionForMission(v.mission_id || v.missionId)
        || pendingGovernedActionForLane(v.lane_id || v.laneId));
    const out = denyGovernedAction(id || pending?.request_id, {
      actor: actorDefault,
      reason: v.reason || "approval_denied",
      code: v.code || "approval_denied",
    });
    return { status: out.ok ? 200 : 409, body: out };
  }

  if (path === "/api/v2/lane/agent-session/handoff" || path === "/api/v2/lanes/agent-session/handoff") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { acceptHandoffReport } = await import("./agent-session-lifecycle.mjs");
    const { activeRunForLane } = await import("./execution-run.mjs");
    const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
    if (!found.ok) {
      const status = found.error === "invalid_lane_id" ? 400 : 404;
      return { status, body: { ok: false, error: found.error } };
    }
    const runId = v.run_id || v.runId || activeRunForLane(laneId)?.run_id;
    const out = acceptHandoffReport({
      laneId,
      runId,
      handoff: v,
      cwd: found.lane?.worktree?.path || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }

  if (path === "/api/v2/lane/agent-session/oriented" || path === "/api/v2/lanes/agent-session/oriented") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { acceptOrientationReport } = await import("./agent-session-lifecycle.mjs");
    const { activeRunForLane } = await import("./execution-run.mjs");
    const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
    if (!found.ok) {
      const status = found.error === "invalid_lane_id" ? 400 : 404;
      return { status, body: { ok: false, error: found.error } };
    }
    const runId = v.run_id || v.runId || activeRunForLane(laneId)?.run_id;
    const out = acceptOrientationReport({
      laneId,
      runId,
      orientation: v,
      cwd: found.lane?.worktree?.path || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }

  if (path === "/api/v2/lane/agent-session/start" || path === "/api/v2/lanes/agent-session/start") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { unexpectedLaneControlFields } = await import("./lanes.mjs");
    const extra = unexpectedLaneControlFields(v);
    if (extra.length) return { status: 400, body: { ok: false, error: "unexpected_control_field", fields: extra } };
    if (v.provider) {
      const { setLanePreferredProvider } = await import("./development-lane.mjs");
      setLanePreferredProvider(laneId, v.provider);
    }
    const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
    const out = await startLaneAgentSession({ laneId, origin: "operator" });
    const status = out.ok ? 200
      : (out.error === "runtime_pane_missing" || out.error === "agent_already_running" || out.error === "binding_missing" || out.error === "provider_capacity" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/lane/agent-session/refresh" || path === "/api/v2/lanes/agent-session/refresh") {
    const laneId = v.lane_id || v.id;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { requestSessionRotation } = await import("./agent-session-lifecycle.mjs");
    const out = await requestSessionRotation({
      laneId,
      origin: "operator",
      confirm: v.confirm === true,
    });
    const status = out.ok ? 200 : (out.error === "confirm_required" || out.error === "unsafe_checkpoint" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/lane/resource-request/prioritize" || path === "/api/v2/lanes/resource-request/prioritize") {
    const laneId = v.lane_id || v.id;
    const requestId = v.request_id || v.requestId;
    if (!laneId) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    if (!requestId) return { status: 400, body: { ok: false, error: "missing_request_id" } };
    const { prioritizeResourceRequest } = await import("./execution-resource.mjs");
    const out = prioritizeResourceRequest(requestId, { origin: "operator", expectedLaneId: laneId });
    const status = out.ok ? 200 : (out.error === "not_queued" || out.error === "lane_mismatch" ? 409 : 400);
    return { status, body: out };
  }

  if (path === "/api/v2/missions/brief/ingest") {
    try {
      return { status: 201, body: ingestMissionBrief(v, { slot: v.slot ?? null, provider: v.provider || "claude", actor: v.actor || "operator" }) };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/brief/approve") {
    const out = approveMissionExecution(v.brief_id || v.mission_brief_id || v.mission_id, v.version, {
      actor: v.actor || "operator",
      slot: v.slot ?? null,
      awaitDispatch: Boolean(v.await_dispatch || v.awaitDispatch),
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/deliverable-reviews/accept") {
    const mid = v.mission_id || v.missionId;
    const rid = v.review_id || v.reviewId;
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const out = acceptDeliverableReview(mid, rid, {
      actor: actorDefault,
      response: v.response || v.note || v.operator_note || null,
    });
    return { status: out.ok ? 200 : 409, body: { ...out, certifyNoteSemantics: CERTIFY_NOTE_SEMANTICS } };
  }
  if (path === "/api/v2/deliverable-reviews/request-changes") {
    const mid = v.mission_id || v.missionId;
    const rid = v.review_id || v.reviewId;
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const out = requestDeliverableChanges(mid, rid, {
      direction: v.direction || v.message || v.response,
      actor: actorDefault,
      idempotencyKey,
    });
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (path === "/api/v2/deliverable-reviews/ask") {
    const mid = v.mission_id || v.missionId;
    const rid = v.review_id || v.reviewId;
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const out = askDirectorAboutDeliverable(mid, rid, {
      message: v.message || v.response,
      actor: actorDefault,
      kind: v.kind === "context" ? "context" : "ask",
      idempotencyKey,
    });
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (path === "/api/v2/deliverable-reviews/share-context" || path === "/api/v2/deliverable-reviews/context") {
    const mid = v.mission_id || v.missionId;
    const rid = v.review_id || v.reviewId;
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const out = shareContextWithDirector(mid, rid, {
      message: v.message || v.response || v.note,
      actor: actorDefault,
      idempotencyKey,
    });
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (path === "/api/v2/deliverable-reviews/recheck") {
    const mid = v.mission_id || v.missionId;
    const rid = v.review_id || v.reviewId;
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const out = recheckDeliverableReview(mid, rid, {
      actor: actorDefault,
      idempotencyKey,
    });
    return { status: out.ok ? 200 : 400, body: { ...out, recheckSemantics: RECHECK_SEMANTICS } };
  }
  if (path === "/api/v2/deliverable-reviews/create" || path === "/api/v2/deliverable-reviews/ensure") {
    const mid = v.mission_id || v.missionId;
    const aid = v.assignment_id || v.assignmentId;
    if (aid) {
      const out = createDeliverableReview(mid, aid, { actor: v.actor || "director", force: Boolean(v.force) });
      return { status: out.ok ? 200 : 400, body: out };
    }
    const out = ensureDeliverableReviewsForMission(mid);
    return { status: 200, body: out };
  }

  if (path === "/api/v2/missions/complete" || path === "/api/v2/missions/certify") {
    const mid = v.mission_id || v.missionId;
    const out = certifyMissionCompletion(mid, {
      actor: v.actor || "operator",
      response: v.response || v.note || null,
      force: Boolean(v.force),
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/reject-completion" || path === "/api/v2/missions/completion/reject") {
    const mid = v.mission_id || v.missionId;
    const out = rejectMissionCompletion(mid, {
      actor: v.actor || "operator",
      response: v.response || v.note || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/reopen-work" || path === "/api/v2/missions/send-back") {
    const { reopenMissionForMoreWork } = await import("./mission-reopen.mjs");
    const mid = v.mission_id || v.missionId;
    const out = reopenMissionForMoreWork(mid, {
      actor: v.actor || "operator",
      response: v.response || v.note || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/park-outcome" || path === "/api/v2/missions/park") {
    const { parkMissionOutcome } = await import("./mission-reopen.mjs");
    const mid = v.mission_id || v.missionId;
    const out = parkMissionOutcome(mid, {
      actor: v.actor || "operator",
      response: v.response || v.note || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/advance-implementation" || path === "/api/v2/missions/advance") {
    const { advanceMissionToImplementation } = await import("./mission-advance.mjs");
    const mid = v.mission_id || v.missionId;
    const out = advanceMissionToImplementation(mid, {
      actor: v.actor || "operator",
      response: v.response || v.note || null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/open-next-wave" || path === "/api/v2/missions/next-wave") {
    const { ensureNextImplementationWave } = await import("./mission-advance.mjs");
    const mid = v.mission_id || v.missionId;
    const opened = ensureNextImplementationWave(mid, {
      actor: v.actor || "operator",
      waveHint: { wave: "next", workstream: v.workstream ?? null },
      response: v.response || v.note || "Accept and continue to next implementation phase",
    });
    if (!opened?.ok) {
      return { status: 409, body: opened };
    }
    try {
      const { scheduleDispatchAfterKickoff } = await import("./assignment-dispatch.mjs");
      const dispatched = scheduleDispatchAfterKickoff(mid, { actor: v.actor || "director" });
      return { status: 200, body: { ...opened, dispatch: dispatched } };
    } catch (e) {
      return { status: 200, body: { ...opened, dispatch: { ok: false, error: String(e?.message || e) } } };
    }
  }
  if (path === "/api/v2/missions/dispatch") {
    try {
      if (v.provider) process.env.VACILANDO_EXECUTION_PROVIDER = String(v.provider);
      if (v.allow_mock || v.allowMock) process.env.VACILANDO_ALLOW_MOCK_PROVIDER = "1";
      const { dispatchReadyAssignments } = await import("./assignment-dispatch.mjs");
      const mid = v.mission_id || v.missionId;
      const out = await dispatchReadyAssignments(mid, {
        slot: v.slot ?? null,
        actor: v.actor || "director",
      });
      return { status: 200, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/resume-stalled" || path === "/api/v2/missions/resume") {
    try {
      const { resumeStalledMission } = await import("./mission-reopen.mjs");
      const mid = v.mission_id || v.missionId;
      const out = await resumeStalledMission(mid, {
        actor: v.actor || "operator",
        response: v.response || v.note || null,
        dispatch: v.dispatch !== false,
      });
      return { status: out.ok ? 200 : 409, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/trusted-host/census" || path === "/api/v2/missions/trusted-host/census") {
    try {
      const { fulfillDatabaseCensusForMission } = await import("./trusted-host-actions.mjs");
      const { resumeMissionAfterTrustedHostAction } = await import("./trusted-host-resume.mjs");
      const mid = v.mission_id || v.missionId;
      const out = fulfillDatabaseCensusForMission(mid, {
        assignmentId: v.assignment_id || v.assignmentId || null,
        executionSessionId: v.execution_session_id || v.executionSessionId || null,
        actor: v.actor || "director",
      });
      if (!out.ok) return { status: 409, body: out };
      let resumed = null;
      if (v.resume !== false && out.action?.state === "completed") {
        resumed = await resumeMissionAfterTrustedHostAction({
          missionId: mid,
          actionId: out.action.id,
          assignmentId: v.assignment_id || v.assignmentId || out.action.assignmentId,
          actor: v.actor || "director",
        });
      }
      return { status: 200, body: { ...out, resumed } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/brief/review") {
    const brief = (v.version != null ? getBriefVersion(v.brief_id || v.mission_id, v.version) : null)
      || getBrief(v.brief_id || v.mission_id);
    if (!brief) return { status: 404, body: { ok: false, error: "brief_not_found" } };
    return { status: 200, body: { ok: true, brief, readiness: reviewMissionReadiness(brief) } };
  }
  if (path === "/api/v2/missions/brief/revise") {
    try {
      const brief = proposeBriefRevision(v.brief_id || v.mission_id, v.patch || v, {
        actor: v.actor || "operator",
        changeSummary: v.change_summary || v.changeSummary,
        approvalSource: v.approval_source || "operator_edit",
      });
      let compilation = null;
      try {
        const { compileMissionBrief } = await import("./mission-compiler.mjs");
        compilation = compileMissionBrief(brief.missionId, { brief, actor: "mission_compiler" });
      } catch { /* compile best-effort on revise */ }
      return {
        status: 200,
        body: {
          ok: true,
          brief,
          readiness: reviewMissionReadiness(brief),
          compiled: compilation?.compiled || null,
          compilationReport: compilation?.report || null,
        },
      };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/compile") {
    try {
      const { compileMissionBrief } = await import("./mission-compiler.mjs");
      const mid = v.mission_id || v.missionId || v.brief_id;
      const out = compileMissionBrief(mid, {
        actor: v.actor || "mission_compiler",
        createCompilationDecision: v.create_decision !== false,
      });
      return { status: 200, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }

  if (path === "/api/v2/assignments/ack") {
    return { status: 200, body: acknowledgeWorkerContext(v) };
  }
  if (path === "/api/v2/assignments/start-report") {
    return { status: 200, body: submitWorkerStartReport(v) };
  }
  if (path === "/api/v2/assignments/progress") {
    return { status: 200, body: reportWorkerProgress(v) };
  }
  if (path === "/api/v2/assignments/blocker") {
    return { status: 200, body: reportWorkerBlocker(v) };
  }
  if (path === "/api/v2/assignments/complete") {
    const out = submitWorkerCompletion(v);
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/assignments/validate") {
    return { status: 200, body: validateAssignmentCompletion(v.mission_id || v.missionId, v.assignment_id || v.assignmentId, { actor: v.actor || "director" }) };
  }
  if (path === "/api/v2/assignments/pause") {
    return { status: 200, body: { ok: true, assignments: pauseAssignments(v.mission_id, v.assignment_ids || [], { reason: v.reason, decisionId: v.decision_id }) } };
  }
  if (path === "/api/v2/assignments/resume") {
    return { status: 200, body: { ok: true, assignments: resumeAssignments(v.mission_id, v.assignment_ids || [], { reason: v.reason }) } };
  }

  if (path === "/api/v2/decisions") {
    const out = createDecision({
      ...v,
      missionId: v.mission_id || v.missionId,
      pauseAssignments,
    });
    return { status: 201, body: { ok: true, ...out } };
  }
  if (path === "/api/v2/decisions/answer") {
    const mid = v.mission_id || v.missionId;
    const chosen = v.chosen_option_id || v.chosenOptionId;
    const out = answerDecision({
      ...v,
      missionId: mid,
      decisionId: v.decision_id || v.decisionId,
      chosenOptionId: chosen,
      response: v.response || chosen,
      changesApprovedIntent: Boolean(v.changes_approved_intent || v.changesApprovedIntent),
      briefPatch: v.brief_patch || v.briefPatch,
      changeSummary: v.change_summary || v.changeSummary,
      resumeAssignments,
      invalidateWorkerContexts,
    });
    if (out.ok && mid) {
      // Mission-scoped Trusted Host authorization — execute then resume (no Terminal).
      if (chosen === "authorize_mission_census" || chosen === "retry_trusted_host"
          || chosen === "deny_production_reads" || chosen === "use_cert_only"
          || chosen === "approve_read_only_census") {
        setTimeout(async () => {
          try {
            const { grantMissionAuthorization } = await import("./trusted-host-authz.mjs");
            const { ACTION_TYPES, fulfillDatabaseCensusForMission } = await import("./trusted-host-actions.mjs");
            const { resumeMissionAfterTrustedHostAction } = await import("./trusted-host-resume.mjs");
            if (chosen === "authorize_mission_census") {
              grantMissionAuthorization({
                missionId: mid,
                actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
                actor: v.actor || "operator",
                sourceDecisionId: out.decision?.decisionId,
                note: "Operator authorized read-only database census for this mission.",
              });
            }
            const { handleGovernedDecisionAnswer } = await import("./governed-action-request.mjs");
            const governed = await handleGovernedDecisionAnswer(mid, chosen, { actor: v.actor || "operator" });
            if (governed?.ok) return;
            const fulfilled = fulfillDatabaseCensusForMission(mid, {
              assignmentId: (out.decision?.affectedAssignments || [])[0] || null,
              actor: "director",
            });
            if (fulfilled.ok && fulfilled.action?.state === "completed") {
              await resumeMissionAfterTrustedHostAction({
                missionId: mid,
                actionId: fulfilled.action.id,
                assignmentId: fulfilled.action.assignmentId,
                actor: "director",
              });
            }
          } catch { /* best-effort */ }
        }, 10);
        return { status: 200, body: out };
      }
      const { resumeAfterDecisionAnswer } = await import("./assignment-dispatch.mjs");
      // Durable resume — prefer prior Claude session; do not blind re-dispatch.
      setTimeout(() => {
        resumeAfterDecisionAnswer({
          missionId: mid,
          assignmentIds: out.decision?.affectedAssignments || [],
          decision: out.decision,
          chosenOptionId: chosen,
          response: v.response || chosen,
          actor: "director",
        }).catch(() => {});
      }, 10);
    }
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/issues/classify") {
    return { status: 200, body: { ok: true, ...classifyIssue(v.kind) } };
  }

  if (path === "/api/v2/evidence") {
    try {
      const art = attachEvidence({
        ...v,
        missionId: v.mission_id || v.missionId,
        assignmentId: v.assignment_id || v.assignmentId,
        acceptanceCriteriaIds: v.acceptance_criteria_ids || v.acceptanceCriteriaIds || [],
      });
      return { status: 201, body: { ok: true, artifact: art } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/validation-runs") {
    return { status: 201, body: { ok: true, run: recordValidationRun({
      ...v,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
      exitStatus: v.exit_status ?? v.exitStatus,
      commitSha: v.commit_sha || v.commitSha,
    }) } };
  }

  if (path === "/api/v2/resources/claim") {
    const out = claimResource({
      ...v,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
      workerId: v.worker_id || v.workerId,
      resourceKey: v.resource_key || v.resourceKey,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/resources/release") {
    return { status: 200, body: releaseResource(v.claim_id || v.claimId, { actor: v.actor || "director" }) };
  }

  if (path === "/api/v2/workers/heartbeat") {
    const telemetry = recordHeartbeat({
      workerId: v.worker_id || v.workerId,
      assignmentId: v.assignment_id || v.assignmentId,
      missionId: v.mission_id || v.missionId,
      processId: v.process_id || v.processId,
      cpuPercent: v.cpu_percent ?? v.cpuPercent,
      memoryMb: v.memory_mb ?? v.memoryMb,
      activeCommand: v.active_command || v.activeCommand,
    });
    try {
      recordUsageFromTelemetry(telemetry, {
        runtimeMs: v.runtime_ms ?? v.runtimeMs ?? null,
      });
    } catch { /* usage ledger must not break heartbeats */ }
    return { status: 200, body: { ok: true, telemetry } };
  }
  if (path === "/api/v2/workers/recover") {
    return { status: 200, body: recoverWorker({
      ...v,
      workerId: v.worker_id || v.workerId,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
    }) };
  }
  if (path === "/api/v2/platform/usage") {
    try {
      const event = recordUsageEvent({
        ...v,
        workerId: v.worker_id || v.workerId,
        missionId: v.mission_id || v.missionId,
        assignmentId: v.assignment_id || v.assignmentId,
        runtimeMs: v.runtime_ms ?? v.runtimeMs,
        estimatedCostUsd: v.estimated_cost_usd ?? v.estimatedCostUsd,
        inputTokens: v.input_tokens ?? v.inputTokens,
        outputTokens: v.output_tokens ?? v.outputTokens,
        totalTokens: v.total_tokens ?? v.totalTokens,
        cpuPercent: v.cpu_percent ?? v.cpuPercent,
        memoryMb: v.memory_mb ?? v.memoryMb,
      });
      return { status: 201, body: { ok: true, event } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/workspace/reply" || path === "/api/v2/views/workspace/reply") {
    const { postWorkspaceReply } = await import("./presentation/workspace-runtime.mjs");
    const workspaceId = v.workspace_id || v.workspaceId || v.id || "ws_identity";
    const text = v.text || v.message || v.body || "";
    const out = postWorkspaceReply(workspaceId, { text, actor: actorDefault });
    if (!out.ok) {
      const status = out.error === "workspace_not_found" ? 404
        : out.error === "empty_message" ? 400
          : out.error === "message_too_long" ? 400
            : 400;
      return { status, body: out };
    }
    return { status: 200, body: out };
  }
  if (path === "/api/v2/workspace/last-seen" || path === "/api/v2/views/workspace/last-seen") {
    const { setWorkspaceLastSeen, resolveV31Workspace } = await import("./presentation/workspace-runtime.mjs");
    const workspaceId = v.workspace_id || v.workspaceId || v.id || "ws_identity";
    if (!resolveV31Workspace(workspaceId)) {
      return { status: 404, body: { ok: false, error: "workspace_not_found" } };
    }
    const out = setWorkspaceLastSeen(workspaceId, {
      eventId: v.event_id || v.eventId || null,
      at: v.at || null,
      operatorId: v.operator_id || v.operatorId || "kelly",
    });
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (path === "/api/v2/director/message") {
    try {
      const out = submitOperatorDirectorMessage({
        missionId: v.mission_id || v.missionId,
        decisionId: v.decision_id || v.decisionId || null,
        kind: v.kind,
        message: v.message,
        actor: v.actor || "operator",
      });
      return { status: out.ok ? 200 : 400, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/collaboration" || path === "/api/v2/collaboration") {
    try {
      const entry = createCollaborationEntry({
        missionId: v.mission_id || v.missionId,
        type: v.type || "feedback",
        body: v.body || v.message || v.text,
        author: v.actor || v.author || "director",
        status: v.status || "open",
        deliverableId: v.deliverable_id || v.deliverableId || null,
        deliverableLabel: v.deliverable_label || v.deliverableLabel || null,
        title: v.title || null,
        relatedEntryId: v.related_entry_id || v.relatedEntryId || null,
        source: v.source || "director_collaboration",
      });
      return { status: 201, body: { ok: true, entry } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/collaboration/status" || path === "/api/v2/collaboration/status") {
    const out = updateCollaborationStatus(
      v.mission_id || v.missionId,
      v.entry_id || v.entryId || v.id,
      v.status,
      {
        actor: v.actor || "director",
        note: v.note || null,
      },
    );
    return { status: out.ok ? 200 : 404, body: out };
  }
  if (path === "/api/v2/improvements") {
    try {
      const rec = captureImprovement({
        title: v.title || null,
        description: v.description || null,
        whatHappened: v.what_happened ?? v.whatHappened ?? v.description,
        expectedBehavior: v.expected_behavior ?? v.expectedBehavior,
        interrupt: v.interrupt || null,
        severity: v.severity || null,
        category: v.category || null,
        missionId: v.mission_id || v.missionId || null,
        currentScreen: v.current_screen || v.currentScreen || null,
        currentSection: v.current_section || v.currentSection || null,
        currentRoute: v.current_route || v.currentRoute || null,
        workerId: v.worker_id || v.workerId || null,
        decisionId: v.decision_id || v.decisionId || null,
        screenshotRef: v.screenshot_ref || v.screenshotRef || null,
        createdBy: v.actor || v.created_by || "operator",
      });
      return {
        status: 201,
        body: {
          ok: true,
          improvement: rec,
          interpretation: rec.directorInterpretation || null,
        },
      };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/improvements/update") {
    const out = updateImprovement(v.id || v.improvement_id, v.patch || v, {
      actor: v.actor || "operator",
    });
    return { status: out.ok ? 200 : 404, body: out };
  }
  if (path === "/api/v2/missions/purge") {
    const id = v.mission_id || v.missionId;
    return { status: 200, body: purgeMissionRuntime(id) };
  }
  if (path === "/api/v2/missions/archive") {
    try {
      const { archiveMission, archiveValidationMissionsForCloseout } = await import("./mission-archive.mjs");
      if (v.all_validation || v.closeout) {
        return { status: 200, body: archiveValidationMissionsForCloseout({ actor: v.actor || "operator" }) };
      }
      const id = v.mission_id || v.missionId;
      if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
      const entry = archiveMission(id, {
        reason: v.reason,
        archiveClass: v.archive_class || v.archiveClass,
        classification: v.classification,
        actor: v.actor || "operator",
      });
      return { status: 200, body: { ok: true, entry } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/restore") {
    try {
      const { restoreMission } = await import("./mission-archive.mjs");
      const out = restoreMission(v.mission_id || v.missionId, { actor: v.actor || "operator" });
      return { status: 200, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/local-server" || path === "/api/v2/missions/local-server/control") {
    try {
      const { controlMissionLocalServer } = await import("./mission-local-server.mjs");
      const mid = v.mission_id || v.missionId;
      const action = v.action || v.command || null;
      const out = controlMissionLocalServer(mid, action);
      return { status: out.ok ? 200 : 409, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/day/stop" || path === "/api/v2/day/stop-of-day") {
    try {
      const { stopOfDay } = await import("./day-ops.mjs");
      const out = stopOfDay();
      return { status: out.ok ? 200 : 409, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/day/start" || path === "/api/v2/day/start-of-day") {
    try {
      const { startOfDay } = await import("./day-ops.mjs");
      const out = startOfDay();
      return { status: out.ok ? 200 : 409, body: out };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }

  return null; // not a V2 route
}

export async function handleV2Get(path, url, { headers = {} } = {}) {
  const q = (k) => url.searchParams.get(k);

  if (path === "/api/v2/session") {
    const required = apiAuthRequired();
    const auth = authorizeV2Request(headers || {}, { mutation: false });
    const token = required ? getVacilandoApiToken() : null;
    return {
      status: 200,
      body: {
        ok: true,
        authRequired: required,
        authenticated: Boolean(auth.ok && auth.mode !== "open" ? true : !required),
        tokenFingerprint: required && auth.ok ? tokenFingerprint(token) : null,
        isolation: {
          boundary: "missionId",
          organizations: "n/a — Vacilando control plane is single-tenant/local",
        },
        recheckSemantics: RECHECK_SEMANTICS,
        certifyNoteSemantics: CERTIFY_NOTE_SEMANTICS,
      },
    };
  }

  const gate = authGate(path, "GET", headers);
  if (!gate.ok) return { status: gate.status, body: gate.body };

  if (path === "/api/v2/runtime/diagnostics") {
    const { buildRuntimeDiagnostics } = await import("./runtime-diagnostics.mjs");
    return { status: 200, body: await buildRuntimeDiagnostics() };
  }
  if (path === "/api/v2/day" || path === "/api/v2/views/day" || path === "/api/v2/day/ops") {
    const { dayOpsVm } = await import("./day-ops.mjs");
    return { status: 200, body: { ok: true, ...dayOpsVm() } };
  }
  if (path === "/api/v2/trusted-host/diagnostics" || path === "/api/v2/views/trusted-host/diagnostics") {
    const { trustedHostDiagnostics } = await import("./trusted-host-actions.mjs");
    return { status: 200, body: { ok: true, diagnostics: trustedHostDiagnostics() } };
  }
  if (path === "/api/v2/governed-actions") {
    const { listGovernedActions, pendingGovernedActionForMission, pendingGovernedActionForLane } = await import("./governed-action-request.mjs");
    const mid = q("mission_id") || q("id");
    const laneId = q("lane_id");
    return {
      status: 200,
      body: {
        ok: true,
        requests: listGovernedActions({ missionId: mid, laneId }),
        pending: mid
          ? pendingGovernedActionForMission(mid)
          : (laneId ? pendingGovernedActionForLane(laneId) : null),
      },
    };
  }
  if (path === "/api/v2/revision" || path === "/api/v2/views/revision") {
    const { computePresentationRevision } = await import("./presentation-revision.mjs");
    return { status: 200, body: { ok: true, ...computePresentationRevision() } };
  }

  if (path === "/api/v2/missions" || path === "/api/v2/views/missions") {
    const filter = q("filter") || "active";
    return { status: 200, body: { ok: true, ...missionsHomeVm({ filter }) } };
  }
  if (path === "/api/v2/views/needs-you") {
    return { status: 200, body: { ok: true, items: listNeedsYou() } };
  }
  if (path === "/api/v2/views/workers") {
    return { status: 200, body: { ok: true, ...workersHomeVm() } };
  }
  if (path === "/api/v2/views/worker") {
    const vm = workerDetailVm(q("id") || q("worker_id"));
    if (!vm) return { status: 404, body: { ok: false, error: "worker_not_found" } };
    return { status: 200, body: { ok: true, worker: vm } };
  }
  if (path === "/api/v2/views/mission/overview" || path === "/api/v2/views/mission/dashboard") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    const dashboard = missionDashboardVm(id);
    if (!dashboard) return { status: 404, body: { ok: false, error: "mission_not_found" } };
    return { status: 200, body: { ok: true, dashboard, overview: dashboard } };
  }
  if (path === "/api/v2/deliverable-reviews" || path === "/api/v2/views/deliverable-reviews") {
    const mid = q("mission_id") || q("id");
    if (!mid) return { status: 400, body: { ok: false, error: "missing_mission_id" } };
    ensureDeliverableReviewsForMission(mid);
    return {
      status: 200,
      body: {
        ok: true,
        reviews: listDeliverableReviews(mid, { includeSuperseded: q("all") === "1" }),
        open: getOpenDeliverableReview(mid),
        view: deliverableReviewVm(mid),
      },
    };
  }
  if (path === "/api/v2/deliverable-reviews/one" || path === "/api/v2/views/deliverable-review") {
    const mid = q("mission_id") || q("id");
    const rid = q("review_id") || q("reviewId");
    if (!mid || !rid) return { status: 400, body: { ok: false, error: "missing_ids" } };
    const review = getDeliverableReview(mid, rid);
    if (!review) return { status: 404, body: { ok: false, error: "review_not_found" } };
    return { status: 200, body: { ok: true, review, view: deliverableReviewVm(mid, review) } };
  }
  if (path === "/api/v2/views/mission/outcome") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    const outcome = missionOutcomeVm(id);
    if (!outcome) return { status: 404, body: { ok: false, error: "no_outcome" } };
    return { status: 200, body: { ok: true, outcome } };
  }
  if (path === "/api/v2/views/mission/confidence") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    const refresh = q("refresh") === "1";
    return {
      status: 200,
      body: { ok: true, confidence: refresh ? recordMissionConfidence(id) : getMissionConfidence(id) },
    };
  }
  if (path === "/api/v2/platform/resources") {
    const refresh = q("refresh") === "1";
    return {
      status: 200,
      body: {
        ok: true,
        resources: refresh ? recordPlatformResourcesSnapshot() : getPlatformResources(),
        history: listPlatformResourceHistory({ limit: 20 }),
      },
    };
  }
  if (path === "/api/v2/platform/usage") {
    const mid = q("mission_id");
    return {
      status: 200,
      body: {
        ok: true,
        summary: summarizeUsage({ missionId: mid || null }),
        events: listUsageEvents({ missionId: mid || null, limit: Number(q("limit") || 100) }),
      },
    };
  }
  if (path === "/api/v2/director/messages") {
    const mid = q("mission_id") || q("id");
    if (!mid) return { status: 400, body: { ok: false, error: "missing_mission_id" } };
    return { status: 200, body: { ok: true, messages: listDirectorMessages(mid) } };
  }
  if (path === "/api/v2/missions/collaboration" || path === "/api/v2/views/mission/collaboration") {
    const mid = q("mission_id") || q("id");
    if (!mid) return { status: 400, body: { ok: false, error: "missing_mission_id" } };
    const { directorCollaborationVm } = await import("./presentation/director-collaboration.mjs");
    return {
      status: 200,
      body: {
        ok: true,
        collaboration: directorCollaborationVm(mid),
        entries: listCollaboration(mid, {
          status: q("status") || null,
          type: q("type") || null,
        }),
        types: COLLABORATION_TYPES,
        statuses: COLLABORATION_STATUSES,
      },
    };
  }
  if (path === "/api/v2/improvements" || path === "/api/v2/views/improvements") {
    const status = q("status") || "All";
    const missionScope = q("mission_scope") || q("scope") || "active";
    return {
      status: 200,
      body: {
        ok: true,
        ...improvementsHomeVm({ status, missionScope }),
        categories: IMPROVEMENT_CATEGORIES,
        severities: IMPROVEMENT_SEVERITIES,
        statuses: ["All", "New", "Planned", "Implemented", "Reviewed", "Accepted"],
        missionScopes: ["active", "archived", "all"],
        raw: q("raw") === "1" ? listImprovements({ missionId: q("mission_id") }) : undefined,
      },
    };
  }
  if (path === "/api/v2/improvement" || path === "/api/v2/views/improvement") {
    const id = q("id");
    const vm = improvementDetailVm(id);
    if (!vm) return { status: 404, body: { ok: false, error: "not_found" } };
    return { status: 200, body: { ok: true, improvement: vm } };
  }
  if (
    path === "/api/v2/views/workspace-runtime"
    || path === "/api/v2/views/workspace"
    || path === "/api/v2/workspace"
  ) {
    const {
      workspaceRuntimeVm,
      workspaceShellVm,
      workspaceMessagesVm,
      listV31Workspaces,
    } = await import("./presentation/workspace-runtime.mjs");
    const id = q("id") || q("workspace_id") || q("workspaceId") || "ws_identity";
    if (q("list") === "1") {
      return { status: 200, body: { ok: true, workspaces: listV31Workspaces() } };
    }
    const mode = q("mode") || "full";
    if (mode === "shell") {
      const shell = workspaceShellVm(id);
      if (!shell) return { status: 404, body: { ok: false, error: "workspace_not_found" } };
      return { status: 200, body: { ok: true, shell, workspaces: listV31Workspaces() } };
    }
    if (mode === "messages") {
      const before = q("before") || q("before_event_id") || null;
      const limit = Math.min(100, Math.max(1, Number(q("limit") || 40) || 40));
      const page = workspaceMessagesVm(id, { limit, beforeEventId: before });
      if (!page) return { status: 404, body: { ok: false, error: "workspace_not_found" } };
      return { status: 200, body: { ok: true, ...page } };
    }
    const runtime = workspaceRuntimeVm(id);
    if (!runtime) return { status: 404, body: { ok: false, error: "workspace_not_found" } };
    return { status: 200, body: { ok: true, runtime, workspaces: listV31Workspaces() } };
  }
  if (path === "/api/v2/views/workspace-shell") {
    const { workspaceShellVm, listV31Workspaces } = await import("./presentation/workspace-runtime.mjs");
    const id = q("id") || q("workspace_id") || "ws_identity";
    const shell = workspaceShellVm(id);
    if (!shell) return { status: 404, body: { ok: false, error: "workspace_not_found" } };
    return { status: 200, body: { ok: true, shell, workspaces: listV31Workspaces() } };
  }
  if (path === "/api/v2/views/mission-rail") {
    const { missionConversationListVm } = await import("./presentation/mission-conversation.mjs");
    const list = missionConversationListVm({ filter: "active" });
    return { status: 200, body: { ok: true, ...list } };
  }
  if (path === "/api/v2/views/workspace-messages") {
    const { workspaceMessagesVm } = await import("./presentation/workspace-runtime.mjs");
    const id = q("id") || q("workspace_id") || "ws_identity";
    const before = q("before") || q("before_event_id") || null;
    const limit = Math.min(100, Math.max(1, Number(q("limit") || 40) || 40));
    const page = workspaceMessagesVm(id, { limit, beforeEventId: before });
    if (!page) return { status: 404, body: { ok: false, error: "workspace_not_found" } };
    return { status: 200, body: { ok: true, ...page } };
  }
  if (path === "/api/v2/views/mission/timeline") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    return { status: 200, body: { ok: true, ...timelinePageVm(id) } };
  }
  if (path === "/api/v2/views/mission/evidence") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    return { status: 200, body: { ok: true, ...evidenceGalleryVm(id) } };
  }
  if (path === "/api/v2/evidence/file") {
    const missionId = q("missionId") || q("mission_id");
    const evidenceId = q("evidenceId") || q("evidence_id");
    if (!missionId || !evidenceId) {
      return { status: 400, body: { ok: false, error: "missing_mission_or_evidence_id" } };
    }
    const { resolveMissionEvidenceView } = await import("./presentation/evidence-experience.mjs");
    const view = resolveMissionEvidenceView(missionId, evidenceId);
    if (!view) return { status: 404, body: { ok: false, error: "evidence_file_not_found" } };
    if (view.kind === "file" && view.filePath) {
      return { status: 200, filePath: view.filePath };
    }
    // Inline text (notes / logs / commits without a disk file) — serve as a
    // readable HTML page so the artifact modal never shows raw API error JSON.
    const esc = (s) => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(view.title)}</title>
<style>
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;padding:20px 24px;color:#1a1a1a;background:#faf9f7}
  h1{font-size:15px;margin:0 0 12px;font-weight:650}
  .meta{font-size:12px;color:#666;margin-bottom:14px}
  pre{white-space:pre-wrap;word-break:break-word;margin:0;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#fff;border:1px solid #e8e4dc;border-radius:10px;padding:14px 16px}
</style></head><body>
<h1>${esc(view.title)}</h1>
${view.type ? `<div class="meta">${esc(view.type)}</div>` : ""}
<pre>${esc(view.body)}</pre>
</body></html>`;
    return { status: 200, html };
  }
  if (path === "/api/v2/views/mission/kickoff") {
    const id = q("id") || q("mission_id");
    return { status: 200, body: { ok: true, ...kickoffVm(id) } };
  }
  if (path === "/api/v2/views/mission/compiled" || path === "/api/v2/missions/compiled") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    const { getCompiledMission } = await import("./compiled-mission.mjs");
    const compiled = getCompiledMission(id);
    if (!compiled) return { status: 404, body: { ok: false, error: "compiled_mission_not_found" } };
    return { status: 200, body: { ok: true, compiled, report: compiled.report || null } };
  }
  if (path === "/api/v2/views/decision") {
    const mid = q("mission_id");
    const did = q("id") || q("decision_id");
    const vm = decisionDetailVm(mid, did);
    if (!vm) return { status: 404, body: { ok: false, error: "decision_not_found" } };
    return { status: 200, body: { ok: true, decision: vm } };
  }
  if (path === "/api/v2/views/decisions") {
    const mid = q("mission_id");
    const status = q("status") || "open";
    const decisions = listDecisions(mid || null, { status: status === "all" ? null : status })
      .map((d) => decisionCardVm(d));
    return { status: 200, body: { ok: true, decisions } };
  }
  if (path === "/api/v2/mission") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    const dashboard = missionDashboardVm(id);
    return {
      status: 200,
      body: {
        ok: true,
        ...getMissionDetailProjection(id),
        dashboard,
        overview: dashboard,
        director_summary_vm: directorSummaryVm(id),
      },
    };
  }
  if (path === "/api/v2/mission/summary") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    return { status: 200, body: { ok: true, summary: buildDirectorSummary(id) } };
  }
  if (path === "/api/v2/mission/context") {
    const id = q("id") || q("mission_id");
    const ctx = buildMissionContextPackage(id, { phaseId: q("phase_id") });
    if (!ctx) return { status: 404, body: { ok: false, error: "context_unavailable" } };
    return { status: 200, body: { ok: true, context: ctx } };
  }
  if (path === "/api/v2/mission/kickoff") {
    return { status: 200, body: getKickoffState(q("id") || q("mission_id")) };
  }
  if (path === "/api/v2/mission/timeline") {
    const id = q("id") || q("mission_id");
    return { status: 200, body: { ok: true, timeline: readTimelineSummary(id, { limit: 100 }), summary: summarizeFromTimeline(id), full: q("full") === "1" ? readTimeline(id) : undefined } };
  }
  if (path === "/api/v2/mission/brief") {
    const id = q("id") || q("mission_id");
    const ver = q("version");
    const brief = (ver != null ? getBriefVersion(id, Number(ver)) : null) || getBrief(id);
    if (!brief) return { status: 404, body: { ok: false, error: "brief_not_found" } };
    return { status: 200, body: { ok: true, brief, versions: listBriefVersions(id), readiness: reviewMissionReadiness(brief) } };
  }
  if (path === "/api/v2/assignments") {
    const mid = q("mission_id") || q("id");
    return { status: 200, body: { ok: true, assignments: listAssignments(mid || null), graph: mid ? assignmentDependencyGraph(mid) : null } };
  }
  if (path === "/api/v2/assignment") {
    const mid = q("mission_id");
    const aid = q("assignment_id") || q("id");
    const pkg = buildAssignmentPackage(mid, aid);
    if (!pkg) return { status: 404, body: { ok: false, error: "assignment_not_found" } };
    return { status: 200, body: { ok: true, ...pkg } };
  }
  if (path === "/api/v2/decisions") {
    const mid = q("mission_id");
    const status = q("status");
    return { status: 200, body: { ok: true, decisions: listDecisions(mid || null, { status: status || null }) } };
  }
  if (path === "/api/v2/decision") {
    const d = getDecision(q("mission_id"), q("id") || q("decision_id"));
    if (!d) return { status: 404, body: { ok: false, error: "decision_not_found" } };
    return { status: 200, body: { ok: true, decision: d } };
  }
  if (path === "/api/v2/evidence") {
    const mid = q("mission_id");
    if (!mid) return { status: 200, body: { ok: true, galleries: listAllEvidenceGalleries() } };
    return {
      status: 200,
      body: {
        ok: true,
        artifacts: listEvidence(mid, { assignmentId: q("assignment_id"), type: q("type") }),
        coverage: acceptanceEvidenceCoverage(mid),
        validation_runs: listValidationRuns(mid),
        certification: canCertifyMission(mid),
        completion_package: q("cert") === "1" ? buildMissionCompletionPackage(mid) : undefined,
      },
    };
  }
  if (path === "/api/v2/resources") {
    return { status: 200, body: { ok: true, claims: listResourceClaims({ type: q("type"), missionId: q("mission_id") }), build_lock_held: hasBuildLockConflict() } };
  }
  if (path === "/api/v2/workers") {
    return { status: 200, body: { ok: true, workers: listWorkerTelemetry(), stale: detectStaleWorkers() } };
  }
  if (path === "/api/v2/worker") {
    const id = q("id") || q("worker_id");
    const tel = getWorkerTelemetry(id);
    if (!tel) return { status: 404, body: { ok: false, error: "worker_not_found" } };
    const assignment = tel.missionId && tel.assignmentId
      ? getAssignment(tel.missionId, tel.assignmentId)
      : null;
    const evidence = tel.missionId
      ? listEvidence(tel.missionId, { assignmentId: tel.assignmentId })
      : [];
    return { status: 200, body: { ok: true, telemetry: tel, assignment, evidence } };
  }

  if (path === "/api/v2/lanes" || path === "/api/v2/views/lanes") {
    const { listDevelopmentLanes } = await import("./lanes.mjs");
    const { attachLaneInstructions } = await import("./lane-runtime.mjs");
    const { attachLaneRuns } = await import("./execution-run.mjs");
    const { attachLaneResourceWaits, developmentResourceSnapshot } = await import("./execution-resource.mjs");
    const { attachLaneRecovery } = await import("./execution-recovery.mjs");
    const { attachLaneAgentSessions } = await import("./agent-session-lifecycle.mjs");
    const { attachLaneAdmissions } = await import("./execution-admission.mjs");
    const { attachLaneSourceControl } = await import("./source-control.mjs");
    const { attachLaneRunLifecycle } = await import("./execution-stale.mjs");
    try {
      const { evaluateExclusiveWindow } = await import("./execution-exclusive.mjs");
      evaluateExclusiveWindow();
    } catch { /* */ }
    try {
      const { maybeReconcileGovernor } = await import("./execution-reconcile.mjs");
      await maybeReconcileGovernor({ reason: "lanes_poll", depth: "cheap" });
    } catch { /* */ }
    const out = await listDevelopmentLanes();
    let lanes = attachLaneRunLifecycle(attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions(out.lanes || []), undefined, { includeInstruction: false })))))));
    // A lane whose browser session is dead cannot execute, and until this was
    // attached the Director had no way to see that or fix it. The recovery card
    // is already rendered by the view; without this the data never arrives, so
    // the card never appears and the flow looks undeployed.
    try {
      const { attachLaneBrowserAuth, qaIdentityForSlot } = await import("./browser-auth.mjs");
      lanes = attachLaneBrowserAuth(lanes, { qaIdentityFor: qaIdentityForSlot });
    } catch { /* auth recovery is additive; lane discovery must still answer */ }
    let folders = [];
    try {
      const { listLaneFolders } = await import("./lane-folders.mjs");
      folders = listLaneFolders();
    } catch { /* organisation must never fail discovery */ }
    return { status: out.ok ? 200 : 503, body: { ...out, lanes, folders, development_resources: developmentResourceSnapshot() } };
  }
  if (path === "/api/v2/lane-folders") {
    const { listLaneFolders } = await import("./lane-folders.mjs");
    return { status: 200, body: { ok: true, folders: listLaneFolders() } };
  }
  if (path === "/api/v2/lanes/candidates" || path === "/api/v2/lane/candidates") {
    const { listAdoptionCandidates } = await import("./lane-identity-api.mjs");
    const out = await listAdoptionCandidates();
    return { status: 200, body: out };
  }
  if (path === "/api/v2/development-resources") {
    const { developmentResourceSnapshot } = await import("./execution-resource.mjs");
    return { status: 200, body: developmentResourceSnapshot() };
  }
  if (path === "/api/v2/lane" || path === "/api/v2/views/lane") {
    const id = q("id") || q("lane_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { attachLaneInstructions } = await import("./lane-runtime.mjs");
    const { attachLaneRuns } = await import("./execution-run.mjs");
    const { attachLaneResourceWaits } = await import("./execution-resource.mjs");
    const { attachLaneRecovery } = await import("./execution-recovery.mjs");
    const { attachLaneAgentSessions, maybeAdvanceSessionRotation } = await import("./agent-session-lifecycle.mjs");
    const out = await getDevelopmentLane(id);
    if (!out.ok) {
      const status = out.error === "lane_not_found" || out.error === "unknown_lane" ? 404 : 503;
      return { status, body: out };
    }
    if (out.lane) {
      try { await maybeAdvanceSessionRotation(out.lane); } catch { /* */ }
      const { attachLaneAdmissions } = await import("./execution-admission.mjs");
      const { attachLaneSourceControl } = await import("./source-control.mjs");
      const { attachLaneRunLifecycle } = await import("./execution-stale.mjs");
      try {
        const { maybeReconcileGovernor } = await import("./execution-reconcile.mjs");
        await maybeReconcileGovernor({ reason: "lanes_poll", depth: "cheap" });
      } catch { /* */ }
      out.lane = attachLaneRunLifecycle(attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions([out.lane]), undefined, { includeInstruction: true })))))))[0];
    }
    return { status: 200, body: out };
  }
  if (path === "/api/v2/lane/run" || path === "/api/v2/lanes/run") {
    const id = q("id") || q("lane_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_lane_id" } };
    const { inspectLaneRun } = await import("./execution-run.mjs");
    const { attachLaneResourceWaits } = await import("./execution-resource.mjs");
    const { attachLaneRecovery } = await import("./execution-recovery.mjs");
    const { attachLaneAgentSessions } = await import("./agent-session-lifecycle.mjs");
    const { attachLaneAdmissions } = await import("./execution-admission.mjs");
    const { attachLaneSourceControl } = await import("./source-control.mjs");
    const out = inspectLaneRun(id);
    if (out.execution_run) {
      out.execution_run = attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits([{ lane_id: id, execution_run: out.execution_run }])))))[0].execution_run;
    }
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (path === "/api/v2/lane/output" || path === "/api/v2/lanes/output") {
    const id = q("id") || q("lane_id");
    if (!id) return { status: 400, body: { ok: false, available: false, error: "missing_lane_id" } };
    const linesRaw = q("lines");
    const lines = linesRaw != null && /^\d+$/.test(String(linesRaw)) ? Number(linesRaw) : undefined;
    const mode = q("mode") || undefined;
    const { getLaneOutput } = await import("./lanes.mjs");
    const { enrichOutputRuntime } = await import("./lane-runtime.mjs");
    let laneProvider = null;
    try {
      const { getDurableLane } = await import("./development-lane.mjs");
      laneProvider = getDurableLane(id)?.binding?.provider || null;
    } catch { laneProvider = null; }
    const out = enrichOutputRuntime(await getLaneOutput(id, {
      ...(lines != null ? { maxLines: lines } : {}),
      ...(mode ? { mode } : {}),
    }), undefined, { provider: laneProvider });
    if (!out.ok) {
      const status = out.error === "invalid_lane_id" || out.error === "missing_lane_id" ? 400
        : out.error === "pane_unavailable" ? 503
        : 404;
      return { status, body: out };
    }
    return { status: 200, body: out };
  }
  if (path === "/api/v2/lane/telemetry" || path === "/api/v2/lanes/telemetry") {
    const id = q("id") || q("lane_id");
    if (!id) return { status: 400, body: { ok: false, available: false, error: "missing_lane_id" } };
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { getLaneAgentTelemetry, peekLaneTelemetryCache } = await import("./lane-telemetry.mjs");
    const { maybeAdvanceSessionRotation } = await import("./agent-session-lifecycle.mjs");
    const cached = peekLaneTelemetryCache(id);
    const found = await getDevelopmentLane(id, { includeGitFacts: false });
    if (!found.ok) {
      const status = found.error === "invalid_lane_id" ? 400 : 404;
      return { status, body: { ok: false, available: false, error: found.error } };
    }
    const out = cached || await getLaneAgentTelemetry(found.lane);
    try {
      found.lane.agent_telemetry = out;
      await maybeAdvanceSessionRotation(found.lane);
    } catch { /* rotation must not fail telemetry */ }
    return { status: 200, body: out };
  }

  return null;
}
