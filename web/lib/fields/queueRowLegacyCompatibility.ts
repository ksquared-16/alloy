/**
 * Legacy queue row refKey compatibility — explicit adapter for saved configurations
 * that reference keys not classified in the canonical provider catalog.
 *
 * Compatibility entries are accepted at publish/load but not offered in new pickers.
 * Canonical relationship and collection providers must not be duplicated here.
 *
 * @see docs/sprints/08_2026/field-platform-consumer-convergence.md
 */

export type LegacyQueueRowCompatibilityEntry = {
    refKey: string;
    /** Where the legacy ref originated before provider convergence. */
    originalSource: string;
    /** Canonical replacement when operators should migrate manually (not auto-migrated). */
    canonicalReplacement?: string;
    waitlistOnly?: boolean;
    /** Still resolvable through queue row runtime adapters. */
    resolves: boolean;
    /** Still accepted in published layout validation. */
    publishes: boolean;
    /** Shown in new operator pickers — always false for this list. */
    appearsInNewPickers: false;
    deprecationStatus: "legacy_compat" | "deprecated_alias";
};

/** RefKeys accepted for legacy saved configs only — not picker seeds. */
export const LEGACY_QUEUE_ROW_COMPATIBILITY_REFS = [
    "contact.first_name",
    "contact.last_name",
    "contact.email",
    "contact.phone",
    "person.date_of_birth",
    "person.role_label",
    "person.address_line",
] as const;

export const LEGACY_QUEUE_ROW_COMPATIBILITY_MATRIX: readonly LegacyQueueRowCompatibilityEntry[] = [
    {
        refKey: "contact.first_name",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG (contact.* namespace)",
        canonicalReplacement: "person.primary_contact_name",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "contact.last_name",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG (contact.* namespace)",
        canonicalReplacement: "person.primary_contact_name",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "contact.email",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG (contact.* namespace)",
        canonicalReplacement: "person.primary_email",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "contact.phone",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG (contact.* namespace)",
        canonicalReplacement: "person.primary_phone",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "person.date_of_birth",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "person.role_label",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG",
        canonicalReplacement: "person.role",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "legacy_compat",
    },
    {
        refKey: "person.address_line",
        originalSource: "compositionFieldAdapter QUEUE_FIELD_CATALOG",
        canonicalReplacement: "person.address_line1",
        resolves: true,
        publishes: true,
        appearsInNewPickers: false,
        deprecationStatus: "deprecated_alias",
    },
];

const LEGACY_SET = new Set<string>(LEGACY_QUEUE_ROW_COMPATIBILITY_REFS);

export function isLegacyQueueRowCompatibilityRefKey(refKey: string): boolean {
    return LEGACY_SET.has(refKey.trim());
}

export function legacyQueueRowCompatibilityEntry(refKey: string): LegacyQueueRowCompatibilityEntry | undefined {
    const trimmed = refKey.trim();
    return LEGACY_QUEUE_ROW_COMPATIBILITY_MATRIX.find((entry) => entry.refKey === trimmed);
}
