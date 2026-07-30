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
export function AlloySelect({
    value,
    onChange,
    options,
    disabled,
    placeholder = "Select…",
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
    const display = selected?.label ?? (value ? value : placeholder);

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
                <span className={clsx("alloy-select__value", !selected && "alloy-select__value--placeholder")}>
                    {display}
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
