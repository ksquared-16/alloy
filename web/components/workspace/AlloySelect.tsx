"use client";

import clsx from "clsx";
import { WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";

export type AlloySelectOption = { value: string; label: string };

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
    // Always include an empty option so controlled value="" is valid while options
    // load or when the field is cleared (matches SelectFieldControl).
    return (
        <select
            id={id}
            value={value}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(WS_FIELD_SELECT_CHROME, "w-full disabled:opacity-50", className)}
            data-testid={testId}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}
