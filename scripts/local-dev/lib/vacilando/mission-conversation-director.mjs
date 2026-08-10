/**
 * Vacilando V3-4 — Mission conversational Director (deterministic).
 *
 * Composer → Director in the same thread. Reuses Current State, collaboration,
 * director-messages, and timeline. Not a free-form LLM chat provider.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent, readTimeline } from "./timeline.mjs";
import { listDirectorMessages } from "./director-comms.mjs";
import { createCollaborationEntry, listCollaboration } from "./mission-collaboration.mjs";
import { deriveMissionPosture } from "./mission-posture.mjs";
import { buildDirectorSummary } from "./director-summary.mjs";
import { listEvidence } from "./evidence.mjs";
import { listAssignments, createOperatorObjectiveAssignment } from "./worker-assignment.mjs";
import { resolveSlotIdentity } from "./identity.mjs";
import { getMission, updateMission } from "./commands/missions.mjs";
import { getBrief } from "./mission-brief.mjs";
import { getOpenDeliverableReview } from "./deliverable-review.mjs";
import { liveWorkProgressVm } from "./presentation/mission-conversation.mjs";
import {
  parseWaveStartIntent,
  ensureNextImplementationWave,
  peekNextImplementationPhase,
  isBeyondRegisterObjective,
} from "./mission-advance.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const MSG_DIR = join(RUNTIME_ROOT, "vacilando", "director-messages");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/**
 * Light intent classification — question vs guidance/feedback vs action.
 * Does not launch workers; action intents only propose existing actions.
 */
export function classifyMissionComposerIntent(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const isQuestion = /\?/.test(raw)
    || /^(what|why|how|when|who|which|where|can|could|should|would|did|does|is|are|was|were)\b/i.test(raw)
    || /\b(where are we|recap|status|summary|recommend|what next|what still|what did)\b/i.test(lower);
  const isGuidance = /\b(i don't like|i do not like|don't like|simplify|prefer|change this|instead|feedback|please make|want the|want you to)\b/i.test(lower)
    || /\b(without changing|preserving|keep the)\b/i.test(lower);
  const isAction = /\b(conti?nue|conintue|proceed|begin implementation|start implementation|start the server|stop the server|open the pr|have claude|have cursor|send this to|fix it|investigate)\b/i.test(lower)
    || /\bnext\s+wave\b/i.test(lower)
    || /\b(open|start|begin|launch|dispatch|run)\b.{0,40}\b(wave|w-?\d+)\b/i.test(lower)
    || /\b(wave\s*\d+|w-?\d+)\b.{0,20}\b(open|start|begin|launch)\b/i.test(lower)
    || /^(go|do it|ship it|approve|certify)\.?$/i.test(raw);

  if (isQuestion && !isAction) {
    return { mode: "question", kind: "ask", persistGuidance: false };
  }
  if (isGuidance && !isAction) {
    return { mode: "guidance", kind: "context", persistGuidance: true };
  }
  if (isAction) {
    return { mode: "action", kind: "ask", persistGuidance: false };
  }
  // Default: treat as ask/context so Director always answers
  return { mode: "question", kind: "ask", persistGuidance: false };
}

/**
 * Bounded Director context from authoritative sources (no unlimited dump).
 */
