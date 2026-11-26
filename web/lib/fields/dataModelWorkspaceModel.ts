/**
 * Data Model workspace summaries — stats and preview helpers for Overview tab.
 */

import type { SettingsFieldCatalogEntry, SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { countFieldsByOwnership, sectionDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import {
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
    relationshipsForHubEntity,
} from "@/lib/fields/entityRelationshipCatalog";

export type DataModelEntityStats = {
    fields: number;
    relationships: number;
    surfaces: number;
    processes: number;
};

export type DataModelFieldSectionPreview = {
    sectionKey: string;
    label: string;
    shown: SettingsFieldCatalogEntry[];
    remaining: number;
    total: number;
};

export type DataModelComputedPreviewGroup = {
    status: "now" | "future";
    label: string;
    entries: SettingsFieldCatalogEntry[];
};

export function dataModelStatsForEntity(
    hubEntity: SettingsHubEntityKey,
    catalogEntries: readonly SettingsFieldCatalogEntry[],
): DataModelEntityStats {
    const counts = countFieldsByOwnership(catalogEntries);
    const relationships = relationshipsForHubEntity(hubEntity);
    return {
        fields: counts.total,
        relationships: relationships.length,
        surfaces: DATA_MODEL_USAGE_SURFACES.length,
        processes: hubEntity === "opportunity" || hubEntity === "inquiry_child" ? 7 : hubEntity === "customer" ? 4 : 2,
    };
}

/** Enticing fields preview: few fields per section + overflow count. */
export function previewFieldSections(
    entries: readonly SettingsFieldCatalogEntry[],
    shownPerSection = 3,
    maxSections = 5,
): DataModelFieldSectionPreview[] {
    const groups = new Map<string, SettingsFieldCatalogEntry[]>();
    for (const entry of entries) {
        if (entry.ownership === "computed") continue;
        const key = entry.section_key?.trim() || "general";
        const list = groups.get(key) ?? [];
        list.push(entry);
        groups.set(key, list);
    }

    const preferred = ["identity", "profile", "health", "medical", "enrollment", "requirements", "contact", "general"];
    const keys = [
        ...preferred.filter((k) => groups.has(k)),
        ...[...groups.keys()].filter((k) => !preferred.includes(k)).sort(),
    ].slice(0, maxSections);

    return keys.map((sectionKey) => {
        const all = groups.get(sectionKey) ?? [];
        const shown = all.slice(0, shownPerSection);
        return {
            sectionKey,
            label: sectionDisplayLabel(sectionKey),
            shown,
            remaining: Math.max(0, all.length - shown.length),
            total: all.length,
        };
    });
}

/** @deprecated Prefer previewFieldSections */
export function previewFieldsBySection(
    entries: readonly SettingsFieldCatalogEntry[],
    limitPerSection = 4,
): Map<string, SettingsFieldCatalogEntry[]> {
    const map = new Map<string, SettingsFieldCatalogEntry[]>();
    for (const section of previewFieldSections(entries, limitPerSection, 99)) {
        map.set(section.sectionKey, section.shown);
    }
    return map;
}

export function computedSignalPreview(
    entries: readonly SettingsFieldCatalogEntry[],
    limit = 4,
): SettingsFieldCatalogEntry[] {
    return entries.filter((e) => e.ownership === "computed").slice(0, limit);
}

export function computedSignalPreviewGroups(
    entries: readonly SettingsFieldCatalogEntry[],
    limitPerGroup = 3,
): DataModelComputedPreviewGroup[] {
    const computed = entries.filter((e) => e.ownership === "computed");
    const now = computed.filter((e) => e.computedField?.resolver_status === "now").slice(0, limitPerGroup);
    const future = computed.filter((e) => e.computedField?.resolver_status === "future").slice(0, limitPerGroup);
    const groups: DataModelComputedPreviewGroup[] = [];
    if (now.length > 0) groups.push({ status: "now", label: "Runtime", entries: now });
    if (future.length > 0) groups.push({ status: "future", label: "Future", entries: future });
    return groups;
}

export function usageSurfaceCountHint(surfaceId: string, hubEntity: SettingsHubEntityKey): string | null {
    // Lightweight orientation counts — not live analytics.
    if (surfaceId === "forms") return hubEntity === "inquiry_child" || hubEntity === "opportunity" ? "Core" : "Used";
    if (surfaceId === "drawers") return "Active";
    if (surfaceId === "focus_panel") return hubEntity === "location" ? null : "Active";
    if (surfaceId === "queue_row") return hubEntity === "opportunity" || hubEntity === "inquiry_child" ? "Preview" : null;
    if (surfaceId === "business_process") {
        return hubEntity === "opportunity" || hubEntity === "inquiry_child" ? "Requirements" : null;
    }
    if (surfaceId === "documents") return hubEntity === "inquiry_child" || hubEntity === "customer" ? "Packets" : null;
    return null;
}

export { DATA_MODEL_BUILDER_AVAILABILITY, DATA_MODEL_USAGE_SURFACES };
