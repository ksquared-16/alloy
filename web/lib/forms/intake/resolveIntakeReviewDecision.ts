/**
 * IC-4 — deterministic intake review routing from link config + match signals.
 * Safe default: legacy/missing config keeps review required for new creates.
 */

import { parseIntakeLinkDefaults, type IntakeLinkDefaults } from "./parseIntakeLinkDefaults";

export type IntakeReviewModeResolved = "required" | "exception_only" | "never" | "legacy_default";

export type IntakeReviewConfidence = "high" | "medium" | "low" | "unknown";

export type IntakeReviewDecision = {
    needsReview: boolean;
    reviewMode: IntakeReviewModeResolved;
    confidence: IntakeReviewConfidence;
    reasons: string[];
    autoOperationalized: boolean;
    /** Primary operator-facing reason when review is required */
    reviewReason: string | undefined;
};

export type ResolveIntakeReviewDecisionInput = {
    linkMetadata: Record<string, unknown> | null | undefined;
    matchStrategy: string;
    matchConfidence: IntakeReviewConfidence;
    emailPresent: boolean;
    phonePresent: boolean;
    personCreated: boolean;
    memberAutoCreated: boolean;
    workUnitDepartmentMismatch: boolean;
    opportunityDedupStrategy: "created" | "attached_existing" | "ambiguous" | "skipped";
    autoCreateOpportunity: boolean;
    hasOpportunity: boolean;
    hasCustomer: boolean;
    hasPerson: boolean;
    /** Submitted guardian name differs from matched person on email/phone match. */
    identityNameMismatchWithMatchedPerson?: boolean;
};

type ParsedIntakeReviewConfig = {
    reviewMode: IntakeReviewModeResolved;
    reviewRequiredExplicit: boolean;
    autoOperationalize: boolean;
    linkDefaults: IntakeLinkDefaults;
};

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

function readBool(m: Record<string, unknown>, key: string): boolean | null {
    const v = m[key];
    return typeof v === "boolean" ? v : null;
}

/** Read review config from link metadata (supports nested intake_outcome). */
export function parseIntakeReviewConfig(
    linkMetadata: Record<string, unknown> | null | undefined
): ParsedIntakeReviewConfig {
    const root = metaObject(linkMetadata);
    const intakeOutcome = metaObject(root.intake_outcome);
    const merged = { ...root, ...intakeOutcome };

    const rawMode = typeof merged.review_mode === "string" ? merged.review_mode.trim() : "";
    let reviewMode: IntakeReviewModeResolved = "legacy_default";
    if (rawMode === "always") reviewMode = "required";
    else if (rawMode === "never") reviewMode = "never";
    else if (rawMode === "confidence" || rawMode === "exception_only") reviewMode = "exception_only";

    return {
        reviewMode,
        reviewRequiredExplicit: readBool(merged, "review_required") === true,
        autoOperationalize: readBool(merged, "auto_operationalize") === true,
        linkDefaults: parseIntakeLinkDefaults(merged),
    };
}

function isRoutingCompleteForAutoOperationalize(
    config: ParsedIntakeReviewConfig,
    input: ResolveIntakeReviewDecisionInput
): boolean {
    if (input.workUnitDepartmentMismatch) return false;
    if (!input.autoCreateOpportunity) return true;

    const { linkDefaults } = config;
    return !!(
        linkDefaults.default_vertical_id &&
        linkDefaults.default_location_id &&
        linkDefaults.default_work_unit_id
    );
}

function legacyBaselineNeedsReview(input: ResolveIntakeReviewDecisionInput): boolean {
    if (input.identityNameMismatchWithMatchedPerson) return true;
    if (input.matchStrategy === "reuse_submission_person_id") {
        return input.workUnitDepartmentMismatch;
    }
    return (
        input.personCreated ||
        input.matchStrategy === "matched_phone" ||
        input.memberAutoCreated ||
        input.workUnitDepartmentMismatch
    );
}