export function buildMissionDirectorContext(missionId, { recentLimit = 8 } = {}) {
  const posture = deriveMissionPosture(missionId);
  const summary = buildDirectorSummary(missionId);
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const openReview = getOpenDeliverableReview(missionId);
  const collab = listCollaboration(missionId, { status: "open", limit: 12 });
  const guidance = collab.filter((e) =>
    ["feedback", "implementation_guidance", "revision_request", "clarification"].includes(e.type));
  const recentTimeline = (readTimeline(missionId, { limit: 40 }) || [])
    .filter((e) => e.visibility !== "debug")
    .slice(-recentLimit)
    .map((e) => ({
      type: e.type,
      summary: String(e.summary || e.headline || "").slice(0, 160),
      actor: e.actor || null,
      at: e.at || null,
    }));
  const recentDirector = listDirectorMessages(missionId, { limit: 12 })
    .slice(-6)
    .map((m) => ({
      kind: m.kind,
      actor: m.actor,
      text: String(m.interpretation?.summary || m.verbatim || "").slice(0, 200),
      at: m.at,
    }));
  const assignments = listAssignments(missionId) || [];
  const active = assignments.find((a) => ["running", "ready", "verification", "paused"].includes(a.status));
  const slot = Number(mission?.worker_slot ?? mission?.slot) || null;
  const identity = slot ? resolveSlotIdentity(slot) : null;
  const evidence = (listEvidence(missionId) || []).slice(-5).map((e) => ({
    title: e.title || e.type,
    type: e.type,
    result: e.test_run_status || e.result || null,
  }));
  const liveProgress = liveWorkProgressVm(missionId);

  return {
    schema_version: "vacilando.mission_director_context.v1",
    missionId,
    title: brief?.title || mission?.title || missionId,
    postureId: posture?.id || null,
    postureLabel: posture?.label || null,
    postureDetail: posture?.detail || null,
    recommendation: posture?.primaryAction?.label
      || summary?.what_happens_next
      || summary?.answers?.what_happens_next
      || null,
    primaryAction: posture?.primaryAction || null,
    secondaryAction: posture?.secondaryAction || null,
    blockedBy: posture?.id === "blocked"
      ? (posture.detail || "Blocked")
      : (summary?.are_we_blocked ? (summary.blocked_detail || null) : null),
    phase: summary?.current_phase?.title || active?.title || null,
    workingOn: summary?.where_are_we || summary?.answers?.where_are_we || active?.title || null,
    lastCompleted: summary?.what_changed || summary?.answers?.what_changed || null,
    openReviewId: openReview?.review_id || null,
    liveProgress,
    worker: {
      provider: identity?.provider || mission?.provider || null,
      slot,
      status: active?.status || null,
    },
    operatorGuidance: guidance.map((g) => ({
      id: g.id,
      type: g.type,
      title: g.title,
      body: String(g.body || "").slice(0, 400),
      at: g.at,
    })),
    recentTimeline,
    recentDirector,
    evidence,
    builtAt: iso(),
  };
}

function line(parts) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Deterministic Director reply grounded in mission context.
 */
