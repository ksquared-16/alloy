/**
 * BOS preparation adapter — Cancel Tour (confirmation-governed / destructive).
 * Execution: preview then commit via executePlatformCommandViaActionsApi → cancelTourAdapter.
 * Adapters prepare only; domain cancel remains in tour booking service.
 */

import {
    buildSimplePreview,
    draftFieldString,
    emptyResolution,
    mapActionResultToBosExecution,
    resolveSubjectFromDraft,
} from "@/lib/bos/commandSession/adapters/shared/bosAdapterDraftHelpers";
import type {
    BosCommandAdapter,
    BosCommandDraft,
    BosCommandResolutionState,
} from "@/lib/bos/commandSession/types";
import { executePlatformCommandViaActionsApi } from "@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi";

export type CancelTourBosAdapterContext = {
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string | null;
};

const COMMAND_KEY = "cancel_tour";

function revalidate(draft: BosCommandDraft): BosCommandResolutionState {
    const subject = resolveSubjectFromDraft(draft);
    const bookingId = draftFieldString(draft, "booking_id");
    const missingRequired: string[] = [];
    if (!subject?.entityId) missingRequired.push("entity_id");
    if (!bookingId) missingRequired.push("booking_id");
    const ready = missingRequired.length === 0;
    return emptyResolution({
        missingRequired,
        readyForPreview: ready,
        // Execute requires a fresh preview token from the confirm step.
        readyToExecute: ready && Boolean(draftFieldString(draft, "preview_token")),
        blockers: !subject
            ? [
                  {
                      code: "missing_subject",
                      message: "Open a lead with an active tour booking to cancel.",
                  },
              ]
            : !bookingId
              ? [
                    {
                        code: "missing_booking",
                        message: "No active tour booking is available to cancel on this lead.",
                    },
                ]
              : [],
    });
}

export const cancelTourBosCommandAdapter: BosCommandAdapter = {
    actionKey: COMMAND_KEY,
    executionKind: "direct_runtime_execute",

    parseSourceText(_text, draft) {
        // Confirmation-only — no NLP extraction.
        return draft;
    },

    revalidate(draft) {
        return revalidate(draft);
    },

    buildPreview(draft) {
        const subject = resolveSubjectFromDraft(draft);
        const bookingId = draftFieldString(draft, "booking_id");
        const reason = draftFieldString(draft, "cancel_reason");
        const token = draftFieldString(draft, "preview_token");
        const warningRaw = draftFieldString(draft, "preview_warnings");
        const warnings = warningRaw
            ? warningRaw.split("\n").map((w) => w.trim()).filter(Boolean)
            : [
                  "This cancels the tour booking. Reminders stop; reschedule requires a new booking.",
              ];
        return buildSimplePreview({
            title: "Cancel Tour",
            draft,
            summaryLines: [
                subject?.label ? `Lead: ${subject.label}` : `Opportunity: ${subject?.entityId ?? "—"}`,
                `Booking: ${bookingId || "—"}`,
                reason ? `Reason: ${reason}` : "Reason: (none)",
            ],
            warnings,
            sideEffects: ["Booking status → canceled"],
            previewToken: token || undefined,
        });
    },

    toExecutePayload(draft) {
        return {
            booking_id: draftFieldString(draft, "booking_id"),
            cancel_reason: draftFieldString(draft, "cancel_reason") || undefined,
            entity_id: draftFieldString(draft, "entity_id"),
            entity_type: draftFieldString(draft, "entity_type") || "opportunity",
            preview_token: draftFieldString(draft, "preview_token"),
        };
    },

    async execute(payload, ctx) {
        const adapterCtx = (ctx ?? {}) as CancelTourBosAdapterContext;
        const entityId = String(payload.entity_id ?? "").trim();
        const bookingId = String(payload.booking_id ?? "").trim();
        const previewToken = String(payload.preview_token ?? "").trim();
        if (!entityId || !bookingId) {
            return {
                ok: false,
                errorMessage: "Lead and booking are required to cancel a tour.",
                retryable: false,
                recoveryHints: ["Open a lead with an active booking."],
            };
        }
        if (!previewToken) {
            return {
                ok: false,
                errorMessage: "Preview confirmation expired. Review again before confirming.",
                retryable: true,
                recoveryHints: ["Open Review again to refresh the cancellation preview."],
            };
        }
        const result = await executePlatformCommandViaActionsApi({
            commandKey: COMMAND_KEY,
            entityType: "opportunity",
            entityId,
            payload: {
                booking_id: bookingId,
                cancel_reason: payload.cancel_reason,
            },
            departmentId: adapterCtx.departmentId,
            workUnitId: adapterCtx.workUnitId,
            surface: adapterCtx.surface ?? "bos_recommendations",
            origin: "bos",
            mode: "execute",
            confirmation: { confirmed: true },
            previewToken,
            networkErrorMessage:
                "I couldn’t reach the server to cancel the tour. Check your connection and try again.",
            failureErrorMessage:
                "I couldn’t cancel the tour. Refresh the preview and try again.",
        });
        return mapActionResultToBosExecution(result);
    },

    mapSuccess(result) {
        if (!result.ok) return null;
        return result.success;
    },
};

/**
 * Fetch server destructive preview and return fields to seed onto the draft.
 * Called by the generic session controller before SET_PREVIEW — not a mutation.
 */
export async function fetchCancelTourBosPreview(input: {
    opportunityId: string;
    bookingId: string;
    cancelReason?: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string | null;
}): Promise<
    | { ok: true; previewToken: string; warnings: string[]; summaryLines: string[] }
    | { ok: false; errorMessage: string }
> {
    const result = await executePlatformCommandViaActionsApi({
        commandKey: COMMAND_KEY,
        entityType: "opportunity",
        entityId: input.opportunityId,
        payload: {
            booking_id: input.bookingId,
            cancel_reason: input.cancelReason,
        },
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        surface: input.surface ?? "bos_recommendations",
        origin: "bos",
        mode: "preview",
        networkErrorMessage: "Could not load cancel-tour preview.",
        failureErrorMessage: "Cancel tour preview failed.",
    });
    if (!result.ok) {
        return { ok: false, errorMessage: result.error };
    }
    const detail = (result.result.detail ?? {}) as Record<string, unknown>;
    const impact =
        (detail.impact_preview as Record<string, unknown> | undefined) ??
        (detail.impactPreview as Record<string, unknown> | undefined) ??
        detail;
    const previewToken = String(
        impact.preview_token ?? impact.previewToken ?? detail.preview_token ?? detail.previewToken ?? ""
    ).trim();
    if (!previewToken) {
        return {
            ok: false,
            errorMessage: "Preview did not return a confirmation token.",
        };
    }
    const warningsRaw = impact.warnings ?? detail.warnings;
    const warnings = Array.isArray(warningsRaw)
        ? warningsRaw.map((w) => {
              if (typeof w === "string") return w;
              if (w && typeof w === "object" && "message" in w) {
                  return String((w as { message?: unknown }).message ?? "");
              }
              return String(w);
          }).filter(Boolean)
        : ["This cancels the tour booking."];
    return {
        ok: true,
        previewToken,
        warnings,
        summaryLines: [
            `Booking: ${input.bookingId}`,
            input.cancelReason ? `Reason: ${input.cancelReason}` : "Reason: (none)",
        ],
    };
}
