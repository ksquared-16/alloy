/**
 * Platform-defined section catalog for the Surface Composer "Add Section" flow.
 *
 * Sections are semantic, platform-owned identities — never freeform strings. Preserving
 * the semantic key lets future BOS/AI understand what a section MEANS (an Emergency
 * Contact is an emergency contact everywhere), not just how it looks. The one escape
 * hatch is `custom_section`, which the operator names but which still carries a stable
 * `custom` semantic so downstream systems can treat it as operator-defined.
 *
 * These map to optional evidence groups already declared on the registered surface spec
 * (`recursiveSurfaceProofs.ts`); the catalog is presentation/authoring metadata only and
 * introduces no new storage.
 */

export type PlatformSectionSemantic =
    | "emergency_contact"
    | "authorized_pickup"
    | "billing_contact"
    | "emergency_medical"
    | "custom_notes"
    | "medical"
    | "documents"
    | "pickup"
    | "communications"
    | "notes"
    | "nickname"
    | "custom";

export type PlatformSectionOption = {
    /** Group key on the surface spec this section enables. */
    groupKey: string;
    /** Stable semantic identity (survives relabeling; for BOS/AI understanding). */
    semantic: PlatformSectionSemantic;
    label: string;
    description: string;
    /** True for the operator-named escape hatch. */
    custom?: boolean;
};

/** Platform section options offered per surface, in presentation order. */
const SECTION_CATALOG: Record<string, readonly PlatformSectionOption[]> = {
    household_surface: [
        {
            groupKey: "emergency_contacts",
            semantic: "emergency_contact",
            label: "Emergency Contact",
            description: "Who to reach in an emergency.",
        },
        {
            groupKey: "authorized_pickups",
            semantic: "authorized_pickup",
            label: "Authorized Pickup",
            description: "People allowed to pick up children.",
        },
        {
            groupKey: "billing_contact",
            semantic: "billing_contact",
            label: "Billing Contact",
            description: "Who receives billing communications.",
        },
        {
            groupKey: "emergency_medical",
            semantic: "emergency_medical",
            label: "Emergency Medical",
            description: "Physician and emergency medical details.",
        },
        {
            groupKey: "custom_notes",
            semantic: "custom_notes",
            label: "Custom Notes",
            description: "Freeform notes for this household.",
        },
    ],
};

const EVIDENCE_SECTION_CATALOG: Record<string, readonly PlatformSectionOption[]> = {
    children_surface: [
        {
            groupKey: "documents",
            semantic: "documents",
            label: "Documents",
            description: "Uploaded and missing documents.",
        },
        {
            groupKey: "medical",
            semantic: "medical",
            label: "Medical",
            description: "Medical information on file.",
        },
        {
            groupKey: "emergency_contacts",
            semantic: "emergency_contact",
            label: "Emergency Contacts",
            description: "Emergency contacts for this child.",
        },
        {
            groupKey: "pickup",
            semantic: "pickup",
            label: "Pickup",
            description: "Pickup authorization instructions.",
        },
        {
            groupKey: "communications",
            semantic: "communications",
            label: "Communications",
            description: "Communications history.",
        },
        {
            groupKey: "notes",
            semantic: "notes",
            label: "Notes",
            description: "Operator notes.",
        },
        {
            groupKey: "nickname",
            semantic: "nickname",
            label: "Nickname",
            description: "Preferred nickname.",
        },
    ],
};

/** The custom-section escape hatch (available on every surface). */
export const CUSTOM_SECTION_OPTION: PlatformSectionOption = {
    groupKey: "custom_notes",
    semantic: "custom",
    label: "Custom Section",
    description: "Name your own section.",
    custom: true,
};

/** Platform section options for a surface (excluding the custom escape hatch). */
export function platformSectionOptions(surfaceId: string): readonly PlatformSectionOption[] {
    return SECTION_CATALOG[surfaceId] ?? [];
}

/** Evidence section options for a nested evidence surface. */
export function evidenceSectionOptions(surfaceId: string): readonly PlatformSectionOption[] {
    return EVIDENCE_SECTION_CATALOG[surfaceId] ?? [];
}

/** Resolve the semantic identity for a group key (for persistence / BOS understanding). */
export function sectionSemanticForGroup(surfaceId: string, groupKey: string): PlatformSectionSemantic | null {
    const fromOperational = platformSectionOptions(surfaceId).find((o) => o.groupKey === groupKey);
    if (fromOperational) return fromOperational.semantic;
    return evidenceSectionOptions(surfaceId).find((o) => o.groupKey === groupKey)?.semantic ?? null;
}
