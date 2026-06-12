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

const FIELD_ENTITY_LABEL: Record<string, string> = {
    first_name: "Parent first name",
    last_name: "Parent last name",
    email: "Email",
    phone: "Phone",
    child_first_name: "Child first name",
    child_last_name: "Child last name",
    child_date_of_birth: "Date of birth",
    child_program: "Program",
    child_program_room_cohort_key: "Room / cohort",
    child_desired_schedule_type: "Schedule",
    child_desired_start_date: "Desired start",
    location_id: "Location",
    source: "Source",
    intake_notes: "Notes",
};

const FINDING_PLACEHOLDER_ORDER = [
    "first_name",
    "email",
    "phone",
    "child_first_name",
    "child_program",
    "location_id",
    "source",
] as const;

function entityLabelForField(field: ActionWorkspaceGatherField): string {
    return FIELD_ENTITY_LABEL[field.payload_key] ?? field.field_label;
}

function confidenceToStatus(confidence: ActionWorkspaceBosSuggestion["confidence"]): CreateLeadLiveFindingStatus {
    if (confidence === "high") return "confirmed";
    if (confidence === "medium") return "review";
    return "review";
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
}): CreateLeadLiveFinding[] {
    if (args.analyzing) {
        return args.suggestions.map((s) => ({
            id: s.id,
            entity: entityLabelForField(
                CREATE_LEAD_GATHER_FIELDS.find((f) => f.payload_key === s.payload_key) ?? {
                    payload_key: s.payload_key,
                    field_label: s.field_label,
                    section: "person",
                    section_label: "Parent / guardian",
                    tier: "optional",
                    value_kind: "text",
                },
            ),
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

    const valueFindings = CREATE_LEAD_GATHER_FIELDS.flatMap((field) => {
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

    return FINDING_PLACEHOLDER_ORDER.map((payloadKey) => {
        const field = CREATE_LEAD_GATHER_FIELDS.find((f) => f.payload_key === payloadKey);
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
    }).filter((f): f is CreateLeadLiveFinding => f != null);
}
