"use client";

import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import {
    actionPlacementEditorCapabilities,
    actionPlacementOwnershipLabel,
    formatActionPlacementWhere,
    groupPlacementEditorRows,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";
import {
    actionRegistryEntryForKey,
    libraryEntryForCatalogRow,
    ACTION_CATEGORY_LABELS,
} from "@/lib/admin/actions/actionDefinitionRegistry";

function friendlyActionLabel(row: ActionPlacementEditorRow): string {
    return actionRegistryEntryForKey(row.definition_key)?.label ?? row.label;
}

function friendlyActionType(row: ActionPlacementEditorRow): string {
    const entry = actionRegistryEntryForKey(row.definition_key);
    if (entry) return ACTION_CATEGORY_LABELS[entry.category];
    return "Action";
}

export type ConfiguredActionPlacementsListProps = {
    rows: ActionPlacementEditorRow[];
    orgId: string;
    isAdmin: boolean;
    canMutate: boolean;
    savingId: string | null;
    rowErrors: Record<string, string>;
    readOnly?: boolean;
    onEdit?: (row: ActionPlacementEditorRow) => void;
    onRemove?: (placementId: string) => void;
    onToggleEnabled?: (placementId: string, enabled: boolean) => void;
};

export default function ConfiguredActionPlacementsList({
    rows,
    orgId,
    isAdmin,
    canMutate,
    savingId,
    rowErrors,
    readOnly = false,
    onEdit,
    onRemove,
    onToggleEnabled,
}: ConfiguredActionPlacementsListProps) {
    const { labels } = useEntityLabels();
    const groups = groupPlacementEditorRows(rows, labels);

    if (!groups.length) return null;

    return (
        <div className="space-y-4">
            {groups.map((group) => (
                <section
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-alloy-forge/12 bg-white/55 shadow-sm"
                >
                    <div className="border-b border-alloy-forge/10 px-4 py-3 sm:px-5">
                        <h3 className="text-sm font-semibold text-alloy-midnight">{group.title}</h3>
                    </div>
                    <ul className="divide-y divide-alloy-forge/8">
                        {group.items.map((row) => {
                            const cap = actionPlacementEditorCapabilities(row, orgId);
                            const saving = savingId === row.placement_id;
                            const ownership = actionPlacementOwnershipLabel(row.org_id);
                            const lib = libraryEntryForCatalogRow({
                                id: row.definition_id,
                                key: row.definition_key,
                                label: row.label,
                                action_type: row.action_type,
                                entity_type: row.entity_type,
                                org_id: row.definition_org_id,
                            });
                            return (
                                <li
                                    key={row.placement_id}
                                    className="px-4 py-4 sm:px-5"
                                    data-testid={`action-placement-${row.placement_id}`}
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium text-alloy-midnight">
                                                    {friendlyActionLabel(row)}
                                                </span>
                                                <span className="rounded-full bg-alloy-forge/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/60">
                                                    {friendlyActionType(row)}
                                                </span>
                                                {!readOnly && ownership === "org" ? (
                                                    <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-pine">
                                                        Your org
                                                    </span>
                                                ) : null}
                                                {!row.is_active ? (
                                                    <span className="text-[10px] font-medium text-alloy-midnight/45">
                                                        Disabled
                                                    </span>
                                                ) : null}
                                            </div>
                                            {lib?.description ? (
                                                <p className="text-xs leading-relaxed text-alloy-midnight/60">
                                                    {lib.description}
                                                </p>
                                            ) : null}
                                            <p className="text-xs text-alloy-midnight/70">
                                                <span className="font-medium text-alloy-midnight/80">
                                                    Appears on:{" "}
                                                </span>
                                                {formatActionPlacementWhere(row, labels)}
                                            </p>
                                        </div>
                                        {!readOnly ? (
                                            <div className="flex shrink-0 flex-row flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                                                <label className="flex items-center gap-2 text-xs">
                                                    <span className="text-alloy-midnight/55">Enabled</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={row.is_active}
                                                        disabled={
                                                            !cap.canToggleActive ||
                                                            !isAdmin ||
                                                            !canMutate ||
                                                            saving
                                                        }
                                                        onChange={(e) =>
                                                            onToggleEnabled?.(row.placement_id, e.target.checked)
                                                        }
                                                    />
                                                </label>
                                                {cap.editable && isAdmin && canMutate ? (
                                                    <div className="flex gap-3 text-xs">
                                                        <button
                                                            type="button"
                                                            className="font-medium text-alloy-pine hover:underline"
                                                            disabled={saving}
                                                            onClick={() => onEdit?.(row)}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="font-medium text-red-700/80 hover:underline"
                                                            disabled={saving}
                                                            onClick={() => onRemove?.(row.placement_id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <p className="shrink-0 text-[10px] text-alloy-midnight/45">System default</p>
                                        )}
                                    </div>
                                    {rowErrors[row.placement_id] ? (
                                        <p className="mt-2 text-[11px] text-red-600">{rowErrors[row.placement_id]}</p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
