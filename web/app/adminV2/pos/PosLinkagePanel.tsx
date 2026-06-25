"use client";

/**
 * POS Linkage (prototype surface).
 *
 * Linkage/Resolution is where a human settles ambiguity (confirm match, create new,
 * request info, reject). The live decision UI already exists per-case in the
 * Processing decision column; this section will become the cross-case resolution
 * lane. Prototype for now — routes the operator to Processing.
 */

import { GitMerge } from "lucide-react";
import type { PosSection } from "./posSections";

export default function PosLinkagePanel({ onNavigate }: { onNavigate: (section: PosSection) => void }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-alloy-stone/12 bg-white px-4 py-2">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-alloy-midnight">Linkage</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Prototype</span>
                </div>
                <div className="text-[11px] text-stone-500">Resolve ambiguity: confirm a match, create new, request info, or reject.</div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-6">
                <div className="max-w-sm rounded-lg border border-alloy-stone/15 bg-white p-5 text-center shadow-sm">
                    <GitMerge className="mx-auto h-5 w-5 text-emerald-600" aria-hidden />
                    <div className="mt-2 text-[13px] font-semibold text-alloy-midnight">Resolution lane coming together</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
                        Match candidates and link/create/route decisions are live today inside each Processing case (the third
                        column). The cross-case resolution lane will surface here.
                    </p>
                    <button
                        type="button"
                        onClick={() => onNavigate("processing")}
                        className="mt-3 rounded-md bg-[#00A283] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#009276]"
                    >
                        Open Processing
                    </button>
                </div>
            </div>
        </div>
    );
}
