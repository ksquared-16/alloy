"use client";

import type { ReactNode } from "react";

/**
 * Compact title row for AdminV2 Settings — no white “dashboard” card (replaces AdminPageHeader there).
 */
export default function SettingsPageHeader({
    title,
    subtitle,
    actions,
    className = "mb-4",
    variant = "default",
}: {
    title: string;
    subtitle?: string | null;
    actions?: ReactNode;
    className?: string;
    /** Hero — pine-accent card matching Configuration hub. */
    variant?: "default" | "hero";
}) {
    const shell =
        variant === "hero"
            ? "rounded-xl border border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90 px-5 py-4 shadow-sm"
            : "";

    return (
        <header className={`${shell} ${className}`} role="banner">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {variant === "hero" ?
                        <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">{title}</h1>
                    :   <h2 className="text-base font-semibold tracking-tight text-alloy-midnight">{title}</h2>}
                    {subtitle ?
                        <p
                            className={`mt-1 max-w-3xl leading-relaxed text-alloy-midnight/60 ${
                                variant === "hero" ? "text-sm" : "text-xs"
                            }`}
                        >
                            {subtitle}
                        </p>
                    :   null}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                :   null}
            </div>
        </header>
    );
}
