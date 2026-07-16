"use client";

import { useState } from "react";
import type { ConfigReadinessArea } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Operational Readiness — "Have I finished configuring what we can assess?"
 * Unknown areas (complete === null) are excluded from the denominator.
 * Collapses to a single calm line at 100%.
 * When `embedded`, skips outer card chrome (for Overview composition).
 */
export function ConfigOperationalReadiness({
    percent,
    areas,
    onSelectArea,
    compact = false,
    embedded = false,
    testId = "config-operational-readiness",
}: {
    percent: number;
    areas: ConfigReadinessArea[];
    onSelectArea?: (area: ConfigReadinessArea) => void;
    compact?: boolean;
    embedded?: boolean;
    testId?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const known = areas.filter((area) => area.complete !== null);
    const incomplete = known.filter((area) => area.complete === false);
    const unknown = areas.filter((area) => area.complete === null);

    const body =
        percent >= 100 && incomplete.length === 0 ?
            <>
                <p className="text-sm font-medium text-[#007d68]" data-testid={`${testId}-complete`}>
                    Operational readiness complete ✓
                </p>
                {unknown.length > 0 ?
                    <p className="config-typo-sublabel mt-1">
                        {unknown.length} {unknown.length === 1 ? "area" : "areas"} not assessed yet
                    </p>
                :   null}
            </>
        :   <>
                {!embedded ?
                    <div className="flex items-end gap-3">
                        <p className="text-2xl font-semibold tracking-tight text-alloy-midnight">{percent}%</p>
                        <div className="pb-0.5 text-xs text-alloy-midnight/55">
                            {incomplete.length} remaining
                            {unknown.length > 0 ?
                                <span className="ml-1 text-alloy-midnight/40">· {unknown.length} not assessed</span>
                            :   null}
                        </div>
                    </div>
                :   <p className="text-xs text-alloy-midnight/55">
                        {incomplete.length} remaining
                        {unknown.length > 0 ?
                            <span className="ml-1 text-alloy-midnight/40">· {unknown.length} not assessed</span>
                        :   null}
                    </p>
                }
                {!embedded ?
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-alloy-forge/10">
                        <div
                            className="h-full rounded-full bg-[#00a283]"
                            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                        />
                    </div>
                :   null}
                <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-[#007d68]"
                    onClick={() => setExpanded((current) => !current)}
                    aria-expanded={expanded}
                >
                    {expanded ? "Hide areas" : "Review areas"}
                </button>
                {expanded ?
                    <ul className="mt-2 divide-y divide-alloy-forge/10 border-t border-alloy-forge/10">
                        {areas.map((area) => (
                            <li key={area.key}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between py-1.5 text-xs"
                                    onClick={() => onSelectArea?.(area)}
                                    disabled={!onSelectArea}
                                >
                                    <span className="text-alloy-midnight/70">{area.label}</span>
                                    <span
                                        className={
                                            area.complete === true ? "text-[#007d68]"
                                            : area.complete === false ?
                                                "text-amber-700"
                                            :   "text-alloy-midnight/40"
                                        }
                                    >
                                        {area.complete === true ?
                                            "Ready"
                                        : area.complete === false ?
                                            "Finish"
                                        :   "Not assessed"}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                :   null}
            </>;

    if (embedded) {
        return (
            <div data-testid={testId}>
                {body}
            </div>
        );
    }

    if (percent >= 100 && incomplete.length === 0) {
        return (
            <ConfigWorkspaceCard compact={compact} testId={testId}>
                {body}
            </ConfigWorkspaceCard>
        );
    }

    return (
        <ConfigWorkspaceCard title="Operational readiness" compact={compact} testId={testId}>
            {body}
        </ConfigWorkspaceCard>
    );
}
