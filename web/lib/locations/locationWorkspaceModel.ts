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
    label: string;
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
    const completedSetupItems = setupItems.filter((item) => item.complete).length;
    const setupPercent = Math.round((completedSetupItems / setupItems.length) * 100);

    const attention: LocationWorkspaceAttentionItem[] = [];
    if (!timezone) {
        attention.push({
            key: "timezone",
            grade: "fix",
            label: "Time zone is not set up yet",
            tab: "general",
        });
    }
    if (rooms.length === 0) {
        attention.push({
            key: "rooms",
            grade: "fix",
            label: "Add a room to begin tracking capacity",
            tab: "rooms",
        });
    } else if (roomsNeedingCapacity > 0) {
        attention.push({
            key: "room-capacity",
            grade: "fix",
            label: `${roomsNeedingCapacity} ${roomsNeedingCapacity === 1 ? "room needs" : "rooms need"} capacity setup`,
            tab: "rooms",
        });
    }
    if (programs.length === 0) {
        attention.push({
            key: "programs",
            grade: "fix",
            label: "No programs are offered at this location yet",
            tab: "programs",
        });
    }
    if (schedules.length === 0) {
        attention.push({
            key: "schedule",
            grade: "improve",
            label: "Weekly schedule is not set up yet",
            tab: "schedule",
        });
    }
    if (attention.length === 0) {
        attention.push({
            key: "all-good",
            grade: "good",
            label: "Everything looks good",
            tab: "overview",
        });
    }
    const criticalCount = attention.filter((item) => item.grade === "fix").length;
    const incompleteSetupCount = setupItems.filter((item) => item.complete !== true).length;
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
