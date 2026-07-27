"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import {
    WS_ACTION_SECONDARY,
    WS_FIELD_SEARCH_CHROME,
} from "@/components/workspace/workspaceTokens";
import { AlloySelect } from "@/components/workspace/AlloySelect";

export { AlloySelect };
export type { AlloySelectOption } from "@/components/workspace/AlloySelect";

export function AlloyFieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45"
        >
            {children}
        </label>
    );
}

export function AlloyTextInput({
    value,
    onChange,
    placeholder,
    disabled,
    testId,
    id,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    testId?: string;
    id?: string;
}) {
    return (
        <input
            id={id}
            type="text"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(WS_FIELD_SEARCH_CHROME, "w-full disabled:opacity-50")}
            data-testid={testId}
        />
    );
}

export function AlloyTextArea({
    value,
    onChange,
    placeholder,
    disabled,
    rows = 3,
    testId,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    testId?: string;
}) {
    return (
        <textarea
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            rows={rows}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(WS_FIELD_SEARCH_CHROME, "w-full resize-none disabled:opacity-50")}
            data-testid={testId}
        />
    );
}

export function AlloyCheckbox({
    checked,
    onChange,
    label,
    disabled,
    testId,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <label
            className={clsx(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-2 text-[12px] font-medium text-alloy-midnight transition-colors",
                checked ? "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.04]" : "hover:border-alloy-stone/30",
                disabled && "cursor-not-allowed opacity-50"
            )}
            data-testid={testId}
        >
            <span
                className={clsx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked ? "border-alloy-bend-pine bg-alloy-bend-pine text-white" : "border-alloy-stone/40 bg-white"
                )}
                aria-hidden
            >
                {checked ? <span className="text-[10px] leading-none">✓</span> : null}
            </span>
            <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            {label}
        </label>
    );
}

export function AlloyRadioGroup({
    value,
    onChange,
    options,
    name,
    disabled,
    testId,
}: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string; description?: string }>;
    name: string;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <div className="space-y-1.5" data-testid={testId}>
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <label
                        key={o.value}
                        className={clsx(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                            active
                                ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.05]"
                                : "border-alloy-stone/20 bg-white hover:border-alloy-stone/30",
                            disabled && "cursor-not-allowed opacity-50"
                        )}
                    >
                        <span
                            className={clsx(
                                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                                active ? "border-alloy-bend-pine" : "border-alloy-stone/40"
                            )}
                            aria-hidden
                        >
                            {active ? <span className="h-2 w-2 rounded-full bg-alloy-bend-pine" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold text-alloy-midnight">{o.label}</span>
                            {o.description ? (
                                <span className="mt-0.5 block text-[10px] leading-snug text-alloy-midnight/45">
                                    {o.description}
                                </span>
                            ) : null}
                        </span>
                        <input
                            type="radio"
                            name={name}
                            className="sr-only"
                            checked={active}
                            disabled={disabled}
                            onChange={() => onChange(o.value)}
                        />
                    </label>
                );
            })}
        </div>
    );
}

export function AlloySegmentControl<T extends string>({
    value,
    onChange,
    options,
    disabled,
    testId,
}: {
    value: T;
    onChange: (value: T) => void;
    options: Array<{ value: T; label: string }>;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <div
            className="inline-flex flex-wrap gap-0.5 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-0.5"
            data-testid={testId}
        >
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(o.value)}
                        className={clsx(
                            "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                            active
                                ? "bg-white text-alloy-bend-pine shadow-sm"
                                : "text-alloy-midnight/55 hover:text-alloy-midnight"
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export function AlloyInspectorDivider() {
    return <div className="my-3 border-t border-alloy-stone/15" role="separator" />;
}

export function AlloyInspectorGroup({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/35">{title}</h4>
            <div className="space-y-2.5">{children}</div>
        </section>
    );
}

export function AlloySecondaryButton({
    children,
    onClick,
    disabled,
    testId,
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <button type="button" disabled={disabled} onClick={onClick} className={WS_ACTION_SECONDARY} data-testid={testId}>
            {children}
        </button>
    );
}