export function composeMissionDirectorResponse(ctx, { operatorText, intent } = {}) {
  const q = String(operatorText || "").trim();
  const lower = q.toLowerCase();
  const mode = intent?.mode || "question";

  // Recall prior guidance
  if (/\b(what (feedback|guidance|did i)|what did i (ask|say|request)|my feedback)\b/i.test(lower)) {
    const g = (ctx.operatorGuidance || []).slice(-3);
    if (!g.length) {
      return {
        summary: "I do not have open operator guidance recorded on this mission yet.",
        proposedAction: null,
        mode: "question",
      };
    }
    const bullets = g.map((x) => `• ${x.body}`).join("\n");
    return {
      summary: `Here is the open guidance I am carrying for this mission:\n${bullets}`,
      proposedAction: ctx.primaryAction || null,
      mode: "question",
    };
  }

  if (mode === "guidance") {
    return {
      summary: line([
        "Recorded.",
        `I will treat this as mission guidance: “${q.slice(0, 220)}”.`,
        "It stays on this mission and will be included in the next worker context handoff.",
        ctx.recommendation ? `Current recommendation remains: ${ctx.recommendation}.` : null,
      ]),
      proposedAction: ctx.primaryAction || null,
      mode: "guidance",
      recordedGuidance: q,
    };
  }

  if (mode === "action") {
    const beyond = isBeyondRegisterObjective(q);
    const nextPhase = peekNextImplementationPhase(ctx.missionId);
    const waveIntent = beyond ? null : parseWaveStartIntent(q);

    // Register exhausted + promotion/certification brief → open a real assignment.
    if (beyond && !nextPhase) {
      const opened = createOperatorObjectiveAssignment(ctx.missionId, {
        title: "Access & Identity V2 — promotion, certification, remaining plan",
        objective: q,
        actor: "operator",
      });
      if (opened?.ok) {
        try {
          updateMission(ctx.missionId, {
            status: "executing",
            kickoff_status: "executing",
            pending_question: null,
            pending_approval: null,
          });
        } catch { /* best-effort */ }
        return {
          summary: line([
            "W-0…W-12 in the implementation register are complete — this is not a missing wave.",
            opened.reused
              ? "Updated the beyond-register promotion/certification assignment with your brief."
              : "Opened a beyond-register assignment from your Director objective.",
            "Dispatching a worker onto it now. Minimize operator intervention; escalate only for genuine decisions.",
          ]),
          proposedAction: {
            kind: "dispatch_ready",
            label: "Start work",
            missionId: ctx.missionId,
            assignmentId: opened.assignment?.assignmentId,
          },
          mode: "action",
          objectiveOpen: opened,
          autoDispatch: true,
          persistGuidance: true,
        };
      }
    }

    if (waveIntent) {
      const opened = ensureNextImplementationWave(ctx.missionId, {
        actor: "operator",
        waveHint: waveIntent,
        response: q.slice(0, 240),
      });
      if (opened?.ok) {
        const title = opened.readyAssignment?.title || opened.phase?.title || "next wave";
        const wantsDispatch = /\b(start|begin|launch|dispatch|run|conti?nue|conintue|proceed|next)\b/i.test(q);
        const canDispatch = opened.nextAction?.kind === "dispatch_ready";
        return {
          summary: line([
            opened.reused
              ? `${title} is already queued.`
              : `Opened ${title} from the accepted implementation plan.`,
            wantsDispatch && canDispatch
              ? "Dispatching a worker onto it now."
              : canDispatch
                ? "Confirm Start work to dispatch a worker onto it."
                : "It is not ready to dispatch yet — check dependencies.",
          ]),
          proposedAction: opened.nextAction || null,
          mode: "action",
          waveOpen: opened,
          autoDispatch: Boolean(wantsDispatch && canDispatch),
        };
      }
      if (opened?.error === "no_remaining_phases" || /complete/i.test(String(opened?.detail || ""))) {
        return {
          summary: line([
            "The W-0…W-12 implementation register is complete — there is no next wave to open from that list.",
            "If you want promotion, shared-environment certification, or Waves 4–5 / remaining plan work, paste that as a Director objective (include “Director objective” or “promotion / certification”).",
            "I will open a beyond-register assignment instead of hunting for a finished wave.",
          ]),
          proposedAction: ctx.primaryAction || null,
          mode: "action",
        };
      }
      return {
        summary: line([
          "I could not open that wave from the plan register.",
          opened?.detail || opened?.error || null,
          "Say which wave (e.g. Wave 2) or workstream (e.g. W-5), or use Start work once an assignment is ready.",
        ]),
        proposedAction: ctx.primaryAction || null,
        mode: "action",
      };
    }
    const action = ctx.primaryAction;
    if (/\bstart (the )?server\b/i.test(lower)) {
      return {
        summary: "I can start the local Alloy app for this mission from the Operations rail when you confirm Start Server.",
        proposedAction: { kind: "server_start", label: "Start Server", missionId: ctx.missionId },
        mode: "action",
      };
    }
    if (action) {
      return {
        summary: line([
          "Understood.",
          ctx.workingOn ? `We are currently on: ${String(ctx.workingOn).slice(0, 120)}.` : null,
          `The next existing action I recommend is “${action.label || action.kind}”.`,
          "Confirm that action when you are ready — I will not launch work silently.",
        ]),
        proposedAction: action,
        mode: "action",
      };
    }
    return {
      summary: line([
        "Understood.",
        "I do not have a safe auto-launch action for that instruction from current mission state.",
        "Tell me the outcome you want, or use the Operations rail for server/worker controls.",
      ]),
      proposedAction: null,
      mode: "action",
    };
  }

  // Question / recap
  const bits = [];
  bits.push(ctx.title ? `${String(ctx.title).split(/[.\n]/)[0].slice(0, 80)}.` : "Here is where this mission stands.");
  if (ctx.phase) bits.push(`Current phase: ${ctx.phase}.`);
  if (ctx.postureLabel) bits.push(`Status: ${ctx.postureLabel}.`);
  const lp = ctx.liveProgress;
  if (lp?.active) {
    bits.push(
      `Progress: ${lp.percentLabel}${lp.doneCount != null && lp.totalCount ? ` (${lp.doneCount}/${lp.totalCount} assignments closed)` : ""}.`,
    );
    bits.push(`Worker status: ${lp.freshnessLabel}${lp.heartbeatLabel ? ` · ${lp.heartbeatLabel}` : ""}.`);
    if (lp.activity) bits.push(`Now: ${lp.activity}.`);
    if (lp.doneSummary?.length) bits.push(`Done so far: ${lp.doneSummary.join("; ")}.`);
    if (lp.freshness === "stale") {
      bits.push("I have not seen a fresh worker heartbeat recently — this may be stuck or still in a long tool call.");
    }
  } else {
    if (ctx.workingOn) bits.push(`Working on: ${String(ctx.workingOn).slice(0, 140)}.`);
    if (ctx.lastCompleted) bits.push(`Last completed: ${String(ctx.lastCompleted).slice(0, 120)}.`);
  }
  if (ctx.blockedBy) bits.push(`Blocked by: ${ctx.blockedBy}.`);
  else bits.push("No active blocker is recorded.");
  if (ctx.worker?.provider) {
    bits.push(`Worker: ${ctx.worker.provider}${ctx.worker.slot != null ? ` · slot ${ctx.worker.slot}` : ""}${ctx.worker.status ? ` (${ctx.worker.status})` : ""}.`);
  }
  const g = (ctx.operatorGuidance || []).slice(-2);
  if (g.length) {
    bits.push(`Open guidance: ${g.map((x) => x.body.slice(0, 100)).join(" · ")}.`);
  }
  if (ctx.recommendation) {
    bits.push(`I recommend: ${ctx.recommendation}.`);
  } else if (ctx.primaryAction?.label) {
    bits.push(`I recommend: ${ctx.primaryAction.label}.`);
  }

  // Evidence hint when asked about tests/browser
  if (/\b(browser|test|certif|evidence|screenshot)\b/i.test(lower) && ctx.evidence?.length) {
    const last = ctx.evidence[ctx.evidence.length - 1];
    bits.push(`Recent evidence: ${last.title}${last.result ? ` (${last.result})` : ""}.`);
  }

  return {
    summary: bits.filter(Boolean).join(" "),
    proposedAction: ctx.primaryAction || null,
    mode: "question",
  };
}

