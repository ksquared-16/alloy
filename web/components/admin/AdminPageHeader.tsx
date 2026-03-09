"use client";

import { ReactNode } from "react";

interface AdminPageHeaderProps {
    title: string;
    subtitle?: string | null;
    actions?: ReactNode;
}

/** Page header strip with light Alloy Blue tint so the title sits on a branded surface (Layer 2). */
export default function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
    return (
        <header className="rounded-t-xl bg-alloy-blue/[0.08] border-b border-admin-border px-6 py-4 mb-6" role="banner">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-alloy-midnight tracking-tight">{title}</h1>
                    {subtitle && <p className="mt-1 text-sm text-alloy-muted">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </header>
    );
}
