"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function WorkspaceChrome({
    breadcrumbs,
    title,
    subtitle,
    children,
}: {
    breadcrumbs: { href: string; label: string }[];
    title: string;
    subtitle?: string;
    children: ReactNode;
}) {
    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
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
            <header>
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/70">Workspace (V2 slice)</p>
                <h1 className="text-2xl font-semibold text-alloy-midnight mt-1">{title}</h1>
                {subtitle ? <p className="text-sm text-alloy-midnight/65 mt-2 max-w-3xl">{subtitle}</p> : null}
            </header>
            {children}
        </div>
    );
}
