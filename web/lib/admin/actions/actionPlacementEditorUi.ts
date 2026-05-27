import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import { resolveEntityLabel } from "@/lib/admin/resolveEntityDisplayLabel";
import type { ActionSurface, ActionSlot } from "@/lib/admin/actions/types";
import {
    ACTION_PLACEMENT_DISPLAY_STYLES,
    OPERATOR_EDITABLE_ACTION_SURFACES,
    actionPlacementEditableInSettings,
    actionPlacementLockedReason,
} from "@/lib/admin/actions/actionPlacementMutation";
import {
    SETTINGS_EDITABLE_SURFACES,
    settingsSlotLabel,
    settingsSurfaceLabel,
} from "@/lib/admin/actions/actionPlacementPresentation";

export type ActionPlacementEditorRow = {
    placement_id: string;
    definition_id: string;
    definition_key: string;
    definition_org_id: string | null;
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

function formatPlacementEntitySuffix(
    entityType: string | null | undefined,
    labels?: EntityLabelsMap
): string {
    const et = entityType?.trim();
    if (!et) return "";
    const label = labels
        ? resolveEntityLabel(et, labels, { fallback: "Record" })
        : et;
    return ` · ${label}`;
}

/** Operator-facing summary of where a placement renders. */
export function formatActionPlacementWhere(
    row: Pick<ActionPlacementEditorRow, "surface" | "slot" | "section_key" | "entity_type">,
    labels?: EntityLabelsMap
): string {
    const surface = settingsSurfaceLabel(row.surface);
    const entity = formatPlacementEntitySuffix(row.entity_type, labels);
    const slot = row.slot ? ` · ${settingsSlotLabel(row.slot)}` : "";
    const section =
        row.surface === "record_section" && row.section_key?.trim()
            ? ` · section “${row.section_key.trim()}”`
            : "";
    return `${surface}${entity}${slot}${section}`;
}

export function actionPlacementOwnershipLabel(orgId: string | null): "org" | "platform" {
    return orgId ? "org" : "platform";
}

/** @deprecated Use settingsSurfaceLabel from actionPlacementPresentation */
export function actionPlacementSurfaceLabel(surface: string): string {
    return settingsSurfaceLabel(surface);
}

export function actionPlacementEditorCapabilities(row: ActionPlacementEditorRow, orgId: string) {
    const editable = actionPlacementEditableInSettings(orgId, row.org_id);
    const isPlatformPlacement = row.org_id == null;
    const isOrgDefinition = row.definition_org_id != null;
    return {
        editable,
        isPlatformPlacement,
        isOrgDefinition,
        lockedReason: editable
            ? null
            : isPlatformPlacement
              ? "Built-in placement — add your own org placement below to customize where this action appears."
              : actionPlacementLockedReason(row.org_id),
        canToggleActive: editable,
        canEditLabel: editable && isOrgDefinition,
        canEditEntityType: editable,
        canEditSurface: editable,
        canEditSlot: editable,
        canEditSectionKey: editable,
        canEditOrder: editable,
        canCloneAsOrgPlacement: isPlatformPlacement,
        allowedSurfaces: SETTINGS_EDITABLE_SURFACES,
        allowedSurfaceOptions: OPERATOR_EDITABLE_ACTION_SURFACES as readonly ActionSurface[],
        allowedDisplayStyles: ACTION_PLACEMENT_DISPLAY_STYLES,
    };
}

/** Settings list: org-editable placements vs locked platform defaults. */
export function partitionPlacementRowsForSettings(
    rows: ActionPlacementEditorRow[],
    orgId: string
): { orgPlacements: ActionPlacementEditorRow[]; systemDefaults: ActionPlacementEditorRow[] } {
    const orgPlacements: ActionPlacementEditorRow[] = [];
    const systemDefaults: ActionPlacementEditorRow[] = [];
    for (const row of rows) {
        if (actionPlacementEditorCapabilities(row, orgId).editable) {
            orgPlacements.push(row);
        } else {
            systemDefaults.push(row);
        }
    }
    return { orgPlacements, systemDefaults };
}

export function groupPlacementEditorRows(
    rows: ActionPlacementEditorRow[],
    labels?: EntityLabelsMap
): Array<{
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
            const entityTitle =
                entity === "any"
                    ? "All types"
                    : labels
                      ? resolveEntityLabel(entity, labels, { fallback: "Record" })
                      : entity;
            return {
                id: key,
                title: `${actionPlacementSurfaceLabel(surface)} — ${entityTitle}`,
                items: [...items].sort((a, b) => a.order_index - b.order_index || a.label.localeCompare(b.label)),
            };
        });
}