function deriveMatchConfidence(input: ResolveIntakeReviewDecisionInput): IntakeReviewConfidence {
    if (input.opportunityDedupStrategy === "ambiguous") return "low";
    if (input.matchStrategy === "matched_email") return "high";
    if (input.matchStrategy === "matched_phone") return "medium";
    if (input.personCreated && input.emailPresent) return "high";
    if (input.personCreated) return "medium";
    if (input.opportunityDedupStrategy === "attached_existing") return "high";
    return input.matchConfidence;
}

function buildReviewReason(input: ResolveIntakeReviewDecisionInput, reasons: string[]): string | undefined {
    if (input.identityNameMismatchWithMatchedPerson) {
        return "Email or phone matches an existing family, but the submitted name differs — confirm the match before continuing.";
    }
    if (input.workUnitDepartmentMismatch) {
        return "Work unit does not belong to the configured department on this link — verify routing before generating documents.";
    }
    if (input.personCreated && reasons.includes("new_person_created")) {
        return "A new person record was created from this form — verify identity before generating documents.";
    }
    if (input.matchStrategy === "matched_phone") {
        return "Person was matched by phone only — verify identity before generating documents.";
    }
    if (input.memberAutoCreated) {
        return "A child customer member was auto-created — verify customer linkage before generating documents.";
    }
    if (reasons.includes("routing_incomplete")) {
        return "Required intake routing is incomplete on this link — verify location and work unit before continuing.";
    }
    if (reasons.includes("explicit_review_required")) {
        return "This intake link requires operator review before enrollment continues.";
    }
    if (reasons.length > 0) {
        return "Verify CRM linkage before generating documents.";
    }
    return undefined;
}

function canAutoOperationalize(
    config: ParsedIntakeReviewConfig,
    input: ResolveIntakeReviewDecisionInput,
    confidence: IntakeReviewConfidence
): { ok: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (config.reviewMode !== "exception_only") return { ok: false, reasons };
    if (!config.autoOperationalize) {
        reasons.push("auto_operationalize_disabled");
        return { ok: false, reasons };
    }
    if (config.reviewRequiredExplicit) {
        reasons.push("explicit_review_required");
        return { ok: false, reasons };
    }
    if (input.identityNameMismatchWithMatchedPerson) {
        reasons.push("identity_name_mismatch");
        return { ok: false, reasons };
    }
    if (input.opportunityDedupStrategy === "ambiguous") {
        reasons.push("ambiguous_opportunity_match");
        return { ok: false, reasons };
    }
    if (input.matchStrategy === "matched_phone") {
        reasons.push("phone_only_match");
        return { ok: false, reasons };
    }
    if (input.memberAutoCreated) {
        reasons.push("child_member_auto_created");
        return { ok: false, reasons };
    }
    if (input.workUnitDepartmentMismatch) {
        reasons.push("work_unit_department_mismatch");
        return { ok: false, reasons };
    }
    if (!input.hasPerson || !input.hasCustomer) {
        reasons.push("crm_records_incomplete");
        return { ok: false, reasons };
    }
    if (input.autoCreateOpportunity && !input.hasOpportunity) {
        reasons.push("opportunity_not_created");
        return { ok: false, reasons };
    }
    if (!isRoutingCompleteForAutoOperationalize(config, input)) {
        reasons.push("routing_incomplete");
        return { ok: false, reasons };
    }

    const cleanCreate =
        input.personCreated &&
        input.emailPresent &&
        input.opportunityDedupStrategy === "created";
    const confidentAttach =
        input.opportunityDedupStrategy === "attached_existing" &&
        input.matchStrategy === "matched_email" &&
        !input.personCreated;

    if (cleanCreate && confidence === "high") {
        return { ok: true, reasons: ["clean_new_opportunity_create"] };
    }
    if (confidentAttach) {
        return { ok: true, reasons: ["confident_duplicate_attach"] };
    }

    if (input.personCreated) reasons.push("new_person_created");
    if (!input.emailPresent && input.phonePresent) reasons.push("email_missing");
    if (confidence !== "high") reasons.push("confidence_not_high");

    return { ok: false, reasons };
}

