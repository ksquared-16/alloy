"use client";

import { AlloySelect } from "@/components/workspace/AlloySelect";
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

/**
 * Field-system ADAPTER for `field_definitions`-backed option sets — not a second select.
 *
 * This was a shared wrapper around a native `<select>`, which meant the Universal Field
 * System shipped its own input runtime beside `AlloySelect`. A native option popup ignores
 * CSS on macOS, so every field routed through here rendered the OS menu however the trigger
 * was styled. The two primitives also lived side by side in the same forms:
 * `IdentityFieldValue` chose between them with a hardcoded field-name allowlist, so two
 * fields could present two different design systems depending on what they were called.
 *
 * Behaviour now delegates entirely to the platform primitive. What survives is the part
 * worth keeping — the field-system CONTRACT: `SelectOptionChoice` options, the form-input
 * chrome its callers already lay out around, and the prop names those call sites use. It
 * owns no value semantics, no keyboard model, and no menu.
 *
 * `className` keeps its original meaning — REPLACE the control's chrome — and lands on the
 * trigger, which is the element it was always describing.
 */
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
        <AlloySelect
            value={value}
            onChange={onChange}
            options={options}
            disabled={disabled}
            // The empty entry stays selectable: every consumer rendered
            // `<option value="">{placeholder}</option>` as a real choice.
            placeholder={placeholder}
            triggerClassName={className ?? SELECT_CLASS}
            testId={dataTestId}
            aria-label={ariaLabel}
        />
    );
}
