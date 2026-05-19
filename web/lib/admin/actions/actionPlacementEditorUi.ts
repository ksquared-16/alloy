import type { ActionSurface, ActionSlot } from "@/lib/admin/actions/types";
import {
    ACTION_PLACEMENT_DISPLAY_STYLES,
    ACTION_PLACEMENT_SLOTS,
    OPERATOR_EDITABLE_ACTION_SURFACES,
    actionPlacementEditableInSettings,
    actionPlacementLockedReason,
} from "@/lib/admin/actions/actionPlacementMutation";

export type ActionPlacementEditorRow = {
    placement_id: string;
    definition_id: string;
    definition_key: string;
    label: string;
    action_type: string;
    entity_type: string | null;
    org_id: string | null;
    surface: string;
    slot: string;
    section_key: string | null;
    order_index: number;
    display_style: string;
    is_active: boolean;
};

/** Operator-facing summary of where a placement renders. */
export function formatActionPlacementWhere(row: Pick<ActionPlacementEditorRow, "surface" | "slot" | "section_key" | "entity_type">): string {
    const surface = actionPlacementSurfaceLabel(row.surface);
    const entity = row.entity_type ? ` · ${row.entity_type}` : "";
    const slot = row.slot ? ` · ${row.slot}` : "";
    const section =
        row.surface === "record_section" && row.section_key?.trim()
            ? ` · section “${row.section_key.trim()}”`
            : "";
    return `${surface}${entity}${slot}${section}`;
}

export function actionPlacementOwnershipLabel(orgId: string | null): "org" | "platform" {
    return orgId ? "org" : "platform";
}

export function actionPlacementSurfaceLabel(surface: string): string {
    switch (surface) {
        case "record_header":
            return "Record header";
        case "record_section":
            return "Record section";
        case "queue_row":
            return "Queue row";
        default:
            return surface.replace(/_/g, " ");
    }
}

export function actionPlacementEditorCapabilities(row: ActionPlacementEditorRow, orgId: string) {
    const editable = actionPlacementEditableInSettings(orgId, row.org_id);
    return {
        editable,
        lockedReason: editable ? null : actionPlacementLockedReason(row.org_id),
        canToggleActive: editable,
        canEditLabel: editable && row.org_id != null,
        canEditSurface: editable,
        canEditSlot: editable,
        canEditSectionKey: editable && row.surface === "record_section",
        canEditOrder: editable,
        allowedSurfaces: OPERATOR_EDITABLE_ACTION_SURFACES as readonly ActionSurface[],
        allowedSlots: ACTION_PLACEMENT_SLOTS as readonly ActionSlot[],
        allowedDisplayStyles: ACTION_PLACEMENT_DISPLAY_STYLES,
    };
}

export function groupPlacementEditorRows(rows: ActionPlacementEditorRow[]): Array<{
    id: string;
    title: string;
    items: ActionPlacementEditorRow[];
}> {
    const map = new Map<string, ActionPlacementEditorRow[]>();
    for (const row of rows) {
        const entity = row.entity_type ?? "any";
        const key = `${row.surface}::${entity}`;
        const list = map.get(key) ?? [];
        list.push(row);
        map.set(key, list);
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, items]) => {
            const [surface, entity] = key.split("::");
            return {
                id: key,
                title: `${actionPlacementSurfaceLabel(surface)} — ${entity === "any" ? "All types" : entity}`,
                items: [...items].sort((a, b) => a.order_index - b.order_index || a.label.localeCompare(b.label)),
            };
        });
}
