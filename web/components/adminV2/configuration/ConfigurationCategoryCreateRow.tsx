"use client";

import { useState } from "react";
import { slugifyConfigurationKey } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Plus } from "lucide-react";

type Props = {
    entityType: string;
    open: boolean;
    saving?: boolean;
    error?: string | null;
    canMutate?: boolean;
    onCancel: () => void;
    onCreated: () => void | Promise<void>;
    onError?: (message: string) => void;
};

export default function ConfigurationCategoryCreateRow({
    entityType,
    open,
    saving: savingProp = false,
    error = null,
    canMutate = false,
    onCancel,
    onCreated,
    onError,
}: Props) {
    const [label, setLabel] = useState("");
    const [saving, setSaving] = useState(false);

    if (!open) return null;

    const create = async () => {
        const trimmed = label.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const section_key = slugifyConfigurationKey(trimmed);
            const res = await fetch("/api/admin/field-sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: entityType,
                    section_key,
                    label: trimmed,
                    sort_order: 100,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const message = (json as { error?: string }).error ?? "Could not create category";
                onError?.(message);
                return;
            }
            setLabel("");
            await onCreated();
        } catch (e) {
            onError?.((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const busy = saving || savingProp;

    return (
        <div
            className="mb-2 rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.03] px-2.5 py-2"
            data-testid="configuration-category-create-row"
        >
            <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 space-y-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        New category
                    </span>
                    <input
                        autoFocus
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Licensing"
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                        data-testid="category-create-label"
                    />
                </label>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                        className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2 py-1 text-[11px] font-medium text-alloy-midnight/70"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || !canMutate || !label.trim()}
                        onClick={() => void create()}
                        className="config-primary-btn inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        data-testid="category-create-save"
                    >
                        <Plus size={12} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                        {busy ? "Creating…" : "Add"}
                    </button>
                </div>
            </div>
            {error ? <p className="mt-1 text-[11px] text-alloy-ember">{error}</p> : null}
        </div>
    );
}
