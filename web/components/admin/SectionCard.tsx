"use client";

import { ReactNode } from "react";

interface SectionCardProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export default function SectionCard({ title, children, className = "" }: SectionCardProps) {
    return (
        <section className={`rounded-xl border border-admin-border bg-admin-surface-card shadow-sm ${className}`}>
            <h2 className="border-b border-admin-border px-5 py-3 text-sm font-semibold uppercase tracking-wider text-alloy-muted">
                {title}
            </h2>
            <div className="p-5">{children}</div>
        </section>
    );
}
