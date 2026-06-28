"use client";

import type { ReactNode } from "react";
import type { EffectiveStatus } from "@/lib/adminV2/operationalConfig/configReadPresentation";

/**
 * Read-only display primitives for Operational Configuration V1 surfaces
 * (Financials + Locations operational rules). Batch 0 is read-only: these
 * components present versioned/effective-dated config without any edit affordance.
 */

const STATUS_CLASS: Record<EffectiveStatus, string> = {
    current: "border-emerald-200 bg-emerald-50 text-emerald-700",
    scheduled: "border-sky-200 bg-sky-50 text-sky-700",
    historical: "border-alloy-stone/40 bg-alloy-stone/10 text-alloy-forge/70",
};

export function ConfigEffectiveBadge({ status, label }: { status: EffectiveStatus; label: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}
            data-testid={`config-effective-badge-${status}`}
        >
            {label}
        </span>
    );
}

export function ConfigScopeBadge({ label, override }: { label: string; override: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                override ?
                    "border-amber-200 bg-amber-50 text-amber-700"
                :   "border-alloy-stone/40 bg-white text-alloy-forge/70"
            }`}
        >
            {label}
        </span>
    );
}

/** Persistent banner clarifying that a surface is read-only in V1. */
export function ConfigReadonlyNotice({ children, testId }: { children: ReactNode; testId?: string }) {
    return (
        <div
            className="mb-3 flex items-start gap-2 rounded-lg border border-alloy-stone/40 bg-alloy-stone/10 px-3 py-2 text-[12px] leading-relaxed text-alloy-forge/80"
            data-testid={testId}
            role="note"
        >
            <span aria-hidden className="mt-0.5 font-semibold text-alloy-forge">
                Read-only
            </span>
            <span>{children}</span>
        </div>
    );
}

export function ConfigField({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="config-typo-sublabel text-alloy-forge/60">{label}</dt>
            <dd className="config-typo-field-value text-alloy-midnight">{value ?? "—"}</dd>
        </div>
    );
}

export function ConfigFieldGrid({ children }: { children: ReactNode }) {
    return <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>;
}
