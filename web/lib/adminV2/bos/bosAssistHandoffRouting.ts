/**
 * Deterministic BOS drawer → Task Assist routing from operational recommendations.
 * NL seed parsing alone misroutes when copy contains "follow-up" alongside "send".
 */

import {
    buildOperationalRecommendationHandoffCopy,
    HANDOFF_CTA_CONTINUE,
    hasStructuredOperationalHandoff,
    type OperationalRecommendationHandoffCopy,
} from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import type { OperationalRecommendationV1, RecommendationTypeV1, UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import { suggestionActionForReasonCode } from "@/lib/agent/needsAttentionSuggestion/suggestionActionMap";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type {
    TaskAssistCommandBootstrap,
    TaskAssistCommandIntent,
    TaskAssistCommandIntentType,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { buildTaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { generateOperationalDraft } from "@/lib/adminV2/bos/communication/generateOperationalDraft";
import {
    communicationObjectiveLabel,
    resolveCommunicationObjective,
} from "@/lib/adminV2/bos/communication/communicationObjectives";

export type BosAssistHandoffMode = "draft_message" | "schedule_message" | "create_reminder" | "workflow_assist";

/** Queue L0 preview — grounds BOS assist without full entity GET. */
export type QueueBosHandoffPreview = {
    doNext: string;
    whyNow?: string | null;
    recommendationType?: RecommendationTypeV1 | null;
    urgencyBand?: UrgencyBandV1 | null;
};

const QUEUE_BOS_HANDOFF_PREVIEW_KEY = "_queue_bos_handoff_preview";

export type BosAssistHandoffPackage = {
    assistMode: BosAssistHandoffMode;
    seedCommand: string;
    taskAssistIntent: TaskAssistCommandIntent | null;
    taskAssistBootstrap: TaskAssistCommandBootstrap | null;
    copy: OperationalRecommendationHandoffCopy;
    preferredNextAction: string;
};

const MESSAGE_FIRST_CATALOG_KEYS = new Set([
    "stale_new_inquiry",
    "tour_date_passed",
    "stale_quote_followup",
    "waiting_on_family",
    "high_value_stale",
    "mid_funnel_stale",
    "stale_qualified",
]);

const REMINDER_FIRST_ACTION_KEYS = new Set(["set_reminder", "create_reminder", "schedule_reminder"]);

function parseOperationalRecommendation(
    overviewData: Record<string, unknown> | null | undefined
): OperationalRecommendationV1 | null {
    const raw = overviewData?._operational_recommendation;
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as OperationalRecommendationV1;
    if (rec.version !== 1) return null;
    return rec;
}

/** Catalog attention reason from wire payload (not stored as top-level field on V1). */
function catalogAttentionKeyFromRecommendation(rec: OperationalRecommendationV1): string | null {
    const fromFingerprint = rec.stale_state_check?.fingerprint_inputs?.primary_reason_code?.trim();
    if (fromFingerprint) return fromFingerprint;
    const primarySignal = rec.grounding_signals.find((s) => s.code === "primary_attention_reason");
    return primarySignal?.reason_code?.trim() || null;
}

function parseQueueBosHandoffPreview(
    overviewData: Record<string, unknown> | null | undefined
): QueueBosHandoffPreview | null {
    const raw = overviewData?.[QUEUE_BOS_HANDOFF_PREVIEW_KEY];
    if (!raw || typeof raw !== "object") return null;
    const p = raw as QueueBosHandoffPreview;
    const doNext = p.doNext?.trim();
    if (!doNext) return null;
    return {
        doNext,
        whyNow: p.whyNow?.trim() || null,
        recommendationType: p.recommendationType ?? null,
        urgencyBand: p.urgencyBand ?? null,
    };
}

function buildCopyFromQueuePreview(args: {
    preview: QueueBosHandoffPreview;
    entityLabel: string | null | undefined;
}): OperationalRecommendationHandoffCopy {
    const recordName = args.entityLabel?.trim() || "this inquiry";
    const whyNow = args.preview.whyNow?.trim() || "";
    return {
        eyebrow: "Review assist",
        operationalRead: args.preview.doNext,
        whyNow,
        doNext: args.preview.doNext,
        likelyOutcome: null,
        supportingContext: recordName,
        contextLine: recordName,
        ctaLabel: HANDOFF_CTA_CONTINUE,
    };
}

/**
 * Merge entity overview with queue L0 preview when full recommendation is unavailable.
 */
export function buildOverviewDataForBosHandoff(args: {
    entityId: string;
    entityLabel: string;
    overviewData?: Record<string, unknown> | null;
    queuePreview?: QueueBosHandoffPreview | null;
}): Record<string, unknown> {
    const id = args.entityId.trim();
    const name = args.entityLabel.trim() || "Inquiry";
    const base = args.overviewData && typeof args.overviewData === "object" ? { ...args.overviewData } : { id, name };
    if (!base.id) base.id = id;
    if (!base.name) base.name = name;

    if (hasStructuredOperationalHandoff(base)) {
        return base;
    }

    if (args.queuePreview?.doNext?.trim()) {
        return {
            ...base,
            [QUEUE_BOS_HANDOFF_PREVIEW_KEY]: args.queuePreview,
        };
    }

    return base;
}

function groundedWhyNowFromRecommendation(rec: OperationalRecommendationV1 | null, copy: OperationalRecommendationHandoffCopy): string {
    const urgency = rec?.urgency_reason?.trim();
    const whyMatters = rec?.why_it_matters?.trim();
    const stripWhy = rec?.render?.drawer_strip?.why_line?.trim();
    const base = copy.whyNow.trim();
    const parts = [base, urgency, stripWhy && stripWhy !== base ? stripWhy : null, whyMatters && whyMatters !== base ? whyMatters : null].filter(
        (p, i, arr): p is string => Boolean(p?.trim()) && arr.indexOf(p) === i
    );
    return parts.join(" ").slice(0, 320);
}

function parseAttention(
    overviewData: Record<string, unknown> | null | undefined
): OpportunityAttentionResult | null {
    const raw = overviewData?._operational_attention;
    if (!raw || typeof raw !== "object") return null;
    return raw as OpportunityAttentionResult;
}

function availableTaskAssistIntents(rec: OperationalRecommendationV1): string[] {
    return rec.available_actions
        .filter((a) => a.kind === "task_assist_intent" && typeof a.intent === "string" && a.intent.trim())
        .map((a) => a.intent!.trim());
}

function channelFromRecommendation(rec: OperationalRecommendationV1 | null): "sms" | "email" | null {
    const hint = rec?.communication_reference?.channel_hint;
    if (hint === "sms") return "sms";
    if (hint === "email") return "email";
    return null;
}

function modeFromRecommendationType(type: RecommendationTypeV1): BosAssistHandoffMode | null {
    if (type === "workflow" || type === "escalation") return "workflow_assist";
    if (type === "communication") return "draft_message";
    return null;
}

function modeFromActionFamily(
    family: AttentionSuggestionActionFamily,
    catalogKey: string | null | undefined
): BosAssistHandoffMode {
    switch (family) {
        case "send_message":
            return "draft_message";
        case "schedule":
            return "schedule_message";
        case "workflow":
            return "workflow_assist";
        case "follow_up":
            if (catalogKey && MESSAGE_FIRST_CATALOG_KEYS.has(catalogKey)) return "draft_message";
            return "draft_message";
        case "review":
        case "update_record":
            return "workflow_assist";
        default:
            return "draft_message";
    }
}

function modeFromAvailableActions(
    intents: string[],
    actionKey: string | null | undefined
): BosAssistHandoffMode | null {
    const key = actionKey?.trim() ?? "";
    if (key && REMINDER_FIRST_ACTION_KEYS.has(key) && intents.length === 1 && intents[0] === "create_reminder") {
        return "create_reminder";
    }
    if (intents.includes("draft_message") && !intents.includes("create_reminder")) return "draft_message";
    if (intents.includes("create_reminder") && !intents.includes("draft_message")) return "create_reminder";
    if (intents.includes("draft_message") && intents.includes("create_reminder")) return "draft_message";
    if (intents.includes("schedule_message")) return "schedule_message";
    return null;
}

/**
 * Resolve assist mode from canonical recommendation, catalog, and action metadata.
 */
export function resolveBosAssistHandoffMode(args: {
    overviewData: Record<string, unknown> | null | undefined;
}): BosAssistHandoffMode {
    const queuePreview = parseQueueBosHandoffPreview(args.overviewData);
    const rec = parseOperationalRecommendation(args.overviewData);
    if (queuePreview && !rec) {
        if (queuePreview.recommendationType === "communication") return "draft_message";
        if (queuePreview.recommendationType === "workflow" || queuePreview.recommendationType === "escalation") {
            return "workflow_assist";
        }
        return "draft_message";
    }

    if (rec) {
        const intents = availableTaskAssistIntents(rec);
        const fromActions = modeFromAvailableActions(intents, rec.recommended_action?.key);
        if (fromActions) return fromActions;

        const fromType = modeFromRecommendationType(rec.recommendation_type);
        if (fromType) return fromType;

        const catalogKey = catalogAttentionKeyFromRecommendation(rec);
        if (catalogKey && MESSAGE_FIRST_CATALOG_KEYS.has(catalogKey)) {
            return "draft_message";
        }

        return modeFromActionFamily(rec.recommended_action.action_family, catalogKey);
    }

    const attention = parseAttention(args.overviewData);
    if (attention?.primary_reason?.code) {
        const mapped = suggestionActionForReasonCode(attention.primary_reason.code);
        return modeFromActionFamily(mapped.action_family, attention.primary_reason.code);
    }

    return "draft_message";
}

export function buildBosAssistHandoffTaskAssistIntent(args: {
    mode: BosAssistHandoffMode;
    copy: OperationalRecommendationHandoffCopy;
    overviewData: Record<string, unknown> | null | undefined;
    channelHint?: "sms" | "email" | null;
}): TaskAssistCommandIntent | null {
    if (args.mode === "workflow_assist") return null;

    const intent_type: TaskAssistCommandIntentType =
        args.mode === "schedule_message" ? "schedule_message"
        : args.mode === "create_reminder" ? "create_reminder"
        : "draft_message";

    const objective = resolveCommunicationObjective({
        overviewData: args.overviewData,
        copy: args.copy,
    });
    const objectiveGoal =
        args.mode === "draft_message" || args.mode === "schedule_message"
            ? communicationObjectiveLabel(objective)
            : args.copy.doNext.trim() || args.copy.operationalRead.trim() || null;

    return {
        intent_type,
        channel_hint: args.channelHint ?? null,
        timing_hint_text: null,
        message_goal_text: objectiveGoal,
        search_text_hint: null,
        confidence: "high",
        warnings: [],
        workflow_blocked: false,
    };
}

function buildBosAssistHandoffBootstrap(args: {
    mode: BosAssistHandoffMode;
    intent: TaskAssistCommandIntent;
    copy: OperationalRecommendationHandoffCopy;
    overviewData: Record<string, unknown> | null | undefined;
    channelHint?: "sms" | "email" | null;
    operatorDisplayName?: string | null;
}): TaskAssistCommandBootstrap {
    const base = buildTaskAssistCommandBootstrap(args.intent);
    if (args.mode !== "draft_message" && args.mode !== "schedule_message") {
        return {
            ...base,
            operator_guidance: args.copy.doNext.trim() || null,
        };
    }

    const generated = generateOperationalDraft({
        overviewData: args.overviewData,
        copy: args.copy,
        channel: args.channelHint === "sms" ? "sms" : "email",
        operatorDisplayName: args.operatorDisplayName ?? null,
    });

    return {
        ...base,
        communication_objective: generated.objective,
        operator_guidance: communicationObjectiveLabel(generated.objective),
        instruction: `communication_objective:${generated.objective}`,
        synthesized_draft: {
            subject: generated.subject,
            body: generated.body,
            sms_body: generated.sms_body,
            mode: generated.mode,
        },
    };
}

export function buildBosAssistHandoffSeedCommand(args: {
    mode: BosAssistHandoffMode;
    entityLabel: string;
    copy: OperationalRecommendationHandoffCopy;
}): string {
    const name = args.entityLabel.trim() || "this family";
    const doNext = args.copy.doNext.trim();
    const whyNow = args.copy.whyNow.trim();
    const read = args.copy.operationalRead.trim();
    const groundedWhy = whyNow;

    switch (args.mode) {
        case "draft_message":
            return [
                `Draft a message to ${name} about this inquiry`,
                doNext ? `: ${doNext}` : "",
                groundedWhy ? `. Why now: ${groundedWhy}` : "",
            ].join("");
        case "schedule_message":
            return [
                `Draft a scheduled message to ${name}`,
                doNext ? `: ${doNext}` : "",
                groundedWhy ? `. Why now: ${groundedWhy}` : "",
            ].join("");
        case "create_reminder":
            return [
                `Set a reminder for ${name}`,
                doNext ? `: ${doNext}` : "",
                groundedWhy ? `. Context: ${groundedWhy}` : "",
            ].join("");
        case "workflow_assist":
            return [
                `Explain workflow status for ${name}`,
                read ? `: ${read}` : "",
                groundedWhy ? `. Why now: ${groundedWhy}` : "",
            ].join("");
        default:
            return `Draft a message to ${name} about this inquiry`;
    }
}

/**
 * Full BOS drawer handoff package: operational copy + deterministic assist mode + seed.
 */
export function buildBosAssistHandoffPackage(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
    operatorDisplayName?: string | null;
}): BosAssistHandoffPackage {
    const rec = parseOperationalRecommendation(args.overviewData);
    const queuePreview = parseQueueBosHandoffPreview(args.overviewData);
    const copy =
        rec || hasStructuredOperationalHandoff(args.overviewData)
            ? buildOperationalRecommendationHandoffCopy({
                  entityLabel: args.entityLabel,
                  overviewData: args.overviewData,
              })
            : queuePreview
              ? buildCopyFromQueuePreview({ preview: queuePreview, entityLabel: args.entityLabel })
              : buildOperationalRecommendationHandoffCopy({
                    entityLabel: args.entityLabel,
                    overviewData: args.overviewData,
                });

    const enrichedCopy =
        rec ?
            { ...copy, whyNow: groundedWhyNowFromRecommendation(rec, copy) }
        :   copy;

    const assistMode = resolveBosAssistHandoffMode({ overviewData: args.overviewData });
    const label = args.entityLabel?.trim() || "this inquiry";
    const seedCommand = buildBosAssistHandoffSeedCommand({
        mode: assistMode,
        entityLabel: label,
        copy: enrichedCopy,
    });
    const channelHint = channelFromRecommendation(rec);
    const taskAssistIntent = buildBosAssistHandoffTaskAssistIntent({
        mode: assistMode,
        copy: enrichedCopy,
        overviewData: args.overviewData,
        channelHint,
    });
    const taskAssistBootstrap =
        taskAssistIntent
            ? buildBosAssistHandoffBootstrap({
                  mode: assistMode,
                  intent: taskAssistIntent,
                  copy: enrichedCopy,
                  overviewData: args.overviewData,
                  channelHint,
                  operatorDisplayName: args.operatorDisplayName ?? null,
              })
            : null;

    return {
        assistMode,
        seedCommand,
        taskAssistIntent,
        taskAssistBootstrap,
        copy: enrichedCopy,
        preferredNextAction: enrichedCopy.doNext.trim() || enrichedCopy.operationalRead.trim(),
    };
}

/**
 * Orchestrator seed from operational context — prefers recommendation routing package.
 */
export function orchestratorHandoffSeedCommand(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
}): string | undefined {
    const label = args.entityLabel?.trim() || "this inquiry";
    const overview = args.overviewData;
    if (
        !hasStructuredOperationalHandoff(overview) &&
        !parseQueueBosHandoffPreview(overview)
    ) {
        return `Draft message for ${label}`;
    }
    return buildBosAssistHandoffPackage({
        entityLabel: args.entityLabel,
        overviewData: overview,
    }).seedCommand;
}
