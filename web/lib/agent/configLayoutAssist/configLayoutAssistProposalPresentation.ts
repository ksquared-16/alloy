import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import {
    adminFieldEntityPluralLabel,
    adminFieldEntitySingularLabel,
} from "@/lib/admin/adminFieldEntityDisplayLabel";

import type {
    ConfigurationOperationKindV1,
    ConfigurationOperationV1,
    ConfigurationProposalV1,
} from "./configurationProposalV1";

export type ProposalLifecycleState =
    | "draft"
    | "reviewed"
    | "approved"
    | "rejected"
    | "applied"
    | "failed"
    | "rolled_back";

export type ProposalReviewPresentationKind =
    | "create_field"
    | "set_field_interaction"
    | "recommendation"
    | "generic";

export type ProposalReviewFieldRow = {
    label: string;
    value: string;
};

export type ProposalAdvancedOperationRow = {
    kind: string;
    entity_type: string;
    field_key: string | null;
    section_key: string | null;
    raw_json: string;
};

export type ProposalReviewPresentation = {
    kind: ProposalReviewPresentationKind;
    title: string;
    summary: string;
    fieldRows: ProposalReviewFieldRow[];
    confirmationQuestions: string[];
    humanExplanation?: string;
    advanced: {
        proposal_id: string;
        risk_level: string;
        apply_mode: string;
        permissions: string[];
        operations: ProposalAdvancedOperationRow[];
        internal_field_key?: string | null;
    };
};

export type ProposalListPresentation = {
    title: string;
    forLabel: string | null;
    stateLabel: string;
    statusHint: string;
};

export type ProposalStatePresentation = {
    stateLabel: string;
    statusHint: string;
    isRecommendationOnly: boolean;
    needsConfirmation: boolean;
};

export type ProposalPresentationContext = {
    entityLabels?: EntityLabelsMap;
};

const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Text",
    date: "Date",
    email: "Email",
    phone: "Phone",
    number: "Number",
    select: "Select",
    boolean: "Yes/No",
    textarea: "Long text",
};

const SECTION_KEY_LABELS: Record<string, string> = {
    custom: "Custom section",
    default: "Default section",
    summary: "Summary",
    details: "Details",
};

function isMutatingProposal(proposal: ConfigurationProposalV1): boolean {
    return proposal.proposed_operations.some((o) => o.kind !== "data_quality_recommendation");
}

export function proposalHasMutatingOperations(proposal: ConfigurationProposalV1): boolean {
    return isMutatingProposal(proposal);
}

export function formatProposalLifecycleState(
    state: string,
    applyMode: string,
    proposal?: ConfigurationProposalV1 | null
): ProposalStatePresentation {
    const recommendationOnly =
        applyMode === "recommendation_only" ||
        (proposal != null && !isMutatingProposal(proposal) && proposal.proposed_operations.length > 0);
    const mutating = proposal ? isMutatingProposal(proposal) : applyMode !== "recommendation_only";

    switch (state as ProposalLifecycleState) {
        case "draft":
            return {
                stateLabel: recommendationOnly ? "Draft · recommendation" : "Draft · pending review",
                statusHint: recommendationOnly ? "Review only" : "Needs confirmation",
                isRecommendationOnly: recommendationOnly,
                needsConfirmation: mutating && !recommendationOnly,
            };
        case "reviewed":
            return {
                stateLabel: "Reviewed · ready for approval",
                statusHint: recommendationOnly ? "Review only" : "Awaiting approval",
                isRecommendationOnly: recommendationOnly,
                needsConfirmation: false,
            };
        case "approved":
            return {
                stateLabel: recommendationOnly ? "Approved · no changes to apply" : "Approved · ready to apply",
                statusHint: recommendationOnly ? "No system change" : "Ready to apply",
                isRecommendationOnly: recommendationOnly,
                needsConfirmation: false,
            };
        case "applied":
            return {
                stateLabel: "Applied",
                statusHint: "Change is live",
                isRecommendationOnly: false,
                needsConfirmation: false,
            };
        case "failed":
            return {
                stateLabel: "Failed",
                statusHint: "Apply did not complete",
                isRecommendationOnly: false,
                needsConfirmation: false,
            };
        case "rejected":
            return {
                stateLabel: "Rejected",
                statusHint: "Closed without applying",
                isRecommendationOnly: false,
                needsConfirmation: false,
            };
        case "rolled_back":
            return {
                stateLabel: "Rolled back",
                statusHint: "Previously applied change was reversed",
                isRecommendationOnly: false,
                needsConfirmation: false,
            };
        default:
            return {
                stateLabel: state,
                statusHint: "",
                isRecommendationOnly: recommendationOnly,
                needsConfirmation: false,
            };
    }
}

