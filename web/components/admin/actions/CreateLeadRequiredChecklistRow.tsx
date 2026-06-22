"use client";

import { Check } from "lucide-react";
import type { CreateLeadRequiredChecklistItem } from "@/lib/admin/actions/resolveCreateLeadRequiredChecklist";

type Props = {
    items: readonly CreateLeadRequiredChecklistItem[];
    className?: string;
};

function statusLabel(status: CreateLeadRequiredChecklistItem["status"]): string {
    if (status === "ok") return "✓";
    if (status === "missing") return "Missing";
    return "—";
}

/** Compact required-to-create status row above commit preview. */
export function CreateLeadRequiredChecklistRow({ items, className = "" }: Props) {
    if (!items.length) return null;

    return (
        <div
            className={`rounded-lg border border-alloy-stone/10 bg-white px-2.5 py-2 ${className}`}
            data-testid="create-lead-required-checklist"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                Required to create
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {items.map((item) => (
                    <li
                        key={item.key}
                        className="flex items-center gap-1 text-[11px] text-alloy-midnight/70"
                        data-testid={`create-lead-required-item-${item.key}`}
                        data-status={item.status}
                    >
                        <span>{item.label}</span>
                        {item.status === "ok" ?
                            <span className="inline-flex items-center gap-0.5 font-semibold text-[#007A63]">
                                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            </span>
                        : item.status === "missing" ?
                            <span className="font-semibold text-amber-800">{statusLabel(item.status)}</span>
                        :   <span className="text-alloy-midnight/40">{statusLabel(item.status)}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
