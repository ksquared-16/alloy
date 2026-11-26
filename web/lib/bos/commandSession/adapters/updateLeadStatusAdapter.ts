/**
 * BOS preparation adapter — Update Lead Status (existing-record mutation).
 * Execution: executePlatformCommandViaActionsApi → Command Runtime → Mutation Runtime.
 */

import {
    buildSimplePreview,
    draftFieldString,
    eligiblePayloadWithSubject,
    emptyResolution,
    mapActionResultToBosExecution,
    resolveSubjectFromDraft,
} from "@/lib/bos/commandSession/adapters/shared/bosAdapterDraftHelpers";
import { applyOperatorFieldEdit } from "@/lib/bos/commandSession/draftEdits";
import type {
    BosCommandAdapter,
    BosCommandDraft,
    BosCommandResolutionState,
} from "@/lib/bos/commandSession/types";
import { executePlatformCommandViaActionsApi } from "@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi";

export type UpdateLeadStatusAdapterContext = {
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string | null;
    /** Optional label map for preview copy. */
    statusLabels?: Record<string, string>;
};

const COMMAND_KEY = "update_lead_status";

function revalidate(draft: BosCommandDraft): BosCommandResolutionState {
    const subject = resolveSubjectFromDraft(draft);
    const target = draftFieldString(draft, "target_state");
    const missingRequired: string[] = [];
    if (!subject?.entityId) missingRequired.push("entity_id");
    if (!target) missingRequired.push("target_state");
    const ready = missingRequired.length === 0;
    return emptyResolution({
        missingRequired,
        readyForPreview: ready,
        readyToExecute: ready,
        blockers: !subject
            ? [
                  {
                      code: "missing_subject",
                      message: "Open a lead record so BOS can update its status.",
                  },
              ]
            : [],
    });
}

export const updateLeadStatusBosCommandAdapter: BosCommandAdapter = {
    actionKey: COMMAND_KEY,
    executionKind: "direct_runtime_execute",

    parseSourceText(text, draft) {
        // Light match: treat a single token as a candidate status key/label.
        const trimmed = text.trim();
        if (!trimmed) return draft;
        const token = trimmed.split(/\s+/).pop() ?? trimmed;
        if (!token || token.length > 64) return draft;
        return applyOperatorFieldEdit(draft, "target_state", token.toLowerCase().replace(/\s+/g, "_"));
    },

    revalidate(draft) {
        return revalidate(draft);
    },

    buildPreview(draft, ctx) {
        const adapterCtx = (ctx ?? {}) as UpdateLeadStatusAdapterContext;
        const subject = resolveSubjectFromDraft(draft);
        const target = draftFieldString(draft, "target_state");
        const label =
            adapterCtx.statusLabels?.[target] ??
            target.replace(/_/g, " ");
        return buildSimplePreview({
            title: "Update Lead Status",
            draft,
            summaryLines: [
                subject?.label ? `Lead: ${subject.label}` : `Opportunity: ${subject?.entityId ?? "—"}`,
                `New status: ${label}`,
            ],
            warnings: ["Status will change on the open lead through Mutation Runtime."],
        });
    },

    toExecutePayload(draft) {
        const payload = eligiblePayloadWithSubject(draft);
        return {
            target_state: draftFieldString(draft, "target_state"),
            entity_id: payload.entity_id,
            entity_type: payload.entity_type,
        };
    },

    async execute(payload, ctx) {
        const adapterCtx = (ctx ?? {}) as UpdateLeadStatusAdapterContext;
        const entityId = String(payload.entity_id ?? "").trim();
        const targetState = String(payload.target_state ?? "").trim();
        if (!entityId || !targetState) {
            return {
                ok: false,
                errorMessage: "Lead and target status are required.",
                retryable: false,
                recoveryHints: ["Open a lead and choose a status."],
            };
        }
        const result = await executePlatformCommandViaActionsApi({
            commandKey: COMMAND_KEY,
            entityType: "opportunity",
            entityId,
            payload: { target_state: targetState },
            departmentId: adapterCtx.departmentId,
            workUnitId: adapterCtx.workUnitId,
            surface: adapterCtx.surface ?? "bos_recommendations",
            origin: "bos",
            mode: "execute",
            confirmation: { confirmed: true },
            networkErrorMessage:
                "I couldn’t reach the server to update lead status. Check your connection and try again.",
            failureErrorMessage:
                "I couldn’t update the lead status. Review the target status and try again.",
        });
        return mapActionResultToBosExecution(result);
    },

    mapSuccess(result) {
        if (!result.ok) return null;
        return result.success;
    },
};
