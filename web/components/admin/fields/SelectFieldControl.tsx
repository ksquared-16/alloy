"use client";

import type { SelectOptionChoice } from "@/lib/admin/hooks/useOptionSetSelectOptions";

const SELECT_CLASS =
    "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-[rgba(0,162,131,0.45)] focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60";

type Props = {
    value: string;
    onChange: (value: string) => void;
    options: readonly SelectOptionChoice[];
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    "data-testid"?: string;
    "aria-label"?: string;
};

/** Shared native `<select>` for field_definitions-backed option sets. */
export default function SelectFieldControl({
    value,
    onChange,
    options,
    disabled = false,
    placeholder = "Select…",
    className,
    "data-testid": dataTestId,
    "aria-label": ariaLabel,
}: Props) {
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={className ?? SELECT_CLASS}
            data-testid={dataTestId}
            aria-label={ariaLabel}
        >
            <option value="">{placeholder}</option>
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
