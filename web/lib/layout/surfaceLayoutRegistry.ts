/**
 * Surface Layout Registry — Visual Layout Configuration Builder (Phase 1).
 *
 * Maps product surfaces (opportunity_drawer, …) to Layout V2 identity
 * (entity_type + surface + layout_key), closed vocabularies, and platform vs
 * layout ownership boundaries.
 *
 * Storage remains `entity_layouts.doc` — this module is code-level registry only.
 */

import type { EntityDrawerShellSlot } from "@/lib/admin/drawer/entityDrawerOperatingModel";
import type { ActionSurface } from "@/lib/admin/actions/types";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { GLOBAL_WIDGET_CATALOG, type LayoutCatalogGroup, type LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import {
    collectRefKeysFromLayoutDoc,
    validateRefKeyForWrite,
} from "@/lib/layout/layoutRefKeyAliases";
import {
    CHILDCARE_STARTER_FIELD_CATALOG,
    isChildcareCatalogRefKey,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS } from "@/lib/layout/runtime/resolveHouseholdAddressFieldValues";
import type { LayoutPickerAnchorEntity } from "@/lib/layout/platformFieldResolutionManifest";
import {
    contactRoleFieldRefs,
    LAYOUT_EDITOR_CONTACT_ROLES,
} from "@/lib/layout/layoutEditorContactRoles";
import {
    PERSON_ADDRESS_LAYOUT_REF_KEYS,
    CONTACT_ROLE_ADDRESS_LAYOUT_REF_KEYS,
} from "@/lib/layout/personDrawerAddressLayoutRefs";
import {
    LAYOUT_ITEM_KINDS,
    type LayoutDoc,
    type LayoutItemKind,
    type LayoutSurface,
} from "@/lib/layout/layoutV2";

/** Product surface keys — stable IDs for gallery + validation. */
export const SURFACE_LAYOUT_KEYS = [
    "opportunity_drawer",
    "person_drawer",
    "child_drawer",
    "queue_record",
    "communications_command_center",
    "pos_workspace",
] as const;

export type SurfaceLayoutKey = (typeof SURFACE_LAYOUT_KEYS)[number];

export type SurfaceLayoutAvailability = "enabled" | "coming_soon";

/** Layout-configurable zones inside a surface shell (not platform chrome). */
export const OPPORTUNITY_DRAWER_LAYOUT_ZONES = [
    "summary_strip",
    "main",
    "right_rail",
    "footer_actions",
] as const;

export type OpportunityDrawerLayoutZone = (typeof OPPORTUNITY_DRAWER_LAYOUT_ZONES)[number];

/**
 * Platform-owned drawer shell slots — layout docs MUST NOT declare sections or
 * top-level config that targets these areas.
 */
export const PLATFORM_SHELL_SLOTS = [
    "frame",
    "header",
    "lifecycle_rail_container",
    "summary_strip_container",
    "tabs_container",
    "bos",
    "actions",
    "actions_bar",
    "status",
    "close",
    "relationship_navigation",
    "performance_reveal",
    "reveal_gates",
] as const satisfies readonly (EntityDrawerShellSlot | "actions_bar" | "reveal_gates")[];

export type PlatformShellSlot = (typeof PLATFORM_SHELL_SLOTS)[number];

/** Reserved section keys that map to platform shell — reject if used as layout sections. */
export const PLATFORM_RESERVED_SECTION_KEYS: ReadonlySet<string> = new Set([
    ...PLATFORM_SHELL_SLOTS,
    "summary_strip_container",
    "tabs",
    "lifecycle_rail",
    "header_frame",
    "drawer_frame",
]);

/** Top-level doc.metadata keys that attempt platform shell control — reject on write. */
export const PLATFORM_SHELL_METADATA_KEYS: ReadonlySet<string> = new Set([
    "shell",
    "shell_config",
    "platform_shell",
    "header",
    "frame",
    "tabs",
    "lifecycle_rail",
    "bos",
    "reveal_gates",
    "summary_strip_container",
    "tabs_container",
    "lifecycle_rail_container",
    "actions_bar",
    "performance_reveal",
]);

/** Opportunity drawer — registered section keys (closed vocabulary). */
export const OPPORTUNITY_DRAWER_SECTION_KEYS = [
    "lead_summary",
    "children_enrollment",
    "household_contact",
    "lead_source",
    "notes_communication",
    "activity",
] as const;

export type OpportunityDrawerSectionKey = (typeof OPPORTUNITY_DRAWER_SECTION_KEYS)[number];

/** Person drawer — registered section keys (closed vocabulary). */
export const PERSON_DRAWER_SECTION_KEYS = [
    "person_summary",
    "household_relationships",
    "connected_children",
    "contact_information",
    "notes_communication",
    "recent_activity",
    "documents",
] as const;

export type PersonDrawerSectionKey = (typeof PERSON_DRAWER_SECTION_KEYS)[number];

/** Child drawer — registered section keys (closed vocabulary). */
export const CHILD_DRAWER_SECTION_KEYS = [
    "child_summary",
    "program_enrollment",
    "family_relationships",
    "schedule_attendance",
    "notes_communication",
    "recent_activity",
    "documents",
] as const;

export type ChildDrawerSectionKey = (typeof CHILD_DRAWER_SECTION_KEYS)[number];

/** Shared drawer layout zones — person/child reuse opportunity zone set. */
export const DRAWER_SURFACE_LAYOUT_ZONES = OPPORTUNITY_DRAWER_LAYOUT_ZONES;
export type DrawerSurfaceLayoutZone = OpportunityDrawerLayoutZone;

/** Default zone assignment per person section key. */
export const PERSON_DRAWER_SECTION_DEFAULT_ZONE: Readonly<
    Record<PersonDrawerSectionKey, DrawerSurfaceLayoutZone>
> = {
    person_summary: "summary_strip",
    household_relationships: "main",
    connected_children: "main",
    contact_information: "main",
    notes_communication: "right_rail",
    recent_activity: "right_rail",
    documents: "right_rail",
};

/** Default zone assignment per child section key. */
export const CHILD_DRAWER_SECTION_DEFAULT_ZONE: Readonly<
    Record<ChildDrawerSectionKey, DrawerSurfaceLayoutZone>
> = {
    child_summary: "summary_strip",
    program_enrollment: "main",
    family_relationships: "main",
    schedule_attendance: "main",
    notes_communication: "right_rail",
    recent_activity: "right_rail",
    documents: "right_rail",
};

/** Person drawer structural refKeys (related lists, blocks). */
export const PERSON_DRAWER_STRUCTURAL_REF_KEYS = [
    "household_children",
    "children",
    "family_adults",
    "contact_block",
    "layout_block",
    "_template",
    "_action_button",
] as const;

/** Child drawer structural refKeys (related lists, blocks). */
export const CHILD_DRAWER_STRUCTURAL_REF_KEYS = [
    "family_adults",
    "parents",
    "children",
    "contact_block",
    "layout_block",
    "_template",
    "_action_button",
] as const;

/** Action placement surfaces configurable via Settings → Actions for person/child drawers. */
export const PERSON_CHILD_DRAWER_ACTION_PLACEMENTS: readonly ActionSurface[] = [
    "record_header",
    "record_section",
    "right_rail",
];

/** Default zone assignment per section key (editor hint + validation of layoutZone overrides). */
export const OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE: Readonly<
    Record<OpportunityDrawerSectionKey, OpportunityDrawerLayoutZone>
> = {
    lead_summary: "summary_strip",
    children_enrollment: "main",
    household_contact: "main",
    lead_source: "main",
    notes_communication: "right_rail",
    activity: "right_rail",
};

/** Layout-owned contact repeater columns (Phase 5.14B). */
export const OPPORTUNITY_DRAWER_CONTACT_REPEATER_FIELD_REFS = [
    "person.role",
    "person.relationship",
    "person.is_primary",
    "person.display_name",
    "person.name",
    "person.contact_role",
    "person.is_payer",
    "person.secondary_email",
] as const;

/** Contact block role cards — all role-specific name/email/phone/address refs (Phase 5.15 certification). */
export const OPPORTUNITY_DRAWER_CONTACT_BLOCK_FIELD_REFS = LAYOUT_EDITOR_CONTACT_ROLES.flatMap((role) => {
    const refs = contactRoleFieldRefs(role);
    return [
        refs.name,
        refs.email,
        refs.phone,
        refs.addressLine1,
        refs.addressLine2,
        refs.city,
        refs.state,
        refs.postalCode,
    ];
});

/** Related-list / structural item refKeys allowed outside field catalog. */
export const OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS = [
    "children",
    "contacts",
    "household_members",
    "contact_block",
    "layout_block",
    "_template",
    "_action_button",
] as const;

/**
 * Custom container policy (Phase 5.13):
 * - Registered section keys: OPPORTUNITY_DRAWER_SECTION_KEYS
 * - Custom sections: custom_section_* / layout_section_* + layoutEditorCustom metadata + layoutZone
 * - System blocks: contact_block, children (related_list), layout_block (with block config)
 * - Custom blocks: custom_block_* / layout_block_* + layoutEditorBlockConfig + layoutEditorCustom
 * - Rejected: section_N, bare "block", platform shell keys, unknown field/widget/action refs
 */
export const OPPORTUNITY_DRAWER_CUSTOM_SECTION_POLICY = {
    allowedZones: OPPORTUNITY_DRAWER_LAYOUT_ZONES,
    sectionKeyPrefixes: ["custom_section_", "layout_section_"] as const,
    blockRefKeyPrefixes: ["custom_block_", "layout_block_"] as const,
    requiredSectionMetadata: ["layoutEditorCustom", "layoutZone"] as const,
    requiredBlockMetadata: ["layoutEditorCustom", "layoutEditorBlockConfig"] as const,
} as const;

/** Action placement surfaces configurable via Settings → Actions for this drawer. */
export const OPPORTUNITY_DRAWER_ACTION_PLACEMENTS: readonly ActionSurface[] = [
    "record_header",
    "record_section",
    "right_rail",
];

export type SurfaceLayoutIdentity = {
    entityType: string;
    surface: LayoutSurface;
    layoutKey: string;
};

export type SurfaceLayoutRegistryEntry = {
    surfaceKey: SurfaceLayoutKey;
    availability: SurfaceLayoutAvailability;
    label: string;
    description: string;
    identity: SurfaceLayoutIdentity | null;
    layoutZones: readonly string[];
    platformShellSlots: readonly PlatformShellSlot[];
    allowedSectionKeys: readonly string[];
    allowedSectionComponentTypes: readonly LayoutItemKind[];
    allowedFieldSources: readonly string[];
    allowedFieldRefKeys: readonly string[];
    allowedWidgetKeys: readonly string[];
    allowedActionPlacements: readonly ActionSurface[];
};

function drawerEligibleWidgets(): LayoutCatalogWidget[] {
    return GLOBAL_WIDGET_CATALOG.filter(
        (w) => !w.relevantSurfaces || w.relevantSurfaces.includes("drawer"),
    );
}

function childcareCatalogRefKeysForLayoutAnchor(anchor: LayoutPickerAnchorEntity): string[] {
    return CHILDCARE_STARTER_FIELD_CATALOG.filter(
        (entry) => entry.layoutAnchors.includes(anchor) && isChildcareCatalogRefKey(entry.refKey, anchor),
    ).map((entry) => entry.refKey);
}

function buildOpportunityDrawerAllowedFieldRefKeys(): readonly string[] {
    const baseline = collectRefKeysFromLayoutDoc(buildLeadDrawerDefaultDoc());
    const catalog = childcareCatalogRefKeysForLayoutAnchor("opportunities");
    const merged = new Set<string>([
        ...baseline,
        ...catalog,
        ...HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS,
        ...PERSON_ADDRESS_LAYOUT_REF_KEYS,
        ...CONTACT_ROLE_ADDRESS_LAYOUT_REF_KEYS,
        ...OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
        ...OPPORTUNITY_DRAWER_CONTACT_REPEATER_FIELD_REFS,
        ...OPPORTUNITY_DRAWER_CONTACT_BLOCK_FIELD_REFS,
    ]);
    return [...merged].sort();
}

const OPPORTUNITY_DRAWER_FIELD_REFS = buildOpportunityDrawerAllowedFieldRefKeys();

function buildPersonDrawerAllowedFieldRefKeys(): readonly string[] {
    const baseline = collectRefKeysFromLayoutDoc(buildPersonDrawerDefaultDoc());
    const catalog = childcareCatalogRefKeysForLayoutAnchor("person");
    const merged = new Set<string>([
        ...baseline,
        ...catalog,
        ...HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS,
        ...PERSON_ADDRESS_LAYOUT_REF_KEYS,
        ...OPPORTUNITY_DRAWER_CONTACT_BLOCK_FIELD_REFS,
        ...PERSON_DRAWER_STRUCTURAL_REF_KEYS,
    ]);
    return [...merged].sort();
}

function buildChildDrawerAllowedFieldRefKeys(): readonly string[] {
    const baseline = collectRefKeysFromLayoutDoc(buildChildDrawerDefaultDoc());
    const catalog = childcareCatalogRefKeysForLayoutAnchor("child");
    const merged = new Set<string>([
        ...baseline,
        ...catalog,
        ...HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS,
        ...CHILD_DRAWER_STRUCTURAL_REF_KEYS,
    ]);
    return [...merged].sort();
}

const PERSON_DRAWER_FIELD_REFS = buildPersonDrawerAllowedFieldRefKeys();
const CHILD_DRAWER_FIELD_REFS = buildChildDrawerAllowedFieldRefKeys();

/** Person drawer composition widget keys (summary strip + rail — not in global catalog). */
export const PERSON_DRAWER_COMPOSITION_WIDGET_KEYS = [
    "household_summary",
    "connected_children",
    "last_touch",
    "tasks",
    "related_people",
    "notes",
    "recent_communication",
    "activity",
    "activity_timeline",
    "documents",
] as const;

/** Child drawer composition widget keys (summary strip + rail — not in global catalog). */
export const CHILD_DRAWER_COMPOSITION_WIDGET_KEYS = [
    "program_enrollment",
    "family",
    "documents_requirements",
    "last_touch",
    "schedule_attendance",
    "notes",
    "recent_communication",
    "activity",
    "activity_timeline",
    "documents",
] as const;

function buildPersonDrawerAllowedWidgetKeys(): readonly string[] {
    const merged = new Set<string>([
        ...drawerEligibleWidgets().map((w) => w.widgetKey),
        ...PERSON_DRAWER_COMPOSITION_WIDGET_KEYS,
    ]);
    return [...merged].sort();
}

function buildChildDrawerAllowedWidgetKeys(): readonly string[] {
    const merged = new Set<string>([
        ...drawerEligibleWidgets().map((w) => w.widgetKey),
        ...CHILD_DRAWER_COMPOSITION_WIDGET_KEYS,
    ]);
    return [...merged].sort();
}

export const PERSON_DRAWER_SURFACE: SurfaceLayoutRegistryEntry = {
    surfaceKey: "person_drawer",
    availability: "enabled",
    label: "Person Drawer",
    description: "Parent / contact drawer — summary strip, household, children, and right rail.",
    identity: { entityType: "person", surface: "drawer", layoutKey: "default" },
    layoutZones: DRAWER_SURFACE_LAYOUT_ZONES,
    platformShellSlots: PLATFORM_SHELL_SLOTS,
    allowedSectionKeys: PERSON_DRAWER_SECTION_KEYS,
    allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
    allowedFieldSources: ["person", "customer", "location", "child", "opportunity"],
    allowedFieldRefKeys: PERSON_DRAWER_FIELD_REFS,
    allowedWidgetKeys: buildPersonDrawerAllowedWidgetKeys(),
    allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
};

export const CHILD_DRAWER_SURFACE: SurfaceLayoutRegistryEntry = {
    surfaceKey: "child_drawer",
    availability: "enabled",
    label: "Child Drawer",
    description: "Child profile drawer — enrollment, family, schedule, and right rail.",
    identity: { entityType: "child", surface: "drawer", layoutKey: "default" },
    layoutZones: DRAWER_SURFACE_LAYOUT_ZONES,
    platformShellSlots: PLATFORM_SHELL_SLOTS,
    allowedSectionKeys: CHILD_DRAWER_SECTION_KEYS,
    allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
    allowedFieldSources: ["child", "person", "inquiry_child", "customer", "location"],
    allowedFieldRefKeys: CHILD_DRAWER_FIELD_REFS,
    allowedWidgetKeys: buildChildDrawerAllowedWidgetKeys(),
    allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
};

export const OPPORTUNITY_DRAWER_SURFACE: SurfaceLayoutRegistryEntry = {
    surfaceKey: "opportunity_drawer",
    availability: "enabled",
    label: "Opportunity Drawer",
    description: "Lead / enrollment inquiry drawer — summary strip, main body, and right rail.",
    identity: { entityType: "opportunities", surface: "drawer", layoutKey: "default" },
    layoutZones: OPPORTUNITY_DRAWER_LAYOUT_ZONES,
    platformShellSlots: PLATFORM_SHELL_SLOTS,
    allowedSectionKeys: OPPORTUNITY_DRAWER_SECTION_KEYS,
    allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
    allowedFieldSources: ["opportunity", "person", "child", "inquiry_child", "customer", "location"],
    allowedFieldRefKeys: OPPORTUNITY_DRAWER_FIELD_REFS,
    allowedWidgetKeys: drawerEligibleWidgets().map((w) => w.widgetKey),
    allowedActionPlacements: OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
};

const COMING_SOON_SURFACES: Omit<SurfaceLayoutRegistryEntry, "allowedFieldRefKeys" | "allowedWidgetKeys">[] = [
    {
        surfaceKey: "queue_record",
        availability: "coming_soon",
        label: "Queue Record",
        description: "Work-unit queue row / card layout.",
        identity: { entityType: "opportunities", surface: "queue", layoutKey: "default" },
        layoutZones: [],
        platformShellSlots: [],
        allowedSectionKeys: [],
        allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
        allowedFieldSources: ["opportunity", "person", "child", "inquiry_child"],
        allowedActionPlacements: ["queue_row", "right_rail"],
    },
    {
        surfaceKey: "communications_command_center",
        availability: "coming_soon",
        label: "Communications Command Center",
        description: "Communications workspace operator surface.",
        identity: null,
        layoutZones: [],
        platformShellSlots: [],
        allowedSectionKeys: [],
        allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
        allowedFieldSources: [],
        allowedActionPlacements: [],
    },
    {
        surfaceKey: "pos_workspace",
        availability: "coming_soon",
        label: "POS / Processing Workspace",
        description: "Point-of-sale and processing workspace layout.",
        identity: null,
        layoutZones: [],
        platformShellSlots: [],
        allowedSectionKeys: [],
        allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
        allowedFieldSources: [],
        allowedActionPlacements: [],
    },
];

const COMING_SOON_ENTRIES: SurfaceLayoutRegistryEntry[] = COMING_SOON_SURFACES.map((s) => ({
    ...s,
    allowedFieldRefKeys: [],
    allowedWidgetKeys: [],
}));

export const SURFACE_LAYOUT_REGISTRY: Readonly<Record<SurfaceLayoutKey, SurfaceLayoutRegistryEntry>> = {
    opportunity_drawer: OPPORTUNITY_DRAWER_SURFACE,
    person_drawer: PERSON_DRAWER_SURFACE,
    child_drawer: CHILD_DRAWER_SURFACE,
    queue_record: COMING_SOON_ENTRIES.find((e) => e.surfaceKey === "queue_record")!,
    communications_command_center: COMING_SOON_ENTRIES.find((e) => e.surfaceKey === "communications_command_center")!,
    pos_workspace: COMING_SOON_ENTRIES.find((e) => e.surfaceKey === "pos_workspace")!,
};

export function isSurfaceLayoutKey(v: unknown): v is SurfaceLayoutKey {
    return typeof v === "string" && (SURFACE_LAYOUT_KEYS as readonly string[]).includes(v);
}

/** Resolve product surface key from a validated LayoutDoc identity. */
export function resolveSurfaceLayoutKeyFromDoc(doc: Pick<LayoutDoc, "entityType" | "surface">): SurfaceLayoutKey | null {
    if (doc.entityType === "opportunities" && doc.surface === "drawer") return "opportunity_drawer";
    if (doc.entityType === "person" && doc.surface === "drawer") return "person_drawer";
    if (doc.entityType === "child" && doc.surface === "drawer") return "child_drawer";
    if (doc.entityType === "opportunities" && doc.surface === "queue") return "queue_record";
    return null;
}

export function getSurfaceLayoutRegistryEntry(surfaceKey: SurfaceLayoutKey): SurfaceLayoutRegistryEntry {
    return SURFACE_LAYOUT_REGISTRY[surfaceKey];
}

export function listEnabledSurfaceLayouts(): SurfaceLayoutRegistryEntry[] {
    return SURFACE_LAYOUT_KEYS.map((k) => SURFACE_LAYOUT_REGISTRY[k]).filter((e) => e.availability === "enabled");
}

export function listComingSoonSurfaceLayouts(): SurfaceLayoutRegistryEntry[] {
    return SURFACE_LAYOUT_KEYS.map((k) => SURFACE_LAYOUT_REGISTRY[k]).filter((e) => e.availability === "coming_soon");
}

/** JSON-serializable registry payload for GET /api/admin/surface-layouts/registry */
export function buildSurfaceLayoutRegistryResponse() {
    const mapEntry = (entry: SurfaceLayoutRegistryEntry) => ({
        surface_key: entry.surfaceKey,
        availability: entry.availability,
        label: entry.label,
        description: entry.description,
        identity: entry.identity,
        layout_zones: entry.layoutZones,
        platform_shell_slots: entry.platformShellSlots,
        allowed_section_keys: entry.allowedSectionKeys,
        allowed_section_component_types: entry.allowedSectionComponentTypes,
        allowed_field_sources: entry.allowedFieldSources,
        allowed_field_ref_keys: entry.allowedFieldRefKeys,
        allowed_widget_keys: entry.allowedWidgetKeys,
        allowed_action_placements: entry.allowedActionPlacements,
        section_default_zones:
            entry.surfaceKey === "opportunity_drawer" ? OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE
            : entry.surfaceKey === "person_drawer" ? PERSON_DRAWER_SECTION_DEFAULT_ZONE
            : entry.surfaceKey === "child_drawer" ? CHILD_DRAWER_SECTION_DEFAULT_ZONE
            :   undefined,
    });

    return {
        contract_version: 1,
        enabled: listEnabledSurfaceLayouts().map(mapEntry),
        coming_soon: listComingSoonSurfaceLayouts().map(mapEntry),
    };
}

/** Field ref allow-list check for opportunity drawer surfaces. */
export function isAllowedOpportunityDrawerFieldRefKey(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    if ((OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(trimmed)) return true;
    if (OPPORTUNITY_DRAWER_FIELD_REFS.includes(trimmed)) return true;
    return false;
}

/** Field ref allow-list check for person drawer surfaces. */
export function isAllowedPersonDrawerFieldRefKey(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    if ((PERSON_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(trimmed)) return true;
    if (PERSON_DRAWER_FIELD_REFS.includes(trimmed)) return true;
    return false;
}

/** Field ref allow-list check for child drawer surfaces. */
export function isAllowedChildDrawerFieldRefKey(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    if ((CHILD_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(trimmed)) return true;
    if (CHILD_DRAWER_FIELD_REFS.includes(trimmed)) return true;
    return false;
}

export function isAllowedDrawerSurfaceFieldRefKey(surfaceKey: SurfaceLayoutKey, refKey: string): boolean {
    if (surfaceKey === "opportunity_drawer") return isAllowedOpportunityDrawerFieldRefKey(refKey);
    if (surfaceKey === "person_drawer") return isAllowedPersonDrawerFieldRefKey(refKey);
    if (surfaceKey === "child_drawer") return isAllowedChildDrawerFieldRefKey(refKey);
    return false;
}

/** Filter catalog groups to refs allowed on a drawer surface (validator-aligned picker). */
export function filterCatalogGroupsForDrawerSurface(
    surfaceKey: Extract<SurfaceLayoutKey, "opportunity_drawer" | "person_drawer" | "child_drawer">,
    groups: LayoutCatalogGroup[],
): LayoutCatalogGroup[] {
    return groups
        .map((group) => ({
            ...group,
            fields: group.fields.filter((field) => isAllowedDrawerSurfaceFieldRefKey(surfaceKey, field.refKey)),
        }))
        .filter((group) => group.fields.length > 0);
}

/** Widget key allow-list check for opportunity drawer surfaces. */
export function isAllowedOpportunityDrawerWidgetKey(widgetKey: string): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return OPPORTUNITY_DRAWER_SURFACE.allowedWidgetKeys.includes(trimmed);
}

/** Widget key allow-list check for person drawer surfaces. */
export function isAllowedPersonDrawerWidgetKey(widgetKey: string): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return PERSON_DRAWER_SURFACE.allowedWidgetKeys.includes(trimmed);
}

/** Widget key allow-list check for child drawer surfaces. */
export function isAllowedChildDrawerWidgetKey(widgetKey: string): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return CHILD_DRAWER_SURFACE.allowedWidgetKeys.includes(trimmed);
}

export function isOpportunityDrawerLayoutZone(v: unknown): v is OpportunityDrawerLayoutZone {
    return typeof v === "string" && (OPPORTUNITY_DRAWER_LAYOUT_ZONES as readonly string[]).includes(v);
}

export function isDrawerSurfaceLayoutZone(v: unknown): v is DrawerSurfaceLayoutZone {
    return isOpportunityDrawerLayoutZone(v);
}
