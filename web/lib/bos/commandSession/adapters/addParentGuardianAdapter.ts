/**
 * BOS preparation adapter — Add Parent / Guardian (relationship).
 * Execution: executePlatformCommandViaActionsApi → Command Runtime → Relationship Runtime.
 * No server preview (relationship facade rejects mode:"preview") — client summary only.
 */

import {
    buildSimplePreview,
    draftFieldString,
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

export type AddParentGuardianAdapterContext = {
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string | null;
};

const COMMAND_KEY = "add_parent_guardian";

function revalidate(draft: BosCommandDraft): BosCommandResolutionState {
    const subject = resolveSubjectFromDraft(draft);
    const sourceCustomerId = draftFieldString(draft, "source_customer_id");
    const first = draftFieldString(draft, "first_name");
    const last = draftFieldString(draft, "last_name");
    const selectedPersonId = draftFieldString(draft, "selected_person_id");
    const missingRequired: string[] = [];
    if (!subject?.entityId) missingRequired.push("entity_id");
    if (!sourceCustomerId) missingRequired.push("source_customer_id");
    if (!selectedPersonId && (!first || !last)) {
        if (!first) missingRequired.push("first_name");
        if (!last) missingRequired.push("last_name");
    }
    const ready = missingRequired.length === 0;
    return emptyResolution({
        missingRequired,
        readyForPreview: ready,
        readyToExecute: ready,
        blockers: !subject
            ? [
                  {
                      code: "missing_subject",
                      message: "Open a lead (or child) record so BOS can add a parent/guardian.",
                  },
              ]
            : !sourceCustomerId
              ? [
                    {
                        code: "missing_customer",
                        message: "This record has no household customer to attach a guardian to.",
                    },
                ]
              : [],
    });
}

export const addParentGuardianBosCommandAdapter: BosCommandAdapter = {
    actionKey: COMMAND_KEY,
    executionKind: "direct_runtime_execute",

    parseSourceText(text, draft) {
        const trimmed = text.trim();
        if (!trimmed) return draft;
        // "Jane Doe" or "Jane Doe jane@x.com"
        const parts = trimmed.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return draft;
        let next = applyOperatorFieldEdit(draft, "first_name", parts[0]!);
        const emailIdx = parts.findIndex((p) => p.includes("@"));
        const lastParts =
            emailIdx > 0 ? parts.slice(1, emailIdx) : parts.slice(1).filter((p) => !p.includes("@"));
        if (lastParts.length) {
            next = applyOperatorFieldEdit(next, "last_name", lastParts.join(" "));
        }
        if (emailIdx >= 0) {
            next = applyOperatorFieldEdit(next, "email", parts[emailIdx]!);
        }
        return next;
    },

    revalidate(draft) {
        return revalidate(draft);
    },

    buildPreview(draft) {
        const subject = resolveSubjectFromDraft(draft);
        const selectedPersonId = draftFieldString(draft, "selected_person_id");
        const name = selectedPersonId
            ? `existing person ${selectedPersonId.slice(0, 8)}…`
            : `${draftFieldString(draft, "first_name")} ${draftFieldString(draft, "last_name")}`.trim();
        return buildSimplePreview({
            title: "Add Parent / Guardian",
            draft,
            summaryLines: [
                subject?.label ? `Record: ${subject.label}` : `Subject: ${subject?.entityId ?? "—"}`,
                `Add ${name || "guardian"} as Guardian`,
                `Household customer: ${draftFieldString(draft, "source_customer_id") || "—"}`,
            ],
            warnings: ["Role is fixed to Guardian by the relationship registry."],
        });
    },

    toExecutePayload(draft) {
        const subject = resolveSubjectFromDraft(draft);
        const selectedPersonId = draftFieldString(draft, "selected_person_id");
        const payload: Record<string, unknown> = {
            source_customer_id: draftFieldString(draft, "source_customer_id"),
            source_entity_type: subject?.entityType ?? "opportunity",
            source_record_id: subject?.entityId ?? "",
            entity_id: subject?.entityId ?? "",
            entity_type: subject?.entityType ?? "opportunity",
        };
        if (selectedPersonId) {
            payload.selected_person_id = selectedPersonId;
        } else {
            payload.create_person_draft = {
                first_name: draftFieldString(draft, "first_name"),
                last_name: draftFieldString(draft, "last_name"),
                email: draftFieldString(draft, "email") || undefined,
                phone: draftFieldString(draft, "phone") || undefined,
            };
        }
        return payload;
    },

    async execute(payload, ctx) {
        const adapterCtx = (ctx ?? {}) as AddParentGuardianAdapterContext;
        const entityId = String(payload.entity_id ?? payload.source_record_id ?? "").trim();
        const entityType = String(payload.entity_type ?? payload.source_entity_type ?? "opportunity").trim();
        if (!entityId) {
            return {
                ok: false,
                errorMessage: "A subject record is required.",
                retryable: false,
                recoveryHints: ["Open a lead and try again."],
            };
        }
        const { entity_id: _e, entity_type: _t, ...rest } = payload;
        const result = await executePlatformCommandViaActionsApi({
            commandKey: COMMAND_KEY,
            entityType,
            entityId,
            payload: rest,
            departmentId: adapterCtx.departmentId,
            workUnitId: adapterCtx.workUnitId,
            surface: adapterCtx.surface ?? "bos_recommendations",
            origin: "bos",
            mode: "execute",
            confirmation: { confirmed: true },
            networkErrorMessage:
                "I couldn’t reach the server to add a parent/guardian. Check your connection and try again.",
            failureErrorMessage:
                "I couldn’t add the parent/guardian. Review the details and try again.",
        });
        return mapActionResultToBosExecution(result);
    },

    mapSuccess(result) {
        if (!result.ok) return null;
        return result.success;
    },
};
