"use client";

import type { OperationalSummaryV1 } from "@/lib/ai/enrichmentContracts";

function riskChipLabel(hint: OperationalSummaryV1["risk_urgency_hint"]): string {
    switch (hint) {
        case "high":
            return "Urgent";
        case "medium":
            return "Follow up";
        default:
            return "FYI";
    }
}

type Props = {
    summary: OperationalSummaryV1;
    /** Tighter typography when embedded in drawer chrome. */
    density?: "chrome" | "panel";
};

/**
 * Compact operational narrative (Phase 2) — non-authoritative; no send/apply.
 */
export default function OperationalSummaryNarrativeBlock({ summary, density = "panel" }: Props) {
    const chrome = density === "chrome";
    const bullets = summary.bullets.slice(0, 3);

    return (
        <div
            className={
                chrome
                    ? "mb-1.5 rounded-md border border-alloy-stone/18 bg-alloy-stone/[0.04] px-2 py-1.5"
                    : "mb-2 rounded-lg border border-alloy-stone/16 bg-white/70 px-2.5 py-2"
            }
            data-drawer-slot="operational_summary_narrative"
        >
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/40">
                    Operational read
                </span>
                <span
                    className={
                        chrome
                            ? "rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/55 ring-1 ring-alloy-stone/25"
                            : "rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/55 ring-1 ring-alloy-stone/22"
                    }
                    title="Derived urgency from resolver severity / SLA — not a customer-facing promise."
                >
                    {riskChipLabel(summary.risk_urgency_hint)}
                </span>
            </div>
            <p
                className={
                    chrome
                        ? "mt-1 text-[11px] font-medium leading-snug text-alloy-midnight/88"
                        : "mt-1 text-[12px] font-medium leading-snug text-alloy-midnight/90"
                }
            >
                {summary.headline}
            </p>
            {bullets.length > 0 ? (
                <ul
                    className={
                        chrome
                            ? "mt-1 list-inside list-disc space-y-0.5 pl-0.5 text-[10px] leading-snug text-alloy-midnight/72"
                            : "mt-1.5 list-inside list-disc space-y-0.5 text-[11px] leading-snug text-alloy-midnight/74"
                    }
                >
                    {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                    ))}
                </ul>
            ) : null}
            {summary.generation_mode === "deterministic_plus_stub_overlay" ? (
                <p className="mt-1 text-[9px] leading-snug text-alloy-midnight/42">Includes synthetic stub overlay for UX review.</p>
            ) : null}
        </div>
    );
}
