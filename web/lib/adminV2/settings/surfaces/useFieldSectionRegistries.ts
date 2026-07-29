"use client";

/**
 * Load Settings → Fields section registries for composer category labels.
 * Merges rows across hub entity API types (person, inquiry_child, customer_member, …).
 */

import { useEffect, useMemo, useState } from "react";
import {
    fetchFieldSectionRegistry,
    type FieldSectionRegistryRow,
} from "@/lib/admin/fieldSectionSelectOptions";
import {
    hubEntitiesForPickerNamespaces,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerFieldCatalog";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";

function entityTypesForNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
): string[] {
    const types = new Set<string>();
    for (const hub of hubEntitiesForPickerNamespaces(namespaces)) {
        for (const entityType of hubEntityApiTypes(hub)) {
            types.add(entityType);
        }
    }
    return [...types].sort();
}

function mergeSectionRegistries(
    batches: readonly (readonly FieldSectionRegistryRow[])[],
): FieldSectionRegistryRow[] {
    const byKey = new Map<string, FieldSectionRegistryRow>();
    for (const batch of batches) {
        for (const row of batch) {
            const key = row.section_key.trim();
            if (!key) continue;
            const existing = byKey.get(key);
            if (!existing || row.sort_order < existing.sort_order) {
                byKey.set(key, row);
            }
        }
    }
    return [...byKey.values()].sort(
        (a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key),
    );
}

export function useFieldSectionRegistries(
    namespaces: readonly AvailableFieldEntityNamespace[],
): {
    sectionRegistry: FieldSectionRegistryRow[];
    loading: boolean;
} {
    const entityTypesKey = useMemo(
        () => entityTypesForNamespaces(namespaces).join(","),
        [namespaces],
    );
    const [sectionRegistry, setSectionRegistry] = useState<FieldSectionRegistryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const entityTypes = entityTypesKey
            ? entityTypesKey.split(",").filter(Boolean)
            : [];
        if (entityTypes.length === 0) {
            setSectionRegistry([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        void Promise.all(entityTypes.map((entityType) => fetchFieldSectionRegistry(entityType)))
            .then((batches) => {
                if (cancelled) return;
                setSectionRegistry(mergeSectionRegistries(batches));
            })
            .catch(() => {
                if (!cancelled) setSectionRegistry([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [entityTypesKey]);

    return { sectionRegistry, loading };
}
