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
import { GLOBAL_WIDGET_CATALOG, type LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import {
    collectRefKeysFromLayoutDoc,
    validateRefKeyForWrite,
} from "@/lib/layout/layoutRefKeyAliases";
import { allPickerEligibleRefKeys } from "@/lib/layout/platformFieldResolutionManifest";
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

/** Related-list / structural item refKeys allowed outside field catalog. */
export const OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS = [
    "children",
    "contact_block",
    "layout_block",
    "_template",
    "_action_button",
] as const;

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

function buildOpportunityDrawerAllowedFieldRefKeys(): readonly string[] {
    const baseline = collectRefKeysFromLayoutDoc(buildLeadDrawerDefaultDoc());
    const picker = allPickerEligibleRefKeys("opportunities");
    const merged = new Set<string>([
        ...baseline,
        ...picker,
        ...OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
    ]);
    return [...merged].sort();
}

const OPPORTUNITY_DRAWER_FIELD_REFS = buildOpportunityDrawerAllowedFieldRefKeys();

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
        surfaceKey: "person_drawer",
        availability: "coming_soon",
        label: "Person Drawer",
        description: "Parent / contact drawer layout.",
        identity: { entityType: "person", surface: "drawer", layoutKey: "default" },
        layoutZones: ["summary_strip", "main", "right_rail", "footer_actions"],
        platformShellSlots: PLATFORM_SHELL_SLOTS,
        allowedSectionKeys: [],
        allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
        allowedFieldSources: ["person", "opportunity", "child"],
        allowedActionPlacements: ["record_header", "record_section", "right_rail"],
    },
    {
        surfaceKey: "child_drawer",
        availability: "coming_soon",
        label: "Child Drawer",
        description: "Child profile drawer layout.",
        identity: { entityType: "child", surface: "drawer", layoutKey: "default" },
        layoutZones: ["summary_strip", "main", "right_rail", "footer_actions"],
        platformShellSlots: PLATFORM_SHELL_SLOTS,
        allowedSectionKeys: [],
        allowedSectionComponentTypes: LAYOUT_ITEM_KINDS,
        allowedFieldSources: ["child", "person", "inquiry_child"],
        allowedActionPlacements: ["record_header", "record_section", "right_rail"],
    },
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
    person_drawer: COMING_SOON_ENTRIES.find((e) => e.surfaceKey === "person_drawer")!,
    child_drawer: COMING_SOON_ENTRIES.find((e) => e.surfaceKey === "child_drawer")!,
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
            entry.surfaceKey === "opportunity_drawer" ? OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE : undefined,
    });

    return {
        contract_version: 1,
        enabled: listEnabledSurfaceLayouts().map(mapEntry),
        coming_soon: listComingSoonSurfaceLayouts().map(mapEntry),
    };
}

/** Field ref allow-list check (includes deprecated-on-write guard). */
export function isAllowedOpportunityDrawerFieldRefKey(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    if ((OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(trimmed)) return true;
    if (OPPORTUNITY_DRAWER_FIELD_REFS.includes(trimmed)) return true;
    return false;
}

/** Widget key allow-list check for opportunity drawer surfaces. */
export function isAllowedOpportunityDrawerWidgetKey(widgetKey: string): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return OPPORTUNITY_DRAWER_SURFACE.allowedWidgetKeys.includes(trimmed);
}

export function isOpportunityDrawerLayoutZone(v: unknown): v is OpportunityDrawerLayoutZone {
    return typeof v === "string" && (OPPORTUNITY_DRAWER_LAYOUT_ZONES as readonly string[]).includes(v);
}
