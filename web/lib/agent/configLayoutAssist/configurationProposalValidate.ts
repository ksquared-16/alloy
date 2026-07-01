/**
 * Configuration proposal validation (Card 5).
 */

import { parseFieldInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import { parseFieldRequirementPolicy } from "@/lib/fields/fieldRequirementPolicy";

import { validateOperationPayloadShape } from "./configurationProposalOperationPayloads";
import {
    CONFIGURATION_OPERATION_KINDS,
    CONFIGURATION_PROPOSAL_ENTITY_TYPES,
    CONFIGURATION_PROPOSAL_VERSION,
    type ConfigurationOperationKindV1,
    type ConfigurationOperationV1,
    type ConfigurationProposalCategoryV1,
    type ConfigurationProposalRiskLevelV1,
    type ConfigurationProposalV1,
    type ProposalValidationIssue,
    type ProposalValidationResultV1,
    type ProposalWarningSeverityV1,
} from "./configurationProposalV1";
import { isKnownConfigurationPermissionKey } from "./configurationProposalPermissions";

const CATEGORIES: readonly ConfigurationProposalCategoryV1[] = [
    "layout",
    "field",
    "section",
    "requirement",
    "interaction",
    "data_quality",
    "option_set",
];

const RISK_LEVELS: readonly ConfigurationProposalRiskLevelV1[] = ["low", "medium", "high"];

const SEVERITIES: readonly ProposalWarningSeverityV1[] = ["warning", "error"];

function nonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim() !== "";
}

export type ProposalValidationContextV1 = {
    /** entity_type → known field_key set (for update/move ops). */
    known_field_keys_by_entity?: Record<string, readonly string[]>;
    /** entity_type → known section_key set. */
    known_section_keys_by_entity?: Record<string, readonly string[]>;
};

function issue(
    severity: ProposalWarningSeverityV1,
    code: string,
    message: string,
    extra?: { operation_id?: string | null; path?: string | null }
): ProposalValidationIssue {
    return {
        severity,
        code,
        message,
        operation_id: extra?.operation_id ?? null,
        path: extra?.path ?? null,
    };
}

function finalize(issues: ProposalValidationIssue[]): ProposalValidationResultV1 {
    const sorted = [...issues].sort(
        (a, b) =>
            (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1) ||
            a.code.localeCompare(b.code) ||
            (a.operation_id ?? "").localeCompare(b.operation_id ?? "") ||
            a.message.localeCompare(b.message)
    );
    const error_count = sorted.filter((i) => i.severity === "error").length;
    const warning_count = sorted.filter((i) => i.severity === "warning").length;
    return {
        ok: error_count === 0,
        issues: sorted,
        error_count,
        warning_count,
    };
}

function isEntityType(s: string): boolean {
    return (CONFIGURATION_PROPOSAL_ENTITY_TYPES as readonly string[]).includes(s);
}

function validateWarning(w: unknown, path: string, issues: ProposalValidationIssue[], opId?: string): void {
    if (w == null || typeof w !== "object" || Array.isArray(w)) {
        issues.push(issue("error", "invalid_warning", `${path} must be an object`, { path, operation_id: opId }));
        return;
    }
    const o = w as Record<string, unknown>;
    const sev = o.severity;
    if (typeof sev !== "string" || !SEVERITIES.includes(sev as ProposalWarningSeverityV1)) {
        issues.push(issue("error", "invalid_warning_severity", `${path}.severity invalid`, { path, operation_id: opId }));
    }
    if (typeof o.code !== "string" || !o.code.trim()) {
        issues.push(issue("error", "invalid_warning_code", `${path}.code required`, { path, operation_id: opId }));
    }
    if (typeof o.message !== "string" || !o.message.trim()) {
        issues.push(issue("error", "invalid_warning_message", `${path}.message required`, { path, operation_id: opId }));
    }
}

function fieldKeysForEntity(ctx: ProposalValidationContextV1 | undefined, entity_type: string): Set<string> | null {
    const list = ctx?.known_field_keys_by_entity?.[entity_type];
    if (!list) return null;
    return new Set(list);
}

function sectionKeysForEntity(ctx: ProposalValidationContextV1 | undefined, entity_type: string): Set<string> | null {
    const list = ctx?.known_section_keys_by_entity?.[entity_type];
    if (!list) return null;
    return new Set(list);
}

