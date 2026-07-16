import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

export const LOCATION_WORKSPACE_TABS = [
    { key: "overview", label: "Overview" },
    { key: "programs", label: "Programs" },
    { key: "rooms", label: "Rooms" },
    { key: "schedule", label: "Schedule" },
    { key: "tours", label: "Tours" },
    { key: "placement", label: "Placement" },
    { key: "access", label: "Access" },
] as const;

export const US_LOCATION_TIMEZONE_OPTIONS = [
    { label: "Eastern Time", value: "America/New_York" },
    { label: "Central Time", value: "America/Chicago" },
    { label: "Mountain Time", value: "America/Denver" },
    { label: "Arizona", value: "America/Phoenix" },
    { label: "Pacific Time", value: "America/Los_Angeles" },
    { label: "Alaska Time", value: "America/Anchorage" },
    { label: "Hawaii Time", value: "Pacific/Honolulu" },
] as const;

export type UsLocationTimezone = (typeof US_LOCATION_TIMEZONE_OPTIONS)[number]["value"];

export function normalizeUsLocationTimezone(value: unknown): UsLocationTimezone | null {
    const normalized = String(value ?? "").trim();
    return US_LOCATION_TIMEZONE_OPTIONS.some((option) => option.value === normalized) ?
            (normalized as UsLocationTimezone)
        :   null;
}

export type LocationWorkspaceTab = (typeof LOCATION_WORKSPACE_TABS)[number]["key"];

export type LocationWorkspaceSetupItem = {
    key: "general" | "programs" | "rooms" | "schedule" | "tours" | "placement" | "access";
    label: string;
    tab: LocationWorkspaceTab | "general";
    complete: boolean | null;
};

export type LocationWorkspaceAttentionItem = {
    key: string;
    grade: "fix" | "improve" | "good";
    /** What is wrong. */
    label: string;
    /** What happens because of it. */
    consequence?: string;
    /** Where the operator goes next. */
    nextLabel?: string;
    tab: LocationWorkspaceTab | "general";
};

export type LocationWorkspaceModel = {
    displayName: string;
    address: string | null;
    phone: string | null;
    timezone: string | null;
    activeRoomCount: number;
    activeProgramCount: number;
    configuredCapacity: number | null;
    roomsNeedingCapacity: number;
    setupPercent: number;
    setupComplete: boolean;
    setupItems: LocationWorkspaceSetupItem[];
    attention: LocationWorkspaceAttentionItem[];
    criticalCount: number;
    recommendedCount: number;
};

export type StaffingThreshold = {
    requiredStaff: number;
    maxChildren: number;
};

export type LocationProgramOperationalSummary = {
    id: string;
    label: string;
    roomCount: number;
    configuredCapacity: number | null;
    ageRange: string;
    isActive: boolean;
};

export function parseLocationWorkspaceTab(raw: string | string[] | null | undefined): LocationWorkspaceTab {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return LOCATION_WORKSPACE_TABS.some((tab) => tab.key === value) ? (value as LocationWorkspaceTab) : "overview";
}

/** Org-level Locations fleet landing — no location selected. */
export function locationsFleetHref(): string {
    return "/settings/locations";
}

export function locationWorkspaceHref(
    locationId: string,
    tab: LocationWorkspaceTab = "overview",
    itemId?: string | null,
): string {
    const params = new URLSearchParams();
    const normalizedLocationId = String(locationId ?? "").trim();
    const normalizedItemId = String(itemId ?? "").trim();
    if (normalizedLocationId) params.set("locationId", normalizedLocationId);
    if (tab !== "overview") params.set("tab", tab);
    if (normalizedItemId) params.set("itemId", normalizedItemId);
    const search = params.toString();
    return `/settings/locations${search ? `?${search}` : ""}`;
}

export type LocationsFleetLocationSummary = {
    id: string;
    displayName: string;
    isActive: boolean;
    locality: string | null;
    criticalCount: number;
    improveCount: number;
    setupPercent: number;
    setupComplete: boolean;
    activeRoomCount: number;
    activeProgramCount: number;
    configuredCapacity: number | null;
    topAttention: LocationWorkspaceAttentionItem | null;
};

export type LocationsFleetAttentionHighlight = {
    locationId: string;
    locationName: string;
    item: LocationWorkspaceAttentionItem;
};

