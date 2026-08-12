"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
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

    /**
     * Every entry in the listbox, placeholder first, so keyboard and pointer
     * traverse exactly the same sequence.
     */
    const entries = useMemo(
        () => [{ value: "", label: placeholder }, ...options],
        [options, placeholder]
    );

    const pick = useCallback(
        (next: string) => {
            onChange(next);
            setOpen(false);
        },
        [onChange]
    );

    // Open on the current selection so ArrowDown starts from where the operator is.
    const openList = useCallback(() => {
        const idx = entries.findIndex((e) => e.value === value);
        setActiveIndex(idx >= 0 ? idx : 0);
        setOpen(true);
    }, [entries, value]);

    // Move DOM focus with the active option so screen readers and the browser's
    // own focus ring follow the keyboard.
    useEffect(() => {
        if (!open) return;
        const node = listRef.current?.querySelectorAll<HTMLLIElement>("[role=option]")[activeIndex];
        node?.focus();
    }, [open, activeIndex]);

    const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
        }
    };

    const onOptionKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, entries.length - 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
        } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(entries.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pick(entries[index]?.value ?? "");
        } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
        }
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
                    if (disabled) return;
                    if (open) setOpen(false);
                    else openList();
                }}
                onKeyDown={onTriggerKeyDown}
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
                <ul
                    id={listId}
                    ref={listRef}
                    role="listbox"
                    className="alloy-select__list"
                    aria-label={ariaLabel}
                    aria-activedescendant={`${listId}-opt-${activeIndex}`}
                >
                    {entries.map((o, index) => (
                        <li
                            key={o.value || "__placeholder__"}
                            id={`${listId}-opt-${index}`}
                            role="option"
                            tabIndex={-1}
                            aria-selected={o.value === value}
                            className={clsx(
                                "alloy-select__option",
                                o.value === value && "alloy-select__option--selected",
                                index === activeIndex && "alloy-select__option--active",
                            )}
                            // mousedown keeps the pre-existing pointer behaviour (it fires
                            // before the trigger blurs); click is what synthetic clicks,
                            // touch taps and assistive tech actually emit. Selecting
                            // closes the list, so the pair can never double-fire.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                pick(o.value);
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                pick(o.value);
                            }}
                            onKeyDown={(event) => onOptionKeyDown(event, index)}
                            onMouseEnter={() => setActiveIndex(index)}
                        >
                            {o.label}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
