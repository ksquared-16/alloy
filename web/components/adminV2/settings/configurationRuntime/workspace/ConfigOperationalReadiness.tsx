"use client";

import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import type { ConfigReadinessArea } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Operational Readiness — "Have I finished configuring what we can assess?"
 * Unknown areas (complete === null) are excluded from the denominator.
 * The visible area list reconciles the percentage without becoming a task list.
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
    const known = areas.filter((area) => area.complete !== null);
    const completed = known.filter((area) => area.complete === true);
    const incomplete = known.filter((area) => area.complete === false);
    const unknown = areas.filter((area) => area.complete === null);

    const body = (
        <>
            <div className="flex items-end justify-between gap-3">
                <div>
                    <p
                        className="text-2xl font-semibold tracking-tight text-alloy-midnight"
                        data-testid={`${testId}-percent`}
                    >
                        {percent}%
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/50">
                        {completed.length} of {known.length} assessed areas complete
                        {unknown.length > 0 ? ` · ${unknown.length} not assessed` : ""}
                    </p>
                </div>
                {incomplete.length > 0 ?
                    <p className="text-[11px] font-medium text-alloy-ember">
                        {incomplete.length} {incomplete.length === 1 ? "area needs" : "areas need"} setup
                    </p>
                :   null}
            </div>
            <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-alloy-forge/10"
                role="progressbar"
                aria-label="Operational readiness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
                <div
                    className="h-full rounded-full bg-alloy-bend-pine"
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
            </div>
            <ul className="mt-3 divide-y divide-alloy-forge/10 border-y border-alloy-forge/10">
                {areas.map((area) => {
                    const status =
                        area.complete === true ? "Complete"
                        : area.complete === false ? "Needs setup"
                        :   "Not assessed";
                    const icon =
                        area.complete === true ?
                            <CheckCircle2 className="h-3.5 w-3.5 text-alloy-bend-pine" aria-hidden />
                        : area.complete === false ?
                            <CircleAlert className="h-3.5 w-3.5 text-alloy-ember" aria-hidden />
                        :   <CircleHelp className="h-3.5 w-3.5 text-alloy-midnight/35" aria-hidden />;
                    return (
                        <li key={area.key}>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 py-2 text-xs hover:bg-alloy-bend-pine/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                                onClick={() => onSelectArea?.(area)}
                                disabled={!onSelectArea}
                            >
                                <span className="font-medium text-alloy-midnight/75">{area.label}</span>
                                <span
                                    className={`inline-flex items-center gap-1.5 ${
                                        area.complete === true ? "text-alloy-bend-pine"
                                        : area.complete === false ? "text-alloy-ember"
                                        :   "text-alloy-midnight/45"
                                    }`}
                                >
                                    {icon}
                                    {status}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );

    if (embedded) {
        return (
            <div data-testid={testId}>
                {body}
            </div>
        );
    }

    return (
        <ConfigWorkspaceCard title="Operational readiness" compact={compact} testId={testId}>
            {body}
        </ConfigWorkspaceCard>
    );
}
