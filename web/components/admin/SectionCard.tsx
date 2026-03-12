"use client";

import { ReactNode } from "react";

interface SectionCardProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export default function SectionCard({ title, children, className = "" }: SectionCardProps) {
    return (
        <section className={`rounded-xl border border-admin-border/90 bg-admin-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}>
            <h2 className="border-b border-admin-border/80 px-5 py-3.5 text-sm font-semibold uppercase tracking-wider text-alloy-muted">
                {title}
            </h2>
            <div className="p-5">{children}</div>
        </section>
    );
}
