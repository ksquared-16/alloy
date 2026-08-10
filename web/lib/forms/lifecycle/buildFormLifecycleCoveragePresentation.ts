/**
 * Operator-facing lifecycle coverage presentation — no raw keys or resolver names.
 */

import { LIFECYCLE_STAGE_LABELS } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { FormsLifecycleCoverageResult, FormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import type { FormsLifecycleUsageV1 } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { persistedLevelForFormsRule } from "@/lib/completion/readinessFromFormsCoverage";
import { requirementLevelOperatorLabel } from "@/lib/completion/readinessDisplayPresentation";
import {
    operationalIntentRequiresLifecycleRecordCoverage,
    recordCreationLabelForIntent,
} from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import {
    operationalIntentTemplate,
    type OperationalIntentKey,
} from "@/lib/forms/operationalIntentTemplates";
import { deferredTimingLabel } from "@/lib/forms/lifecycle/formRequirementTiming";

export type FormLifecycleCoverageRowPresentation = {
    field_label: string;
    tier_label: "Required" | "Recommended" | "Enforced";
    status_label: "Satisfied" | "Missing" | "Unknown";
    detail: string | null;
    /**
     * Set when the process requires this field but a LATER moment owns it, so it does not block
     * this form. Without this a deferred requirement is indistinguishable from a merely optional
     * one, which is what made demoting fields to `recommended` feel like the only lever.
     */
    deferred_note?: string;
};

export type FormLifecycleCoverageEntityPresentation = {
    entity_label: string;
    rows: FormLifecycleCoverageRowPresentation[];
};

export type FormLifecycleCoveragePresentationStatus =
    | "empty"
    | "no_schema"
    | "ready"
    | "missing_required";

export type FormLifecycleCoveragePresentation = {
    status: FormLifecycleCoveragePresentationStatus;
    status_headline: string;
    status_message: string;
    schema_source: "published" | "draft" | "none";
    lifecycle_label: string | null;
    stage_label: string | null;
    intent_label: string | null;
    entity_groups: FormLifecycleCoverageEntityPresentation[];
    /**
     * Operator-facing labels of the required fields this form is missing, in coverage order.
     * The panel names these inline — "Missing required fields" without saying *which* is the
     * complaint this exists to answer.
     */
    missing_required_labels: string[];
};

function intentLabel(intent: string): string {
    if (
        intent === "enrollment_lead" ||
        intent === "existing_family" ||
        intent === "operational_document" ||
        intent === "waitlist" ||
        intent === "packet_step" ||
        intent === "custom"
    ) {
        return operationalIntentTemplate(intent as OperationalIntentKey).label;
    }
    if (intent === "general") return "General form";
    return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: "satisfied" | "missing" | "unknown"): "Satisfied" | "Missing" | "Unknown" {
    if (status === "satisfied") return "Satisfied";
    if (status === "unknown") return "Unknown";
    return "Missing";
}

function satisfiedDetail(matchedFormFieldLabel?: string): string | null {
    if (!matchedFormFieldLabel?.trim()) return "Satisfied";
    return `Satisfied by ${matchedFormFieldLabel.trim()}`;
}

function tierLabel(
    item: {
        requirementId: string;
        requiredness: "required" | "recommended";
    },
    contract: FormsLifecycleRequirementContract | null,
    departmentMetadata?: Record<string, unknown> | null
): "Required" | "Recommended" | "Enforced" {
    if (item.requiredness === "recommended") {
        return "Recommended";
    }
    if (contract) {
        const level = persistedLevelForFormsRule(item.requirementId, contract, departmentMetadata);
        return requirementLevelOperatorLabel(level === "off" ? "required" : level);
    }
    return "Required";
}

/** Timing note for a requirement the process requires but a later moment owns. */
function deferredNote(
    requirementId: string,
    contract: FormsLifecycleRequirementContract | null
): string | undefined {
    const timing = contract?.recommended.find((r) => r.id === requirementId)?.deferredTiming;
    if (!timing?.length) return undefined;
    return `Required ${deferredTimingLabel(timing)} — not needed on this form`;
}

function itemToRow(
    item: {
        requirementId: string;
        requirementLabel: string;
        requiredness: "required" | "recommended";
        status: "satisfied" | "missing" | "unknown";
        matchedFormFieldLabel?: string;
    },
    contract: FormsLifecycleRequirementContract | null,
    departmentMetadata?: Record<string, unknown> | null
): FormLifecycleCoverageRowPresentation {
    const deferred_note = deferredNote(item.requirementId, contract);
    return {
        field_label: item.requirementLabel,
        tier_label: tierLabel(item, contract, departmentMetadata),
        status_label: statusLabel(item.status),
        detail:
            item.status === "satisfied" ?
                satisfiedDetail(item.matchedFormFieldLabel)
            : item.status === "unknown" ?
                "Coverage could not be determined for this field"
            :   null,
        ...(deferred_note ? { deferred_note } : {}),
    };
}

function constraintRow(
    coverage: FormsLifecycleCoverageResult,
    contract: FormsLifecycleRequirementContract | null,
    departmentMetadata?: Record<string, unknown> | null
): FormLifecycleCoverageRowPresentation | null {
    if (!coverage.constraintFailures.length) {
        const email = [...coverage.satisfiedRequired, ...coverage.satisfiedRecommended].find(
            (i) => i.requirementId === "person:email"
        );
        const phone = [...coverage.satisfiedRequired, ...coverage.satisfiedRecommended].find(
            (i) => i.requirementId === "person:phone"
        );
        const participant = email?.status === "satisfied" ? email : phone?.status === "satisfied" ? phone : null;
        if (!participant) return null;
        return {
            field_label: "Phone or email",
            tier_label: tierLabel(participant, contract, departmentMetadata),
            status_label: "Satisfied",
            detail: satisfiedDetail(participant.matchedFormFieldLabel),
        };
    }

    const cf = coverage.constraintFailures[0];
    if (!cf) return null;
    return {
        field_label: cf.requirementLabel.replace(/\.$/, ""),
        tier_label: "Enforced",
        status_label: "Missing",
        detail: null,
    };
}

/**
 * Labels of the required fields this form does not capture — including an unmet constraint such as
 * "phone or email", which blocks record creation exactly like a missing field does.
 */
function missingRequiredLabels(coverage: FormsLifecycleCoverageResult): string[] {
    const out: string[] = [];
    for (const item of coverage.missingRequired) {
        // Some requirements are authored as sentences too, not just constraints.
        const label = constraintLabelAsFieldName(item.requirementLabel);
        if (label && !out.includes(label)) out.push(label);
    }
    for (const cf of coverage.constraintFailures) {
        const label = constraintLabelAsFieldName(cf.requirementLabel);
        if (label && !out.includes(label)) out.push(label);
    }
    return out;
}

/**
 * Constraint labels are authored as sentences ("Phone or email is required."). Inside an
 * "Add: …" list that reads as "Add: Phone or email is required" — reduce it to the field name.
 */
function constraintLabelAsFieldName(raw: string | undefined): string {
    return (raw ?? "")
        .trim()
        .replace(/\.$/, "")
        .replace(/\s+(is|are)\s+required$/i, "")
        .trim();
}

/** "A", "A and B", "A, B, and C" — operator prose, not a bullet dump. */
function formatLabelList(labels: readonly string[]): string {
    if (labels.length <= 1) return labels[0] ?? "";
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function buildEntityGroups(
    coverage: FormsLifecycleCoverageResult,
    contract: FormsLifecycleRequirementContract | null,
    departmentMetadata?: Record<string, unknown> | null
): FormLifecycleCoverageEntityPresentation[] {
    const groups: FormLifecycleCoverageEntityPresentation[] = [];
    const constraint = constraintRow(coverage, contract, departmentMetadata);

    for (const [entityLabel, group] of Object.entries(coverage.byEntity)) {
        const rows: FormLifecycleCoverageRowPresentation[] = [
            ...group.required.map((item) => itemToRow(item, contract, departmentMetadata)),
            ...group.recommended.map((item) => itemToRow(item, contract, departmentMetadata)),
        ];

        if (entityLabel === "Person / Guardian" && constraint) {
            const hasContactRow = rows.some((r) => r.field_label.toLowerCase().includes("email") || r.field_label.toLowerCase().includes("phone"));
            if (!hasContactRow) {
                rows.push(constraint);
            }
        }

        if (rows.length) {
            groups.push({ entity_label: entityLabel, rows });
        }
    }

    if (constraint && !groups.some((g) => g.entity_label === "Person / Guardian")) {
        groups.unshift({
            entity_label: "Person / Guardian",
            rows: [constraint],
        });
    }

    return groups;
}

export function buildFormLifecycleCoveragePresentation(input: {
    usage: FormsLifecycleUsageV1 | null;
    departmentName?: string | null;
    contract: FormsLifecycleRequirementContract | null;
    coverage: FormsLifecycleCoverageResult | null;
    schema_source: "published" | "draft" | "none";
    departmentMetadata?: Record<string, unknown> | null;
}): FormLifecycleCoveragePresentation {
    const schema_source = input.schema_source;
    const lifecycle_label = input.departmentName?.trim() || input.contract?.lifecycleLabel?.trim() || null;
    const stage_label =
        input.usage ?
            LIFECYCLE_STAGE_LABELS[input.usage.stage_key] ?? input.contract?.stageLabel ?? null
        :   null;
    const intent_label = input.usage ? intentLabel(String(input.usage.intake_intent)) : null;

    if (!input.usage) {
        return {
            status: "empty",
            status_headline: "No business process selected",
            status_message:
                "Select a business process and stage to check whether this form captures the required fields.",
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: [],
            missing_required_labels: [],
        };
    }

    if (schema_source === "none" || !input.coverage) {
        return {
            status: "no_schema",
            status_headline: "Add form fields first",
            status_message: "Publish or save a draft with fields to evaluate business process coverage.",
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: [],
            missing_required_labels: [],
        };
    }

    if (input.coverage.ready) {
        const recordIntent = operationalIntentRequiresLifecycleRecordCoverage(
            input.usage ? String(input.usage.intake_intent) : null
        );
        const recordLabel = recordCreationLabelForIntent(
            input.usage ? String(input.usage.intake_intent) : null
        );
        const recommendedGaps = input.coverage.missingRecommended.length > 0;
        const status_headline =
            recordIntent && recommendedGaps ?
                "Ready. Recommended fields are missing."
            : recordIntent ?
                recordLabel === "Lead" ?
                    "Ready to create Lead."
                :   `Ready to create ${recordLabel}.`
            :   "Ready for this business process stage";
        const status_message =
            recordIntent && recommendedGaps ?
                `Ready to create ${recordLabel}. Recommended fields are missing but sharing is allowed.`
            : recordIntent ?
                `This form captures the required information to create a ${recordLabel} for the selected business process stage.`
            :   "This form captures the required information for the selected workflow stage.";

        return {
            status: "ready",
            status_headline,
            status_message,
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: buildEntityGroups(input.coverage, input.contract, input.departmentMetadata),
            missing_required_labels: [],
        };
    }

    const recordIntent = operationalIntentRequiresLifecycleRecordCoverage(
        input.usage ? String(input.usage.intake_intent) : null
    );
    const recordLabel = recordCreationLabelForIntent(
        input.usage ? String(input.usage.intake_intent) : null
    );
    const missing_required_labels = missingRequiredLabels(input.coverage);
    const named = missing_required_labels.length ? ` Add: ${formatLabelList(missing_required_labels)}.` : "";
    const recordBlockMessage =
        recordIntent ?
            `This form can be saved and published, but it cannot create a ${recordLabel} until it captures every required field for this stage.${named}`
        :   `This form is missing required fields for this stage.${named}`;

    return {
        status: "missing_required",
        status_headline:
            missing_required_labels.length === 1 ?
                "1 required field missing"
            : missing_required_labels.length ?
                `${missing_required_labels.length} required fields missing`
            :   "Missing required fields",
        status_message: recordBlockMessage,
        schema_source,
        lifecycle_label,
        stage_label,
        intent_label,
        entity_groups: buildEntityGroups(input.coverage, input.contract, input.departmentMetadata),
        missing_required_labels,
    };
}
