"use client";

/**
 * CandidateMatchCard — one existing-record match candidate, expandable in place.
 *
 * Extracted from ReviewDecideCard so match DISCOVERY can live where it belongs — inside
 * "What Alloy found" (the middle Work column), next to "What came in" — instead of being
 * duplicated in the narrow right-side decision rail (§1). Purely presentational + read-only.
 */

import { useState } from "react";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";
import type { CandidateDetail } from "@/lib/pos/processingCase/recommendation/candidateDetail";

export default function CandidateMatchCard({
    candidate,
    detail,
    recommended,
}: {
    candidate: IntakeRecommendation["candidates"][number];
    detail: CandidateDetail | undefined;
    recommended: boolean;
}) {
    const [open, setOpen] = useState(false);
    const reasons = detail?.matchReasons?.length ? detail.matchReasons : [`Matched on ${candidate.matchReason}`];
    return (
        <li className={`rounded-md border ${recommended ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.07]" : "border-stone-200 bg-white"}`}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
            >
                <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-alloy-midnight">{detail?.fullName ?? candidate.label}</span>
                    <span className="block truncate text-[11px] text-stone-500">{reasons[0]}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                    {recommended ? (
                        <span className="rounded bg-alloy-bend-pine/[0.14] px-1.5 py-0.5 text-[10px] font-semibold text-alloy-bend-pine">Recommended</span>
                    ) : null}
                    <span className="text-[11px] text-alloy-midnight/30">{open ? "▾" : "▸"}</span>
                </span>
            </button>
            {open ? (
                <div className="space-y-1 border-t border-stone-200/70 px-2.5 py-2 text-[11.5px] text-alloy-midnight/80">
                    {detail?.email ? <div><span className="text-stone-400">Email </span>{detail.email}</div> : null}
                    {detail?.phone ? <div><span className="text-stone-400">Phone </span>{detail.phone}</div> : null}
                    {detail?.zip ? <div><span className="text-stone-400">ZIP </span>{detail.zip}</div> : null}
                    {detail?.householdName ? <div><span className="text-stone-400">Household </span>{detail.householdName}</div> : null}
                    {detail?.children?.length ? <div><span className="text-stone-400">Children </span>{detail.children.join(", ")}</div> : null}
                    {detail?.status ? <div><span className="text-stone-400">Status </span>{detail.status}</div> : null}
                    {detail?.lastUpdated ? <div><span className="text-stone-400">Last updated </span>{detail.lastUpdated}</div> : null}
                    <div className="pt-0.5">
                        <span className="text-stone-400">Why it matches: </span>
                        <span className="text-alloy-bend-pine">{reasons.join(" · ")}</span>
                    </div>
                </div>
            ) : null}
        </li>
    );
}
