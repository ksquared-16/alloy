/**
 * FC-2 — Platform field resolution manifest.
 *
 * Machine-readable contract for canonical layout refKeys: labels, storage class,
 * runtime phase, layout context, and layout-config picker eligibility.
 * Consumed by field-catalog API and fieldCatalog picker filtering.
 */

import { INQUIRY_CHILD_NATIVE_FIELD_MANIFEST } from "@/lib/fields/inquiryChildFieldRegistry";
import { isChildcareCatalogRefKey } from "./childcareLayoutFieldCatalog";
import {
    CANONICAL_LAYOUT_REFKEY_NAMESPACES,
    normalizeRefKeyOnRead,
    type CanonicalLayoutRefKeyNamespace,
} from "./layoutRefKeyAliases";

export type PlatformFieldStorageClass =
    | "native_ocm"
    | "native_entity"
    | "metadata"
    | "computed"
    | "relationship"
    | "reference";

/** Runtime resolver availability phase (not picker visibility). */
export type PlatformFieldRuntimePhase = "now" | "fc3" | "fc5";

export type PlatformFieldPickerGroup =
    | "opportunity"
    | "person"
    | "child"
    | "inquiry_child"
    | "location"
    | "customer";

export type PlatformFieldLayoutContext = "case" | "repeater" | "relationship" | "reference";

export type LayoutPickerAnchorEntity = "opportunities" | "person" | "child" | "placement_candidate";

export type PlatformFieldManifestEntry = {
    refKey: string;
    label: string;
    fieldType: string;
    storageClass: PlatformFieldStorageClass;
    /** Human-readable storage hint for FC-3 mappers. */
    storagePath: string;
    runtimePhase: PlatformFieldRuntimePhase;
    layoutContexts: PlatformFieldLayoutContext[];
    pickerGroup: PlatformFieldPickerGroup;
    /** Canonical refKey safe for new layout writes when anchor matches. */
    pickerEligible: boolean;
    pickerAnchors: LayoutPickerAnchorEntity[];
};

/** Mis-grained / deprecated refKeys — never emitted by layout-config picker. */
export const BLOCKED_LAYOUT_PICKER_REF_KEYS = new Set<string>([
    "child.program",
    "child.desired_start_date",
    "child.status",
    "child.location",
    "child.room",
    "child.schedule",
    "inquiry_child.program",
    "inquiry_child.schedule",
    "opportunity.location",
    "child.location",
]);

const LEAD_PRIMARY_CONTACT_PROJECTION_MANIFEST: PlatformFieldManifestEntry[] = [
    entry(
        "person.primary_contact_name",
        "Primary contact name",
        "text",
        "relationship",
        "opportunities.primary_person_id → persons.display_name",
        "now",
        ["case", "relationship"],
        ["opportunities"],
    ),
    entry(
        "person.primary_email",
        "Primary contact email",
        "text",
        "relationship",
        "opportunities.primary_person_id → persons.email",
        "now",
        ["case", "relationship"],
        ["opportunities"],
    ),
    entry(
        "person.primary_phone",
        "Primary contact phone",
        "phone",
        "relationship",
        "opportunities.primary_person_id → persons.phone",
        "now",
        ["case", "relationship"],
        ["opportunities"],
    ),
];

const OPPORTUNITY_MANIFEST: PlatformFieldManifestEntry[] = [
    entry("opportunity.status_key", "Status", "status", "native_entity", "opportunities.status_key", "now", ["case"], ["opportunities"]),
    entry("opportunity.source", "Source", "text", "native_entity", "opportunities.source", "now", ["case"], ["opportunities"]),
    entry("opportunity.customer_notes", "Notes", "text", "native_entity", "opportunities.customer_notes", "now", ["case"], ["opportunities"]),
    entry("opportunity.job_date", "Requested date", "date", "native_entity", "opportunities.job_date", "now", ["case"], ["opportunities"]),
    entry("opportunity.tour_date", "Tour date", "date", "metadata", "opportunities.metadata.tour_date", "now", ["case"], ["opportunities"]),
    entry("opportunity.channel", "Channel", "text", "metadata", "opportunities.metadata.channel", "now", ["case"], ["opportunities"]),
    entry("opportunity.campaign", "Campaign", "text", "metadata", "opportunities.metadata.campaign", "now", ["case"], ["opportunities"]),
    entry("opportunity.tour_status", "Tour status", "status", "metadata", "opportunities.metadata.tour_status", "now", ["case"], ["opportunities"]),
];

