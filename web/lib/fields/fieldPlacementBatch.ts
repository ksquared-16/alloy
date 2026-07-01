/**
 * Batch field placement validation (section_key + sort_order only).
 * Used by Settings → Layouts and future config_layout_assist apply adapters.
 */

import { validateFieldSectionAssignment } from "@/lib/fields/sectionManagement";

export type FieldPlacementUpdate = {
    id: string;
    section_key?: string;
    sort_order?: number;
};

export type FieldPlacementBatchInput = {
    entity_type: string;
    updates: FieldPlacementUpdate[];
};

export type FieldSectionCatalogRow = {
    section_key: string;
    entity_type: string;
    is_archived?: boolean;
};

export type FieldDefPlacementRow = {
    id: string;
    entity_type: string;
    field_key: string;
    section_key: string | null;
    sort_order: number;
    is_system?: boolean;
};

export type ValidateFieldPlacementBatchResult =
    | { ok: true; normalized: Array<{ id: string; section_key: string; sort_order: number }> }
    | { ok: false; error: string };

export function validateFieldPlacementBatch(
    input: FieldPlacementBatchInput,
    fieldRows: FieldDefPlacementRow[],
    sectionCatalog: FieldSectionCatalogRow[]
): ValidateFieldPlacementBatchResult {
    const entityType = input.entity_type.trim().toLowerCase();
    if (!entityType) return { ok: false, error: "entity_type is required" };

    if (!Array.isArray(input.updates) || input.updates.length === 0) {
        return { ok: false, error: "updates must be a non-empty array" };
    }

    const byId = new Map(fieldRows.map((r) => [r.id, r]));
    const normalized: Array<{ id: string; section_key: string; sort_order: number }> = [];
    const seenIds = new Set<string>();

    for (const raw of input.updates) {
        const id = typeof raw.id === "string" ? raw.id.trim() : "";
        if (!id) return { ok: false, error: "Each update requires id" };
        if (seenIds.has(id)) return { ok: false, error: `Duplicate field id in batch: ${id}` };
        seenIds.add(id);

        const existing = byId.get(id);
        if (!existing) return { ok: false, error: `Unknown field definition id: ${id}` };
        if (String(existing.entity_type).toLowerCase() !== entityType) {
            return { ok: false, error: `Field ${id} does not belong to entity_type ${entityType}` };
        }

        const section_key =
            raw.section_key !== undefined
                ? String(raw.section_key).trim() || "custom"
                : String(existing.section_key ?? "custom").trim() || "custom";

        const sort_order =
            raw.sort_order !== undefined
                ? typeof raw.sort_order === "number" && !Number.isNaN(raw.sort_order)
                    ? raw.sort_order
                    : Number(raw.sort_order)
                : existing.sort_order;

        if (typeof sort_order !== "number" || Number.isNaN(sort_order)) {
            return { ok: false, error: `Invalid sort_order for field ${id}` };
        }

        const assignCheck = validateFieldSectionAssignment({
            section_key,
            entity_type: entityType,
            sections: sectionCatalog,
        });
        if (!assignCheck.ok) return { ok: false, error: assignCheck.error };

        normalized.push({ id, section_key, sort_order });
    }

    return { ok: true, normalized };
}

/** Assign contiguous sort_order (10, 20, …) for keys listed in order within one section. */
export function normalizeSortOrdersInSection(
    orderedFieldIds: string[],
    start = 10,
    step = 10
): Record<string, number> {
    const out: Record<string, number> = {};
    orderedFieldIds.forEach((id, i) => {
        out[id] = start + i * step;
    });
    return out;
}
