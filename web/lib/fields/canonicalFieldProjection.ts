/**
 * Canonical field projection metadata — owned by one grain, presented on another subject.
 *
 * Projection does not change ownership, storage, option sets, or mutation targets.
 * @see docs/platform/modules/field-concepts.md
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";

export type CanonicalFieldProjectionKind =
    | "inquiry_participation"
    | "current_enrollment"
    | "committed_placement"
    | "relationship"
    | "calculated"
    | "runtime"
    | string;

export type CanonicalFieldProjection = {
    /** Canonical field ref on the owning grain (e.g. inquiry_child.program_category_id). */
    sourceFieldRef: string;
    /** Ownership entity_type / grain. */
    ownerEntity: string;
    /** Subject the consumer presents against (e.g. child). */
    projectionSubject: string;
    /** Consumer-facing provider refKey used in pickers/layouts. */
    providerRef: string;
    projectionKind: CanonicalFieldProjectionKind;
    displayLabelOverride?: string;
    /** Option/master entity for choice fields — distinct from field owner. */
    optionSourceEntity?: string;
    /** When false, projection is read-only on the subject surface. */
    writableViaOwner?: boolean;
};

/** Enrollment participation fields projected onto Child Focus Panel / Child surfaces. */
export const CHILD_ENROLLMENT_PROJECTIONS: readonly CanonicalFieldProjection[] = [
    {
        sourceFieldRef: "inquiry_child.location_id",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.location_id",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Location",
        optionSourceEntity: "location",
        writableViaOwner: true,
    },
    {
        sourceFieldRef: "inquiry_child.program_category_id",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.program",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Program",
        optionSourceEntity: "location_program_category",
        writableViaOwner: true,
    },
    {
        sourceFieldRef: "inquiry_child.program_room_cohort_key",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.program_room_cohort_key",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Room",
        optionSourceEntity: "location_unit",
        writableViaOwner: true,
    },
    {
        sourceFieldRef: "inquiry_child.schedule_type",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.schedule_type",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Schedule",
        optionSourceEntity: "option_set",
        writableViaOwner: true,
    },
    {
        sourceFieldRef: "inquiry_child.start_date",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.start_date",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Desired start date",
        writableViaOwner: true,
    },
    {
        sourceFieldRef: "inquiry_child.outcome_status_key",
        ownerEntity: "inquiry_child",
        projectionSubject: "child",
        providerRef: "inquiry_child.outcome_status_key",
        projectionKind: "inquiry_participation",
        displayLabelOverride: "Enrollment status",
        writableViaOwner: true,
    },
] as const;

/** Legacy layout aliases that implied Child ownership of Enrollment facts. */
export const LEGACY_CHILD_ENROLLMENT_ALIAS_TO_PROVIDER: Readonly<Record<string, string>> = {
    "child.program": "inquiry_child.program",
    "child.location": "inquiry_child.location_id",
    "child.room": "inquiry_child.program_room_cohort_key",
    "child.schedule": "inquiry_child.schedule_type",
    "child.start_date": "inquiry_child.start_date",
    "child.status": "inquiry_child.outcome_status_key",
};

/**
 * How Child-surface enrollment projections select the participation record.
 *
 * Focus Panel Children evidence rows are already bound to one
 * `opportunity_customer_members` / `_inquiry_children` participation. Projected
 * values resolve from that bound row — never an arbitrary "first enrollment"
 * across opportunities. These are inquiry participation fields (requested /
 * in-process), not committed operational placement.
 *
 * Out of band for this subject grain: multi-opportunity historical/future
 * placements — selected by Work Views / process instance context, not by the
 * provider. When no bound OCM row exists, projected values safely degrade to empty.
 */
export const CURRENT_ENROLLMENT_PROJECTION_RESOLUTION = {
    kind: "bound_inquiry_child_participation_row",
    storageGrain: "opportunity_customer_members",
    ownerEntity: "inquiry_child",
    silentFirstRowForbidden: true,
} as const;

const PROJECTION_BY_PROVIDER = new Map(
    CHILD_ENROLLMENT_PROJECTIONS.map((row) => [row.providerRef, row] as const),
);

export function projectionForProviderRef(providerRef: string): CanonicalFieldProjection | undefined {
    const trimmed = providerRef.trim();
    const direct = PROJECTION_BY_PROVIDER.get(trimmed);
    if (direct) return direct;
    const canonical = LEGACY_CHILD_ENROLLMENT_ALIAS_TO_PROVIDER[trimmed];
    return canonical ? PROJECTION_BY_PROVIDER.get(canonical) : undefined;
}

export function reconcileLegacyChildEnrollmentAlias(refKey: string): string {
    const trimmed = refKey.trim();
    return LEGACY_CHILD_ENROLLMENT_ALIAS_TO_PROVIDER[trimmed] ?? trimmed;
}

export function isEnrollmentOwnedChildProjection(refKey: string): boolean {
    return projectionForProviderRef(refKey) != null;
}

export function enrollmentAssignmentOwnerEntity(refKey: string): string | null {
    return projectionForProviderRef(refKey)?.ownerEntity ?? null;
}

/** Attach projection metadata + presentation labels onto matching providers. */
export function enrichProvidersWithChildEnrollmentProjections(
    providers: readonly CanonicalDataProvider[],
): CanonicalDataProvider[] {
    return providers.map((provider) => {
        const projection = projectionForProviderRef(provider.refKey);
        if (!projection) return provider;
        return {
            ...provider,
            label: projection.displayLabelOverride ?? provider.label,
            // Projection kind owns the operator category — never collapse to a hardcoded
            // "enrollment" / "general" bucket that hides Inquiry Participation in composers.
            categoryKey:
                projection.projectionKind === "inquiry_participation"
                    ? "inquiry_participation"
                    : provider.categoryKey,
            projection,
            settingsEntity: provider.settingsEntity ?? projection.ownerEntity,
        };
    });
}

/** Enrollment assignment keys must never register as customer_member fields. */
export function isEnrollmentAssignmentFieldKeyOnCustomerMember(fieldKey: string): boolean {
    const key = fieldKey.trim();
    return (
        key === "location_id"
        || key === "program_category_id"
        || key === "program_room_cohort_key"
        || key === "schedule_type"
        || key === "outcome_status_key"
        || key === "start_date"
        || key === "program"
        || key === "location"
        || key === "room"
        || key === "schedule"
    );
}