const PERSON_MANIFEST: PlatformFieldManifestEntry[] = [
    entry("person.phone", "Phone", "phone", "relationship", "primary_contact.phone", "fc3", ["case", "relationship"], ["opportunities", "person", "child"]),
    entry("person.email", "Email", "text", "relationship", "primary_contact.email", "fc3", ["case", "relationship"], ["opportunities", "person", "child"]),
    entry("person.first_name", "First name", "text", "relationship", "primary_contact.first_name", "fc3", ["relationship"], ["person"]),
    entry("person.last_name", "Last name", "text", "relationship", "primary_contact.last_name", "fc3", ["relationship"], ["person"]),
    entry("person.secondary_contact_name", "Secondary contact name", "text", "relationship", "secondary_contact.display_name", "fc3", ["case"], ["opportunities", "person"]),
    entry("person.secondary_phone", "Secondary phone", "phone", "relationship", "secondary_contact.phone", "fc3", ["case"], ["opportunities", "person"]),
];

const CHILD_MANIFEST: PlatformFieldManifestEntry[] = [
    entry("child.first_name", "First name", "text", "native_entity", "customer_members.first_name", "fc5", ["repeater"], ["child"], false),
    entry("child.last_name", "Last name", "text", "native_entity", "customer_members.last_name", "fc5", ["repeater"], ["child"], false),
    entry("child.full_name", "Full name", "text", "computed", "customer_members.first_name + last_name", "fc5", ["repeater"], ["child"]),
    entry("child.name", "Child name", "text", "computed", "customer_member.display_name", "fc5", ["repeater"], ["child"]),
    entry("child.date_of_birth", "Date of birth", "date", "native_entity", "customer_members.date_of_birth", "fc5", ["repeater"], ["child"], false),
    entry("child.age_band", "Age band", "text", "computed", "customer_member.age_band", "fc5", ["repeater"], ["child"], false),
];

const INQUIRY_CHILD_MANIFEST: PlatformFieldManifestEntry[] = INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.map((row) =>
    entry(
        `inquiry_child.${row.field_key}`,
        row.label,
        row.field_type,
        "native_ocm",
        `opportunity_customer_members.${row.field_key}`,
        "now",
        ["repeater"],
        ["opportunities", "child"],
    ),
);

/** Declared for FC-3 — hidden from picker until resolvers land. */
const LOCATION_MANIFEST: PlatformFieldManifestEntry[] = [
    entry("location.name", "Location name", "text", "reference", "sites.name", "fc3", ["reference"], [], false),
    entry("location.id", "Location ID", "text", "reference", "sites.id", "fc3", ["reference"], [], false),
];

const CUSTOMER_MANIFEST: PlatformFieldManifestEntry[] = [
    entry("customer.name", "Customer name", "text", "reference", "customers.display_name", "fc3", ["reference"], [], false),
];

function entry(
    refKey: string,
    label: string,
    fieldType: string,
    storageClass: PlatformFieldStorageClass,
    storagePath: string,
    runtimePhase: PlatformFieldRuntimePhase,
    layoutContexts: PlatformFieldLayoutContext[],
    pickerAnchors: LayoutPickerAnchorEntity[],
    pickerEligible = true,
): PlatformFieldManifestEntry {
    const dot = refKey.indexOf(".");
    const pickerGroup = (dot === -1 ? refKey : refKey.slice(0, dot)) as PlatformFieldPickerGroup;
    return {
        refKey,
        label,
        fieldType,
        storageClass,
        storagePath,
        runtimePhase,
        layoutContexts,
        pickerGroup,
        pickerEligible,
        pickerAnchors,
    };
}

export const PLATFORM_FIELD_MANIFEST: PlatformFieldManifestEntry[] = [
    ...OPPORTUNITY_MANIFEST,
    ...PERSON_MANIFEST,
    ...LEAD_PRIMARY_CONTACT_PROJECTION_MANIFEST,
    ...CHILD_MANIFEST,
    ...INQUIRY_CHILD_MANIFEST,
    ...LOCATION_MANIFEST,
    ...CUSTOMER_MANIFEST,
];

export const PLATFORM_FIELD_MANIFEST_BY_REFKEY: ReadonlyMap<string, PlatformFieldManifestEntry> = new Map(
    PLATFORM_FIELD_MANIFEST.map((e) => [e.refKey, e]),
);

