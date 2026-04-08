"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function WorkspaceChrome({
    breadcrumbs,
    title,
    subtitle,
    variant = "default",
    children,
}: {
    breadcrumbs: { href: string; label: string }[];
    title: string;
    subtitle?: string;
    /** `bridge`: breadcrumbs only — main title/subtitle live in the Admin V2 department shell. */
    variant?: "default" | "bridge";
    children: ReactNode;
}) {
    const outer =
        variant === "bridge"
            ? "w-full max-w-none mx-0 px-0 pt-2 pb-0 space-y-4"
            : "max-w-6xl mx-auto px-4 py-6 space-y-6";

    return (
        <div className={outer}>
            <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1" aria-label="Breadcrumb">
                {breadcrumbs.map((b, i) => (
                    <span key={`${b.href}-${i}`} className="flex items-center gap-1">
                        {i > 0 ? <span className="text-alloy-midnight/40" aria-hidden>/</span> : null}
                        {i === breadcrumbs.length - 1 ? (
                            <span className="text-alloy-midnight/80 font-medium">{b.label}</span>
                        ) : (
                            <Link href={b.href} className="hover:text-alloy-blue">
                                {b.label}
                            </Link>
                        )}
                    </span>
                ))}
            </nav>
            {variant !== "bridge" ? (
                <header>
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/70">Workspace (V2 slice)</p>
                    <h1 className="text-2xl font-semibold text-alloy-midnight mt-1">{title}</h1>
                    {subtitle ? <p className="text-sm text-alloy-midnight/65 mt-2 max-w-3xl">{subtitle}</p> : null}
                </header>
            ) : null}
            {children}
        </div>
    );
}
