"use client";

import { useMemo, useState } from "react";
import { COMMS_FIELD_LABEL_CLASS, COMMS_INPUT_CLASS, COMMS_SELECT_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import { TEMPLATE_CATEGORY_PLACEHOLDER } from "@/lib/communications/v2/templateSchema";

type Props = {
    value: string;
    onChange: (next: string) => void;
    existingCategories: string[];
};

const CREATE_VALUE = "__create_category__";

/** Lightweight category picker — options derived from existing templates; operator can add new. */
export default function TemplateCategoryField({ value, onChange, existingCategories }: Props) {
    const [creating, setCreating] = useState(false);
    const options = useMemo(() => {
        const set = new Set(existingCategories.map((c) => c.trim()).filter(Boolean));
        const cur = value.trim();
        if (cur) set.add(cur);
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [existingCategories, value]);

    const selectValue = creating || !value || !options.includes(value) ? (creating ? CREATE_VALUE : value || "") : value;

    return (
        <div className="flex flex-col gap-1.5">
            <span className={COMMS_FIELD_LABEL_CLASS}>Category</span>
            {options.length > 0 && !creating ? (
                <select
                    data-template-category="true"
                    value={selectValue}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_VALUE) {
                            setCreating(true);
                            onChange("");
                            return;
                        }
                        onChange(v);
                    }}
                    className={COMMS_SELECT_CLASS}
                >
                    <option value="">Select category…</option>
                    {options.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                    <option value={CREATE_VALUE}>+ Create category…</option>
                </select>
            ) : null}
            {(creating || options.length === 0) && (
                <div className="flex gap-2">
                    <input
                        data-template-category-new="true"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={TEMPLATE_CATEGORY_PLACEHOLDER}
                        className={COMMS_INPUT_CLASS}
                    />
                    {options.length > 0 ? (
                        <button
                            type="button"
                            className="shrink-0 rounded-lg border border-alloy-stone/25 px-2 py-1 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/8"
                            onClick={() => setCreating(false)}
                        >
                            Pick existing
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}
