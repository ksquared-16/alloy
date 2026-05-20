"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import OperationalAttentionAnchoredDraftPopover from "@/components/admin/drawer/OperationalAttentionAnchoredDraftPopover";
import OperationalAttentionEnhanceDraft from "@/components/admin/drawer/OperationalAttentionEnhanceDraft";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
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
    /** When parent renders a section title (e.g. inquiry summary “What BOS has to say”). */
    suppressSectionBrandLabel?: boolean;
};

const WHY_MAX_CHARS = 220;

function conciseWhy(text: string): string {
    const t = text.trim();
    if (t.length <= WHY_MAX_CHARS) return t;
    return `${t.slice(0, WHY_MAX_CHARS - 1)}…`;
}

/**
 * Primary operational-attention chrome for the drawer.
 * Premium surface is **What BOS has to say** (deterministic suggestion + optional draft).
 * `_operational_summary` may still be present on `overviewData` from the server; this strip does not
 * duplicate it here — queue list previews may still use `operationalSummaryPreview` separately.
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
    const factorsPreferDetails = otherReasons.length >= 4 || factorsJoined.length > 130;

    const headlinePrimaryOnly = `Needs attention: ${primary.label}`;

    const premiumChromeFrame =
        "rounded-md border border-[color-mix(in_srgb,rgb(188,67,0)_26%,var(--d-border,rgba(39,63,82,0.14)))] border-l-[3px] border-l-[rgb(188,67,0)] bg-gradient-to-br from-[color-mix(in_srgb,rgb(255,248,240)_72%,white)] via-white to-[color-mix(in_srgb,rgb(245,250,255)_40%,white)] px-1.5 py-1 text-[11px] leading-tight shadow-[inset_3px_0_0_color-mix(in_srgb,var(--d-admin-amber,#c95a00)_28%,transparent)]";

    const premiumPanelFrame =
        "mt-1.5 rounded-lg border border-admin-border border-l-[3px] border-l-[rgb(188,67,0)] bg-gradient-to-br from-[color-mix(in_srgb,rgb(255,248,240)_65%,white)] via-white to-[color-mix(in_srgb,rgb(245,250,255)_38%,white)] px-2 py-1.5 text-[11px] leading-tight shadow-sm";

    if (suggestion) {
        const stale = payload.auxiliary?.activity_stale;
        const draftBody = suggestion.suggested_content?.body?.trim();
        const frame = chrome ? premiumChromeFrame : premiumPanelFrame;

        return (
            <div
                className={`${frame} relative overflow-visible`}
                data-drawer-slot="operational_attention_header"
                data-attention-surface="suggestion_primary"
                {...(chrome ? { "data-operational-attention-canonical": "chrome" as const } : {})}
            >
                <div className="flex items-start gap-1">
                    <Sparkles
                        className="mt-0.5 h-3 w-3 shrink-0 text-[color-mix(in_srgb,rgb(188,67,0)_85%,#273f52)] opacity-90"
                        aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                        {!suppressSectionBrandLabel ? (
                            <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/38">
                                What BOS has to say
                            </div>
                        ) : null}
                        <div
                            className={
                                chrome
                                    ? "font-semibold text-[11px] leading-tight text-[rgb(72,32,0)]"
                                    : "text-[12px] font-semibold leading-tight text-alloy-midnight/92"
                            }
                        >
                            {headlinePrimaryOnly}
                        </div>
                        <div className="pt-0.5">
                            <span className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                Next ·{" "}
                            </span>
                            <span
                                className={
                                    chrome
                                        ? "text-[11px] font-medium leading-tight text-alloy-midnight/90"
                                        : "text-[12px] font-medium leading-tight text-alloy-midnight/90"
                                }
                            >
                                {suggestion.next_action.label}
                            </span>
                        </div>
                        <p
                            className={
                                chrome
                                    ? "text-[10px] leading-snug text-alloy-midnight/72"
                                    : "text-[11px] leading-snug text-alloy-midnight/76"
                            }
                        >
                            <span className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                Why ·{" "}
                            </span>
                            {conciseWhy(suggestion.reasoning.summary)}
                        </p>

                        {draftBody ? (
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
                        ) : null}

                        <OperationalAttentionEnhanceDraft suggestion={suggestion} />

                        {otherReasons.length > 0 ? (
                            factorsPreferDetails ? (
                                <details className="text-[9px] leading-snug text-alloy-midnight/72">
                                    <summary className="cursor-pointer select-none font-medium text-alloy-midnight/65 [&::-webkit-details-marker]:hidden">
                                        Other factors ({otherReasons.length})
                                    </summary>
                                    <div className="mt-0.5 text-[9px] leading-snug text-alloy-midnight/75">{factorsJoined}</div>
                                </details>
                            ) : (
                                <div className="text-[9px] leading-snug text-alloy-midnight/70">
                                    <span className="font-medium text-alloy-midnight/75">Factors · </span>
                                    {factorsJoined}
                                </div>
                            )
                        ) : null}

                        {stale?.label ? (
                            <div className="rounded border border-alloy-stone/14 bg-white/45 px-1 py-0.5 text-[9px] text-alloy-midnight/72">
                                <span className="font-medium text-alloy-midnight/78">Activity · </span>
                                {stale.label}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    if (chrome) {
        return (
            <div
                className="rounded-md border border-[color-mix(in_srgb,rgb(188,67,0)_30%,var(--d-border, rgba(39,63,82,0.14)))] border-l-[3px] border-l-[rgb(188,67,0)] bg-[color-mix(in_srgb,rgb(255,244,235)_55%,white)] px-2 py-1.5 text-[11px] leading-snug shadow-[inset_3px_0_0_color-mix(in_srgb,var(--d-admin-amber, #c95a00)_32%,transparent)]"
                data-drawer-slot="operational_attention_header"
                data-operational-attention-canonical="chrome"
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
        );
    }

    return (
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
    );
}