function humanizeFieldKey(fieldKey: string): string {
    const words = fieldKey.split("_").filter(Boolean);
    if (words.length === 0) return fieldKey;
    return words
        .map((part, index) =>
            index === 0
                ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                : part.toLowerCase()
        )
        .join(" ");
}

function formatFieldType(fieldType: string | undefined | null): string {
    if (!fieldType?.trim()) return "Text";
    const key = fieldType.trim().toLowerCase();
    return FIELD_TYPE_LABELS[key] ?? humanizeFieldKey(key);
}

function formatSectionPlacement(sectionKey: string | undefined | null, entitySingular: string): string {
    const sk = (sectionKey ?? "custom").trim().toLowerCase();
    const sectionLabel = SECTION_KEY_LABELS[sk] ?? humanizeFieldKey(sk);
    return `${entitySingular} drawer → ${sectionLabel}`;
}

function yesNo(value: boolean | undefined | null): string {
    return value === true ? "Yes" : "No";
}

function entityDisplayFromProposal(
    proposal: ConfigurationProposalV1,
    entityType: string,
    form: "singular" | "plural",
    ctx?: ProposalPresentationContext
): string {
    const meta = proposal.metadata;
    const fromMeta =
        typeof meta?.entity_display_label === "string" ? meta.entity_display_label.trim() : "";
    if (fromMeta) {
        if (form === "singular") {
            const lower = fromMeta.toLowerCase();
            if (lower.endsWith("ies")) return `${fromMeta.slice(0, -3)}y`;
            if (lower.endsWith("s") && !lower.endsWith("ss")) return fromMeta.slice(0, -1);
        }
        return fromMeta;
    }
    if (ctx?.entityLabels) {
        return form === "plural"
            ? adminFieldEntityPluralLabel(ctx.entityLabels, entityType)
            : adminFieldEntitySingularLabel(ctx.entityLabels, entityType);
    }
    if (entityType === "opportunity") {
        return form === "plural" ? "Inquiries" : "Inquiry";
    }
    return humanizeFieldKey(entityType);
}

function primaryOperation(proposal: ConfigurationProposalV1): ConfigurationOperationV1 | null {
    const mutating = proposal.proposed_operations.filter((o) => o.kind !== "data_quality_recommendation");
    if (mutating.length > 0) return mutating[0] ?? null;
    return proposal.proposed_operations[0] ?? null;
}

function resolvePresentationKind(
    proposal: ConfigurationProposalV1,
    op: ConfigurationOperationV1 | null
): ProposalReviewPresentationKind {
    if (proposal.apply_mode === "recommendation_only") return "recommendation";
    if (op?.kind === "data_quality_recommendation") return "recommendation";
    if (op?.kind === "create_field") return "create_field";
    if (op?.kind === "set_field_interaction") return "set_field_interaction";
    if (proposal.proposed_operations.every((o) => o.kind === "data_quality_recommendation")) {
        return "recommendation";
    }
    return "generic";
}

