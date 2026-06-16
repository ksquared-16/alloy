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
            section_label: "Parent / guardian",
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
        label: "Pasted inquiry",
        snippet,
        status,
    };
}

export function buildCreateLeadLiveFindings(args: {
    suggestions: ActionWorkspaceBosSuggestion[];
    values: Record<string, string>;
    analyzing: boolean;
    manualMode: boolean;
    gatherFields?: readonly ActionWorkspaceGatherField[];
}): CreateLeadLiveFinding[] {
    const gatherFields = args.gatherFields ?? CREATE_LEAD_GATHER_FIELDS;

    if (args.analyzing) {
        return args.suggestions.map((s) => ({
            id: s.id,
            entity: entityLabelForField(fieldForPayloadKey(gatherFields, s.payload_key)),
            value: s.suggested_value,
            status: "streaming",
            detail: "Extracting from material…",
            payloadKey: s.payload_key,
            confidence: s.confidence,
            selected: s.selected,
            editable: true,
            source: "suggestion",
        }));
    }

    if (args.suggestions.length > 0) {
        return args.suggestions.map((s) => ({
            id: s.id,
            entity: s.field_label,
            value: s.suggested_value,
            status: confidenceToStatus(s.confidence),
            detail: s.confidence === "high" ? "High confidence" : "Needs review",
            payloadKey: s.payload_key,
            confidence: s.confidence,
            selected: s.selected,
            editable: true,
            source: "suggestion",
        }));
    }

    const valueFindings = gatherFields.flatMap((field) => {
        const value = (args.values[field.payload_key] ?? "").trim();
        if (!value) return [];
        return [
            {
                id: `value:${field.payload_key}`,
                entity: entityLabelForField(field),
                value,
                status: "confirmed" as const,
                detail: args.manualMode ? "Entered manually" : "Confirmed",
                payloadKey: field.payload_key,
                editable: args.manualMode,
                source: "value" as const,
            },
        ];
    });

    if (valueFindings.length > 0) return valueFindings;

    return placeholderOrderForFields(gatherFields)
        .map((payloadKey) => {
            const field = gatherFields.find((f) => f.payload_key === payloadKey);
            if (!field) return null;
            const finding: CreateLeadLiveFinding = {
                id: `placeholder:${payloadKey}`,
                entity: entityLabelForField(field),
                value: "",
                status: "empty",
                detail: "Waiting for material",
                payloadKey,
                source: "placeholder",
            };
            return finding;
        })
        .filter((f): f is CreateLeadLiveFinding => f != null);
}
