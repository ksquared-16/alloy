/**
 * Programs domain — Program Offering Variants.
 *
 * Ownership: Programs. Consumed by Commercial (rates), Enrollment,
 * Scheduling, Capacity, Attendance, Analytics.
 *
 * A variant is the quantity/configuration dimension under an offering type.
 * Example: "Full Day" offering → variants "2 days/week", "3 days/week", "5 days/week".
 * "Drop-In" offering → one transparent default variant (no quantity).
 *
 * Commercial rates always attach to a variant_id, never directly to an offering.
 */

export type QuantityType = "days" | "hours" | "sessions" | "weeks" | "months";

export type VariantStatus =
    | "active"
    | "draft"
    | "coming_soon"
    | "seasonal"
    | "retired"
    | "archived";

export type ProgramOfferingVariant = {
    id: string;
    org_id: string;
    offering_id: string;
    /** null = transparent default variant (shown as offering name in UI) */
    label: string | null;
    quantity_type: QuantityType | null;
    quantity_value: number | null;
    sort_order: number;
    is_active: boolean;
    status: VariantStatus;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export const QUANTITY_TYPE_LABELS: Record<QuantityType, string> = {
    days: "days/week",
    hours: "hours/week",
    sessions: "sessions/week",
    weeks: "weeks",
    months: "months",
};

export const QUANTITY_TYPE_SINGULAR: Record<QuantityType, string> = {
    days: "day/week",
    hours: "hour/week",
    sessions: "session/week",
    weeks: "week",
    months: "month",
};

export const VARIANT_STATUS_LABELS: Record<VariantStatus, string> = {
    active: "Active",
    draft: "Draft",
    coming_soon: "Coming Soon",
    seasonal: "Seasonal",
    retired: "Retired",
    archived: "Archived",
};

/** Whether this is the transparent default variant (no quantity dimension). */
export function isDefaultVariant(variant: ProgramOfferingVariant): boolean {
    return variant.quantity_type === null && variant.quantity_value === null;
}

/**
 * Auto-generate a label from quantity fields.
 * Used when the operator doesn't provide a custom label.
 */
export function autoVariantLabel(quantityValue: number, quantityType: QuantityType): string {
    const unit =
        quantityValue === 1
            ? QUANTITY_TYPE_SINGULAR[quantityType]
            : QUANTITY_TYPE_LABELS[quantityType];
    return `${quantityValue} ${unit}`;
}

/** Human-readable description of a variant (for display in lists). */
export function describeVariant(variant: ProgramOfferingVariant): string {
    if (variant.label) return variant.label;
    if (variant.quantity_value != null && variant.quantity_type != null) {
        return autoVariantLabel(variant.quantity_value, variant.quantity_type);
    }
    return "Default";
}

/** Display name: custom label first, then auto-generated, then "Default". */
export function variantDisplayLabel(variant: ProgramOfferingVariant): string {
    return describeVariant(variant);
}

/** Sort variants by quantity_value asc, then label. */
export function sortVariants(variants: ProgramOfferingVariant[]): ProgramOfferingVariant[] {
    return [...variants].sort((a, b) => {
        // Default variant always first
        if (isDefaultVariant(a) && !isDefaultVariant(b)) return -1;
        if (!isDefaultVariant(a) && isDefaultVariant(b)) return 1;

        // Sort by sort_order, then quantity_value
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        const av = a.quantity_value ?? 0;
        const bv = b.quantity_value ?? 0;
        if (av !== bv) return av - bv;

        return (a.label ?? "").localeCompare(b.label ?? "");
    });
}

/** Group variants by offering_id. */
export function groupVariantsByOffering(
    variants: ProgramOfferingVariant[],
): Map<string, ProgramOfferingVariant[]> {
    const map = new Map<string, ProgramOfferingVariant[]>();
    for (const v of variants) {
        if (!map.has(v.offering_id)) map.set(v.offering_id, []);
        map.get(v.offering_id)!.push(v);
    }
    return map;
}
