"use client";

/**
 * AlloyTimeInput — compact, keyboard-first time field for operational surfaces.
 *
 * Stored value: `HH:mm` (same contract as native `<input type="time">`).
 * Display: `8:30 AM`. Optional suggestion popover for fast repeated entry.
 */

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";

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
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(() => formatAlloyTimeDisplay(value));
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        setDraft(formatAlloyTimeDisplay(value));
        setInvalid(false);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
            {open && !disabled ? (
                <ul id={listId} role="listbox" className="alloy-time-input__list" aria-label={ariaLabel ?? "Suggested times"}>
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
                </ul>
            ) : null}
        </div>
    );
}