function buildCreateFieldPresentation(
    proposal: ConfigurationProposalV1,
    op: ConfigurationOperationV1,
    ctx?: ProposalPresentationContext
): ProposalReviewPresentation {
    const after = (op.after ?? {}) as Record<string, unknown>;
    const fieldLabel =
        typeof after.label === "string" && after.label.trim()
            ? after.label.trim()
            : humanizeFieldKey(String(op.field_key ?? after.field_key ?? "field"));
    const fieldKey = String(op.field_key ?? after.field_key ?? "");
    const entityPlural = entityDisplayFromProposal(proposal, op.entity_type, "plural", ctx);
    const entitySingular = entityDisplayFromProposal(proposal, op.entity_type, "singular", ctx);
    const fieldType = formatFieldType(typeof after.field_type === "string" ? after.field_type : null);
    const required =
        after.is_required === true ||
        (typeof after.requirement_mode === "string" && after.requirement_mode !== "optional");

    return {
        kind: "create_field",
        title: "Create a new field",
        summary: `Alloy will add a new field to ${entityPlural}.`,
        fieldRows: [
            { label: "Field name", value: fieldLabel },
            { label: "Field type", value: fieldType },
            { label: "Record type", value: entityPlural },
            { label: "Required", value: yesNo(required) },
            {
                label: "Where it appears",
                value: formatSectionPlacement(
                    typeof after.section_key === "string" ? after.section_key : op.section_key,
                    entitySingular
                ),
            },
            {
                label: "Editable",
                value: yesNo(after.is_visible_in_drawer !== false && after.is_visible_in_form !== false),
            },
        ],
        confirmationQuestions: [
            "Is this the correct field type?",
            "Should this field be required?",
            "Is this the right place to show it?",
        ],
        advanced: buildAdvancedBlock(proposal, fieldKey),
    };
}

function buildSetFieldInteractionPresentation(
    proposal: ConfigurationProposalV1,
    op: ConfigurationOperationV1,
    ctx?: ProposalPresentationContext
): ProposalReviewPresentation {
    const fieldKey = String(op.field_key ?? "");
    const fieldLabel = humanizeFieldKey(fieldKey);
    const entitySingular = entityDisplayFromProposal(proposal, op.entity_type, "singular", ctx);
    const entityPlural = entityDisplayFromProposal(proposal, op.entity_type, "plural", ctx);
    const policy = (op.after?.interaction_policy ?? null) as Record<string, unknown> | null;
    const ownership =
        policy != null && typeof policy === "object" && policy.ownership != null && typeof policy.ownership === "object"
            ? (policy.ownership as Record<string, unknown>)
            : null;
    const writeTargetEntity = String(ownership?.write_target_entity ?? op.entity_type);
    const writeTargetField = String(ownership?.write_target_field ?? fieldKey);
    const ownerEntity =
        writeTargetEntity !== op.entity_type
            ? humanizeFieldKey(writeTargetEntity)
            : entitySingular;
    const editability =
        String(policy?.editability_mode ?? "") === "editable_through_related_record" ? "Yes" : "Yes";
    const updatesLabel = `${humanizeFieldKey(writeTargetEntity)} → ${humanizeFieldKey(writeTargetField)}`;
    const risk = proposal.risk_level.charAt(0).toUpperCase() + proposal.risk_level.slice(1);

    const humanExplanation =
        writeTargetEntity !== op.entity_type
            ? `Editing this field from an ${entitySingular} will update the linked ${ownerEntity} record. The change will appear anywhere that ${ownerEntity.toLowerCase()}'s ${humanizeFieldKey(writeTargetField).toLowerCase()} is shown.`
            : `This updates how "${fieldLabel}" can be edited on ${entityPlural}.`;

    return {
        kind: "set_field_interaction",
        title: "Change field editing behavior",
        summary: "Alloy will change whether this field can be edited from this record.",
        fieldRows: [
            { label: "Field", value: fieldLabel },
            { label: "Shown on", value: entitySingular },
            { label: "Owned by", value: ownerEntity },
            { label: "Updates", value: updatesLabel },
            { label: `Editable from ${entitySingular}`, value: editability },
            { label: "Risk", value: risk },
        ],
        confirmationQuestions: [
            "Is this the correct field?",
            "Should edits from this record update the linked record?",
        ],
        humanExplanation,
        advanced: buildAdvancedBlock(proposal, fieldKey),
    };
}

function buildRecommendationPresentation(proposal: ConfigurationProposalV1): ProposalReviewPresentation {
    const rationale = proposal.rationale.filter((r) => r.trim());
    return {
        kind: "recommendation",
        title: "Recommendation",
        summary: "No system change will be applied. This is for review only.",
        fieldRows:
            rationale.length > 0
                ? [{ label: "What we found", value: rationale.join(" ") }]
                : [{ label: "What we found", value: proposal.summary }],
        confirmationQuestions: ["Does this recommendation look accurate?"],
        advanced: buildAdvancedBlock(proposal, null),
    };
}