function persistDirectorMessage({ missionId, summary, inReplyTo, intent, nowMs }) {
  if (!existsSync(MSG_DIR)) mkdirSync(MSG_DIR, { recursive: true });
  const messageId = "mdm_" + randomBytes(8).toString("hex");
  const record = {
    schema_version: "vacilando.mission_director_message.v1",
    messageId,
    missionId,
    kind: "director_response",
    actor: "director",
    verbatim: summary,
    interpretation: {
      action: intent?.mode || "answered",
      summary,
    },
    inReplyTo: inReplyTo || null,
    source: "v3_mission_conversation",
    at: iso(nowMs),
  };
  appendFileSync(join(MSG_DIR, `${missionId}.jsonl`), JSON.stringify(record) + "\n");
  return record;
}

/**
 * Full conversational Director turn for the mission composer.
 * Operator message is already on the timeline (postWorkspaceReply).
 */
export function executeMissionDirectorTurn(missionId, {
  operatorText,
  operatorEventId = null,
  nowMs,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  const text = String(operatorText || "").trim();
  if (!text) return { ok: false, error: "empty_message" };

  const intent = classifyMissionComposerIntent(text);
  const ctx = buildMissionDirectorContext(missionId);
  const composed = composeMissionDirectorResponse(ctx, { operatorText: text, intent });

  let collaboration = null;
  if (intent.persistGuidance || composed.mode === "guidance" || composed.persistGuidance) {
    try {
      collaboration = createCollaborationEntry({
        missionId,
        type: "implementation_guidance",
        body: text,
        author: "operator",
        status: "open",
        title: composed.objectiveOpen ? "Beyond-register Director objective" : "Operator guidance",
        source: "v3_mission_conversation",
        nowMs,
      });
    } catch (e) {
      collaboration = { ok: false, error: String(e?.message || e) };
    }
  }

  const directorMsg = persistDirectorMessage({
    missionId,
    summary: composed.summary,
    inReplyTo: operatorEventId,
    intent,
    nowMs,
  });

  const timelineEv = appendTimelineEvent(missionId, {
    type: "director_response",
    summary: composed.summary.slice(0, 500),
    headline: composed.summary.length > 120
      ? `${composed.summary.slice(0, 117)}…`
      : composed.summary,
    visibility: "summary",
    actor: "director",
    detail: {
      messageId: directorMsg.messageId,
      source: "v3_mission_conversation",
      mode: composed.mode,
      inReplyTo: operatorEventId,
      proposedAction: composed.proposedAction || null,
      collaborationId: collaboration?.id || null,
    },
  });

  let dispatch = null;
  if (composed.autoDispatch) {
    import("./assignment-dispatch.mjs").then(({ scheduleDispatchAfterKickoff }) => {
      scheduleDispatchAfterKickoff(missionId, { actor: "director" });
    }).catch(() => {});
    dispatch = { ok: true, scheduled: true };
  }

  return {
    ok: true,
    intent,
    context: {
      postureId: ctx.postureId,
      recommendation: ctx.recommendation,
      guidanceCount: (ctx.operatorGuidance || []).length,
    },
    directorMessage: directorMsg,
    timelineEventId: timelineEv.event_id,
    message: {
      messageId: timelineEv.event_id,
      kind: "director_counsel",
      from: { id: "director", label: "Director", role: "counsel" },
      body: composed.summary,
      createdAt: timelineEv.at || iso(nowMs),
      provenance: { source: "timeline", eventId: timelineEv.event_id, type: "director_response" },
      actions: composed.proposedAction ? [composed.proposedAction] : [],
      artifacts: [],
    },
    proposedAction: composed.proposedAction || null,
    collaboration,
    dispatch,
    waveOpen: composed.waveOpen || null,
  };
}
