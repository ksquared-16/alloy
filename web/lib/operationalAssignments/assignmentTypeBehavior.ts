/**
 * Extended Assignment Category behavior stored in `operational_assignment_types.default_behavior`.
 * Internal key remains assignment_type; operator language is Assignment Category.
 */
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import { spaceEligibleForUse, type UseForSpace } from "@/lib/location/spaceUse";

export type RequirementMode = "required" | "optional" | "not_used";

export type EligibleSpaceMode = "any" | "selected" | "program_match";

/**
 * Finer-grained financial relationship than the `billing_participation` column
 * (which only stores none|eligible). Stored in behavior JSON — no schema change.
 * Derives the column value: none → none, anything else → eligible.
 */
export type BillingExpectation = "none" | "optional" | "expected" | "funding_eligible";

export type AssignmentTypeBehavior = {
    description?: string | null;
    primaryEligible?: boolean;
    /** @deprecated Prefer programRequirement */
    requiresProgram?: boolean;
    /** @deprecated Prefer roomRequirement */
    requiresRoom?: boolean;
    allowsOverlap?: boolean;
    programRequirement?: RequirementMode;
    roomRequirement?: RequirementMode;
    /**
     * Retired (V7 Q-B): a space's eligibility is its own Uses (`spaceEligibleForUse`), enforced on the
     * server. These keys are read and written back unchanged so stored history survives a save; no
     * picker or writer consults them.
     */
    eligibleSpaceMode?: EligibleSpaceMode;
    /** Retired with `eligibleSpaceMode` — stored history only. */
    eligibleRoomIds?: string[];
    /** Empty or absent ⇒ org-wide availability. */
    locationIds?: string[];
    /** Finer financial relationship; derives billing_participation column on write. */
    billingExpectation?: BillingExpectation;
    /**
     * This category, when configured as a use of a classroom, makes that classroom a homeroom for the
     * children assigned there (V7-03, Director H-ID Option A). Child categories only. Never inferred
     * from the category's name — an operator sets it.
     */
    providesHomeroom?: boolean;
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
    return {
        description: typeof bag.description === "string" ? bag.description : null,
        primaryEligible: bag.primaryEligible === true,
        requiresProgram: programRequirement === "required",
        requiresRoom: roomRequirement === "required",
        allowsOverlap: bag.allowsOverlap === true,
        programRequirement,
        roomRequirement,
        eligibleSpaceMode,
        eligibleRoomIds,
        locationIds,
        billingExpectation: asBillingExpectation(bag.billingExpectation, "none"),
        providesHomeroom: bag.providesHomeroom === true,
    };
}

/** Normalize for write — keep legacy booleans in sync with tri-state. */
export function writeAssignmentTypeBehavior(behavior: AssignmentTypeBehavior): AssignmentTypeBehavior {
    const programRequirement = behavior.programRequirement ?? (behavior.requiresProgram ? "required" : "optional");
    const roomRequirement = behavior.roomRequirement ?? (behavior.requiresRoom ? "required" : "optional");
    return {
        description: behavior.description ?? null,
        primaryEligible: behavior.primaryEligible === true,
        allowsOverlap: behavior.allowsOverlap === true,
        programRequirement,
        roomRequirement,
        requiresProgram: programRequirement === "required",
        requiresRoom: roomRequirement === "required",
        eligibleSpaceMode: behavior.eligibleSpaceMode ?? "any",
        eligibleRoomIds: behavior.eligibleRoomIds ?? [],
        locationIds: behavior.locationIds ?? [],
        billingExpectation: behavior.billingExpectation ?? "none",
        providesHomeroom: behavior.providesHomeroom === true,
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

/**
 * Scope rooms for the Assignment picker when operators may override ineligible rooms.
 *
 * The space's own Uses decide (the same rule the server enforces); a Category that uses no space
 * offers none. A Category's old room list no longer narrows the picker (V7 Q-B) — the server never
 * applied it. Age/program fit is owned by `placement.room_fit`, so ineligible rooms stay visible for
 * override.
 */
export function scopeRoomsForAssignmentPicker<
    T extends { roomId: string; programCategoryId?: string | null; unitRole?: CanonicalUnitRole; spaceUses?: readonly string[] | null },
>(
    rooms: T[],
    behavior: AssignmentTypeBehavior,
    /** The use being scheduled: when given, the space's own configuration decides first (V7-02a). */
    use?: UseForSpace,
): T[] {
    if (use) {
        rooms = rooms.filter(
            (r) => !r.unitRole || spaceEligibleForUse({ unitRole: r.unitRole, spaceUses: r.spaceUses ?? null }, use).ok,
        );
    }
    const roomReq = behavior.roomRequirement ?? (behavior.requiresRoom ? "required" : "optional");
    if (roomReq === "not_used") return [];
    return rooms;
}

/**
 * The rooms one choice may apply to SEVERAL assignments — the Roster's bulk pickers.
 *
 * Active rooms only, then {@link scopeRoomsForAssignmentPicker} once per selected row's use: a room
 * is offered only if every selected row could use it — the space's configured uses, and a Category
 * that uses no space offers none, exactly as in the editor.
 */
export function roomsForEveryCategory<
    T extends { roomId: string; active?: boolean; programCategoryId?: string | null; unitRole?: CanonicalUnitRole; spaceUses?: readonly string[] | null },
>(rooms: T[], uses: ReadonlyArray<{ behavior: AssignmentTypeBehavior; use: UseForSpace }>): T[] {
    return uses.reduce(
        (offered, u) => scopeRoomsForAssignmentPicker(offered, u.behavior, u.use),
        rooms.filter((r) => r.active !== false),
    );
}
