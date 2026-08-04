/**
 * Extended Assignment Category behavior stored in `operational_assignment_types.default_behavior`.
 * Internal key remains assignment_type; operator language is Assignment Category.
 */

export type RequirementMode = "required" | "optional" | "not_used";

export type EligibleSpaceMode = "any" | "selected" | "program_match";

/**
 * Finer-grained financial relationship than the `billing_participation` column
 * (which only stores none|eligible). Stored in behavior JSON — no schema change.
 * Derives the column value: none → none, anything else → eligible.
 */
export type BillingExpectation = "none" | "optional" | "expected" | "funding_eligible";

/**
 * Fixed catalog-category vocabulary for "what this Category may bill against".
 * No dedicated billing catalog taxonomy exists yet in the platform — this fixed
 * list is intentionally small and stored only in behavior (not a new column).
 */
export const ELIGIBLE_CATALOG_CATEGORIES = [
    { value: "tuition", label: "Tuition" },
    { value: "recurring_service", label: "Recurring service" },
    { value: "activity_enrichment", label: "Activity / enrichment" },
    { value: "transportation", label: "Transportation" },
    { value: "registration_one_time", label: "Registration (one-time)" },
] as const;

export type AssignmentTypeBehavior = {
    description?: string | null;
    primaryEligible?: boolean;
    /**
     * When true, committed assignments of this category may define the child's
     * Enrollment Start Date. When absent, defaults to `primaryEligible`.
     * Enrichment / add-on categories should set false (or leave primaryEligible false).
     */
    establishesEnrollment?: boolean;
    /** @deprecated Prefer programRequirement */
    requiresProgram?: boolean;
    /** @deprecated Prefer roomRequirement */
    requiresRoom?: boolean;
    allowsOverlap?: boolean;
    programRequirement?: RequirementMode;
    roomRequirement?: RequirementMode;
    eligibleSpaceMode?: EligibleSpaceMode;
    /** When eligibleSpaceMode = selected */
    eligibleRoomIds?: string[];
    /** Empty or absent ⇒ org-wide availability. */
    locationIds?: string[];
    /** Finer financial relationship; derives billing_participation column on write. */
    billingExpectation?: BillingExpectation;
    /** Catalog-category keys this Category may bill against (behavior-only). */
    eligibleCatalogCategories?: string[];
};

function asRequirement(raw: unknown, fallbackRequired: boolean): RequirementMode {
    if (raw === "required" || raw === "optional" || raw === "not_used") return raw;
    return fallbackRequired ? "required" : "optional";
}

function asBillingExpectation(raw: unknown, fallback: BillingExpectation): BillingExpectation {
    if (raw === "none" || raw === "optional" || raw === "expected" || raw === "funding_eligible") return raw;
    return fallback;
}

/** Derives the `billing_participation` column value from the richer behavior field. */
export function billingParticipationFromExpectation(expectation: BillingExpectation): "none" | "eligible" {
    return expectation === "none" ? "none" : "eligible";
}

export function readAssignmentTypeBehavior(raw: unknown): AssignmentTypeBehavior {
    if (!raw || typeof raw !== "object") return {};
    const bag = raw as Record<string, unknown>;
    const locationIds = Array.isArray(bag.locationIds)
        ? (bag.locationIds as unknown[]).map(String).filter(Boolean)
        : undefined;
    const eligibleRoomIds = Array.isArray(bag.eligibleRoomIds)
        ? (bag.eligibleRoomIds as unknown[]).map(String).filter(Boolean)
        : undefined;
    const requiresProgram = bag.requiresProgram === true;
    const requiresRoom = bag.requiresRoom === true;
    const programRequirement = asRequirement(bag.programRequirement, requiresProgram);
    const roomRequirement = asRequirement(bag.roomRequirement, requiresRoom);
    const eligibleSpaceMode =
        bag.eligibleSpaceMode === "selected" || bag.eligibleSpaceMode === "program_match"
            ? bag.eligibleSpaceMode
            : "any";
    const eligibleCatalogCategories = Array.isArray(bag.eligibleCatalogCategories)
        ? (bag.eligibleCatalogCategories as unknown[]).map(String).filter(Boolean)
        : undefined;
    return {
        description: typeof bag.description === "string" ? bag.description : null,
        primaryEligible: bag.primaryEligible === true,
        establishesEnrollment:
            bag.establishesEnrollment === true
                ? true
                : bag.establishesEnrollment === false
                  ? false
                  : undefined,
        requiresProgram: programRequirement === "required",
        requiresRoom: roomRequirement === "required",
        allowsOverlap: bag.allowsOverlap === true,
        programRequirement,
        roomRequirement,
        eligibleSpaceMode,
        eligibleRoomIds,
        locationIds,
        billingExpectation: asBillingExpectation(bag.billingExpectation, "none"),
        eligibleCatalogCategories,
    };
}

