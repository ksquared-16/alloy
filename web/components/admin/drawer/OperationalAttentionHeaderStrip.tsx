"use client";

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import {
    nextStepGuidance,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { EnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";

type Props = {
    overviewData: Record<string, unknown>;
    /**
     * `chrome`: drawer title stack — compact text lines (no bordered panel).
     * `panel`: standalone bordered summary (dev fixtures / rare embedded uses).
     */
    variant?: "chrome" | "panel";
};

export default function OperationalAttentionHeaderStrip({ overviewData, variant = "panel" }: Props) {
    const payload = overviewData._operational_attention as OpportunityAttentionResult | null | undefined;
    const err = overviewData._operational_attention_error as OperationalAttentionAttachmentError | null | undefined;

    const chrome = variant === "chrome";

    if (err?.message) {
        return (
            <div
                className={
                    chrome
                        ? "text-[11px] leading-snug text-alloy-midnight/75"
                        : "mt-2 rounded-lg border border-amber-200/90 bg-amber-50/50 px-2.5 py-1.5 text-[12px] text-alloy-midnight/80"
                }
                data-drawer-slot="operational_attention_header"
            >
                <span className="font-medium text-alloy-midnight/90">Operational summary unavailable · </span>
                {err.message}
            </div>
        );
    }

    if (!payload) return null;

    const wb = payload.waiting.bucket;
    const safeBucket: EnrollmentWaitBucket = isEnrollmentWaitBucket(wb) ? wb : "none";
    const worst = worstTierAmongReasons(payload.reasons);
    const primary = payload.primary_reason;

    if (!payload.needs_attention || !primary) {
        if (!payload.auxiliary?.activity_stale) return null;
        const line = payload.auxiliary.activity_stale.label;
        return (
            <div
                className={
                    chrome
                        ? "text-[11px] leading-snug text-alloy-midnight/72"
                        : "mt-2 rounded-lg border border-alloy-stone/22 bg-alloy-stone/[0.06] px-2.5 py-1.5 text-[12px] text-alloy-midnight/78"
                }
                data-drawer-slot="operational_attention_header"
            >
                <span className="font-medium text-alloy-midnight/85">Activity signal · </span>
                {line}
            </div>
        );
    }

    const extra = Math.max(0, payload.reasons.length - 1);
    const factors = extra > 0 ? ` · +${extra} factor${extra === 1 ? "" : "s"}` : "";
    const headline = `Needs attention: ${primary.label}${factors}`;
    const nextLine = nextStepGuidance({
        primaryCode: primary.code,
        waitingBucket: safeBucket,
        worstSlaTier: worst,
    });

    if (chrome) {
        return (
            <div className="space-y-0.5 text-[11px] leading-snug" data-drawer-slot="operational_attention_header">
                <div className="font-semibold text-alloy-midnight/88">{headline}</div>
                <div className="text-alloy-midnight/72">
                    <span className="font-medium text-alloy-midnight/78">Next: </span>
                    {nextLine}
                </div>
            </div>
        );
    }

    return (
        <div
            className="mt-2 rounded-lg border border-admin-border border-l-[3px] border-l-[rgb(188,67,0)] bg-white/90 px-2.5 py-1.5 shadow-sm"
            data-drawer-slot="operational_attention_header"
        >
            <div className="text-[12px] font-semibold leading-snug text-alloy-midnight/92">{headline}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/72">
                <span className="font-medium text-alloy-midnight/80">Next · </span>
                {nextLine}
            </div>
            {payload.reasons.length > 1 ? (
                <details className="mt-1.5 border-t border-alloy-stone/12 pt-1.5">
                    <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                        Factors ({payload.reasons.length})
                    </summary>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-alloy-midnight/75">
                        {payload.reasons.map((r) => (
                            <li key={r.code}>{r.label}</li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </div>
    );
}
