"use client";

import { ReactNode } from "react";

interface SectionCardProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export default function SectionCard({ title, children, className = "" }: SectionCardProps) {
    return (
        <section className={`rounded-xl border border-[#e6e8ec] bg-white shadow-sm ${className}`}>
            <h2 className="border-b border-[#e6e8ec] px-5 py-3 text-sm font-semibold uppercase tracking-wider text-[#59678b]">
                {title}
            </h2>
            <div className="p-5">{children}</div>
        </section>
    );
}
