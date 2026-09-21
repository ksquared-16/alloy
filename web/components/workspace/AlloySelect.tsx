"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";
// The primitive carries its own presentation so it renders correctly on every surface
// that imports it — not only inside the operator runtime shell that used to own these
// rules. Without this, the trigger styled and the popup did not.
import "./alloySelect.css";

export type AlloySelectOption = { value: string; label: string; disabled?: boolean };

/** Menu max-height (220px) + the 2px offset, so the flip decision matches the CSS. */
const MENU_SPACE_PX = 222;

/**
 * How long typed characters keep composing one prefix. Matches the WAI-ARIA listbox
 * guidance and is close enough to a native select that muscle memory carries over.
 */
const TYPEAHEAD_RESET_MS = 500;

/**
 * Resolve a typed buffer to an option index, native-select style.
 *
 * Two behaviours a native `<select>` has and a naive prefix match does not:
 *   - repeating ONE character ("ppp") cycles through every option starting with it,
 *     rather than searching for the literal string "ppp";
 *   - the search starts AFTER the current position and wraps, so pressing the same
 *     letter walks forward through matches instead of sticking on the first.
 *
 * Disabled options are never a destination. Returns -1 when nothing matches, and the
 * caller leaves the active option where it was — a non-match must not move the operator.
 */
