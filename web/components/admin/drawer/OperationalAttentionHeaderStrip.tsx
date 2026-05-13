"use client";

import { Sparkles } from "lucide-react";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import OperationalSummaryNarrativeBlock from "@/components/admin/drawer/OperationalSummaryNarrativeBlock";
import { buildOperationalSummaryDeterministic } from "@/lib/ai/buildOperationalSummary";
import type { OperationalSummaryV1 } from "@/lib/ai/enrichmentContracts";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
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

function copyDraftMessage(body: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(body);
    }
}

export default function OperationalAttentionHeaderStrip({ overviewData, variant = "panel" }: Props) {
    const payload = overviewData._operational_attention as OpportunityAttentionResult | null | undefined;
    const err = overviewData._operational_attention_error as OperationalAttentionAttachmentError | null | undefined;
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
            >
                <span className="font-medium text-alloy-midnight/90">Operational summary unavailable · </span>
                {err.message}
            </div>
        );
    }

    if (!payload) return null;

    const hasBundledSummary = Object.prototype.hasOwnProperty.call(overviewData, "_operational_summary");
    const stableNow =
        suggestion?.generated_at_iso ?? payload.computed_at_iso ?? "1970-01-01T00:00:00.000Z";
    const operationalSummary: OperationalSummaryV1 | null = hasBundledSummary
        ? ((overviewData._operational_summary as OperationalSummaryV1 | null) ?? null)
        : buildOperationalSummaryDeterministic({
              attention: payload,
              suggestion: suggestion ?? null,
              nowIso: stableNow,
          });

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
    const factorsPreferDetails = otherReasons.length >= 4 || factorsJoined.length > 130;

    const headlinePrimaryOnly = `Needs attention: ${primary.label}`;

    const premiumChromeFrame =
        "rounded-md border border-[color-mix(in_srgb,rgb(188,67,0)_26%,var(--d-border,rgba(39,63,82,0.14)))] border-l-[3px] border-l-[rgb(188,67,0)] bg-gradient-to-br from-[color-mix(in_srgb,rgb(255,248,240)_72%,white)] via-white to-[color-mix(in_srgb,rgb(245,250,255)_40%,white)] px-2 py-1.5 text-[11px] leading-snug shadow-[inset_3px_0_0_color-mix(in_srgb,var(--d-admin-amber,#c95a00)_28%,transparent)]";

    const premiumPanelFrame =
        "mt-2 rounded-lg border border-admin-border border-l-[3px] border-l-[rgb(188,67,0)] bg-gradient-to-br from-[color-mix(in_srgb,rgb(255,248,240)_65%,white)] via-white to-[color-mix(in_srgb,rgb(245,250,255)_38%,white)] px-2.5 py-2 shadow-sm";

    if (suggestion) {
        const stale = payload.auxiliary?.activity_stale;
        const draftBody = suggestion.suggested_content?.body?.trim();
        const frame = chrome ? premiumChromeFrame : premiumPanelFrame;
        return (
            <>
                {operationalSummary ? (
                    <OperationalSummaryNarrativeBlock summary={operationalSummary} density={chrome ? "chrome" : "panel"} />
                ) : null}
                <div
                    className={frame}
                    data-drawer-slot="operational_attention_header"
                    data-attention-surface="suggestion_primary"
                >
                <div className="flex items-start gap-1.5">
                    <Sparkles
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color-mix(in_srgb,rgb(188,67,0)_85%,#273f52)] opacity-90"
                        aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/38">
                            Recommended by Alloy
                        </div>
                        <div className={chrome ? "font-semibold text-[11px] text-[rgb(72,32,0)]" : "text-[12px] font-semibold leading-snug text-alloy-midnight/92"}>
                            {headlinePrimaryOnly}
                        </div>
                        <div className="space-y-0.5 pt-0.5">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/42">
                                Suggested next step
                            </div>
                            <div className={chrome ? "text-[11px] font-medium leading-snug text-alloy-midnight/90" : "text-[13px] font-medium leading-snug text-alloy-midnight/90"}>
                                {suggestion.next_action.label}
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/42">Why</div>
                            <p className={chrome ? "text-[10px] leading-snug text-alloy-midnight/72" : "text-xs leading-relaxed text-alloy-midnight/76"}>
                                {suggestion.reasoning.summary}
                            </p>
                        </div>

                        {draftBody ? (
                            <details className="group/draft mt-1 rounded border border-alloy-stone/16 bg-white/55 px-1.5 py-1">
                                <summary className="cursor-pointer select-none text-[9px] font-semibold text-alloy-blue hover:underline [&::-webkit-details-marker]:hidden">
                                    Draft message
                                    <span className="ml-1 font-normal text-alloy-midnight/45">· not sent</span>
                                </summary>
                                <p className="mt-1 text-[9px] text-alloy-midnight/50">Copy and edit before using.</p>
                                <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/12 bg-alloy-stone/[0.03] px-1.5 py-1 font-sans text-[10px] leading-snug text-alloy-midnight/85">
                                    {draftBody}
                                </pre>
                                <button
                                    type="button"
                                    className="mt-1 text-[9px] font-semibold text-alloy-blue hover:underline"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        copyDraftMessage(draftBody);
                                    }}
                                >
                                    Copy draft
                                </button>
                            </details>
                        ) : null}

                        {otherReasons.length > 0 ? (
                            factorsPreferDetails ? (
                                <details className="text-[10px] leading-snug text-alloy-midnight/72">
                                    <summary className="cursor-pointer select-none font-medium text-alloy-midnight/65 [&::-webkit-details-marker]:hidden">
                                        Other factors ({otherReasons.length})
                                    </summary>
                                    <div className="mt-1 text-[10px] leading-snug text-alloy-midnight/75">{factorsJoined}</div>
                                </details>
                            ) : (
                                <div className="text-[10px] leading-snug text-alloy-midnight/70">
                                    <span className="font-medium text-alloy-midnight/75">Factors · </span>
                                    {factorsJoined}
                                </div>
                            )
                        ) : null}

                        {stale?.label ? (
                            <div className="rounded border border-alloy-stone/14 bg-white/45 px-1.5 py-1 text-[10px] text-alloy-midnight/72">
                                <span className="font-medium text-alloy-midnight/78">Activity · </span>
                                {stale.label}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            </>
        );
    }

    if (chrome) {
        return (
            <>
                {operationalSummary ? (
                    <OperationalSummaryNarrativeBlock summary={operationalSummary} density="chrome" />
                ) : null}
                <div
                    className="rounded-md border border-[color-mix(in_srgb,rgb(188,67,0)_30%,var(--d-border, rgba(39,63,82,0.14)))] border-l-[3px] border-l-[rgb(188,67,0)] bg-[color-mix(in_srgb,rgb(255,244,235)_55%,white)] px-2 py-1.5 text-[11px] leading-snug shadow-[inset_3px_0_0_color-mix(in_srgb,var(--d-admin-amber, #c95a00)_32%,transparent)]"
                    data-drawer-slot="operational_attention_header"
                >
                <div className="font-semibold text-[rgb(72,32,0)]">{headlinePrimaryOnly}</div>
                {otherReasons.length > 0 ? (
                    factorsPreferDetails ? (
                        <details className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/75">
                            <summary className="cursor-pointer select-none font-medium text-alloy-midnight/72 [&::-webkit-details-marker]:hidden">
                                Show {otherReasons.length} factor{otherReasons.length === 1 ? "" : "s"}
                            </summary>
                            <div className="mt-1 text-[10px] leading-snug text-alloy-midnight/78">{factorsJoined}</div>
                        </details>
                    ) : (
                        <div className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/75">
                            <span className="font-medium text-alloy-midnight/78">Factors: </span>
                            {factorsJoined}
                        </div>
                    )
                ) : null}
                <div className="mt-0.5 text-alloy-midnight/70">
                    <span className="font-medium text-alloy-midnight/75">Suggested next step · </span>
                    {nextLine}
                </div>
            </div>
            </>
        );
    }

    return (
        <>
            {operationalSummary ? (
                <OperationalSummaryNarrativeBlock summary={operationalSummary} density="panel" />
            ) : null}
            <div
                className="mt-2 rounded-lg border border-admin-border border-l-[3px] border-l-[rgb(188,67,0)] bg-white/90 px-2.5 py-1.5 shadow-sm"
                data-drawer-slot="operational_attention_header"
            >
            <div className="text-[12px] font-semibold leading-snug text-alloy-midnight/92">{headlinePrimaryOnly}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/72">
                <span className="font-medium text-alloy-midnight/80">Suggested next step · </span>
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
        </>
    );
}
