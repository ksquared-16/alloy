"use client";

import { useMemo, useState } from "react";
import {
    COMMS_FIELD_LABEL_CLASS,
    COMMS_INPUT_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SELECT_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { TEMPLATE_CATEGORY_PLACEHOLDER } from "@/lib/communications/v2/templateSchema";

type Props = {
    value: string;
    onChange: (next: string) => void;
    existingCategories: string[];
    /** Categories created in-session before the next list refresh. */
    extraCategories?: string[];
    onCreateCategory?: (category: string) => void;
};

const CREATE_VALUE = "__create_category__";

/** Lightweight category picker — options derived from existing templates; operator can add new inline. */
export default function TemplateCategoryField({
    value,
    onChange,
    existingCategories,
    extraCategories = [],
    onCreateCategory,
}: Props) {
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState("");

    const options = useMemo(() => {
        const set = new Set(
            [...existingCategories, ...extraCategories].map((c) => c.trim()).filter(Boolean)
        );
        const cur = value.trim();
        if (cur) set.add(cur);
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [existingCategories, extraCategories, value]);

    const commitNewCategory = () => {
        const next = draft.trim();
        if (!next) return;
        onChange(next);
        onCreateCategory?.(next);
        setDraft("");
        setCreating(false);
    };

    const showSelect = !creating && (options.length > 0 || value.trim());
    const selectValue = options.includes(value) ? value : value.trim() ? value : "";

    return (
        <div className="flex flex-col gap-1.5">
            <span className={COMMS_FIELD_LABEL_CLASS}>Category</span>
            {showSelect ? (
                <select
                    data-template-category="true"
                    value={selectValue}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_VALUE) {
                            setCreating(true);
                            setDraft(value.trim());
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        data-template-category-new="true"
                        value={creating ? draft : value}
                        onChange={(e) => {
                            const next = e.target.value;
                            if (creating) setDraft(next);
                            else onChange(next);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commitNewCategory();
                            }
                        }}
                        placeholder={TEMPLATE_CATEGORY_PLACEHOLDER}
                        className={COMMS_INPUT_CLASS}
                    />
                    <div className="flex shrink-0 gap-2">
                        <button
                            type="button"
                            data-template-category-add="true"
                            className={`${COMMS_PRIMARY_BTN_CLASS} !px-2 !py-1 text-[10px]`}
                            onClick={commitNewCategory}
                            disabled={!(creating ? draft.trim() : value.trim())}
                        >
                            Add category
                        </button>
                        {options.length > 0 ? (
                            <button
                                type="button"
                                className={`${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[10px]`}
                                onClick={() => {
                                    setCreating(false);
                                    setDraft("");
                                }}
                            >
                                Pick existing
                            </button>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