function buildGenericPresentation(
    proposal: ConfigurationProposalV1,
    op: ConfigurationOperationV1 | null
): ProposalReviewPresentation {
    const entityPlural =
        op != null ? entityDisplayFromProposal(proposal, op.entity_type, "plural") : "your workspace";
    return {
        kind: "generic",
        title: "Confirm this change",
        summary: proposal.summary || `Alloy will apply a configuration change for ${entityPlural}.`,
        fieldRows: proposal.rationale.slice(0, 3).map((line) => ({ label: "Detail", value: line })),
        confirmationQuestions: ["Does this change match what you intended?"],
        advanced: buildAdvancedBlock(proposal, op?.field_key ?? null),
    };
}

function buildAdvancedBlock(
    proposal: ConfigurationProposalV1,
    internalFieldKey: string | null
): ProposalReviewPresentation["advanced"] {
    return {
        proposal_id: proposal.id,
        risk_level: proposal.risk_level,
        apply_mode: proposal.apply_mode,
        permissions: proposal.permission_requirements,
        internal_field_key: internalFieldKey,
        operations: proposal.proposed_operations.map((op) => ({
            kind: op.kind,
            entity_type: op.entity_type,
            field_key: op.field_key ?? null,
            section_key: op.section_key ?? null,
            raw_json: JSON.stringify({ before: op.before, after: op.after }, null, 2),
        })),
    };
}

export function buildProposalReviewPresentation(
    proposal: ConfigurationProposalV1,
    ctx?: ProposalPresentationContext
): ProposalReviewPresentation {
    const op = primaryOperation(proposal);
    const kind = resolvePresentationKind(proposal, op);

    if (kind === "recommendation") {
        return buildRecommendationPresentation(proposal);
    }
    if (kind === "create_field" && op) {
        return buildCreateFieldPresentation(proposal, op, ctx);
    }
    if (kind === "set_field_interaction" && op) {
        return buildSetFieldInteractionPresentation(proposal, op, ctx);
    }
    return buildGenericPresentation(proposal, op);
}

/** Parse list summary heuristics: "Create X on Inquiries" → title + for label. */
export function buildProposalListPresentation(item: {
    summary: string;
    state: string;
    apply_mode: string;
    category?: string;
}): ProposalListPresentation {
    const statePresentation = formatProposalLifecycleState(item.state, item.apply_mode, null);
    const summary = item.summary.trim();
    const onMatch = summary.match(/^(.+?)\s+on\s+(.+)$/i);
    if (onMatch) {
        return {
            title: onMatch[1]!.trim(),
            forLabel: onMatch[2]!.trim(),
            stateLabel: statePresentation.stateLabel,
            statusHint: statePresentation.statusHint,
        };
    }
    return {
        title: summary,
        forLabel: null,
        stateLabel: statePresentation.stateLabel,
        statusHint: statePresentation.statusHint,
    };
}

export function buildProposalListPresentationFromProposal(
    proposal: ConfigurationProposalV1,
    state: string,
    applyMode: string,
    ctx?: ProposalPresentationContext
): ProposalListPresentation {
    const op = primaryOperation(proposal);
    let title = proposal.summary.trim();
    let forLabel: string | null = null;

    if (op?.kind === "create_field") {
        const after = (op.after ?? {}) as Record<string, unknown>;
        const fieldLabel =
            typeof after.label === "string" && after.label.trim()
                ? after.label.trim()
                : humanizeFieldKey(String(op.field_key ?? ""));
        title = `Create ${fieldLabel} field`;
        forLabel = entityDisplayFromProposal(proposal, op.entity_type, "plural", ctx);
    } else if (op?.kind === "set_field_interaction" && op.field_key) {
        title = `Change ${humanizeFieldKey(op.field_key)} editing`;
        forLabel = entityDisplayFromProposal(proposal, op.entity_type, "plural", ctx);
    } else if (proposal.apply_mode === "recommendation_only") {
        title = "Configuration recommendation";
        forLabel = null;
    }

    const statePresentation = formatProposalLifecycleState(state, applyMode, proposal);
    return {
        title,
        forLabel,
        stateLabel: statePresentation.stateLabel,
        statusHint: statePresentation.statusHint,
    };
}

export function operationKindLabel(kind: ConfigurationOperationKindV1): string {
    return kind.replace(/_/g, " ");
}
