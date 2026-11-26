"use client";

/**
 * STUDIO — what the financial day is made of, and where each piece is actually configured.
 *
 * ── THIS DUPLICATES NOTHING, AND THAT IS THE WHOLE DESIGN ──
 *
 * Financials configuration already exists and already has an owner: `/organization/financials`
 * persists tuition rates, the billable catalogue, commercial policies, accounting mappings, the
 * simulator and the funding boundary. A Studio that re-authored any of it would create a second
 * writer for one setting — the exact failure that produces two organizations' worth of truth in
 * one organization.
 *
 * So Studio writes nothing. It is a launch and summary surface: the tiles come from
 * `buildFinancialsLandingSections()`, the same model the configuration landing page renders, and
 * each one navigates to the canonical page. When a tile's copy needs to change, it changes in
 * the model both surfaces read.
 *
 * Thread 4 declined a Studio because a rail with one position is furniture and a duplicating
 * Studio is worse than none. Both objections are answered here: Work has six sections, and this
 * mode owns no configuration.
 */

import { useMemo } from "react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import {
    buildFinancialsLandingSections,
    FINANCIALS_LANDING_HREF,
} from "@/lib/financials/financialsLandingModel";

const KIND_LABEL: Record<string, string> = {
    configuration: "Configuration",
    utility: "Utility",
    boundary: "Owned elsewhere",
};

export default function FinancialsStudio() {
    const sections = useMemo(() => buildFinancialsLandingSections(), []);

    return (
        <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="financials-studio-section">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3" data-financials-studio-tiles="true">
                    {sections.map((section) => (
                        <WorkspaceCard key={section.id}>
                            <a
                                href={section.href}
                                data-financials-studio-tile={section.id}
                                className="flex h-full flex-col gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/50"
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-alloy-midnight">{section.label}</span>
                                    <span className="shrink-0 whitespace-nowrap rounded-full border border-alloy-stone/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/55">
                                        {KIND_LABEL[section.kind] ?? section.postureLabel}
                                    </span>
                                </span>
                                <span className="text-xs text-alloy-midnight/65">{section.summary}</span>
                                <ul className="mt-0.5 flex flex-col gap-0.5">
                                    {section.capabilities.map((capability) => (
                                        <li key={capability} className="text-[11px] text-alloy-midnight/50">
                                            · {capability}
                                        </li>
                                    ))}
                                </ul>
                            </a>
                        </WorkspaceCard>
                    ))}
                </div>
            </div>
            <div
                className="shrink-0 border-t border-alloy-stone/10 px-3 py-2 text-xs text-alloy-midnight/55"
                data-financials-studio-footer="true"
            >
                {/* Said plainly, so nobody looks for a save button that will never exist here. */}
                Every setting is authored and persisted at{" "}
                <a href={FINANCIALS_LANDING_HREF} className="underline underline-offset-2">
                    Organization → Financials
                </a>
                . Studio launches it; it does not hold a second copy.
            </div>
        </WorkspaceSurface>
    );
}
