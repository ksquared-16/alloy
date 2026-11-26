"use client";

import { useMemo, useRef, useState } from "react";
import {
    COMMS_FIELD_LABEL_CLASS,
    COMMS_FIELD_STACK_CLASS,
    COMMS_INPUT_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SELECT_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { TEMPLATE_CATEGORY_PLACEHOLDER } from "@/lib/communications/v2/templateSchema";
import { resolveTemplateCategoryCommitValue } from "@/lib/communications/v2/templateCategoryCreate";
import { normalizeTemplateCategoryLabel } from "@/lib/communications/v2/templateCategoryOptions";

type Props = {
    value: string;
    onChange: (next: string) => void;
    existingCategories: string[];
    /** Categories created in-session before the next list refresh. */
    extraCategories?: string[];
    onCreateCategory?: (category: string) => void;
};

const CREATE_VALUE = "__create_category__";

/** Category picker — dropdown by default; explicit create mode reveals a visible text input. */
export default function TemplateCategoryField({
    value,
    onChange,
    existingCategories,
    extraCategories = [],
    onCreateCategory,
}: Props) {
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    const options = useMemo(() => {
        const set = new Set(
            [...existingCategories, ...extraCategories].map((c) => c.trim()).filter(Boolean)
        );
        const cur = value.trim();
        if (cur) set.add(cur);
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [existingCategories, extraCategories, value]);

    const selectValue = options.includes(value.trim()) ? value.trim() : "";

    const commitNewCategory = () => {
        const next = normalizeTemplateCategoryLabel(
            resolveTemplateCategoryCommitValue({ creating: true, draft, value: "" })
        );
        if (!next) return;
        onChange(next);
        onCreateCategory?.(next);
        setDraft("");
        setCreating(false);
    };

    const cancelCreate = () => {
        setCreating(false);
        setDraft("");
    };

    const openCreateMode = () => {
        setCreating(true);
        setDraft("");
        queueMicrotask(() => inputRef.current?.focus());
    };

    return (
        <div className={COMMS_FIELD_STACK_CLASS} data-template-category-field="true">
            <span className={COMMS_FIELD_LABEL_CLASS}>Category</span>

            {!creating ? (
                <select
                    data-template-category="true"
                    data-template-category-mode="dropdown"
                    value={selectValue}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_VALUE) {
                            openCreateMode();
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
                    <option value={CREATE_VALUE}>+ Create new category</option>
                </select>
            ) : (
                <div
                    data-template-category-mode="create"
                    className="rounded-lg border border-alloy-stone/25 bg-white p-2.5 shadow-sm"
                >
                    <input
                        ref={inputRef}
                        data-template-category-new="true"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commitNewCategory();
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                cancelCreate();
                            }
                        }}
                        placeholder={TEMPLATE_CATEGORY_PLACEHOLDER}
                        className={`${COMMS_INPUT_CLASS} text-alloy-midnight caret-alloy-midnight`}
                        autoComplete="off"
                    />
                    <div className="mt-2 flex shrink-0 gap-2">
                        <button
                            type="button"
                            data-template-category-add="true"
                            className={`${COMMS_PRIMARY_BTN_CLASS} !px-2.5 !py-1 text-[10px]`}
                            onClick={commitNewCategory}
                            disabled={!normalizeTemplateCategoryLabel(draft)}
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            data-template-category-cancel="true"
                            className={`${COMMS_SECONDARY_BTN_CLASS} !px-2.5 !py-1 text-[10px]`}
                            onClick={cancelCreate}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
