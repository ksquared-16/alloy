import type { ActionWorkspaceBosSuggestion, ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";

export type CreateLeadMaterialStatus = "unread" | "reading" | "read";

export type CreateLeadMaterialSourceType = "paste" | "email" | "call_note" | "upload";

export type CreateLeadMaterialCard = {
    id: string;
    sourceType: CreateLeadMaterialSourceType;
    label: string;
    snippet: string;
    status: CreateLeadMaterialStatus;
};

export type CreateLeadLiveFindingStatus = "confirmed" | "streaming" | "pending" | "review" | "empty";

export type CreateLeadLiveFinding = {
    id: string;
    entity: string;
    value: string;
    status: CreateLeadLiveFindingStatus;
    detail?: string;
    payloadKey?: string;
    confidence?: ActionWorkspaceBosSuggestion["confidence"];
    selected?: boolean;
    editable?: boolean;
    source: "suggestion" | "value" | "placeholder";
};

const FALLBACK_PLACEHOLDER_ORDER = [
    "first_name",
    "email",
    "phone",
    "child_first_name",
    "child_program",
    "location_id",
    "source",
] as const;

function fieldForPayloadKey(
    gatherFields: readonly ActionWorkspaceGatherField[],
    payloadKey: string,
): ActionWorkspaceGatherField {
    return (
        gatherFields.find((f) => f.payload_key === payloadKey) ?? {
            payload_key: payloadKey,
            field_label: payloadKey,
            section: "person",
            section_label: "Person",
            tier: "optional",
            value_kind: "text",
        }
    );
}

function entityLabelForField(field: ActionWorkspaceGatherField): string {
    return field.field_label;
}

function confidenceToStatus(confidence: ActionWorkspaceBosSuggestion["confidence"]): CreateLeadLiveFindingStatus {
    if (confidence === "high") return "confirmed";
    if (confidence === "medium") return "review";
    return "review";
}

function placeholderOrderForFields(gatherFields: readonly ActionWorkspaceGatherField[]): string[] {
    const required = gatherFields.filter((f) => f.tier === "required").map((f) => f.payload_key);
    if (required.length) return required;
    return [...FALLBACK_PLACEHOLDER_ORDER];
}

export function buildCreateLeadMaterialCard(args: {
    pasteText: string;
    analyzing: boolean;
    analyzed: boolean;
}): CreateLeadMaterialCard | null {
    const snippet = args.pasteText.trim();
    if (!snippet) return null;

    const status: CreateLeadMaterialStatus =
        args.analyzing ? "reading"
        : args.analyzed ? "read"
        : "unread";

    return {
        id: "material-paste",
        sourceType: "paste",
        label: "Pasted information",
        snippet,
        status,
    };
}

export function buildCreateLeadLiveFindings(args: {
    suggestions: ActionWorkspaceBosSuggestion[];
    values: Record<string, string>;
    analyzing: boolean;
    manualMode: boolean;
    draftEditMode?: boolean;
    gatherFields?: readonly ActionWorkspaceGatherField[];
}): CreateLeadLiveFinding[] {
    const gatherFields = args.gatherFields ?? CREATE_LEAD_GATHER_FIELDS;

    if (args.manualMode || args.draftEditMode) {
        return [];
    }

    if (args.analyzing) {
        const keys = placeholderOrderForFields(gatherFields);
        return keys.map((payloadKey) => {
            const field = fieldForPayloadKey(gatherFields, payloadKey);
            const pending = args.suggestions.find((s) => s.payload_key === payloadKey);
            const value =
                (args.values[payloadKey] ?? "").trim() ||
                pending?.suggested_value ||
                "";
            return {
                id: pending?.id ?? `streaming:${payloadKey}`,
                entity: entityLabelForField(field),
                value,
                status: "streaming" as const,
                detail: "Extracting from material…",
                payloadKey,
                confidence: pending?.confidence,
                selected: pending?.selected,
                editable: false,
                source: pending ? ("suggestion" as const) : ("placeholder" as const),
            };
        });
    }

    const order = placeholderOrderForFields(gatherFields);
    const suggestionByKey = new Map(args.suggestions.map((s) => [s.payload_key, s]));

    return order.map((payloadKey) => {
        const field = fieldForPayloadKey(gatherFields, payloadKey);
        const value = (args.values[payloadKey] ?? "").trim();
        const pending = suggestionByKey.get(payloadKey);

        if (value) {
            return {
                id: `value:${payloadKey}`,
                entity: entityLabelForField(field),
                value,
                status: "confirmed" as const,
                detail: "Confirmed",
                payloadKey,
                editable: false,
                source: "value" as const,
            };
        }

        if (pending) {
            return {
                id: pending.id,
                entity: pending.field_label,
                value: pending.suggested_value,
                status: confidenceToStatus(pending.confidence),
                detail: pending.confidence === "medium" ? "Needs review" : "Low confidence",
                payloadKey,
                confidence: pending.confidence,
                selected: pending.selected,
                editable: true,
                source: "suggestion" as const,
            };
        }

        return {
            id: `placeholder:${payloadKey}`,
            entity: entityLabelForField(field),
            value: "",
            status: "empty" as const,
            detail: "Waiting for material",
            payloadKey,
            source: "placeholder" as const,
        };
    });
}
