import {
    CONFIGURATION_MUTATING_OPERATION_KINDS,
    type ConfigurationOperationKindV1,
    type ConfigurationOperationV1,
    type ConfigurationProposalRiskLevelV1,
    type ConfigurationProposalV1,
} from "./configurationProposalV1";

const RISK_ORDER: Record<ConfigurationProposalRiskLevelV1, number> = {
    low: 0,
    medium: 1,
    high: 2,
};

function maxRisk(
    a: ConfigurationProposalRiskLevelV1,
    b: ConfigurationProposalRiskLevelV1
): ConfigurationProposalRiskLevelV1 {
    return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function riskForOperationKind(kind: ConfigurationOperationKindV1, op: ConfigurationOperationV1): ConfigurationProposalRiskLevelV1 {
    switch (kind) {
        case "expose_field_on_layout":
            return "low";
        case "create_field":
        case "update_field":
        case "move_field_to_section":
        case "create_section":
        case "update_section":
        case "reorder_section":
        case "set_field_requirement":
        case "set_field_interaction":
            return riskForRequirementOrInteraction(op);
        case "archive_section":
        case "hide_field_on_layout":
            return riskForHideOrArchive(op);
        case "set_field_write_target":
            return riskForWriteTarget(op);
        case "update_option_set":
            return "medium";
        case "data_quality_recommendation":
            return "low";
        default:
            return "medium";
    }
}

function riskForRequirementOrInteraction(op: ConfigurationOperationV1): ConfigurationProposalRiskLevelV1 {
    const after = op.after ?? {};
    const mode = String(after.requirement_mode ?? after.interaction_mode ?? after.mode ?? "").toLowerCase();
    if (mode === "required" || after.is_required === true) return "medium";
    return "low";
}

function riskForHideOrArchive(op: ConfigurationOperationV1): ConfigurationProposalRiskLevelV1 {
    const before = op.before ?? {};
    if (before.is_required === true || before.requirement_mode === "required") return "high";
    if (before.is_visible_in_drawer === true || before.exposed === true) return "medium";
    return "medium";
}

function riskForWriteTarget(op: ConfigurationOperationV1): ConfigurationProposalRiskLevelV1 {
    const after = op.after ?? {};
    const behavior = String(after.write_behavior ?? "").toLowerCase();
    const target = after.write_target_entity ?? after.write_target_field;
    if (!target || behavior === "none" || behavior === "") {
        if (after.editable === true || after.interaction_mode === "editable") return "high";
        return "medium";
    }
    if (behavior === "related_record") return "medium";
    return "low";
}

/** Deterministic proposal risk from operation kinds and lightweight payload hints. */
export function classifyProposalRisk(operations: ConfigurationOperationV1[]): ConfigurationProposalRiskLevelV1 {
    if (!operations.length) return "low";
    let risk: ConfigurationProposalRiskLevelV1 = "low";
    for (const op of operations) {
        risk = maxRisk(risk, riskForOperationKind(op.kind, op));
    }
    return risk;
}

export function inferApplyMode(operations: ConfigurationOperationV1[]): ConfigurationProposalV1["apply_mode"] {
    const kinds = operations.map((o) => o.kind);
    const onlyRecommendation =
        kinds.length > 0 && kinds.every((k) => k === "data_quality_recommendation");
    if (onlyRecommendation) return "recommendation_only";
    if (operations.length === 1) return "single_operation";
    return "batched_atomic";
}

export function inferRequiresApproval(operations: ConfigurationOperationV1[]): boolean {
    return operations.some((o) =>
        (CONFIGURATION_MUTATING_OPERATION_KINDS as readonly string[]).includes(o.kind)
    );
}

export function applyRiskDefaults(proposal: ConfigurationProposalV1): ConfigurationProposalV1 {
    const risk_level = classifyProposalRisk(proposal.proposed_operations);
    const apply_mode = inferApplyMode(proposal.proposed_operations);
    const requires_approval = inferRequiresApproval(proposal.proposed_operations);
    return {
        ...proposal,
        risk_level,
        apply_mode,
        requires_approval: requires_approval ? true : proposal.requires_approval,
    };
}