export type LocationsFleetModel = {
    locationCount: number;
    activeLocationCount: number;
    inactiveLocationCount: number;
    locationsNeedingAttention: number;
    locationsSetupComplete: number;
    averageSetupPercent: number;
    totalCritical: number;
    totalImprove: number;
    totalConfiguredCapacity: number | null;
    totalRooms: number;
    totalPrograms: number;
    locations: LocationsFleetLocationSummary[];
    attentionHighlights: LocationsFleetAttentionHighlight[];
};

/**
 * Fleet setup uses only known-complete dimensions (general, programs, rooms, schedule).
 * Tours / Placement / Access stay unknown until a location workspace loads them — they must
 * not depress org rollups as incomplete (doctrine: unknown is never zero / fabricated).
 */
function fleetSetupFromWorkspace(model: LocationWorkspaceModel): {
    setupPercent: number;
    setupComplete: boolean;
} {
    const known = model.setupItems.filter((item) =>
        item.key === "general" || item.key === "programs" || item.key === "rooms" || item.key === "schedule",
    );
    const completed = known.filter((item) => item.complete === true).length;
    const setupPercent = known.length === 0 ? 0 : Math.round((completed / known.length) * 100);
    return { setupPercent, setupComplete: setupPercent === 100 };
}

export function buildLocationsFleetModel(params: {
    sites: LocationHierarchyRow[];
    rooms: LocationHierarchyRow[];
    programs: LocationProgramCategoryRow[];
    schedules: { id: string; site_location_id: string; is_active: boolean }[];
}): LocationsFleetModel {
    const locations: LocationsFleetLocationSummary[] = params.sites.map((site) => {
        const siteSchedules = params.schedules.filter((schedule) => schedule.site_location_id === site.id);
        const workspace = buildLocationWorkspaceModel({
            site,
            rooms: params.rooms,
            programs: params.programs,
            schedules: siteSchedules,
        });
        const fleetSetup = fleetSetupFromWorkspace(workspace);
        const topAttention =
            workspace.attention.find((item) => item.grade === "fix") ??
            workspace.attention.find((item) => item.grade === "improve") ??
            null;
        const locality =
            [site.city, site.state]
                .map((part) => String(part ?? "").trim())
                .filter(Boolean)
                .join(", ") || null;
        return {
            id: site.id,
            displayName: workspace.displayName,
            isActive: site.is_active !== false,
            locality,
            criticalCount: workspace.criticalCount,
            improveCount: workspace.attention.filter((item) => item.grade === "improve").length,
            setupPercent: fleetSetup.setupPercent,
            setupComplete: fleetSetup.setupComplete,
            activeRoomCount: workspace.activeRoomCount,
            activeProgramCount: workspace.activeProgramCount,
            configuredCapacity: workspace.configuredCapacity,
            topAttention,
        };
    });

    locations.sort((a, b) => {
        if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
        if (a.improveCount !== b.improveCount) return b.improveCount - a.improveCount;
        if (a.setupPercent !== b.setupPercent) return a.setupPercent - b.setupPercent;
        return a.displayName.localeCompare(b.displayName);
    });

    const active = locations.filter((location) => location.isActive);
    const capacityValues = locations
        .map((location) => location.configuredCapacity)
        .filter((capacity): capacity is number => capacity != null && Number.isFinite(capacity));
    const attentionHighlights: LocationsFleetAttentionHighlight[] = [];
    for (const location of locations) {
        if (!location.topAttention || location.topAttention.grade === "good") continue;
        attentionHighlights.push({
            locationId: location.id,
            locationName: location.displayName,
            item: location.topAttention,
        });
        if (attentionHighlights.length >= 8) break;
    }

    const setupPercents = locations.map((location) => location.setupPercent);
    const averageSetupPercent =
        setupPercents.length === 0 ?
            0
        :   Math.round(setupPercents.reduce((sum, value) => sum + value, 0) / setupPercents.length);

    return {
        locationCount: locations.length,
        activeLocationCount: active.length,
        inactiveLocationCount: locations.length - active.length,
        locationsNeedingAttention: locations.filter((location) => location.criticalCount > 0 || location.improveCount > 0)
            .length,
        locationsSetupComplete: locations.filter((location) => location.setupComplete).length,
        averageSetupPercent,
        totalCritical: locations.reduce((sum, location) => sum + location.criticalCount, 0),
        totalImprove: locations.reduce((sum, location) => sum + location.improveCount, 0),
        totalConfiguredCapacity: capacityValues.length > 0 ? capacityValues.reduce((sum, value) => sum + value, 0) : null,
        totalRooms: locations.reduce((sum, location) => sum + location.activeRoomCount, 0),
        totalPrograms: locations.reduce((sum, location) => sum + location.activeProgramCount, 0),
        locations,
        attentionHighlights,
    };
}

