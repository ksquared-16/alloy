"use client";

import { useRef, useState } from "react";

import OperationalAttentionAnchoredDraftPopover from "@/components/admin/drawer/OperationalAttentionAnchoredDraftPopover";
import OperationalAttentionEnhanceDraft from "@/components/admin/drawer/OperationalAttentionEnhanceDraft";
import OperationalReviewAssistBand from "@/components/admin/drawer/OperationalReviewAssistBand";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    nextStepGuidance,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { EnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    opIntelligenceSurface,
    opLabelCaps,
    opMetadata,
    opStackSectionCompact,
} from "@/lib/operational/ui/operationalVisualTokens";
import clsx from "clsx";

type Props = {
    overviewData: Record<string, unknown>;
    /**
     * `chrome`: drawer title stack — compact text lines (no bordered panel).
     * `panel`: standalone bordered summary (dev fixtures / rare embedded uses).
     */
    variant?: "chrome" | "panel";
    /** When parent renders a section title (e.g. inquiry summary). */
    suppressSectionBrandLabel?: boolean;
};

/**
 * Drawer operational-attention chrome — Review assist band when a recommendation is present.
 * `_operational_summary` is not duplicated here; queue previews may still use it separately.
 */
export default function OperationalAttentionHeaderStrip({
    overviewData,
    variant = "panel",
    suppressSectionBrandLabel = false,
}: Props) {
    const draftTriggerRef = useRef<HTMLButtonElement>(null);
    const [draftPopoverOpen, setDraftPopoverOpen] = useState(false);
    const payload = overviewData._operational_attention as OpportunityAttentionResult | null | undefined;
    const err = overviewData._operational_attention_error as OperationalAttentionAttachmentError | null | undefined;
    const recommendationDisplay = getRecommendationDrawerStrip(overviewData);
    const supportingDetail = getRecommendationDetailSummary(overviewData);
    const suggestion = overviewData._attention_suggestion as AttentionSuggestionV1 | null | undefined;

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
                {...(chrome ? { "data-operational-attention-canonical": "chrome" as const } : {})}
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
                        ? "rounded-md border border-alloy-stone/25 border-l-[3px] border-l-alloy-honey/80 bg-alloy-honey/10 px-2 py-1.5 text-[11px] leading-snug text-alloy-midnight/75"
                        : "mt-2 rounded-lg border border-alloy-stone/22 bg-alloy-stone/[0.06] px-2.5 py-1.5 text-[12px] text-alloy-midnight/78"
                }
                data-drawer-slot="operational_attention_header"
                {...(chrome ? { "data-operational-attention-canonical": "chrome" as const } : {})}
            >
                <span className="font-medium text-alloy-midnight/85">Activity signal · </span>
                {line}
            </div>
        );
    }

    const nextLine = nextStepGuidance({
        primaryCode: primary.code,
        waitingBucket: safeBucket,
        worstSlaTier: worst,
    });

    const otherReasons = payload.reasons.filter((r) => r.code !== primary.code);
    const factorsJoined = otherReasons.map((r) => r.label).join(", ");

    if (recommendationDisplay) {
        const stale = payload.auxiliary?.activity_stale;
        const draftBody = suggestion?.suggested_content?.body?.trim();

        const draftSlot = draftBody ? (
            <div className="relative mt-0.5 w-full min-w-0" data-drawer-slot="deterministic_draft_row">
                <button
                    ref={draftTriggerRef}
                    type="button"
                    className="w-full rounded border border-alloy-stone/16 bg-white/55 px-1 py-0.5 text-left text-[8px] font-semibold text-alloy-blue hover:bg-white/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-alloy-blue/35"
                    aria-expanded={draftPopoverOpen}
                    data-drawer-slot="deterministic_draft_trigger"
                    onClick={() => setDraftPopoverOpen((v) => !v)}
                >
                    Draft · not sent
                </button>
                <OperationalAttentionAnchoredDraftPopover
                    open={draftPopoverOpen}
                    onClose={() => setDraftPopoverOpen(false)}
                    anchorRef={draftTriggerRef}
                    title="Draft"
                    subtitle="Copy and edit before using."
                    body={draftBody}
                    copyLabel="Copy draft"
                    data-drawer-slot="attention_draft_popover"
                />
            </div>
        ) : null;

        return (
            <div
                data-drawer-slot="operational_attention_header"
                data-attention-surface="suggestion_primary"
            >
                <OperationalReviewAssistBand
                    display={recommendationDisplay}
                    variant={variant}
                    suppressSectionBrandLabel={suppressSectionBrandLabel}
                    activityStaleLabel={stale?.label ?? null}
                    supportingDetail={supportingDetail}
                    draftSlot={draftSlot}
                    enhanceSlot={suggestion ? <OperationalAttentionEnhanceDraft suggestion={suggestion} /> : null}
                />
            </div>
        );
    }

    const fallbackAssistFrame = clsx(
        opIntelligenceSurface,
        chrome ? "px-2.5 py-2 text-[11px] leading-snug" : "px-3 py-2.5 text-[11px] leading-snug",
    );

    if (chrome) {
        return (
            <div
                className={fallbackAssistFrame}
                data-drawer-slot="operational_attention_header"
                data-operational-attention-canonical="chrome"
                data-attention-surface="attention_fallback"
            >
                <div className={opStackSectionCompact}>
                    <div>
                        <span className={clsx(opLabelCaps, "text-[10px]")}>Operational read</span>
                        <p className="mt-0.5 font-medium text-alloy-midnight">{primary.label}</p>
                    </div>
                    <div>
                        <span className={clsx(opLabelCaps, "text-[10px]")}>Do next</span>
                        <p className="mt-0.5 text-alloy-midnight/85">{nextLine}</p>
                    </div>
                    {otherReasons.length > 0 ? (
                        <details className="text-[10px] leading-snug text-alloy-midnight/65">
                            <summary className="cursor-pointer select-none font-medium text-alloy-midnight/55 [&::-webkit-details-marker]:hidden">
                                Supporting detail ({otherReasons.length})
                            </summary>
                            <p className="mt-0.5 text-alloy-midnight/70">{factorsJoined}</p>
                        </details>
                    ) : null}
                    {payload.auxiliary?.activity_stale?.label ? (
                        <p className={opMetadata}>
                            <span className="font-medium text-alloy-midnight/70">Activity · </span>
                            {payload.auxiliary.activity_stale.label}
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div
            className={clsx(fallbackAssistFrame, "mt-2")}
            data-drawer-slot="operational_attention_header"
            data-attention-surface="attention_fallback"
        >
            <div className={opStackSectionCompact}>
                <div>
                    <span className={opLabelCaps}>Operational read</span>
                    <p className="mt-0.5 text-[12px] font-medium leading-snug text-alloy-midnight/92">{primary.label}</p>
                </div>
                <div>
                    <span className={opLabelCaps}>Do next</span>
                    <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/72">{nextLine}</p>
                </div>
                {payload.reasons.length > 1 ? (
                    <details className="border-t border-alloy-stone/12 pt-1.5">
                        <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                            Supporting detail ({payload.reasons.length})
                        </summary>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-alloy-midnight/75">
                            {payload.reasons.map((r) => (
                                <li key={r.code}>{r.label}</li>
                            ))}
                        </ul>
                    </details>
                ) : null}
            </div>
        </div>
    );
}
