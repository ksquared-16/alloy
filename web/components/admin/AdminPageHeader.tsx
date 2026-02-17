"use client";

import { ReactNode } from "react";

interface AdminPageHeaderProps {
    title: string;
    subtitle?: string | null;
    actions?: ReactNode;
}

export default function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-[#31394d] tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-[#59678b]">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
