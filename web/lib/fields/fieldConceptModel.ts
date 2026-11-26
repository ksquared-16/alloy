/**
 * Field concept taxonomy - separates Business Fields, Calculated Fields, and Runtime Signals.
 *
 * Business Fields: org-owned data (platform templates + custom field_definitions).
 * Calculated Fields: operator-defined formulas (planned, not yet implemented).
 * Runtime Signals: platform projections (today's "computed" catalog entries).
 *
 * @see docs/platform/modules/field-concepts.md
 */

import type { ConfigurationUnavailableHint } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import type { ComputedFieldDefinition, ComputedFieldResolverStatus } from "@/lib/fields/computedFieldCatalog";
import type { FieldLifecycleState } from "@/lib/fields/fieldLifecycleModel";
import type { FieldOwnershipKind } from "@/lib/fields/fieldOwnership";
import type { SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";
import type { FieldSurfaceAvailabilityRow } from "@/lib/fields/fieldSurfaceAvailability";

export type FieldConceptKind = "business_field" | "calculated_field" | "runtime_signal";

export const FIELD_CONCEPT_LABELS: Readonly<Record<FieldConceptKind, string>> = {
    business_field: "Business Field",
    calculated_field: "Calculated",
    runtime_signal: "Runtime Signal",
};

export function fieldConceptKindForCatalogEntry(entry: SettingsFieldCatalogEntry): FieldConceptKind {
    if (entry.ownership === "computed") {
        return entry.computedField?.concept_kind ?? "runtime_signal";
    }
    return "business_field";
}

export function fieldConceptChipLabel(entry: SettingsFieldCatalogEntry): string {
    const kind = fieldConceptKindForCatalogEntry(entry);
    if (entry.ownership === "platform") return "Platform";
    if (entry.ownership === "custom") return "Business";
    return FIELD_CONCEPT_LABELS[kind];
}

export type ComputedConceptAuditRow = {
    refKey: string;
    label: string;
    concept_kind: FieldConceptKind;
    rationale: string;
};

export const COMPUTED_FIELD_CONCEPT_AUDIT: readonly ComputedConceptAuditRow[] = [
    { refKey: "child.age", label: "Age", concept_kind: "calculated_field", rationale: "Formula from Date of Birth; operator-calculated field (planned)." },
    { refKey: "child.age_months", label: "Age (months)", concept_kind: "calculated_field", rationale: "Formula from Date of Birth; planned calculated field." },
    { refKey: "child.profile_completion", label: "Profile completion", concept_kind: "runtime_signal", rationale: "Platform readiness projection, not stored business data." },
    { refKey: "child.missing_required_info", label: "Missing required info", concept_kind: "runtime_signal", rationale: "Platform requirement evaluator projection." },
    { refKey: "person.primary_phone", label: "Primary phone", concept_kind: "runtime_signal", rationale: "Contact projection for queue/drawer runtime." },
    { refKey: "person.primary_email", label: "Primary email", concept_kind: "runtime_signal", rationale: "Contact projection for queue/drawer runtime." },
    { refKey: "person.relationship_to_child", label: "Relationship to child", concept_kind: "runtime_signal", rationale: "Relationship projection at read time." },
    { refKey: "family.primary_parent", label: "Primary parent", concept_kind: "runtime_signal", rationale: "Household contact projection." },
    { refKey: "family.primary_phone", label: "Primary phone", concept_kind: "runtime_signal", rationale: "Household contact projection." },
    { refKey: "family.primary_email", label: "Primary email", concept_kind: "runtime_signal", rationale: "Household contact projection." },
    { refKey: "family.children_summary", label: "Children summary", concept_kind: "runtime_signal", rationale: "Aggregated queue hydration projection." },
    { refKey: "family.latest_communication", label: "Latest communication", concept_kind: "runtime_signal", rationale: "Communications thread projection." },
    { refKey: "family.needs_response", label: "Needs response", concept_kind: "runtime_signal", rationale: "Attention / triage signal." },
    { refKey: "opportunity.current_stage", label: "Current stage", concept_kind: "runtime_signal", rationale: "Pipeline stage projection." },
    { refKey: "opportunity.current_work", label: "Current work", concept_kind: "runtime_signal", rationale: "Active work summary projection." },
    { refKey: "opportunity.days_in_stage", label: "Days in stage", concept_kind: "runtime_signal", rationale: "Stage duration projection." },
    { refKey: "opportunity.next_step", label: "Next step", concept_kind: "runtime_signal", rationale: "Next-action projection." },
    {
        refKey: "opportunity.tour_scheduled_date",
        label: "Tour scheduled date",
        concept_kind: "runtime_signal",
        rationale:
            "Process projection of tour scheduling state. Underlying tour date may be business data; this catalog entry surfaces enrollment workflow context at runtime.",
    },
    {
        refKey: "opportunity.target_start_date",
        label: "Target start date",
        concept_kind: "calculated_field",
        rationale: "Aggregated from child start dates; planned calculated field.",
    },
    { refKey: "opportunity.missing_required_info", label: "Missing required info", concept_kind: "runtime_signal", rationale: "Lifecycle requirement evaluator." },
    { refKey: "opportunity.readiness_status", label: "Readiness status", concept_kind: "runtime_signal", rationale: "Enrollment readiness signal." },
    { refKey: "location.capacity_summary", label: "Capacity summary", concept_kind: "runtime_signal", rationale: "Placement capacity projection." },
    { refKey: "location.open_spots", label: "Open spots", concept_kind: "runtime_signal", rationale: "Placement availability projection." },
    { refKey: "location.waitlist_count", label: "Waitlist count", concept_kind: "runtime_signal", rationale: "Waitlist queue projection." },
] as const;

const AUDIT_BY_REF = new Map(COMPUTED_FIELD_CONCEPT_AUDIT.map((r) => [r.refKey, r]));

export function computedConceptAudit(refKey: string): ComputedConceptAuditRow | undefined {
    return AUDIT_BY_REF.get(refKey.trim());
}

export function conceptKindForComputedField(field: ComputedFieldDefinition): FieldConceptKind {
    return field.concept_kind ?? computedConceptAudit(field.refKey)?.concept_kind ?? "runtime_signal";
}

const BENIGN_UNAVAILABLE_PATTERNS = [
    /not available in forms/i,
    /calculated at runtime/i,
    /not available in table/i,
    /not available in business process/i,
    /surface is not intended/i,
];

function isBenignSurfaceBlock(reason: string): boolean {
    return BENIGN_UNAVAILABLE_PATTERNS.some((re) => re.test(reason));
}

export function resolveConfigurationFieldRowHint(args: {
    entry: SettingsFieldCatalogEntry;
    availability: readonly FieldSurfaceAvailabilityRow[];
    lifecycle: FieldLifecycleState;
}): ConfigurationUnavailableHint | null {
    const { entry, availability, lifecycle } = args;

    if (lifecycle === "archived") return { label: "Archived" };
    if (lifecycle === "hidden") return { label: "Hidden" };

    if (entry.ownership === "computed") {
        const concept = fieldConceptKindForCatalogEntry(entry);
        const status: ComputedFieldResolverStatus | undefined = entry.computedField?.resolver_status;
        if (concept === "calculated_field") {
            return status === "now"
                ? { label: "Calculated", title: "Formula builder is planned; this value is resolver-backed today." }
                : { label: "Calculated (planned)", title: entry.computedField?.unavailable_reason };
        }
        if (status === "future") {
            const short = entry.computedField?.unavailable_reason?.split(".")[0] ?? "Coming soon";
            return { label: "Coming soon", title: short };
        }
        return null;
    }

    const meaningful = availability.filter((r) => r.status === "unavailable" && !isBenignSurfaceBlock(r.reason));
    if (meaningful.length === 0) return null;

    const first = meaningful[0]!;
    if (/child context/i.test(first.reason)) {
        return { label: "Requires Child Context", title: first.reason };
    }
    if (/runtime only/i.test(first.reason)) {
        return { label: "Runtime Only", title: first.reason };
    }

    return {
        label: first.reason.length > 40 ? `${first.reason.slice(0, 37)}...` : first.reason,
        title: meaningful.map((r) => r.reason).join(" · "),
    };
}

export type FieldOwnershipFilterKind = FieldOwnershipKind | "all" | "runtime_signals" | "calculated_fields";

export function filterCatalogByConcept(
    entries: readonly SettingsFieldCatalogEntry[],
    filter: FieldOwnershipFilterKind,
): SettingsFieldCatalogEntry[] {
    if (filter === "all") return [...entries];
    if (filter === "platform" || filter === "custom") {
        return entries.filter((e) => e.ownership === filter);
    }
    if (filter === "computed") {
        return entries.filter((e) => e.ownership === "computed");
    }
    if (filter === "runtime_signals") {
        return entries.filter(
            (e) => e.ownership === "computed" && fieldConceptKindForCatalogEntry(e) === "runtime_signal",
        );
    }
    if (filter === "calculated_fields") {
        return entries.filter(
            (e) => e.ownership === "computed" && fieldConceptKindForCatalogEntry(e) === "calculated_field",
        );
    }
    return [...entries];
}

export function countFieldsByConcept(entries: readonly SettingsFieldCatalogEntry[]): {
    all: number;
    platform: number;
    custom: number;
    runtime_signals: number;
    calculated_fields: number;
    computed: number;
} {
    let platform = 0;
    let custom = 0;
    let runtime_signals = 0;
    let calculated_fields = 0;
    for (const e of entries) {
        if (e.ownership === "platform") platform += 1;
        else if (e.ownership === "custom") custom += 1;
        else if (e.ownership === "computed") {
            if (fieldConceptKindForCatalogEntry(e) === "calculated_field") calculated_fields += 1;
            else runtime_signals += 1;
        }
    }
    return {
        all: entries.length,
        platform,
        custom,
        runtime_signals,
        calculated_fields,
        computed: runtime_signals + calculated_fields,
    };
}
