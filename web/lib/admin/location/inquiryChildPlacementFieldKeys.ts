/** Canonical inquiry_child OCM field keys for location → program → room cascade. */
export const INQUIRY_CHILD_PLACEMENT_OCM_KEYS = {
    location_id: "location_id",
    desired_program_type: "desired_program_type",
    desired_program_category_id: "desired_program_category_id",
    program_room_cohort_key: "program_room_cohort_key",
} as const;

/** create_lead execute payload keys for the same cascade. */
export const INQUIRY_CHILD_PLACEMENT_CREATE_LEAD_KEYS = {
    location_id: "child_location_id",
    desired_program_type: "child_program",
    program_room_cohort_key: "child_program_room_cohort_key",
} as const;

export type InquiryChildPlacementRole = "location" | "program" | "room";

const PLACEMENT_ROLE_BY_FIELD_KEY: Record<string, InquiryChildPlacementRole> = {
    location_id: "location",
    child_location_id: "location",
    desired_program_type: "program",
    desired_program_category_id: "program",
    child_program: "program",
    program: "program",
    program_room_cohort_key: "room",
    child_program_room_cohort_key: "room",
};

const PLACEMENT_ALIASES: Record<InquiryChildPlacementRole, readonly string[]> = {
    location: ["location_id", "child_location_id"],
    program: ["desired_program_category_id", "desired_program_type", "child_program", "program"],
    room: ["program_room_cohort_key", "child_program_room_cohort_key"],
};

export function inquiryChildPlacementRoleForFieldKey(fieldKey: string): InquiryChildPlacementRole | null {
    return PLACEMENT_ROLE_BY_FIELD_KEY[fieldKey.trim()] ?? null;
}

export function isInquiryChildPlacementFieldKey(fieldKey: string): boolean {
    return inquiryChildPlacementRoleForFieldKey(fieldKey) != null;
}

export function placementFieldKeysInValues(values: Record<string, string>): {
    locationKey: string | null;
    programKey: string | null;
    roomKey: string | null;
} {
    const keys = Object.keys(values);
    const find = (role: InquiryChildPlacementRole) =>
        PLACEMENT_ALIASES[role].find((k) => keys.includes(k)) ?? null;
    return {
        locationKey: find("location"),
        programKey: find("program"),
        roomKey: find("room"),
    };
}

/** Applies cascade reset rules when a placement field changes. */
export function applyInquiryChildPlacementFieldChange(
    fieldKey: string,
    value: string,
    current: Record<string, string>
): Record<string, string> {
    const role = inquiryChildPlacementRoleForFieldKey(fieldKey);
    if (!role) return { ...current, [fieldKey]: value };

    const next: Record<string, string> = { ...current, [fieldKey]: value };
    const keysInForm = new Set(Object.keys(current));

    if (role === "location") {
        for (const k of PLACEMENT_ALIASES.program) {
            if (keysInForm.has(k)) next[k] = "";
        }
        for (const k of PLACEMENT_ALIASES.room) {
            if (keysInForm.has(k)) next[k] = "";
        }
    } else if (role === "program") {
        for (const k of PLACEMENT_ALIASES.room) {
            if (keysInForm.has(k)) next[k] = "";
        }
    }

    return next;
}
