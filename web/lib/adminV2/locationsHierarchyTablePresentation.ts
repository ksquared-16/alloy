import {
    formatLocationAgeRange,
    readLocationMetadataPresentation,
} from "@/lib/admin/location/locationMetadataFields";
import { formatLocationTypeLabel } from "@/lib/admin/locationListPresentation";

export type LocationHierarchyRow = {
    id: string;
    label: string | null;
    location_type: string | null;
    parent_location_id: string | null;
    is_active: boolean;
    status_key?: string | null;
    _status_display?: string | null;
    city: string | null;
    state: string | null;
    metadata?: unknown;
};

export type LocationTableRow = {
    id: string;
    siteLabel: string | null;
    roomLabel: string | null;
    typeLabel: string;
    category: string | null;
    ageRange: string | null;
    capacity: string | null;
    studentTeacherRatio: string | null;
    statusLabel: string | null;
    statusKey: string | null;
    isActive: boolean;
    isSite: boolean;
    isRoom: boolean;
    parentSiteId: string | null;
    depth: number;
};

export const LOCATIONS_EDITOR_TABLE_COLUMNS = [
    "Site",
    "Room",
    "Type",
    "Category",
    "Age Range",
    "Capacity",
    "Student:Teacher Ratio",
    "Status",
    "Actions",
] as const;

export function isDemoLocation(row: LocationHierarchyRow): boolean {
    const label = (row.label ?? "").trim().toLowerCase();
    if (label.includes("brightstart")) return true;
    if (label.startsWith("waitlist demo —") || label.startsWith("placement demo —")) return true;
    const md = row.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const m = md as Record<string, unknown>;
        return m.demo_batch_key != null || m.is_demo_data === true;
    }
    return false;
}

export function buildLocationTableRows(
    roots: LocationHierarchyRow[],
    byParent: Map<string | null, LocationHierarchyRow[]>
): LocationTableRow[] {
    const out: LocationTableRow[] = [];

    const walk = (row: LocationHierarchyRow, depth: number, siteLabel: string | null) => {
        const type = String(row.location_type ?? "").trim().toLowerCase();
        const isSite = type === "site";
        const isRoom = type === "unit";
        const meta = readLocationMetadataPresentation(row.metadata);
        const nextSiteLabel = isSite ? row.label : siteLabel;
        out.push({
            id: row.id,
            siteLabel: isSite ? row.label : siteLabel,
            roomLabel: isRoom ? row.label : null,
            typeLabel: formatLocationTypeLabel(row.location_type),
            category: meta.category,
            ageRange: formatLocationAgeRange(meta.age_range_from, meta.age_range_to, meta.age_range_unit),
            capacity: meta.capacity,
            studentTeacherRatio: meta.student_teacher_ratio,
            statusLabel: row._status_display ?? row.status_key ?? null,
            statusKey: row.status_key ?? null,
            isActive: row.is_active !== false,
            isSite,
            isRoom,
            parentSiteId: row.parent_location_id,
            depth,
        });
        const children = byParent.get(row.id) ?? [];
        for (const child of children) {
            walk(child, depth + 1, nextSiteLabel);
        }
    };

    for (const root of roots) {
        walk(root, 0, null);
    }
    return out;
}

export function buildLocationHierarchyTree(rows: LocationHierarchyRow[]): {
    roots: LocationHierarchyRow[];
    byParent: Map<string | null, LocationHierarchyRow[]>;
} {
    const byParent = new Map<string | null, LocationHierarchyRow[]>();
    for (const row of rows) {
        const key = row.parent_location_id ?? null;
        const list = byParent.get(key) ?? [];
        list.push(row);
        byParent.set(key, list);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    }
    const roots = (byParent.get(null) ?? []).filter((r) => r.location_type !== "unit");
    return { roots, byParent };
}

export function mergeLocationMetadataField(
    existing: unknown,
    fieldKey: string,
    value: string | null
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...(existing as Record<string, unknown>) }
            : {};
    if (value == null || String(value).trim() === "") {
        delete base[fieldKey];
    } else {
        base[fieldKey] = String(value).trim();
    }
    return base;
}
