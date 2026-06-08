"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface KpiCardProps {
    value: number | string;
    label: string;
    href?: string;
    delta?: string | null;
    accent?: "gold" | "navy" | "slate" | "juniper" | "pine" | "ember" | "neutral";
    icon?: ReactNode;
}

const accentBorder: Record<NonNullable<KpiCardProps["accent"]>, string> = {
    gold: "border-l-alloy-gold",
    navy: "border-l-alloy-navy",
    slate: "border-l-alloy-slate",
    juniper: "border-l-alloy-juniper",
    pine: "border-l-alloy-pine",
    ember: "border-l-alloy-ember",
    neutral: "border-l-alloy-muted",
};

export default function KpiCard({ value, label, href, delta, accent = "neutral", icon }: KpiCardProps) {
    const borderClass = accentBorder[accent];
    const content = (
        <div className={`rounded-xl border border-admin-border border-l-4 bg-admin-surface-card p-5 shadow-sm transition-shadow hover:shadow-md ${borderClass}`}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-xs font-medium tracking-wider text-alloy-muted">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-alloy-midnight">{value}</p>
                    {delta != null && delta !== "" && <p className="mt-0.5 text-xs text-alloy-muted">{delta}</p>}
                </div>
                {icon && <div className="text-alloy-muted">{icon}</div>}
            </div>
        </div>
    );
    if (href) {
        return <Link href={href} className="block">{content}</Link>;
    }
    return content;
}