/** Whether committed rows of this category may define child Enrollment Start Date. */
export function assignmentTypeEstablishesEnrollment(behavior: AssignmentTypeBehavior): boolean {
    if (behavior.establishesEnrollment === true) return true;
    if (behavior.establishesEnrollment === false) return false;
    return behavior.primaryEligible === true;
}

/** Normalize for write — keep legacy booleans in sync with tri-state. */
export function writeAssignmentTypeBehavior(behavior: AssignmentTypeBehavior): AssignmentTypeBehavior {
    const programRequirement = behavior.programRequirement ?? (behavior.requiresProgram ? "required" : "optional");
    const roomRequirement = behavior.roomRequirement ?? (behavior.requiresRoom ? "required" : "optional");
    return {
        description: behavior.description ?? null,
        primaryEligible: behavior.primaryEligible === true,
        establishesEnrollment: assignmentTypeEstablishesEnrollment(behavior),
        allowsOverlap: behavior.allowsOverlap === true,
        programRequirement,
        roomRequirement,
        requiresProgram: programRequirement === "required",
        requiresRoom: roomRequirement === "required",
        eligibleSpaceMode: behavior.eligibleSpaceMode ?? "any",
        eligibleRoomIds: behavior.eligibleRoomIds ?? [],
        locationIds: behavior.locationIds ?? [],
        billingExpectation: behavior.billingExpectation ?? "none",
        eligibleCatalogCategories: behavior.eligibleCatalogCategories ?? [],
    };
}

/** DB-checked enum (`operational_assignment_types.visual_tone`) — no free text. */
export type AssignmentTypeVisualTone = "neutral" | "info" | "success" | "warning" | "accent";

/**
 * Distinct default tones for the platform's example vocabulary (seeded by
 * `operational_assignment_type_defaults_v1`). Matched by normalized LABEL (not key —
 * created categories get a unique suffixed key via `slugAssignmentTypeKey`, so a
 * label match is the only reliable way to recognize "this is a Before Care-shaped
 * category" from the create form). Five enum values cannot give seven categories
 * fully unique tones; After Care/Recurring Service and Enrichment/Therapy share by
 * design here, chosen so adjacent rows in the Categories list never match.
 */
export const ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL: Record<string, AssignmentTypeVisualTone> = {
    "primary classroom": "accent",
    "before care": "info",
    "after care": "success",
    "enrichment": "warning",
    "transportation": "neutral",
    "therapy": "warning",
    "recurring service": "success",
};

export function defaultVisualToneForAssignmentTypeLabel(label: string): AssignmentTypeVisualTone | null {
    const key = label.trim().toLowerCase();
    return ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL[key] ?? null;
}

export function slugAssignmentTypeKey(label: string): string {
    const base =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48) || "assignment_purpose";
    return `${base}_${Date.now().toString(36).slice(-5)}`.replace(/[^a-z0-9_]/g, "").slice(0, 63);
}

/** Filter operational room options by Category eligibility. */
export function filterRoomsForPurposeBehavior<T extends { roomId: string; programCategoryId?: string | null }>(
    rooms: T[],
    behavior: AssignmentTypeBehavior,
    programCategoryId: string | null | undefined
): T[] {
    const roomReq = behavior.roomRequirement ?? (behavior.requiresRoom ? "required" : "optional");
    if (roomReq === "not_used") return [];
    const mode = behavior.eligibleSpaceMode ?? "any";
    let scoped = rooms;
    if (mode === "selected") {
        const allow = new Set(behavior.eligibleRoomIds ?? []);
        if (allow.size > 0) scoped = scoped.filter((r) => allow.has(r.roomId));
    } else if (mode === "program_match" && programCategoryId) {
        scoped = scoped.filter((r) => !r.programCategoryId || r.programCategoryId === programCategoryId);
    }
    return scoped;
}

/**
 * Scope rooms for the Assignment picker when operators may override ineligible rooms.
 *
 * Hard-removes only `not_used` Categories and explicit `selected` allow-lists.
 * Does **not** drop `program_match` misses — age/program fit is owned by
 * `placement.room_fit` classification so ineligible rooms stay visible for override.
 */
export function scopeRoomsForAssignmentPicker<T extends { roomId: string; programCategoryId?: string | null }>(
    rooms: T[],
    behavior: AssignmentTypeBehavior,
): T[] {
    const roomReq = behavior.roomRequirement ?? (behavior.requiresRoom ? "required" : "optional");
    if (roomReq === "not_used") return [];
    const mode = behavior.eligibleSpaceMode ?? "any";
    if (mode === "selected") {
        const allow = new Set(behavior.eligibleRoomIds ?? []);
        if (allow.size > 0) return rooms.filter((r) => allow.has(r.roomId));
    }
    return rooms;
}
