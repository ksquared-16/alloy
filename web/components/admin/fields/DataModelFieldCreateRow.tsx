"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Plus } from "lucide-react";

export type FieldInlineCreateValues = {
    label: string;
    field_key: string;
    field_type: string;
    section_key: string;
    description: string;
    is_required: boolean;
    is_visible_in_form: boolean;
    is_visible_in_drawer: boolean;
    is_visible_in_table: boolean;
};

type Props = {
    open: boolean;
    sectionOptions: Array<{ value: string; label: string }>;
    saving?: boolean;
    error?: string | null;
    canMutate?: boolean;
    onCancel: () => void;
    onCreate: (values: FieldInlineCreateValues) => void | Promise<void>;
};

function slugifyLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64);
}

const EMPTY: FieldInlineCreateValues = {
    label: "",
    field_key: "",
    field_type: "text",
    section_key: "custom",
    description: "",
    is_required: false,
    is_visible_in_form: true,
    is_visible_in_drawer: true,
    is_visible_in_table: true,
};

export default function DataModelFieldCreateRow({
    open,
    sectionOptions,
    saving = false,
    error = null,
    canMutate = false,
    onCancel,
    onCreate,
}: Props) {
    const [draft, setDraft] = useState<FieldInlineCreateValues>(EMPTY);
    const keyTouched = useRef(false);

    useEffect(() => {
        if (!open) return;
        setDraft({
            ...EMPTY,
            section_key: sectionOptions.find((o) => o.value === "custom")?.value ?? sectionOptions[0]?.value ?? "custom",
        });
        keyTouched.current = false;
    }, [open, sectionOptions]);

    useEffect(() => {
        if (!open || keyTouched.current) return;
        const slug = slugifyLabel(draft.label);
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
                <label className="block space-y-1">
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
                        Field key
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
                                {t}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Section</span>
                    <select
                        value={draft.section_key}
                        onChange={(e) => setDraft((d) => ({ ...d, section_key: e.target.value }))}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-create-section"
                    >
                        {sectionOptions.length === 0 ? <option value="custom">Custom</option> : null}
                        {sectionOptions.map((opt) => (
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
                    />
                </label>
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                    {(
                        [
                            ["is_required", "Required"],
                            ["is_visible_in_form", "Forms"],
                            ["is_visible_in_drawer", "Drawers"],
                            ["is_visible_in_table", "Tables"],
                        ] as const
                    ).map(([key, label]) => (
                        <label key={key} className="inline-flex items-center gap-1.5 text-[12px] text-alloy-midnight/75">
                            <input
                                type="checkbox"
                                checked={Boolean(draft[key])}
                                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                            />
                            {label}
                        </label>
                    ))}
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
