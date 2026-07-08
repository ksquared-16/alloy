"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ConfigurationStatusToggle from "@/components/adminV2/configuration/ConfigurationStatusToggle";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
} from "@/lib/fields/dataModelWorkspaceOperatorUi";
import type { CustomRelationshipVocabulary } from "@/lib/fields/entityRelationshipCatalog";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Link2 } from "lucide-react";

type Props = {
    item: CustomRelationshipVocabulary;
    expanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    onSaved?: () => void;
};

function patchEndpoint(item: CustomRelationshipVocabulary): string {
    return item.kind === "family_role"
        ? `/api/admin/customer-person-role-types/${item.id}`
        : `/api/admin/person-relationship-type-settings/${item.id}`;
}

export default function DataModelCustomRelationshipRow({
    item,
    expanded,
    onExpand,
    onCollapse,
    onSaved,
}: Props) {
    const { canMutate } = useAdminAuth();
    const [label, setLabel] = useState(item.label);
    const [description, setDescription] = useState(item.description ?? "");
    const [active, setActive] = useState(item.is_active);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (expanded) {
            setLabel(item.label);
            setDescription(item.description ?? "");
            setActive(item.is_active);
            setError(null);
        }
    }, [expanded, item]);

    const save = async () => {
        if (!canMutate) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(patchEndpoint(item), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: label.trim(),
                    description: description.trim() || null,
                    is_active: active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            onSaved?.();
            onCollapse();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const kindLabel = item.kind === "family_role" ? "Family role" : "Person connection";

    return (
        <div
            className={[CONFIG_WORKSPACE_ROW_CLASS, expanded ? CONFIG_WORKSPACE_ROW_EXPANDED_CLASS : ""].join(" ")}
            data-testid="data-model-custom-relationship-row"
            data-relationship-kind="custom"
            data-expanded={expanded ? "true" : "false"}
        >
            <div className="flex items-center gap-2 px-2.5 py-2">
                <Link2 size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-alloy-midnight/45">{kindLabel}</span>
                </button>
                <span className="hidden shrink-0 rounded-full border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-alloy-bend-pine sm:inline">
                    Custom
                </span>
                {!item.is_active ? (
                    <span className="shrink-0 text-[10px] font-medium text-alloy-midnight/35">Hidden</span>
                ) : null}
                <button
                    type="button"
                    onClick={expanded ? onCollapse : onExpand}
                    className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
                    data-testid="data-model-custom-relationship-edit"
                >
                    {expanded ? "Close" : "Edit"}
                </button>
            </div>
            {expanded ? (
                <div className="space-y-2.5 border-t border-alloy-forge/8 px-3 pb-3 pt-2.5" data-testid="data-model-custom-relationship-editor">
                    <label className="block space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Label</span>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Description
                        </span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        />
                    </label>
                    <ConfigurationStatusToggle active={active} onChange={setActive} />
                    {error ? <p className="text-xs text-alloy-ember">{error}</p> : null}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={onCollapse}
                            className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={saving || !canMutate}
                            onClick={() => void save()}
                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