export function readLocationMetadataString(metadata: unknown, key: string): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = (metadata as Record<string, unknown>)[key];
    const normalized = String(value ?? "").trim();
    return normalized || null;
}

export function parseStaffingThresholds(raw: unknown): StaffingThreshold[] {
    const value = String(raw ?? "").trim();
    if (!value) return [];
    const thresholds: StaffingThreshold[] = [];
    for (const segment of value.split(/[\n,;]+/)) {
        const match = segment.trim().match(/^(\d+)\s*(?::|[-–—])\s*(\d+)$/);
        if (!match) continue;
        const requiredStaff = Number(match[1]);
        const maxChildren = Number(match[2]);
        if (requiredStaff > 0 && maxChildren > 0) thresholds.push({ requiredStaff, maxChildren });
    }
    return thresholds.sort((a, b) => a.requiredStaff - b.requiredStaff || a.maxChildren - b.maxChildren);
}

export function serializeStaffingThresholds(thresholds: StaffingThreshold[]): string {
    return thresholds
        .filter(
            (threshold) =>
                Number.isInteger(threshold.requiredStaff) &&
                threshold.requiredStaff > 0 &&
                Number.isInteger(threshold.maxChildren) &&
                threshold.maxChildren > 0,
        )
        .sort((a, b) => a.requiredStaff - b.requiredStaff || a.maxChildren - b.maxChildren)
        .map((threshold) => `${threshold.requiredStaff}:${threshold.maxChildren}`)
        .join(",");
}

export function formatStaffingThreshold(threshold: StaffingThreshold): string {
    return `${threshold.requiredStaff}–${threshold.maxChildren}`;
}

function formatProgramAgeRange(program: LocationProgramCategoryRow): string {
    const from = readLocationMetadataString(program.metadata, "age_range_from");
    const to = readLocationMetadataString(program.metadata, "age_range_to");
    const unit = readLocationMetadataString(program.metadata, "age_range_unit");
    if (!from && !to) return "Age range not set";
    const range = from && to ? `${from}–${to}` : (from ?? to ?? "");
    return unit ? `${range} ${unit}` : range;
}

export function buildLocationProgramOperationalSummaries(params: {
    programs: LocationProgramCategoryRow[];
    rooms: LocationHierarchyRow[];
}): LocationProgramOperationalSummary[] {
    return params.programs.map((program) => {
        const programRooms = params.rooms.filter(
            (room) => room.is_active !== false && readLocationMetadataString(room.metadata, "category") === program.key,
        );
        const capacities = programRooms
            .map((room) => {
                const rawCapacity = readLocationMetadataString(room.metadata, "capacity");
                return rawCapacity == null ? null : Number(rawCapacity);
            })
            .filter((capacity): capacity is number => capacity != null && Number.isFinite(capacity) && capacity >= 0);
        return {
            id: program.id,
            label: program.label,
            roomCount: programRooms.length,
            configuredCapacity: capacities.length > 0 ? capacities.reduce((sum, capacity) => sum + capacity, 0) : null,
            ageRange: formatProgramAgeRange(program),
            isActive: program.is_active !== false,
        };
    });
}

export function formatLocationAddress(
    site: Pick<LocationHierarchyRow, "address1" | "city" | "state" | "postal_code">,
): string | null {
    const locality = [site.city, site.state, site.postal_code]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" ");
    return [String(site.address1 ?? "").trim(), locality].filter(Boolean).join(", ") || null;
}

