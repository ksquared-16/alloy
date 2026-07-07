/**
 * Data Model workspace summaries — stats and preview helpers for Overview tab.
 */

import type { SettingsFieldCatalogEntry, SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { countFieldsByOwnership } from "@/lib/fields/fieldCatalogForSettings";
import {
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
    relationshipsForHubEntity,
} from "@/lib/fields/entityRelationshipCatalog";
import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";

export type DataModelEntityStats = {
    fields: number;
    relationships: number;
    surfaces: number;
    processes: number;
};

export function dataModelStatsForEntity(
    hubEntity: SettingsHubEntityKey,
    catalogEntries: readonly SettingsFieldCatalogEntry[],
): DataModelEntityStats {
    const counts = countFieldsByOwnership(catalogEntries);
    const relationships = relationshipsForHubEntity(hubEntity);
    const surfaceSet = new Set<FieldConsumerSurface>();
    for (const entry of catalogEntries) {
        for (const row of entry.platformField ? [] : []) {
            void row;
        }
    }
    void surfaceSet;
    return {
        fields: counts.total,
        relationships: relationships.length,
        surfaces: DATA_MODEL_USAGE_SURFACES.length,
        processes: hubEntity === "opportunity" || hubEntity === "inquiry_child" ? 7 : hubEntity === "customer" ? 4 : 2,
    };
}

export function previewFieldsBySection(
    entries: readonly SettingsFieldCatalogEntry[],
    limitPerSection = 4,
): Map<string, SettingsFieldCatalogEntry[]> {
    const groups = new Map<string, SettingsFieldCatalogEntry[]>();
    for (const entry of entries) {
        if (entry.ownership === "computed") continue;
        const key = entry.section_key?.trim() || "general";
        const list = groups.get(key) ?? [];
        if (list.length < limitPerSection) {
            list.push(entry);
            groups.set(key, list);
        }
    }
    return groups;
}

export function computedSignalPreview(
    entries: readonly SettingsFieldCatalogEntry[],
    limit = 4,
): SettingsFieldCatalogEntry[] {
    return entries.filter((e) => e.ownership === "computed").slice(0, limit);
}

export { DATA_MODEL_BUILDER_AVAILABILITY, DATA_MODEL_USAGE_SURFACES };
