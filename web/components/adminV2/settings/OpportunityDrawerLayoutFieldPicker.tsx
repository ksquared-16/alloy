"use client";

import { useMemo, useState } from "react";

type FieldOption = { refKey: string; label: string };

type Props = {
    options: FieldOption[];
    value: string;
    onChange: (refKey: string) => void;
    onAdd: () => void;
    disabled?: boolean;
};

export default function OpportunityDrawerLayoutFieldPicker({
    options,
    value,
    onChange,
    onAdd,
    disabled,
}: Props) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options.slice(0, 40);
        return options
            .filter(
                (o) =>
                    o.refKey.toLowerCase().includes(q) ||
                    o.label.toLowerCase().includes(q),
            )
            .slice(0, 40);
    }, [options, query]);

    return (
        <div className="space-y-1" data-testid="visual-editor-field-picker">
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fields…"
                className="w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                data-testid="visual-editor-field-picker-search"
            />
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                data-testid="visual-editor-add-field"
                size={Math.min(6, Math.max(3, filtered.length))}
            >
                <option value="">Select field…</option>
                {filtered.map(({ refKey, label }) => (
                    <option key={refKey} value={refKey}>
                        {label} ({refKey})
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="w-full rounded-md border border-alloy-pine/25 px-2 py-1 text-xs font-medium text-alloy-pine disabled:opacity-40"
                onClick={onAdd}
                disabled={disabled || !value}
                data-testid="visual-editor-add-field-submit"
            >
                Add field
            </button>
        </div>
    );
}
