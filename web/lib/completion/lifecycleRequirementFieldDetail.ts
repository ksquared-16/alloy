/**
 * Operator-facing field detail nested under lifecycle requirement objects (Settings display).
 * Field-level rules are inherited from person/child capture — not editable on Lifecycle today.
 */

export type LifecycleRequirementFieldDetail = {
    /** Nested field labels (no field keys). */
    fields: readonly string[];
    /** Plain-language note for operators. */
    inheritsNote: string;
};

/** High-level requirement label → nested capture detail (display-only). */
export const LIFECYCLE_OBJECT_FIELD_DETAIL: Readonly<Record<string, LifecycleRequirementFieldDetail>> = {
    Person: {
        fields: ["First Name", "Last Name", "Email", "Phone"],
        inheritsNote: "Choose which person fields are required per stage — not a fixed bundle.",
    },
    Child: {
        fields: ["First Name", "Last Name", "Date of Birth", "Age Group"],
        inheritsNote: "Choose which child fields are required per stage on the inquiry.",
    },
    Program: {
        fields: ["Program Interest"],
        inheritsNote: "Usually captured on the child row (program or classroom interest).",
    },
    "Desired Schedule": {
        fields: ["Schedule Type"],
        inheritsNote: "Captured on each child row in the drawer.",
    },
    "Desired Start Date": {
        fields: ["Start Date"],
        inheritsNote: "Captured on each child row in the drawer.",
    },
    Classroom: {
        fields: ["Classroom or Room"],
        inheritsNote: "Placement target on the child before enrollment approval.",
    },
    Schedule: {
        fields: ["Schedule Type"],
        inheritsNote: "Enrollment schedule on each child.",
    },
    "Enrollment Start Date": {
        fields: ["Start Date"],
        inheritsNote: "Target start date on each child.",
    },
    "Start Date": {
        fields: ["Start Date"],
        inheritsNote: "Confirmed start on enrolled children.",
    },
    "Tour Date and Time": {
        fields: ["Tour Date", "Tour Time"],
        inheritsNote: "Captured when scheduling or confirming a tour.",
    },
    "Tour Outcome": {
        fields: ["Completed", "No-Show"],
        inheritsNote: "Recorded with the tour outcome action.",
    },
    "Enrollment Date": {
        fields: ["Enrollment Date"],
        inheritsNote: "Set when enrollment is approved.",
    },
    "Enrollment Packet Reviewed": {
        fields: ["Packet Status"],
        inheritsNote: "Tracked via forms and documents — not toggled on this page.",
    },
};

export function lifecycleRequirementFieldDetailForLabel(label: string): LifecycleRequirementFieldDetail | null {
    return LIFECYCLE_OBJECT_FIELD_DETAIL[label] ?? null;
}

/** Whether nested fields under this label can be toggled on Lifecycle Settings (none today). */
export function lifecycleRequirementFieldDetailEditable(_label: string): boolean {
    return false;
}
