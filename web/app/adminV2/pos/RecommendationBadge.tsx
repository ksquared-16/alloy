"use client";

/**
 * POS — recommendation badge shown on queue rows and Home intake cards.
 *
 * Presentational only: renders a `QueueRecommendationSummary` (already computed
 * server-side from the FP8a read model). Confidence drives the color so the queue
 * reads as triaged work at a glance.
 */

import {
    REC_ACTION_LABELS,
    REC_CONFIDENCE_LABELS,
    type QueueRecommendationSummary,
} from "@/lib/pos/processingCase/recommendation/recommendationSummary";

const PILL_BY_CONFIDENCE: Record<string, string> = {
    high: "border-emerald-200 bg-emerald-50 text-emerald-800",
    medium: "border-amber-200 bg-amber-50 text-amber-800",
    low: "border-amber-200 bg-amber-50 text-amber-800",
    review: "border-stone-200 bg-stone-100 text-stone-600",
};

export default function RecommendationBadge({
    rec,
    showName = true,
    showConfidence = true,
}: {
    rec: QueueRecommendationSummary;
    showName?: boolean;
    showConfidence?: boolean;
}) {
    const pill = PILL_BY_CONFIDENCE[rec.confidence] ?? PILL_BY_CONFIDENCE.review;
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${pill}`}>
                {REC_ACTION_LABELS[rec.action]}
            </span>
            {showConfidence ? (
                <span className="shrink-0 text-[10px] text-stone-400">{REC_CONFIDENCE_LABELS[rec.confidence]}</span>
            ) : null}
            {showName && rec.matchedName ? (
                <span className="min-w-0 truncate text-[10px] text-stone-500">· {rec.matchedName}</span>
            ) : null}
        </span>
    );
}
