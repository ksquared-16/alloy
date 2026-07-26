/**
 * Extended Assignment Type behavior stored in `operational_assignment_types.default_behavior`.
 */

export type AssignmentTypeBehavior = {
    description?: string | null;
    primaryEligible?: boolean;
    requiresProgram?: boolean;
    requiresRoom?: boolean;
    allowsOverlap?: boolean;
    /** Empty or absent ⇒ org-wide availability. */
    locationIds?: string[];
};

export function readAssignmentTypeBehavior(raw: unknown): AssignmentTypeBehavior {
    if (!raw || typeof raw !== "object") return {};
    const bag = raw as Record<string, unknown>;
    const locationIds = Array.isArray(bag.locationIds)
        ? (bag.locationIds as unknown[]).map(String).filter(Boolean)
        : undefined;
    return {
        description: typeof bag.description === "string" ? bag.description : null,
        primaryEligible: bag.primaryEligible === true,
        requiresProgram: bag.requiresProgram === true,
        requiresRoom: bag.requiresRoom === true,
        allowsOverlap: bag.allowsOverlap === true,
        locationIds,
    };
}

export function slugAssignmentTypeKey(label: string): string {
    const base =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48) || "assignment_type";
    return `${base}_${Date.now().toString(36).slice(-5)}`.replace(/[^a-z0-9_]/g, "").slice(0, 63);
}
