"use client";

/**
 * The conversational composer, its suggested replies, and the typed controls beside them.
 *
 * The surface this replaces put six full-width filled buttons where the conversation should be and
 * an input captioned "Or just reply here…" underneath, so the shortcuts read as the product and the
 * conversation read as an afterthought. That is inverted here: the composer is always present and
 * always primary, and the shortcuts are quiet pills above it — convenient, subordinate, skippable.
 *
 * PRESENTATION ONLY. Every control calls back with the participant's WORDS or with a value the
 * authored control produced. Nothing here names a field, a requirement or a command.
 */

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/**
 * A shortcut reply.
 *
 * `emphasis` marks the one a specialist would expect — "Yes, that's right" — which gets a filled
 * pill. Everything else is an outline pill. Never more than a couple: a wall of buttons is the
 * thing this design removes.
 */
export type SuggestedReply = {
    readonly label: string;
    readonly emphasis?: boolean;
    readonly onSelect: () => void;
};

export function SuggestedReplies({
    replies,
    busy,
    controlKind,
}: {
    replies: readonly SuggestedReply[];
    busy: boolean;
    /**
     * The AUTHORED control these shortcuts stand for — `boolean`, `options`, `confirm`, `optional`.
     *
     * A closed-choice need must never degrade to a text box, and this is the marker that proves it
     * did not: the pills ARE that control, rendered conversationally.
     */
    controlKind?: string;
}) {
    if (replies.length === 0) return null;
    return (
        <div
            className="mb-2.5 flex flex-wrap gap-2"
            data-participant-suggested="true"
            {...(controlKind ? { "data-participant-control": controlKind } : {})}
            aria-label="Suggested replies"
            role="group"
        >
            {replies.map((reply) => (
                <button
                    key={reply.label}
                    type="button"
                    disabled={busy}
                    onClick={reply.onSelect}
                    className={clsx(
                        // 36px tall with generous horizontal padding — a real touch target that still
                        // reads as a chip rather than a primary action.
                        "min-h-[36px] rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper",
                        "disabled:opacity-45",
                        reply.emphasis
                            ? "bg-alloy-midnight/[0.06] text-alloy-midnight hover:bg-alloy-midnight/[0.10]"
                            : "border border-alloy-midnight/12 text-alloy-midnight/70 hover:border-alloy-midnight/25 hover:text-alloy-midnight",
                    )}
                >
                    {reply.label}
                </button>
            ))}
        </div>
    );
}

/**
 * The persistent composer.
 *
 * Enter sends, Shift+Enter breaks the line, and the box grows with the text up to a ceiling. The
 * send affordance never leaves the layout while a reply is in flight — it changes colour, not
 * geometry — because a control that disappears under the parent's thumb reads as a bug.
 */
export function Composer({
    busy,
    placeholder,
    onSend,
    /** Focus the composer when the turn changes, on pointer-capable devices only. */
    focusSignal,
}: {
    busy: boolean;
    placeholder: string;
    onSend: (words: string) => void;
    focusSignal?: unknown;
}) {
    const [words, setWords] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);
    const ready = words.trim().length > 0 && !busy;

    // Auto-grow: the scroll height drives the box, so a two-line answer is not typed through a slot.
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        node.style.height = "auto";
        node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
    }, [words]);

    useEffect(() => {
        if (focusSignal === undefined) return;
        // Never on touch: focusing would open the keyboard over the question the parent just got.
        if (typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches) {
            ref.current?.focus();
        }
    }, [focusSignal]);

    const send = () => {
        const trimmed = words.trim();
        if (!trimmed || busy) return;
        setWords("");
        onSend(trimmed);
    };

    return (
        <div
            data-participant-composer="true"
            className={clsx(
                "flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 transition-colors",
                "border-alloy-midnight/12 focus-within:border-alloy-juniper/45 focus-within:ring-2 focus-within:ring-alloy-juniper/15",
            )}
        >
            <label htmlFor="participant-composer" className="sr-only">
                {placeholder}
            </label>
            <textarea
                id="participant-composer"
                ref={ref}
                rows={1}
                value={words}
                disabled={busy}
                placeholder={placeholder}
                enterKeyHint="send"
                onChange={(e) => setWords(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                    }
                }}
                className={clsx(
                    "max-h-[132px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 leading-snug outline-none",
                    // 16px on purpose: iOS zooms the page for anything smaller in a focused input.
                    "text-[16px] text-alloy-midnight placeholder:text-alloy-midnight/35",
                    "disabled:text-alloy-midnight/45",
                )}
            />
            <button
                type="button"
                onClick={send}
                disabled={!ready}
                aria-label="Send"
                className={clsx(
                    // Fixed 36px square in both states — the dock never changes height mid-reply.
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper",
                    ready
                        ? "bg-alloy-midnight text-white"
                        : "bg-alloy-midnight/[0.07] text-alloy-midnight/30",
                )}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                        d="M8 13V3.5M8 3.5L3.75 7.75M8 3.5l4.25 4.25"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
        </div>
    );
}

/**
 * The honest thinking affordance.
 *
 * Shown ONLY while governed interpretation is actually running — a deterministic "Yes" never
 * reaches this path. Three dots in Alloy's voice, not a spinner and never "Saving…": persistence is
 * the platform's business, and a parent asked to watch it is being shown the machine.
 */
export function ThinkingAffordance() {
    return (
        <div
            className="flex items-center gap-1.5 py-0.5"
            data-participant-thinking="true"
            aria-live="polite"
            aria-label="Alloy is reading your answer"
        >
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-alloy-midnight/30 motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 160}ms`, animationDuration: "1100ms" }}
                />
            ))}
        </div>
    );
}