function validateOperationReferences(
    op: ConfigurationOperationV1,
    ctx: ProposalValidationContextV1 | undefined,
    issues: ProposalValidationIssue[]
): void {
    const fieldKeys = fieldKeysForEntity(ctx, op.entity_type);
    const sectionKeys = sectionKeysForEntity(ctx, op.entity_type);

    const kindsNeedingField: ConfigurationOperationKindV1[] = [
        "update_field",
        "set_field_requirement",
        "set_field_interaction",
        "set_field_write_target",
        "expose_field_on_layout",
        "hide_field_on_layout",
        "move_field_to_section",
    ];
    if (kindsNeedingField.includes(op.kind) && op.field_key && fieldKeys && !fieldKeys.has(op.field_key)) {
        issues.push(
            issue("error", "unknown_field_key", `Unknown field_key "${op.field_key}" for ${op.entity_type}`, {
                operation_id: op.operation_id,
            })
        );
    }

    const kindsNeedingSection: ConfigurationOperationKindV1[] = [
        "update_section",
        "archive_section",
        "move_field_to_section",
    ];
    if (kindsNeedingSection.includes(op.kind) && op.section_key && sectionKeys && !sectionKeys.has(op.section_key)) {
        issues.push(
            issue("error", "unknown_section_key", `Unknown section_key "${op.section_key}" for ${op.entity_type}`, {
                operation_id: op.operation_id,
            })
        );
    }
}

function validateEmbeddedPolicies(op: ConfigurationOperationV1, issues: ProposalValidationIssue[]): void {
    const after = op.after;
    if (!after || typeof after !== "object") return;
    if (after.requirement_policy !== undefined) {
        const p = parseFieldRequirementPolicy(after.requirement_policy);
        if (!p.ok) {
            issues.push(
                issue("error", "invalid_requirement_policy", p.error, { operation_id: op.operation_id, path: "after.requirement_policy" })
            );
        }
    }
    if (after.interaction_policy !== undefined) {
        const p = parseFieldInteractionPolicy(after.interaction_policy);
        if (!p.ok) {
            issues.push(
                issue("error", "invalid_interaction_policy", p.error, { operation_id: op.operation_id, path: "after.interaction_policy" })
            );
        }
    }
}

function validateOperation(op: ConfigurationOperationV1, issues: ProposalValidationIssue[], ctx?: ProposalValidationContextV1): void {
    const opId = op.operation_id;

    if (!nonEmptyString(op.operation_id)) {
        issues.push(issue("error", "missing_operation_id", "operation_id is required"));
        return;
    }

    if (!(CONFIGURATION_OPERATION_KINDS as readonly string[]).includes(op.kind)) {
        issues.push(issue("error", "invalid_operation_kind", `Invalid operation kind: ${op.kind}`, { operation_id: opId }));
        return;
    }

    if (!nonEmptyString(op.entity_type) || !isEntityType(op.entity_type)) {
        issues.push(issue("error", "invalid_entity_type", `Invalid entity_type: ${op.entity_type}`, { operation_id: opId }));
    }

    if (!Array.isArray(op.rationale)) {
        issues.push(issue("error", "invalid_rationale", "operation.rationale must be an array", { operation_id: opId }));
    } else if (!op.rationale.every((r) => typeof r === "string")) {
        issues.push(issue("error", "invalid_rationale", "operation.rationale entries must be strings", { operation_id: opId }));
    }

    if (!Array.isArray(op.required_permissions)) {
        issues.push(issue("error", "invalid_permissions", "operation.required_permissions must be an array", { operation_id: opId }));
    } else {
        for (const p of op.required_permissions) {
            if (typeof p !== "string" || !p.trim()) {
                issues.push(issue("error", "invalid_permission", "empty permission key", { operation_id: opId }));
            } else if (!isKnownConfigurationPermissionKey(p)) {
                issues.push(
                    issue("warning", "unknown_permission_key", `Unknown permission key: ${p}`, { operation_id: opId })
                );
            }
        }
    }

    if (op.before !== null && op.before !== undefined && (typeof op.before !== "object" || Array.isArray(op.before))) {
        issues.push(issue("error", "invalid_before", "before must be object or null", { operation_id: opId }));
    }
    if (op.after !== null && op.after !== undefined && (typeof op.after !== "object" || Array.isArray(op.after))) {
        issues.push(issue("error", "invalid_after", "after must be object or null", { operation_id: opId }));
    }

    if (op.kind === "data_quality_recommendation") {
        if (op.after !== null && op.after !== undefined) {
            // shape checked below
        }
    } else if (op.after === null || op.after === undefined) {
        issues.push(issue("error", "missing_after", "mutating operations require after", { operation_id: opId }));
    }

    for (const w of op.warnings ?? []) {
        validateWarning(w, "operation.warnings[]", issues, opId);
    }

    const shape = validateOperationPayloadShape(op);
    if (!shape.ok) {
        issues.push(issue("error", "invalid_operation_payload", shape.error, { operation_id: opId }));
    }

    validateEmbeddedPolicies(op, issues);
    validateOperationReferences(op, ctx, issues);
}

