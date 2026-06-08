"use client";

import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import {
    insertInlineFieldToken,
    listInlineTokenEligibleFields,
    parseInlineFieldTokenKeys,
    validateInlineFieldTokenKeys,
} from "@/lib/forms/inlineFieldTokens";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    schema: FormSchemaV1;
    content: string;
    disabled?: boolean;
    onContentChange: (next: string) => void;
    textareaTestId?: string;
    textareaClassName?: string;
    placeholder?: string;
};

/** Textarea with field-token insert picker (FD-15 MVP authoring). */
export function InlineFieldTokenAuthoringControls({
    schema,
    content,
    disabled = false,
    onContentChange,
    textareaTestId,
    textareaClassName,
    placeholder,
}: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selectedFieldId, setSelectedFieldId] = useState("");

    const eligibleFields = useMemo(() => listInlineTokenEligibleFields(schema), [schema]);
    const tokenKeys = useMemo(() => parseInlineFieldTokenKeys(content), [content]);
    const validation = useMemo(
        () => validateInlineFieldTokenKeys(content, eligibleFields.map((f) => f.id)),
        [content, eligibleFields]
    );

    const fieldLabelById = useMemo(
        () => Object.fromEntries(eligibleFields.map((f) => [f.id, f.label])),
        [eligibleFields]
    );

    const handleInsert = () => {
        if (!selectedFieldId) return;
        const el = textareaRef.current;
        const start = el?.selectionStart ?? content.length;
        const end = el?.selectionEnd ?? start;
        const { nextContent, nextCursor } = insertInlineFieldToken(content, selectedFieldId, start, end);
        onContentChange(nextContent);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(nextCursor, nextCursor);
        });
    };

    return (
        <div className="space-y-2" data-testid="inline-field-token-authoring">
            <textarea
                ref={textareaRef}
                className={textareaClassName}
                disabled={disabled}
                value={content}
                placeholder={placeholder}
                data-testid={textareaTestId}
                onChange={(e) => onContentChange(e.target.value)}
            />

            <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1 space-y-0.5">
                    <span className="text-xs font-medium text-alloy-midnight/75">Insert field reference</span>
                    <select
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-50"
                        disabled={disabled || eligibleFields.length === 0}
                        value={selectedFieldId}
                        data-testid="inline-field-token-picker"
                        onChange={(e) => setSelectedFieldId(e.target.value)}
                    >
                        <option value="">Choose a field…</option>
                        {eligibleFields.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.label}
                                {f.required ? " *" : ""}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-3 py-1.5 text-sm font-semibold text-alloy-midnight shadow-sm hover:bg-alloy-stone/10 disabled:opacity-40"
                    disabled={disabled || !selectedFieldId}
                    data-testid="inline-field-token-insert"
                    onClick={handleInsert}
                >
                    Insert field
                </button>
            </div>

            {tokenKeys.length > 0 ?
                <div className="flex flex-wrap gap-1.5" data-testid="inline-field-token-chips">
                    {tokenKeys.map((key) => {
                        const unknown = validation.unknownKeys.includes(key);
                        const label = fieldLabelById[key] ?? key;
                        return (
                            <span
                                key={key}
                                className={clsx(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                                    unknown ?
                                        "bg-amber-50 text-amber-900 ring-amber-200/80"
                                    :   "bg-alloy-blue/10 text-alloy-midnight ring-alloy-blue/20"
                                )}
                                data-testid={`inline-field-token-chip-${key}`}
                            >
                                {unknown ? `Unknown: ${key}` : label}
                            </span>
                        );
                    })}
                </div>
            :   null}

            <p className={opMutedMeta}>
                References existing form fields inline — no duplicate fields are created. Repeating-group fields are
                not supported in this MVP.
            </p>
            {validation.unknownKeys.length > 0 ?
                <p className={clsx(opMetadata, "text-amber-900")} data-testid="inline-field-token-unknown-warning">
                    Unknown tokens: {validation.unknownKeys.map((k) => `{{${k}}}`).join(", ")}
                </p>
            :   null}
        </div>
    );
}
