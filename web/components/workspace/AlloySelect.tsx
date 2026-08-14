"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";
// The primitive carries its own presentation so it renders correctly on every surface
// that imports it — not only inside the operator runtime shell that used to own these
// rules. Without this, the trigger styled and the popup did not.
import "./alloySelect.css";

export type AlloySelectOption = { value: string; label: string };

/** Menu max-height (220px) + the 2px offset, so the flip decision matches the CSS. */
const MENU_SPACE_PX = 222;

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
    allowEmpty = true,
    density = "default",
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
    /**
     * Whether clearing back to no-value is a choice the operator can make.
     * Default `true`: the placeholder is the first entry and selecting it yields "".
     * Pass `false` for a required field — the list then offers only real options, while
     * the trigger still reads the placeholder until a value is set.
     */
    allowEmpty?: boolean;
    /** `compact` matches dense configuration forms; `default` matches operator surfaces. */
    density?: "default" | "compact";
    testId?: string;
    id?: string;
    "aria-label"?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
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
        () => (allowEmpty ? [{ value: "", label: placeholder }, ...options] : [...options]),
        [options, placeholder, allowEmpty]
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
        // Configuration forms are dense and often sit low in a scroll container. Opening
        // downward there puts the options off-screen, so flip when there is no room below
        // and there is room above. Measured at open time, not on every render.
        const rect = rootRef.current?.getBoundingClientRect();
        setDropUp(
            rect
                ? window.innerHeight - rect.bottom < MENU_SPACE_PX && rect.top > MENU_SPACE_PX
                : false,
        );
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
            className={clsx(
                "alloy-select",
                density === "compact" && "alloy-select--compact",
                open && "alloy-select--open",
                className,
            )}
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
                    className={clsx("alloy-select__list", dropUp && "alloy-select__list--above")}
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
