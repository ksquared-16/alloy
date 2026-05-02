"use client";

import { ReactNode } from "react";

interface SectionCardProps {
    title: string;
    children: ReactNode;
    className?: string;
    /** AdminV2 Settings: softer panel + left accent (workspace-adjacent). */
    surfaceTone?: "default" | "settingsPanel";
    /** When set with surfaceTone=settingsPanel, tailwind border-l color class e.g. border-l-alloy-pine */
    accentClassName?: string;
}

export default function SectionCard({
    title,
    children,
    className = "",
    surfaceTone = "default",
    accentClassName = "border-l-alloy-pine/55",
}: SectionCardProps) {
    const surface =
        surfaceTone === "settingsPanel"
            ? `rounded-xl border border-alloy-forge/12 bg-white/65 shadow-[0_2px_10px_rgba(39,63,82,0.06)] backdrop-blur-[2px] border-l-[3px] ${accentClassName}`
            : "rounded-xl border border-admin-border/90 bg-admin-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
    const headerBorder = surfaceTone === "settingsPanel" ? "border-alloy-forge/10" : "border-admin-border/80";
    return (
        <section className={`${surface} overflow-hidden ${className}`}>
            <h2 className={`border-b ${headerBorder} px-5 py-3.5 text-sm font-semibold tracking-wider text-alloy-muted`}>
                {title}
            </h2>
            <div className="p-5">{children}</div>
        </section>
    );
}
