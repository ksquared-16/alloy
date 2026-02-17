"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface KpiCardProps {
    value: number | string;
    label: string;
    href?: string;
    delta?: string | null;
    accent?: "gold" | "navy" | "slate" | "juniper" | "neutral";
    icon?: ReactNode;
}

const accentBorder: Record<NonNullable<KpiCardProps["accent"]>, string> = {
    gold: "border-l-[#DBC078]",
    navy: "border-l-[#31394d]",
    slate: "border-l-[#45506c]",
    juniper: "border-l-[#00A283]",
    neutral: "border-l-[#59678b]",
};

export default function KpiCard({ value, label, href, delta, accent = "neutral", icon }: KpiCardProps) {
    const borderClass = accentBorder[accent];
    const content = (
        <div className={`rounded-xl border border-[#e6e8ec] border-l-4 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${borderClass}`}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[#59678b]">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-[#31394d]">{value}</p>
                    {delta != null && delta !== "" && <p className="mt-0.5 text-xs text-[#59678b]">{delta}</p>}
                </div>
                {icon && <div className="text-[#59678b]">{icon}</div>}
            </div>
        </div>
    );
    if (href) {
        return <Link href={href} className="block">{content}</Link>;
    }
    return content;
}
