"use client";

import { useCallback } from "react";
import { COMMS_SECONDARY_BTN_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";

type Props = {
    value: string;
    onChange: (next: string) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    className?: string;
};

const EMOJI_OPTIONS = ["👋", "✅", "📅", "📍", "❤️", "⭐"];

function wrapSelection(value: string, start: number, end: number, before: string, after: string, placeholder = "text") {
    const selected = value.slice(start, end) || placeholder;
    return {
        next: value.slice(0, start) + before + selected + after + value.slice(end),
        cursor: start + before.length + selected.length + after.length,
    };
}

/** Lightweight markdown-style inserts — stored as plain text; no rich-text engine yet. */
export default function CommsMessageTextToolbar({ value, onChange, textareaRef, className = "" }: Props) {
    const applyWrap = useCallback(
        (before: string, after: string, placeholder?: string) => {
            const el = textareaRef.current;
            const start = el?.selectionStart ?? value.length;
            const end = el?.selectionEnd ?? value.length;
            const { next, cursor } = wrapSelection(value, start, end, before, after, placeholder);
            onChange(next);
            requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(cursor, cursor);
            });
        },
        [onChange, textareaRef, value]
    );

    const insertAtCursor = useCallback(
        (snippet: string) => {
            const el = textareaRef.current;
            const start = el?.selectionStart ?? value.length;
            const end = el?.selectionEnd ?? value.length;
            const next = value.slice(0, start) + snippet + value.slice(end);
            onChange(next);
            const cursor = start + snippet.length;
            requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(cursor, cursor);
            });
        },
        [onChange, textareaRef, value]
    );

    const btnClass = `${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[10px]`;

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-comms-message-toolbar="true" aria-label="Message formatting">
            <button type="button" className={btnClass} title="Bold (**text**)" onClick={() => applyWrap("**", "**")}>
                Bold
            </button>
            <button type="button" className={btnClass} title="Italic (*text*)" onClick={() => applyWrap("*", "*")}>
                Italic
            </button>
            <button
                type="button"
                className={btnClass}
                title="Link ([label](url))"
                onClick={() => applyWrap("[", "](https://)", "link text")}
            >
                Link
            </button>
            <label className="inline-flex items-center gap-1">
                <span className="sr-only">Insert emoji</span>
                <select
                    className="rounded-lg border border-alloy-stone/25 bg-white px-2 py-1 text-[10px] font-medium text-alloy-midnight/75 shadow-sm"
                    defaultValue=""
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v) insertAtCursor(v);
                        e.target.value = "";
                    }}
                >
                    <option value="">Emoji</option>
                    {EMOJI_OPTIONS.map((e) => (
                        <option key={e} value={e}>
                            {e}
                        </option>
                    ))}
                </select>
            </label>
            <button type="button" disabled title="Image attachments — coming soon" className={`${btnClass} cursor-not-allowed opacity-50`}>
                Image
            </button>
        </div>
    );
}
