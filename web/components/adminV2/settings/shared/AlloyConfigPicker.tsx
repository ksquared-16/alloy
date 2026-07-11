"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";

export type AlloyConfigPickerOption = {
    value: string;
    label: string;
    description?: string;
    group?: string;
    disabled?: boolean;
    disabledReason?: string;
};

export type AlloyConfigPickerGroup = {
    key: string;
    label: string;
};

type Props = {
    label: string;
    value: string;
    options: AlloyConfigPickerOption[];
    groups?: AlloyConfigPickerGroup[];
    onChange: (value: string) => void;
    searchable?: boolean;
    clearable?: boolean;
    testId?: string;
    placeholder?: string;
    compact?: boolean;
};

const GROUP_ORDER = [
    "Recommended",
    "Communications",
    "Workflow",
    "Relationships",
    "Lifecycle",
    "Record actions",
    "BOS",
];

function groupLabelForOption(option: AlloyConfigPickerOption): string {
    return option.group ?? "Record actions";
}

export default function AlloyConfigPicker({
    label,
    value,
    options,
    onChange,
    searchable = true,
    clearable = true,
    testId,
    placeholder = "Select…",
    compact = false,
}: Props) {
    const listboxId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);

    const selected = options.find((row) => row.value === value) ?? null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((row) => {
            const haystack = `${row.label} ${row.description ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [options, query]);

    const groupedEntries = useMemo(() => {
        const buckets = new Map<string, AlloyConfigPickerOption[]>();
        for (const option of filtered) {
            const group = groupLabelForOption(option);
            const list = buckets.get(group) ?? [];
            list.push(option);
            buckets.set(group, list);
        }
        const orderedGroups = [
            ...GROUP_ORDER.filter((key) => buckets.has(key)),
            ...[...buckets.keys()].filter((key) => !GROUP_ORDER.includes(key)),
        ];
        return orderedGroups.map((groupKey) => ({
            groupKey,
            items: buckets.get(groupKey) ?? [],
        }));
    }, [filtered]);

    const flatFiltered = useMemo(
        () => groupedEntries.flatMap((entry) => entry.items),
        [groupedEntries],
    );

    const close = useCallback(() => {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
        triggerRef.current?.focus();
    }, []);

    const selectValue = useCallback(
        (next: string) => {
            onChange(next);
            close();
        },
        [close, onChange],
    );

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(flatFiltered.length - 1, 0)));
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
                return;
            }
            if (event.key === "Enter" && flatFiltered[activeIndex] && !flatFiltered[activeIndex]?.disabled) {
                event.preventDefault();
                selectValue(flatFiltered[activeIndex]!.value);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [activeIndex, close, flatFiltered, open, selectValue]);

    let runningIndex = -1;

    return (
        <div className="space-y-1" data-testid={testId}>
            <span className="text-[10px] font-semibold text-alloy-midnight/70">{label}</span>
            <div className="relative">
                <button
                    ref={triggerRef}
                    type="button"
                    className={clsx(
                        "alloy-config-picker__trigger flex w-full items-center justify-between gap-2 rounded border border-alloy-forge/15 bg-white text-left text-alloy-midnight shadow-sm transition-colors",
                        compact ? "px-2 py-1 text-[10px]" : "px-2 py-1.5 text-xs",
                        open && "border-alloy-bend-pine/40 ring-2 ring-alloy-bend-pine/20",
                    )}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    data-alloy-config-picker-trigger="true"
                    onClick={() => setOpen((current) => !current)}
                >
                    <span className="min-w-0 flex-1 truncate">
                        {selected?.label ?? placeholder}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-alloy-midnight/45">
                        {clearable && value ?
                            <span
                                role="button"
                                tabIndex={-1}
                                className="rounded p-0.5 hover:bg-alloy-bend-pine/[0.08] hover:text-alloy-bend-pine"
                                aria-label={`Clear ${label}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onChange("");
                                    close();
                                }}
                            >
                                <X className="h-3 w-3" aria-hidden />
                            </span>
                        :   null}
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </span>
                </button>

                <ComposerFloatingPopover open={open} anchorRef={triggerRef} onClose={close} className="alloy-config-picker__panel">
                    <div
                        id={listboxId}
                        role="listbox"
                        aria-label={label}
                        className="overflow-hidden rounded-lg border border-alloy-forge/15 bg-white shadow-lg"
                        data-alloy-config-picker-panel="true"
                    >
                        {searchable && options.length > 6 ?
                            <div className="border-b border-alloy-forge/10 px-2 py-1.5">
                                <label className="flex items-center gap-2 rounded-md border border-alloy-forge/10 bg-white px-2 py-1">
                                    <Search className="h-3.5 w-3.5 text-alloy-midnight/40" aria-hidden />
                                    <input
                                        ref={searchRef}
                                        type="search"
                                        value={query}
                                        onChange={(event) => {
                                            setQuery(event.target.value);
                                            setActiveIndex(0);
                                        }}
                                        placeholder="Search…"
                                        className="min-w-0 flex-1 border-0 bg-transparent text-xs text-alloy-midnight outline-none"
                                        data-alloy-config-picker-search="true"
                                    />
                                </label>
                            </div>
                        :   null}

                        <div className="max-h-64 overflow-y-auto p-1">
                            {flatFiltered.length === 0 ?
                                <p className="px-2 py-3 text-xs text-alloy-midnight/50" data-alloy-config-picker-empty="true">
                                    No matching options.
                                </p>
                            :   groupedEntries.map((group) => (
                                    <div key={group.groupKey} className="mb-1 last:mb-0">
                                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            {group.groupKey}
                                        </p>
                                        {group.items.map((option) => {
                                            runningIndex += 1;
                                            const index = runningIndex;
                                            const selectedState = option.value === value;
                                            const activeState = index === activeIndex;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={selectedState}
                                                    disabled={option.disabled}
                                                    className={clsx(
                                                        "flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors",
                                                        selectedState && "bg-alloy-bend-pine/[0.12] text-alloy-midnight",
                                                        !selectedState && activeState && "bg-alloy-bend-pine/[0.06]",
                                                        !selectedState && !activeState && "hover:bg-alloy-bend-pine/[0.06]",
                                                        option.disabled && "cursor-not-allowed opacity-50",
                                                    )}
                                                    data-alloy-config-picker-option={option.value}
                                                    onMouseEnter={() => setActiveIndex(index)}
                                                    onClick={() => {
                                                        if (option.disabled) return;
                                                        selectValue(option.value);
                                                    }}
                                                >
                                                    <span className="text-xs font-medium text-alloy-midnight">{option.label}</span>
                                                    {option.description ?
                                                        <span className="text-[10px] text-alloy-midnight/55">{option.description}</span>
                                                    :   null}
                                                    {option.disabled && option.disabledReason ?
                                                        <span className="text-[10px] text-amber-800">{option.disabledReason}</span>
                                                    :   null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </ComposerFloatingPopover>
            </div>
        </div>
    );
}
