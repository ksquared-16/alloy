/**
 * Group action registry inventory rows for operator diagnostics (read-only).
 */

export type ActionInventoryRow = {
    definition: {
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
    };
    placement: {
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
    };
};

export type ActionInventoryGroup = {
    id: string;
    title: string;
    subtitle: string;
    items: ActionInventoryRow[];
};

function surfaceLabel(surface: string): string {
    switch (surface) {
        case "record_drawer":
            return "Record drawer";
        case "queue_row":
            return "Queue row";
        case "queue_header":
            return "Queue header";
        default:
            return surface.replace(/_/g, " ");
    }
}

function slotLabel(slot: string): string {
    return slot.replace(/_/g, " ");
}

/** Human placement summary for cards. */
export function actionPlacementSummary(row: ActionInventoryRow): string {
    const parts = [
        surfaceLabel(row.placement.surface),
        slotLabel(row.placement.slot),
        row.placement.entity_type ? row.placement.entity_type : null,
        row.placement.section_key ? `section: ${row.placement.section_key}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
}

export function groupActionInventoryRows(items: ActionInventoryRow[]): ActionInventoryGroup[] {
    const map = new Map<string, ActionInventoryRow[]>();
    for (const item of items) {
        const surface = item.placement.surface || "other";
        const entity = item.placement.entity_type ?? item.definition.entity_type ?? "any";
        const key = `${surface}::${entity}`;
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
    }

    const groups: ActionInventoryGroup[] = [];
    for (const [key, rows] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const [surface, entity] = key.split("::");
        groups.push({
            id: key,
            title: `${surfaceLabel(surface)} — ${entity === "any" ? "All types" : entity}`,
            subtitle: `${rows.length} button${rows.length === 1 ? "" : "s"}`,
            items: [...rows].sort((a, b) => a.definition.label.localeCompare(b.definition.label)),
        });
    }
    return groups;
}
