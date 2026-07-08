"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import ConfigurationStatusToggle from "@/components/adminV2/configuration/ConfigurationStatusToggle";
import {
    fieldTypeOperatorLabel,
    slugifyOperatorKey,
} from "@/lib/fields/dataModelWorkspaceOperatorUi";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Plus } from "lucide-react";

export type FieldInlineCreateValues = {
    label: string;
    field_key: string;
    field_type: string;
    category_key: string;
    description: string;
    is_active: boolean;
};

type Props = {
    open: boolean;
    categoryOptions: Array<{ value: string; label: string }>;
    saving?: boolean;
    error?: string | null;
    canMutate?: boolean;
    onCancel: () => void;
    onCreate: (values: FieldInlineCreateValues) => void | Promise<void>;
};

const EMPTY: FieldInlineCreateValues = {
    label: "",
    field_key: "",
    field_type: "text",
    category_key: "custom",
    description: "",
    is_active: true,
};

export default function DataModelFieldCreateRow({
    open,
    categoryOptions,
    saving = false,
    error = null,
    canMutate = false,
    onCancel,
    onCreate,
}: Props) {
    const [draft, setDraft] = useState<FieldInlineCreateValues>(EMPTY);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const keyTouched = useRef(false);

    useEffect(() => {
        if (!open) return;
        setDraft({
            ...EMPTY,
            category_key:
                categoryOptions.find((o) => o.value === "custom")?.value ?? categoryOptions[0]?.value ?? "custom",
        });
        keyTouched.current = false;
        setAdvancedOpen(false);
    }, [open, categoryOptions]);

    useEffect(() => {
        if (!open || keyTouched.current) return;
        const slug = slugifyOperatorKey(draft.label);
        if (slug.length >= 2) setDraft((d) => ({ ...d, field_key: slug }));
    }, [draft.label, open]);

    if (!open) return null;

    return (
        <div
            className="mb-3 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.04]"
            data-testid="data-model-field-create-row"
            data-expanded="true"
        >
            <div className="flex items-center gap-2 border-b border-alloy-bend-pine/15 px-2.5 py-2">
                <Plus size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" aria-hidden />
                <p className="text-[13px] font-semibold text-alloy-midnight">New field</p>
            </div>
            <div className="grid gap-2.5 px-3 py-3 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Label</span>
                    <input
                        autoFocus
                        value={draft.label}
                        onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-create-label"
                        placeholder="e.g. Preferred name"
                    />
                </label>
                <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Field type
                    </span>
                    <select
                        value={draft.field_type}
                        onChange={(e) => setDraft((d) => ({ ...d, field_type: e.target.value }))}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-create-type"
                    >
                        {ADMIN_FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {fieldTypeOperatorLabel(t)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Category
                    </span>
                    <select
                        value={draft.category_key}
                        onChange={(e) => setDraft((d) => ({ ...d, category_key: e.target.value }))}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-create-category"
                    >
                        {categoryOptions.length === 0 ? <option value="custom">Custom</option> : null}
                        {categoryOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Description
                    </span>
                    <textarea
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        rows={2}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-create-description"
                        placeholder="What this field captures for your organization"
                    />
                </label>
                <div className="sm:col-span-2">
                    <ConfigurationStatusToggle
                        active={draft.is_active}
                        onChange={(is_active) => setDraft((d) => ({ ...d, is_active }))}
                    />
                </div>
                <div className="sm:col-span-2">
                    <ConfigurationAdvancedToggle open={advancedOpen} onToggle={() => setAdvancedOpen((o) => !o)} />
                    {advancedOpen ? (
                        <label className="mt-2 block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Internal key
                            </span>
                            <input
                                value={draft.field_key}
                                onChange={(e) => {
                                    keyTouched.current = true;
                                    setDraft((d) => ({ ...d, field_key: e.target.value }));
                                }}
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-sm"
                                data-testid="inline-create-key"
                            />
                            <p className="text-[10px] text-alloy-midnight/40">Generated automatically from the label.</p>
                        </label>
                    ) : null}
                </div>
            </div>
            {error ? (
                <p className="px-3 text-xs text-alloy-ember" data-testid="inline-create-error">
                    {error}
                </p>
            ) : null}
            <div className="flex justify-end gap-2 px-3 pb-3">
                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                    data-testid="inline-create-cancel"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={saving || !canMutate}
                    onClick={() => void onCreate(draft)}
                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                    data-testid="inline-create-save"
                >
                    {saving ? "Creating…" : "Create"}
                </button>
            </div>
        </div>
    );
}
