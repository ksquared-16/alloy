"use client";

import type { ReactNode } from "react";
export const PLATFORM_BUILDER_SHELL =
    "rounded-xl border border-alloy-stone/15 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]";
export const PLATFORM_BUILDER_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50";
export const PLATFORM_BUILDER_INPUT =
    "mt-1 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-juniper/40 focus:outline-none focus:ring-1 focus:ring-alloy-juniper/20";
export const PLATFORM_BUILDER_SELECT = PLATFORM_BUILDER_INPUT;
export const PLATFORM_BUILDER_TEXTAREA = `${PLATFORM_BUILDER_INPUT} min-h-[72px]`;
export const PLATFORM_BUILDER_BTN =
    "rounded-lg border border-alloy-stone/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight hover:bg-alloy-stone/8";
export const PLATFORM_BUILDER_BTN_PRIMARY =
    "rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/10 px-3 py-1.5 text-xs font-semibold text-alloy-juniper hover:bg-alloy-juniper/15";
export const PLATFORM_BUILDER_BTN_DANGER =
    "rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-1.5 text-xs font-semibold text-alloy-ember hover:bg-alloy-ember/10";

export function PlatformBuilderField({
    label,
    children,
    hint,
}: {
    label: string;
    children: ReactNode;
    hint?: string;
}) {
    return (
        <label className="block">
            <span className={PLATFORM_BUILDER_LABEL}>{label}</span>
            {children}
            {hint ?
                <p className="mt-1 text-[10px] text-alloy-midnight/40">{hint}</p>
            :   null}
        </label>
    );
}

export function PlatformBuilderSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h4 className="text-sm font-semibold text-alloy-midnight">{title}</h4>
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        </section>
    );
}
