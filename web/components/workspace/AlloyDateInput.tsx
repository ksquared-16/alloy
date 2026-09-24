"use client";

/**
 * AlloyDateInput — the date sibling of `AlloyTimeInput`, for operational surfaces.
 *
 * Stored value: `YYYY-MM-DD` (the same contract as native `<input type="date">`, so no caller's
 * payload or column semantics change). Display: the canonical `formatDisplayDate`.
 *
 * It exists because the surfaces that commit money were asking for a date through the BROWSER's
 * control — a system-styled widget with a platform calendar button, sitting between two canonical
 * Alloy dropdowns. This is not a date picker and owns no calendar: it is a text field that accepts
 * what an operator types, with the handful of relative days they actually reach for offered in a
 * listbox.
 *
 * The popover is `role="listbox"`, which is what `escapeLayerOwnership`'s
 * `TRANSIENT_POPUP_SELECTOR` already recognises — so Escape closes this list first and leaves the
 * surrounding depth card standing, with no second Escape listener and no change to that module.
 */

import clsx from "clsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { alloyDateSuggestions, parseAlloyDateInput } from "@/lib/workspace/alloyDateValue";

/** Display for a stored value. Empty stays empty so the placeholder can speak. */
function display(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return formatDisplayDate(trimmed) || trimmed;
}

export function AlloyDateInput({
    value,
    onChange,
    disabled,
    placeholder = "Sep 30, 2026",
    "aria-label": ariaLabel,
    testId,
    className,
    suggestions,
}: {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
    placeholder?: string;
    "aria-label"?: string;
    testId?: string;
    className?: string;
    suggestions?: ReadonlyArray<{ value: string; label: string }>;
}) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(() => display(value));
    const [invalid, setInvalid] = useState(false);
    /* Resolved once per mount: "Today" must not drift mid-edit, and it is not a render input. */
    const offered = useMemo(() => suggestions ?? alloyDateSuggestions(), [suggestions]);

    useEffect(() => {
        setDraft(display(value));
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
        const parsed = parseAlloyDateInput(raw);
        if (parsed === null) {
            /* UNPARSEABLE KEEPS THE LAST GOOD ANSWER. A guessed date on a money form is worse
               than no date, and the field says so rather than silently writing one. */
            setInvalid(true);
            setDraft(display(value));
            return;
        }
        setInvalid(false);
        setDraft(display(parsed));
        if (parsed !== value) onChange(parsed);
    };

    const pick = (stored: string) => {
        onChange(stored);
        setDraft(display(stored));
        setInvalid(false);
        setOpen(false);
    };

    return (
        <div
            ref={rootRef}
            className={clsx("alloy-date-input", open && "alloy-date-input--open", className)}
            data-testid={testId}
            data-alloy-date-input="true"
        >
            <div className={clsx("alloy-date-input__field", invalid && "alloy-date-input__field--invalid")}>
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
                    className="alloy-date-input__control alloy-os-sched-input"
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
                    className="alloy-date-input__calendar"
                    disabled={disabled}
                    aria-label={open ? "Hide date suggestions" : "Show date suggestions"}
                    tabIndex={-1}
                    onMouseDown={(event) => {
                        // Keep focus on the text field; toggle popover.
                        event.preventDefault();
                        setOpen((prev) => !prev);
                    }}
                >
                    <span aria-hidden>📅</span>
                </button>
            </div>
            {open && !disabled ? (
                <ul
                    id={listId}
                    role="listbox"
                    className="alloy-date-input__list"
                    aria-label={ariaLabel ?? "Suggested dates"}
                >
                    {offered.map((option) => {
                        const selected = option.value === value;
                        return (
                            <li
                                key={option.value}
                                role="option"
                                aria-selected={selected}
                                className={clsx(
                                    "alloy-date-input__option",
                                    selected && "alloy-date-input__option--selected",
                                )}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    pick(option.value);
                                }}
                            >
                                <span className="alloy-date-input__option-label">{option.label}</span>
                                <span className="alloy-date-input__option-date">{display(option.value)}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
