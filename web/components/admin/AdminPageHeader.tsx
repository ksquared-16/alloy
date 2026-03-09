"use client";

import { ReactNode } from "react";

interface AdminPageHeaderProps {
    title: string;
    subtitle?: string | null;
    actions?: ReactNode;
}

/** Page header strip: subtle Bend Pine tint between top bar and white content; Forge text. */
export default function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
    return (
        <header className="rounded-t-xl bg-alloy-pine/[0.06] border-b border-admin-border px-6 py-4 mb-6" role="banner">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-alloy-forge tracking-tight">{title}</h1>
                    {subtitle && <p className="mt-1 text-sm text-alloy-forge/70">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </header>
    );
}
