/**
 * Operator-facing lifecycle coverage presentation — no raw keys or resolver names.
 */

import { LIFECYCLE_STAGE_LABELS } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type {
    FormsLifecycleCoverageResult,
    FormsLifecycleRequirementContract,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import type { FormsLifecycleUsageV1 } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import {
    operationalIntentTemplate,
    type OperationalIntentKey,
} from "@/lib/forms/operationalIntentTemplates";

export type FormLifecycleCoverageRowPresentation = {
    field_label: string;
    tier_label: "Required" | "Recommended";
    status_label: "Satisfied" | "Missing" | "Unknown";
    detail: string | null;
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

function tierLabel(requiredness: "required" | "recommended"): "Required" | "Recommended" {
    return requiredness === "required" ? "Required" : "Recommended";
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

function itemToRow(item: {
    requirementLabel: string;
    requiredness: "required" | "recommended";
    status: "satisfied" | "missing" | "unknown";
    matchedFormFieldLabel?: string;
}): FormLifecycleCoverageRowPresentation {
    return {
        field_label: item.requirementLabel,
        tier_label: tierLabel(item.requiredness),
        status_label: statusLabel(item.status),
        detail:
            item.status === "satisfied" ?
                satisfiedDetail(item.matchedFormFieldLabel)
            : item.status === "unknown" ?
                "Coverage could not be determined for this field"
            :   null,
    };
}

function constraintRow(coverage: FormsLifecycleCoverageResult): FormLifecycleCoverageRowPresentation | null {
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
            tier_label: "Required",
            status_label: "Satisfied",
            detail: satisfiedDetail(participant.matchedFormFieldLabel),
        };
    }

    const cf = coverage.constraintFailures[0];
    if (!cf) return null;
    return {
        field_label: cf.requirementLabel.replace(/\.$/, ""),
        tier_label: "Required",
        status_label: "Missing",
        detail: null,
    };
}

function buildEntityGroups(coverage: FormsLifecycleCoverageResult): FormLifecycleCoverageEntityPresentation[] {
    const groups: FormLifecycleCoverageEntityPresentation[] = [];
    const constraint = constraintRow(coverage);

    for (const [entityLabel, group] of Object.entries(coverage.byEntity)) {
        const rows: FormLifecycleCoverageRowPresentation[] = [
            ...group.required.map((item) => itemToRow(item)),
            ...group.recommended.map((item) => itemToRow(item)),
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
            status_headline: "No lifecycle selected",
            status_message:
                "Select a lifecycle stage to check whether this form captures the required fields.",
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: [],
        };
    }

    if (schema_source === "none" || !input.coverage) {
        return {
            status: "no_schema",
            status_headline: "Add form fields first",
            status_message: "Publish or save a draft with fields to evaluate lifecycle coverage.",
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: [],
        };
    }

    if (input.coverage.ready) {
        return {
            status: "ready",
            status_headline: "Ready for this lifecycle stage",
            status_message: "This form captures the required information for the selected workflow stage.",
            schema_source,
            lifecycle_label,
            stage_label,
            intent_label,
            entity_groups: buildEntityGroups(input.coverage),
        };
    }

    return {
        status: "missing_required",
        status_headline: "Missing required fields",
        status_message:
            "Missing required fields. This form is not ready to create a Lead for this stage.",
        schema_source,
        lifecycle_label,
        stage_label,
        intent_label,
        entity_groups: buildEntityGroups(input.coverage),
    };
}