export function resolveTypeaheadIndex(
    entries: readonly AlloySelectOption[],
    buffer: string,
    activeIndex: number,
): number {
    if (!buffer) return -1;
    const chars = [...buffer];
    const allSameChar = chars.every((c) => c.toLowerCase() === chars[0]!.toLowerCase());
    const needle = (allSameChar && chars.length > 1 ? chars[0]! : buffer).toLowerCase();

    // A fresh single-character search may land on the current option; a repeated or
    // multi-character one is always looking for the NEXT match.
    const advance = chars.length > 1 ? 1 : 0;
    const start = activeIndex < 0 ? 0 : activeIndex + advance;

    for (let step = 0; step < entries.length; step += 1) {
        const idx = (start + step) % entries.length;
        const entry = entries[idx]!;
        if (entry.disabled) continue;
        if (entry.label.toLowerCase().startsWith(needle)) return idx;
    }
    return -1;
}

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
    triggerClassName,
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
    /** Applied to the ROOT element — layout and positioning of the control as a whole. */
    className?: string;
    /**
     * Replaces the trigger's default chrome. For field-system adapters that already own a
     * form's input chrome, so they can present one control style without re-implementing
     * the listbox. It themes the trigger box only — the menu, keyboard model and ARIA are
     * the primitive's, always.
     */
    triggerClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
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

    /**
     * Typeahead state. A ref rather than state because typing must not re-render the
     * list on every keystroke — a long configured list stays responsive that way, and
     * the only visible effect of a keystroke is the active index moving.
     */
    const typeahead = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

    const seek = useCallback(
        (char: string, fromIndex: number): number => {
            const now = Date.now();
            const t = typeahead.current;
            t.buffer = now - t.at > TYPEAHEAD_RESET_MS ? char : t.buffer + char;
            t.at = now;
            return resolveTypeaheadIndex(entries, t.buffer, fromIndex);
        },
        [entries],
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

    /**
     * Return focus to the trigger when the menu closes.
     *
     * Focus is moved INTO the list while open (above), so when the list unmounts the browser drops
     * focus to `<body>` — the keyboard operator loses their place in the page and Tab restarts from
     * the top. Observed on the Focus Panel: after Escape closed a menu, `document.activeElement`
     * was BODY, which also made every enclosing layer unable to tell that the operator was still
     * inside a field.
     *
     * Only reclaims focus when the list actually had it (activeElement is body, or still inside
     * this control). Closing by clicking somewhere else must leave focus where the operator put it.
     */
    const wasOpen = useRef(false);
    useEffect(() => {
        const closing = wasOpen.current && !open;
        wasOpen.current = open;
        if (!closing || disabled) return;
        const active = document.activeElement;
        const strayed = active !== null && active !== document.body && !rootRef.current?.contains(active);
        if (strayed) return;
        triggerRef.current?.focus();
    }, [open, disabled]);

    /** A printable, unmodified character — the only thing typeahead should react to. */
    const isTypeaheadKey = (event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
        event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;

    const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
            return;
        }
        if (isTypeaheadKey(event)) {
            // A native select changes its VALUE when you type while closed. Alloy opens and
            // highlights instead: a control that commits a value the operator never saw is
            // exactly the accidental-mutation shape this runtime is trying to remove.
            event.preventDefault();
            const found = seek(event.key, entries.findIndex((e) => e.value === value));
            openList();
            if (found >= 0) setActiveIndex(found);
        }
    };

    /** Arrow past any disabled option rather than parking the operator on a dead row. */
    const stepIndex = (from: number, delta: number): number => {
        let next = from + delta;
        while (next >= 0 && next < entries.length && entries[next]?.disabled) next += delta;
        return next >= 0 && next < entries.length ? next : from;
    };

    const onOptionKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => stepIndex(i, 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => stepIndex(i, -1));
        } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(entries[0]?.disabled ? stepIndex(0, 1) : 0);
        } else if (event.key === "End") {
            event.preventDefault();
            const last = entries.length - 1;
            setActiveIndex(entries[last]?.disabled ? stepIndex(last, -1) : last);
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const entry = entries[index];
            if (entry && !entry.disabled) pick(entry.value);
        } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
        } else if (isTypeaheadKey(event)) {
            event.preventDefault();
            const found = seek(event.key, index);
            if (found >= 0) setActiveIndex(found);
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
                ref={triggerRef}
                type="button"
                id={id}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                className={clsx(
                    triggerClassName ?? WS_FIELD_SELECT_CHROME,
                    "alloy-select__trigger w-full disabled:opacity-50",
                )}
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
                            aria-disabled={o.disabled ? true : undefined}
                            className={clsx(
                                "alloy-select__option",
                                o.disabled && "alloy-select__option--disabled",
                                o.value === value && "alloy-select__option--selected",
                                index === activeIndex && "alloy-select__option--active",
                            )}
                            // mousedown keeps the pre-existing pointer behaviour (it fires
                            // before the trigger blurs); click is what synthetic clicks,
                            // touch taps and assistive tech actually emit. Selecting
                            // closes the list, so the pair can never double-fire.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                if (!o.disabled) pick(o.value);
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                if (!o.disabled) pick(o.value);
                            }}
                            onKeyDown={(event) => onOptionKeyDown(event, index)}
                            onMouseEnter={() => {
                                if (!o.disabled) setActiveIndex(index);
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

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * MULTI-SELECT — the same primitive, answering "which of these", not "which one".
 *
 * This is an extension of the control above, not a second control. It shares the stylesheet, the
 * keyboard model, the typeahead resolver, the flip measurement and the focus-restoration rule, so
 * a surface that needs more than one answer does not acquire a different set of manners. The three
 * things that genuinely differ are stated here and nowhere else:
 *
 *   1. SELECTING DOES NOT CLOSE. Picking one of several is not finishing, so Enter/Space toggles
 *      and the list stays open. Escape, Tab and an outside click are what finish.
 *   2. THERE IS NO PLACEHOLDER ENTRY. In a single select the placeholder is a real choice that
 *      means "none". Here, "none" is the empty array — and on the surface this was built for,
 *      an empty selection must NEVER quietly mean "everyone". Offering a row that clears the
 *      selection would invite exactly that reading.
 *   3. AN OPTION MAY BE EXCLUSIVE. Some answers cannot be combined with the others — "Household"
 *      is the whole account, so it cannot also be two of its children. Exclusivity is declared on
 *      the OPTION and enforced here, so no calling surface has to police it and none can forget.
 *
 * Everything else is deliberately identical.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export type AlloyMultiSelectOption = AlloySelectOption & {
    /**
     * This option is the whole set: choosing it clears every other selection, and choosing any
     * other clears it. Declared on the option because it is a property of the MEANING of the
     * value, not of the surface that happens to render it.
     */
    exclusive?: boolean;
};

/**
 * Apply one toggle under the exclusivity rule.
 *
 * Exported and pure so the rule can be locked directly. A test that had to mount a listbox to
 * discover that Household and a child cannot coexist would be testing React, not the rule.
 */
export function resolveMultiSelection(
    options: readonly AlloyMultiSelectOption[],
    current: readonly string[],
    toggled: string,
): string[] {
    const option = options.find((o) => o.value === toggled);
    if (!option || option.disabled) return [...current];

    /* Turning something OFF never needs the exclusivity rule — it only ever shrinks the set. */
    if (current.includes(toggled)) return current.filter((v) => v !== toggled);

    /* An exclusive option IS the answer: it replaces whatever was there. */
    if (option.exclusive) return [toggled];

    /* A normal option evicts any exclusive one, then joins the rest, in the options' own order. */
    const exclusiveValues = new Set(options.filter((o) => o.exclusive).map((o) => o.value));
    const kept = current.filter((v) => !exclusiveValues.has(v));
    const next = new Set([...kept, toggled]);
    return options.filter((o) => next.has(o.value)).map((o) => o.value);
}

/**
 * How the trigger reads when several things are chosen.
 *
 * Names while they fit, because an operator about to commit money should see WHO, not a count.
 * A count only takes over once the names would be truncated into uselessness anyway.
 */
export function summariseMultiSelection(
    options: readonly AlloyMultiSelectOption[],
    values: readonly string[],
    maxNames = 3,
): string {
    const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
    if (labels.length === 0) return "";
    if (labels.length <= maxNames) return labels.join(", ");
    return `${labels.length} selected`;
}

export function AlloyMultiSelect({
    values,
    onChange,
    options,
    disabled,
    placeholder = "Select…",
    density = "default",
    testId,
    id,
    "aria-label": ariaLabel,
    className,
    triggerClassName,
}: {
    values: readonly string[];
    onChange: (values: string[]) => void;
    options: readonly AlloyMultiSelectOption[];
    disabled?: boolean;
    placeholder?: string;
    density?: "default" | "compact";
    testId?: string;
    id?: string;
    "aria-label"?: string;
    className?: string;
    triggerClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listId = useId();

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

    const summary = summariseMultiSelection(options, values);
    const typeahead = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

    const seek = useCallback(
        (char: string, fromIndex: number): number => {
            const now = Date.now();
            const t = typeahead.current;
            t.buffer = now - t.at > TYPEAHEAD_RESET_MS ? char : t.buffer + char;
            t.at = now;
            return resolveTypeaheadIndex(options, t.buffer, fromIndex);
        },
        [options],
    );

    const toggle = useCallback(
        (value: string) => {
            onChange(resolveMultiSelection(options, values, value));
            /* Deliberately NOT closing — see (1) above. */
        },
        [onChange, options, values],
    );

    const openList = useCallback(() => {
        const first = options.findIndex((o) => values.includes(o.value));
        setActiveIndex(first >= 0 ? first : 0);
        const rect = rootRef.current?.getBoundingClientRect();
        setDropUp(
            rect ? window.innerHeight - rect.bottom < MENU_SPACE_PX && rect.top > MENU_SPACE_PX : false,
        );
        setOpen(true);
    }, [options, values]);

    useEffect(() => {
        if (!open) return;
        const node = listRef.current?.querySelectorAll<HTMLLIElement>("[role=option]")[activeIndex];
        node?.focus();
    }, [open, activeIndex]);

    const wasOpen = useRef(false);
    useEffect(() => {
        const closing = wasOpen.current && !open;
        wasOpen.current = open;
        if (!closing || disabled) return;
        const active = document.activeElement;
        const strayed = active !== null && active !== document.body && !rootRef.current?.contains(active);
        if (strayed) return;
        triggerRef.current?.focus();
    }, [open, disabled]);

    const isTypeaheadKey = (event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
        event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;

    const stepIndex = (from: number, delta: number): number => {
        let next = from + delta;
        while (next >= 0 && next < options.length && options[next]?.disabled) next += delta;
        return next >= 0 && next < options.length ? next : from;
    };

    const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
            return;
        }
        if (isTypeaheadKey(event)) {
            event.preventDefault();
            const found = seek(event.key, -1);
            openList();
            if (found >= 0) setActiveIndex(found);
        }
    };

    const onOptionKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => stepIndex(i, 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => stepIndex(i, -1));
        } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(options[0]?.disabled ? stepIndex(0, 1) : 0);
        } else if (event.key === "End") {
            event.preventDefault();
            const last = options.length - 1;
            setActiveIndex(options[last]?.disabled ? stepIndex(last, -1) : last);
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const option = options[index];
            if (option && !option.disabled) toggle(option.value);
        } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
        } else if (isTypeaheadKey(event)) {
            event.preventDefault();
            const found = seek(event.key, index);
            if (found >= 0) setActiveIndex(found);
        }
    };

    return (
        <div
            ref={rootRef}
            className={clsx(
                "alloy-select",
                "alloy-select--multi",
                density === "compact" && "alloy-select--compact",
                open && "alloy-select--open",
                className,
            )}
            data-testid={testId}
            data-alloy-multiselect="true"
            data-selected-count={values.length}
        >
            <button
                ref={triggerRef}
                type="button"
                id={id}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                className={clsx(
                    triggerClassName ?? WS_FIELD_SELECT_CHROME,
                    "alloy-select__trigger w-full disabled:opacity-50",
                )}
                onClick={() => {
                    if (disabled) return;
                    if (open) setOpen(false);
                    else openList();
                }}
                onKeyDown={onTriggerKeyDown}
            >
                <span className={clsx("alloy-select__value", !summary && "alloy-select__value--placeholder")}>
                    {summary || placeholder}
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
                    aria-multiselectable
                    className={clsx("alloy-select__list", dropUp && "alloy-select__list--above")}
                    aria-label={ariaLabel}
                    aria-activedescendant={`${listId}-opt-${activeIndex}`}
                >
                    {options.map((o, index) => {
                        const checked = values.includes(o.value);
                        return (
                            <li
                                key={o.value}
                                id={`${listId}-opt-${index}`}
                                role="option"
                                tabIndex={-1}
                                aria-selected={checked}
                                aria-disabled={o.disabled ? true : undefined}
                                data-option-value={o.value}
                                data-option-exclusive={o.exclusive ? "true" : undefined}
                                className={clsx(
                                    "alloy-select__option",
                                    "alloy-select__option--check",
                                    o.disabled && "alloy-select__option--disabled",
                                    checked && "alloy-select__option--selected",
                                    index === activeIndex && "alloy-select__option--active",
                                )}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    if (!o.disabled) toggle(o.value);
                                }}
                                onClick={(event) => {
                                    event.preventDefault();
                                }}
                                onKeyDown={(event) => onOptionKeyDown(event, index)}
                                onMouseEnter={() => {
                                    if (!o.disabled) setActiveIndex(index);
                                }}
                            >
                                <span className="alloy-select__check" aria-hidden>
                                    {checked ? "✓" : ""}
                                </span>
                                <span className="alloy-select__option-label">{o.label}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
