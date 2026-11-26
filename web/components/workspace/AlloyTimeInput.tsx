"use client";

/**
 * AlloyTimeInput — compact, keyboard-first time field for operational surfaces.
 *
 * Stored value: `HH:mm` (same contract as native `<input type="time">`).
 * Display: `8:30 AM`. Optional suggestion popover for fast repeated entry.
 */

import clsx from "clsx";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
    ALLOY_TIME_SUGGESTIONS,
    formatAlloyTimeDisplay,
    parseAlloyTimeInput,
} from "@/lib/workspace/alloyTimeValue";

export function AlloyTimeInput({
    value,
    onChange,
    disabled,
    placeholder = "8:30 AM",
    "aria-label": ariaLabel,
    testId,
    className,
    suggestions = ALLOY_TIME_SUGGESTIONS,
}: {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
    placeholder?: string;
    "aria-label"?: string;
    testId?: string;
    className?: string;
    suggestions?: readonly string[];
}) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [listStyle, setListStyle] = useState<CSSProperties | null>(null);
    const [draft, setDraft] = useState(() => formatAlloyTimeDisplay(value));
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        setDraft(formatAlloyTimeDisplay(value));
        setInvalid(false);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            // The list is portaled, so "inside" is the field OR the list.
            if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    /*
     * THE SUGGESTIONS FLOAT AT PAGE LEVEL.
     *
     * Rendered inside the field, the list was clipped by any scrolling ancestor — in the Assignment
     * editor, the scrolling form area cut it off below the last row. It is portaled to the body and
     * placed (fixed) under the field, following it on scroll and resize. It opens downward only;
     * near the bottom of the viewport it shortens rather than flipping.
     */
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const field = rootRef.current?.getBoundingClientRect();
            if (!field) return;
            const below = window.innerHeight - field.bottom - 12;
            setListStyle({
                position: "fixed",
                left: field.left,
                top: field.bottom + 4,
                width: field.width,
                right: "auto",
                maxHeight: Math.max(120, Math.min(220, below)),
                zIndex: 85,
            });
        };
        place();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open]);

    const commitDraft = (raw: string) => {
        const parsed = parseAlloyTimeInput(raw);
        if (parsed === null) {
            setInvalid(true);
            setDraft(formatAlloyTimeDisplay(value));
            return;
        }
        setInvalid(false);
        setDraft(formatAlloyTimeDisplay(parsed));
        if (parsed !== value) onChange(parsed);
    };

    const pick = (stored: string) => {
        onChange(stored);
        setDraft(formatAlloyTimeDisplay(stored));
        setInvalid(false);
        setOpen(false);
    };

    return (
        <div
            ref={rootRef}
            className={clsx("alloy-time-input", open && "alloy-time-input--open", className)}
            data-testid={testId}
            data-alloy-time-input="true"
        >
            <div className={clsx("alloy-time-input__field", invalid && "alloy-time-input__field--invalid")}>
                <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    aria-invalid={invalid || undefined}
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-haspopup="listbox"
                    placeholder={placeholder}
                    value={draft}
                    className="alloy-time-input__control alloy-os-sched-input"
                    onChange={(event) => {
                        setDraft(event.target.value);
                        setInvalid(false);
                    }}
                    onBlur={() => commitDraft(draft)}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commitDraft(draft);
                            setOpen(false);
                        }
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setOpen(true);
                        }
                    }}
                />
                <button
                    type="button"
                    className="alloy-time-input__clock"
                    disabled={disabled}
                    aria-label={open ? "Hide time suggestions" : "Show time suggestions"}
                    tabIndex={-1}
                    onMouseDown={(event) => {
                        // Keep focus on the text field; toggle popover.
                        event.preventDefault();
                        setOpen((prev) => !prev);
                    }}
                >
                    <span aria-hidden>🕒</span>
                </button>
            </div>
            {open && !disabled && listStyle && typeof document !== "undefined" ? createPortal(
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className="alloy-time-input__list"
                    data-alloy-time-input-list="true"
                    style={listStyle}
                    aria-label={ariaLabel ?? "Suggested times"}
                >
                    {suggestions.map((stored) => {
                        const selected = stored === value;
                        return (
                            <li
                                key={stored}
                                role="option"
                                aria-selected={selected}
                                className={clsx(
                                    "alloy-time-input__option",
                                    selected && "alloy-time-input__option--selected",
                                )}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    pick(stored);
                                }}
                            >
                                {formatAlloyTimeDisplay(stored)}
                            </li>
                        );
                    })}
                </ul>,
                document.body,
            ) : null}
        </div>
    );
}