/** Resolve whether intake needs operator review and whether it auto-operationalized. */
export function resolveIntakeReviewDecision(input: ResolveIntakeReviewDecisionInput): IntakeReviewDecision {
    const config = parseIntakeReviewConfig(input.linkMetadata);
    const confidence = deriveMatchConfidence(input);
    const reasons: string[] = [];
    const legacyNeedsReview = legacyBaselineNeedsReview(input);

    if (input.identityNameMismatchWithMatchedPerson) {
        reasons.push("identity_name_mismatch");
        return {
            needsReview: true,
            reviewMode: config.reviewMode,
            confidence: "low",
            reasons,
            autoOperationalized: false,
            reviewReason: buildReviewReason(input, reasons),
        };
    }

    if (config.reviewMode === "required" || config.reviewRequiredExplicit) {
        if (legacyNeedsReview || config.reviewRequiredExplicit) {
            if (config.reviewRequiredExplicit) reasons.push("explicit_review_required");
            if (input.personCreated) reasons.push("new_person_created");
            if (input.matchStrategy === "matched_phone") reasons.push("phone_only_match");
            if (input.memberAutoCreated) reasons.push("child_member_auto_created");
            if (input.workUnitDepartmentMismatch) reasons.push("work_unit_department_mismatch");
        }
        return {
            needsReview: true,
            reviewMode: config.reviewRequiredExplicit ? "required" : config.reviewMode,
            confidence,
            reasons: reasons.length ? reasons : ["review_always_mode"],
            autoOperationalized: false,
            reviewReason: buildReviewReason(input, reasons.length ? reasons : ["review_always_mode"]),
        };
    }

    if (config.reviewMode === "never") {
        return {
            needsReview: false,
            reviewMode: "never",
            confidence,
            reasons: ["review_never_mode"],
            autoOperationalized: config.autoOperationalize,
            reviewReason: undefined,
        };
    }

    if (config.reviewMode === "legacy_default") {
        if (legacyNeedsReview) {
            if (input.personCreated) reasons.push("new_person_created");
            if (input.matchStrategy === "matched_phone") reasons.push("phone_only_match");
            if (input.memberAutoCreated) reasons.push("child_member_auto_created");
            if (input.workUnitDepartmentMismatch) reasons.push("work_unit_department_mismatch");
            return {
                needsReview: true,
                reviewMode: "legacy_default",
                confidence,
                reasons,
                autoOperationalized: false,
                reviewReason: buildReviewReason(input, reasons),
            };
        }

        return {
            needsReview: false,
            reviewMode: "legacy_default",
            confidence,
            reasons: ["legacy_no_review_triggers"],
            autoOperationalized: false,
            reviewReason: undefined,
        };
    }

    // exception_only
    const auto = canAutoOperationalize(config, input, confidence);
    if (auto.ok) {
        return {
            needsReview: false,
            reviewMode: "exception_only",
            confidence,
            reasons: auto.reasons,
            autoOperationalized: true,
            reviewReason: undefined,
        };
    }

    // Auto path failed; fall back to legacy exception triggers only
    const exceptionReasons: string[] = [];
    if (legacyNeedsReview) {
        if (input.personCreated) exceptionReasons.push("new_person_created");
        if (input.matchStrategy === "matched_phone") exceptionReasons.push("phone_only_match");
        if (input.memberAutoCreated) exceptionReasons.push("child_member_auto_created");
        if (input.workUnitDepartmentMismatch) exceptionReasons.push("work_unit_department_mismatch");
    }

    return {
        needsReview: legacyNeedsReview,
        reviewMode: "exception_only",
        confidence,
        reasons:
            legacyNeedsReview ?
                exceptionReasons
            :   [...auto.reasons, "exception_auto_operationalize_not_eligible"],
        autoOperationalized: false,
        reviewReason: legacyNeedsReview ? buildReviewReason(input, exceptionReasons) : undefined,
    };
}

export function intakeReviewDecisionToOutcomeMeta(decision: IntakeReviewDecision): Record<string, unknown> {
    return {
        intake_needs_review: decision.needsReview,
        intake_review_reason: decision.reviewReason,
        intake_auto_operationalized: decision.autoOperationalized,
        intake_confidence: decision.confidence,
        intake_review_decision: {
            needs_review: decision.needsReview,
            review_mode: decision.reviewMode,
            confidence: decision.confidence,
            reasons: decision.reasons,
            auto_operationalized: decision.autoOperationalized,
        },
    };
}