export function buildLocationWorkspaceModel(params: {
    site: LocationHierarchyRow;
    rooms: LocationHierarchyRow[];
    programs: LocationProgramCategoryRow[];
    schedules: { id: string; is_active: boolean }[];
    ownedConcernSetup?: Partial<Record<"tours" | "placement" | "access", boolean>>;
}): LocationWorkspaceModel {
    const { site } = params;
    const rooms = params.rooms.filter((room) => room.parent_location_id === site.id && room.is_active !== false);
    const programs = params.programs.filter(
        (program) => program.location_id === site.id && program.is_active !== false,
    );
    const schedules = params.schedules.filter((schedule) => schedule.is_active);
    const roomPresentations = rooms.map((room) => readLocationMetadataPresentation(room.metadata));
    const capacityValues = roomPresentations
        .map((room) => (room.capacity == null ? null : Number(room.capacity)))
        .filter((capacity): capacity is number => capacity != null && Number.isFinite(capacity) && capacity >= 0);
    const roomsNeedingCapacity = roomPresentations.filter((room) => {
        if (room.capacity == null) return true;
        const capacity = Number(room.capacity);
        return !Number.isFinite(capacity) || capacity < 0;
    }).length;

    const address = formatLocationAddress(site);
    const phone = readLocationMetadataString(site.metadata, "site_phone");
    const timezone = readLocationMetadataString(site.metadata, "timezone");
    const generalComplete = Boolean(String(site.label ?? "").trim() && address && timezone);
    const roomsComplete =
        rooms.length > 0 &&
        roomPresentations.every((room) => Boolean(room.capacity && room.student_teacher_ratio && room.category));
    const setupItems: LocationWorkspaceSetupItem[] = [
        {
            key: "general",
            label: "General",
            tab: "general",
            complete: generalComplete,
        },
        {
            key: "programs",
            label: "Programs",
            tab: "programs",
            complete: programs.length > 0,
        },
        { key: "rooms", label: "Rooms", tab: "rooms", complete: roomsComplete },
        {
            key: "schedule",
            label: "Schedule",
            tab: "schedule",
            complete: schedules.length > 0,
        },
        {
            key: "tours",
            label: "Tours",
            tab: "tours",
            complete: params.ownedConcernSetup?.tours ?? null,
        },
        {
            key: "placement",
            label: "Placement",
            tab: "placement",
            complete: params.ownedConcernSetup?.placement ?? null,
        },
        {
            key: "access",
            label: "Access",
            tab: "access",
            complete: params.ownedConcernSetup?.access ?? null,
        },
    ];
    // Unknown (null) areas are excluded from the denominator — never treated as incomplete.
    const knownSetupItems = setupItems.filter((item) => item.complete !== null);
    const completedSetupItems = knownSetupItems.filter((item) => item.complete === true).length;
    const setupPercent =
        knownSetupItems.length === 0 ? 0 : Math.round((completedSetupItems / knownSetupItems.length) * 100);

    const attention: LocationWorkspaceAttentionItem[] = [];
    if (!timezone) {
        attention.push({
            key: "timezone",
            grade: "fix",
            label: "Time zone is not set",
            consequence: "Hours and tours cannot run in local time.",
            nextLabel: "Set time zone",
            tab: "general",
        });
    }
    if (rooms.length === 0) {
        attention.push({
            key: "rooms",
            grade: "fix",
            label: "No rooms are operating yet",
            consequence: "Capacity and placement have nowhere to land.",
            nextLabel: "Add a room",
            tab: "rooms",
        });
    } else if (roomsNeedingCapacity > 0) {
        attention.push({
            key: "room-capacity",
            grade: "fix",
            label: `${roomsNeedingCapacity} ${roomsNeedingCapacity === 1 ? "room needs" : "rooms need"} capacity`,
            consequence: "Those rooms cannot count toward location inventory.",
            nextLabel: "Set capacity",
            tab: "rooms",
        });
    }
    if (programs.length === 0) {
        attention.push({
            key: "programs",
            grade: "fix",
            label: "No programs are offered yet",
            consequence: "Families cannot be placed into an offering here.",
            nextLabel: "Offer a program",
            tab: "programs",
        });
    }
    if (schedules.length === 0) {
        attention.push({
            key: "schedule",
            grade: "improve",
            label: "Weekly hours are not set",
            consequence: "Operating days stay unclear for tours and staffing.",
            nextLabel: "Set hours",
            tab: "schedule",
        });
    }
    // Healthy locations have an empty attention list — UI collapses the section (no filler).
    const criticalCount = attention.filter((item) => item.grade === "fix").length;
    const incompleteSetupCount = setupItems.filter((item) => item.complete === false).length;
    const recommendedCount = incompleteSetupCount + attention.filter((item) => item.grade === "improve").length;

    return {
        displayName: String(site.label ?? "").trim() || "Untitled location",
        address,
        phone,
        timezone,
        activeRoomCount: rooms.length,
        activeProgramCount: programs.length,
        configuredCapacity: capacityValues.length > 0 ? capacityValues.reduce((sum, value) => sum + value, 0) : null,
        roomsNeedingCapacity,
        setupPercent,
        setupComplete: setupPercent === 100,
        setupItems,
        attention,
        criticalCount,
        recommendedCount,
    };
}
