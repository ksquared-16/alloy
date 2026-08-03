"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import { WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";

export type AlloySelectOption = { value: string; label: string };

/**
 * Controlled select with Alloy chrome.
 * Uses a custom listbox (not native `<select>`) so the open menu stays white + midnight —
 * native option popups ignore CSS on macOS and show the OS gray menu.
 */
function looksLikeUuid(raw: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        raw.trim(),
    );
}

export function AlloySelect({
    value,
    onChange,
    options,
    disabled,
    placeholder = "Select…",
    /** Human label when `value` is a raw id and options have not resolved yet. */
    valueLabelHint,
    testId,
    id,
    "aria-label": ariaLabel,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    options: readonly AlloySelectOption[];
    disabled?: boolean;
    placeholder?: string;
    valueLabelHint?: string | null;
    testId?: string;
    id?: string;
    "aria-label"?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
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

    const selected = options.find((o) => o.value === value);
    const hint = (valueLabelHint ?? "").trim();
    // Never flash a raw UUID in the trigger while options resolve — use the
    // known label hint (e.g. "Infant") or the placeholder instead.
    const displayText =
        selected?.label
        ?? (hint && !looksLikeUuid(hint) ? hint : null)
        ?? (value && !looksLikeUuid(value) ? value : null)
        ?? placeholder;

    const pick = (next: string) => {
        onChange(next);
        setOpen(false);
    };

    return (
        <div
            ref={rootRef}
            className={clsx("alloy-select", open && "alloy-select--open", className)}
            data-testid={testId}
        >
            <button
                type="button"
                id={id}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                className={clsx(WS_FIELD_SELECT_CHROME, "alloy-select__trigger w-full disabled:opacity-50")}
                onClick={() => {
                    if (!disabled) setOpen((prev) => !prev);
                }}
            >
                <span
                    className={clsx(
                        "alloy-select__value",
                        !selected && !hint && "alloy-select__value--placeholder",
                    )}
                >
                    {displayText}
                </span>
                <span className="alloy-select__chevron" aria-hidden>
                    ▾
                </span>
            </button>
            {open ? (
                <ul id={listId} role="listbox" className="alloy-select__list" aria-label={ariaLabel}>
                    <li
                        role="option"
                        aria-selected={value === ""}
                        className={clsx("alloy-select__option", value === "" && "alloy-select__option--selected")}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            pick("");
                        }}
                    >
                        {placeholder}
                    </li>
                    {options.map((o) => (
                        <li
                            key={o.value}
                            role="option"
                            aria-selected={o.value === value}
                            className={clsx(
                                "alloy-select__option",
                                o.value === value && "alloy-select__option--selected",
                            )}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                pick(o.value);
                            }}
                        >
                            {o.label}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
