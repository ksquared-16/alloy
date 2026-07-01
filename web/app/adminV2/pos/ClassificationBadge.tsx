"use client";

/**
 * POS — classification badge for queue rows / Home cards (distinct from the
 * recommendation badge). Presentational only; renders the compact `ClassificationBadgeVM`
 * already computed server-side from the stored FP9 classification. `null` → "Awaiting
 * classification". Never shows extracted values or proposals.
 */

import { Tag } from "lucide-react";
import {
    CLASSIFICATION_AWAITING_LABEL,
    CLASSIFICATION_STATUS_LABELS,
    type ClassificationBadgeVM,
} from "@/lib/pos/processingCase/classification/classificationBadge";

const STATUS_PILL: Record<string, string> = {
    classified: "border-emerald-200 bg-emerald-50 text-emerald-800",
    unknown: "border-amber-200 bg-amber-50 text-amber-800",
    unsupported: "border-stone-200 bg-stone-100 text-stone-600",
};

export default function ClassificationBadge({ badge }: { badge: ClassificationBadgeVM | null }) {
    if (!badge) {
        return (
            <span className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-400">
                <Tag className="h-2.5 w-2.5" aria-hidden />
                {CLASSIFICATION_AWAITING_LABEL}
            </span>
        );
    }
    const pill = STATUS_PILL[badge.status] ?? STATUS_PILL.unsupported;
    const text = badge.status === "classified" ? badge.label : CLASSIFICATION_STATUS_LABELS[badge.status];
    return (
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${pill}`}>
            <Tag className="h-2.5 w-2.5" aria-hidden />
            {text}
            {badge.status === "classified" && badge.confidence != null ? (
                <span className="text-[9px] opacity-70">{Math.round(badge.confidence * 100)}%</span>
            ) : null}
        </span>
    );
}
