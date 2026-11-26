"use client";

import type { ReactNode } from "react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    VERSION_STATUS_LABEL,
    type VersionStatus,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";

/**
 * Inline form + versioning display primitives for Operational Configuration
 * authoring surfaces (Batch 1+). Deliberately small and generic so the shared
 * EffectiveDatedConfigurationEditor — and future config domains — render edit
 * affordances consistently with the read-only ConfigReadonlyPrimitives.
 *
 * No edit drawers: authoring is inline (doctrine §9). These are dumb controlled
 * inputs; all validation/versioning lives in services + the pure version model.
 */

const VERSION_STATUS_CLASS: Record<VersionStatus, string> = {
    current: "border-emerald-200 bg-emerald-50 text-emerald-700",
    scheduled: "border-sky-200 bg-sky-50 text-sky-700",
    superseded: "border-alloy-stone/40 bg-alloy-stone/10 text-alloy-forge/70",
    retired: "border-amber-200 bg-amber-50 text-amber-700",
};

export function ConfigVersionBadge({ status }: { status: VersionStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERSION_STATUS_CLASS[status]}`}
            data-testid={`config-version-badge-${status}`}
        >
            {VERSION_STATUS_LABEL[status]}
        </span>
    );
}

export function ConfigFieldLabel({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block text-xs">
            <span className="mb-0.5 block font-medium text-alloy-midnight/70">{label}</span>
            {children}
        </label>
    );
}

const INPUT_CLASS =
    "w-full rounded-md border border-alloy-stone/40 bg-white px-2.5 py-1.5 text-sm text-alloy-midnight outline-none focus:border-[rgba(0,162,131,0.45)] focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60";

export function ConfigTextInput({
    value,
    onChange,
    placeholder,
    disabled,
    testId,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <input
            type="text"
            className={INPUT_CLASS}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
        />
    );
}

export function ConfigNumberInput({
    value,
    onChange,
    placeholder,
    disabled,
    step,
    min,
    testId,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    step?: string;
    min?: string;
    testId?: string;
}) {
    return (
        <input
            type="number"
            className={INPUT_CLASS}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            step={step}
            min={min}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
        />
    );
}

export function ConfigDateInput({
    value,
    onChange,
    disabled,
    min,
    testId,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    min?: string;
    testId?: string;
}) {
    return (
        <input
            type="date"
            className={INPUT_CLASS}
            value={value}
            disabled={disabled}
            min={min}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
        />
    );
}

export function ConfigSelectInput({
    value,
    onChange,
    options,
    disabled,
    testId,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <select
            className={INPUT_CLASS}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

export function ConfigButtonRow({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function ConfigPrimaryButton({
    children,
    onClick,
    disabled,
    testId,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    testId?: string;
}) {
    /*
     * ── ONE PRIMARY ACTION TREATMENT, NOT TWO ─────────────────────────────────────────────────
     *
     * This hand-rolled `bg-alloy-pine` — rgb(39, 63, 82), a dark navy — is what Kelly saw and
     * called "not Alloy", measured on the deployed Policies screen as the computed background of
     * "Create future version". The canonical configuration action is `ConfigurationPrimaryButton`,
     * which is Bend Pine, and eleven Bend Pine elements were already on that same screen: the page
     * was wearing two different answers to "this is the primary action".
     *
     * So this delegates rather than restating the chrome. Every surface that renders a
     * `ConfigPrimaryButton` — fourteen of them, Policies among them — converges by inheriting it,
     * and nothing is special-cased to Financials. Semantic status colours are untouched: this
     * changes ACTION hierarchy, which is the thing that was speaking with two voices.
     */
    return (
        <ConfigurationPrimaryButton onClick={onClick} disabled={disabled} data-testid={testId}>
            {children}
        </ConfigurationPrimaryButton>
    );
}

export function ConfigSecondaryButton({
    children,
    onClick,
    disabled,
    testId,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <button
            type="button"
            className="rounded-md border border-alloy-stone/40 px-3 py-1.5 text-xs font-medium text-alloy-forge/80 disabled:opacity-50"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
        >
            {children}
        </button>
    );
}