/**
 * Validate a ConfigurationProposalV1 structure (deterministic issue ordering).
 */
export function validateConfigurationProposal(
    proposal: ConfigurationProposalV1,
    ctx?: ProposalValidationContextV1
): ProposalValidationResultV1 {
    const issues: ProposalValidationIssue[] = [];

    if (proposal.version !== CONFIGURATION_PROPOSAL_VERSION) {
        issues.push(
            issue("error", "unsupported_version", `Unsupported proposal version: ${proposal.version}`, { path: "version" })
        );
        return finalize(issues);
    }

    if (!nonEmptyString(proposal.id)) {
        issues.push(issue("error", "missing_id", "proposal id is required", { path: "id" }));
    }

    if (!CATEGORIES.includes(proposal.category)) {
        issues.push(issue("error", "invalid_category", `Invalid category: ${proposal.category}`, { path: "category" }));
    }

    if (!nonEmptyString(proposal.intent)) {
        issues.push(issue("error", "missing_intent", "intent is required", { path: "intent" }));
    }

    if (!nonEmptyString(proposal.summary)) {
        issues.push(issue("error", "missing_summary", "summary is required", { path: "summary" }));
    }

    if (!Array.isArray(proposal.rationale) || !proposal.rationale.every((r) => typeof r === "string")) {
        issues.push(issue("error", "invalid_rationale", "rationale must be string[]", { path: "rationale" }));
    }

    if (!Array.isArray(proposal.impacted_entities) || !proposal.impacted_entities.every((e) => typeof e === "string")) {
        issues.push(issue("error", "invalid_impacted_entities", "impacted_entities must be string[]", { path: "impacted_entities" }));
    }

    if (!RISK_LEVELS.includes(proposal.risk_level)) {
        issues.push(issue("error", "invalid_risk_level", `Invalid risk_level: ${proposal.risk_level}`, { path: "risk_level" }));
    }

    if (typeof proposal.requires_approval !== "boolean") {
        issues.push(issue("error", "invalid_requires_approval", "requires_approval must be boolean", { path: "requires_approval" }));
    }

    if (!Array.isArray(proposal.permission_requirements)) {
        issues.push(
            issue("error", "invalid_permission_requirements", "permission_requirements must be array", {
                path: "permission_requirements",
            })
        );
    }

    if (!nonEmptyString(proposal.generated_by)) {
        issues.push(issue("error", "missing_generated_by", "generated_by is required", { path: "generated_by" }));
    }

    if (!nonEmptyString(proposal.created_at)) {
        issues.push(issue("error", "missing_created_at", "created_at is required", { path: "created_at" }));
    } else if (Number.isNaN(Date.parse(proposal.created_at))) {
        issues.push(issue("error", "invalid_created_at", "created_at must be ISO-8601", { path: "created_at" }));
    }

    if (proposal.metadata !== undefined && (typeof proposal.metadata !== "object" || proposal.metadata === null || Array.isArray(proposal.metadata))) {
        issues.push(issue("error", "invalid_metadata", "metadata must be object", { path: "metadata" }));
    }

    for (const w of proposal.warnings ?? []) {
        validateWarning(w, "warnings[]", issues);
    }

    if (!Array.isArray(proposal.proposed_operations)) {
        issues.push(issue("error", "invalid_operations", "proposed_operations must be array", { path: "proposed_operations" }));
        return finalize(issues);
    }

    const opIds = new Set<string>();
    for (const op of proposal.proposed_operations) {
        if (opIds.has(op.operation_id)) {
            issues.push(
                issue("error", "duplicate_operation_id", `Duplicate operation_id: ${op.operation_id}`, {
                    operation_id: op.operation_id,
                })
            );
        } else {
            opIds.add(op.operation_id);
        }
        validateOperation(op, issues, ctx);
    }

    if (proposal.proposed_operations.length === 0) {
        issues.push(issue("warning", "empty_operations", "proposal has no proposed_operations"));
    }

    const mutating = proposal.proposed_operations.some((o) => o.kind !== "data_quality_recommendation");
    if (mutating && proposal.requires_approval !== true) {
        issues.push(
            issue("warning", "approval_expected", "Mutating proposals should set requires_approval true", {
                path: "requires_approval",
            })
        );
    }

    if (proposal.apply_mode === "recommendation_only" && mutating) {
        issues.push(
            issue("error", "apply_mode_mismatch", "recommendation_only cannot include mutating operations", {
                path: "apply_mode",
            })
        );
    }

    return finalize(issues);
}