export const OPTIONAL_PERSON_IDENTITY_SYSTEM_DEFS = [
    { field_key: "first_name", note: "Registry-backed; layout uses relationship binding (FC-3)." },
    { field_key: "last_name", note: "Registry-backed; layout uses relationship binding (FC-3)." },
    { field_key: "display_name", note: "No single person.primary_contact_name registry row — computed in FC-3." },
] as const;

export function isBlockedLayoutPickerRefKey(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return true;
    const normalized = normalizeRefKeyOnRead(trimmed);
    if (normalized.startsWith("child_inquiry.")) return true;
    if (trimmed.startsWith("child_inquiry.")) return true;
    return BLOCKED_LAYOUT_PICKER_REF_KEYS.has(normalized) || BLOCKED_LAYOUT_PICKER_REF_KEYS.has(trimmed);
}

export function isCanonicalLayoutRefKeyNamespace(entityKey: string): entityKey is CanonicalLayoutRefKeyNamespace {
    return (CANONICAL_LAYOUT_REFKEY_NAMESPACES as readonly string[]).includes(entityKey);
}

export function manifestEntryForRefKey(refKey: string): PlatformFieldManifestEntry | undefined {
    return PLATFORM_FIELD_MANIFEST_BY_REFKEY.get(normalizeRefKeyOnRead(refKey));
}

export function isRefKeyPickerEligible(
    refKey: string,
    anchorEntity: LayoutPickerAnchorEntity = "opportunities",
): boolean {
    if (isBlockedLayoutPickerRefKey(refKey)) return false;
    if (anchorEntity === "opportunities" || anchorEntity === "person" || anchorEntity === "child") {
        return isChildcareCatalogRefKey(refKey, anchorEntity);
    }
    const entry = manifestEntryForRefKey(refKey);
    if (!entry?.pickerEligible) return false;
    return entry.pickerAnchors.includes(anchorEntity);
}

export function filterRefKeysForLayoutPicker(
    refKeys: string[],
    anchorEntity: LayoutPickerAnchorEntity = "opportunities",
): string[] {
    return refKeys.filter((k) => isRefKeyPickerEligible(k, anchorEntity));
}

export type CatalogFieldLike = { refKey: string; fieldKey?: string; fieldLabel?: string; fieldType?: string };

export function filterCatalogFieldsForLayoutPicker<T extends CatalogFieldLike>(
    fields: T[],
    anchorEntity: LayoutPickerAnchorEntity = "opportunities",
): T[] {
    return fields.filter((f) => isRefKeyPickerEligible(f.refKey, anchorEntity));
}

export type CatalogGroupLike = { entityKey: string; entityLabel: string; fields: CatalogFieldLike[] };

export function filterCatalogGroupsForLayoutPicker<T extends CatalogGroupLike>(
    groups: T[],
    anchorEntity: LayoutPickerAnchorEntity = "opportunities",
): T[] {
    return groups
        .map((g) => ({
            ...g,
            fields: filterCatalogFieldsForLayoutPicker(g.fields, anchorEntity),
        }))
        .filter((g) => g.fields.length > 0);
}

/** Optional location/customer groups — only when at least one field is picker-eligible. */
export function buildOptionalReferencePickerGroups(
    anchorEntity: LayoutPickerAnchorEntity = "opportunities",
): CatalogGroupLike[] {
    const groups: CatalogGroupLike[] = [];
    for (const [groupKey, label] of [
        ["location", "Location"],
        ["customer", "Customer"],
    ] as const) {
        const fields = PLATFORM_FIELD_MANIFEST.filter(
            (e) => e.pickerGroup === groupKey && isRefKeyPickerEligible(e.refKey, anchorEntity),
        ).map((e) => ({
            entityKey: groupKey,
            entityLabel: label,
            fieldKey: e.refKey.slice(groupKey.length + 1),
            fieldLabel: e.label,
            fieldType: e.fieldType,
            refKey: e.refKey,
        }));
        if (fields.length > 0) groups.push({ entityKey: groupKey, entityLabel: label, fields });
    }
    return groups;
}

export function allPickerEligibleRefKeys(anchorEntity: LayoutPickerAnchorEntity = "opportunities"): string[] {
    return PLATFORM_FIELD_MANIFEST.filter((e) => isRefKeyPickerEligible(e.refKey, anchorEntity)).map((e) => e.refKey);
}

/** Collect refKeys from catalog groups (for grep-style CI assertions). */
export function collectRefKeysFromCatalogGroups(groups: CatalogGroupLike[]): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.refKey));
}
