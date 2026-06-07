"use client";

/**
 * C1a — optional shadow parity diagnostics (dev/staging only).
 *
 * Rendered only when NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS=1.
 * Does not replace or overlay the VM drawer body.
 */

import type { OpportunityDrawerShadowTelemetry } from "@/lib/layout/runtime/shadow/opportunityDrawerShadowTelemetry";

type Props = {
    telemetry: OpportunityDrawerShadowTelemetry | null;
    evaluating: boolean;
    lastError: string | null;
};

export default function OpportunityDrawerLayoutRuntimeShadowDiagnostics({
    telemetry,
    evaluating,
    lastError,
}: Props) {
    return (
        <details
            className="mt-4 rounded-md border border-dashed border-[#c9d4e8] bg-[#f8fafc] text-xs"
            data-layout-runtime-shadow-diagnostics="true"
        >
            <summary className="cursor-pointer px-3 py-2 font-medium text-[#59678b]">
                Layout runtime shadow (C1a diagnostics)
                {evaluating ? " · evaluating…" : telemetry ? ` · ${telemetry.parityScore}% parity` : ""}
            </summary>
            <div className="border-t border-[#e6e8ec] px-3 py-2 text-[#31394d]">
                {lastError ?
                    <p className="text-[#b54708]">Shadow evaluation skipped: {lastError}</p>
                :   null}
                {!telemetry && !evaluating && !lastError ?
                    <p className="text-[#9aa4bf]">Waiting for shadow evaluation…</p>
                :   null}
                {telemetry ?
                    <>
                        <p className="mb-2">
                            Readiness: <strong>{telemetry.readinessLevel}</strong> · Field coverage:{" "}
                            {telemetry.fieldCoveragePercent}% · Source: {telemetry.layoutSource ?? "—"}
                        </p>
                        <p className="mb-2 text-[#59678b]">{telemetry.summary}</p>
                        {telemetry.topGaps.length > 0 ?
                            <div className="mb-2">
                                <div className="font-semibold uppercase tracking-wide text-[#59678b]">Top gaps</div>
                                <ul className="mt-1 list-disc pl-4">
                                    {telemetry.topGaps.map((g, i) => (
                                        <li key={i}>
                                            [{g.impact}] {g.key}: {g.detail}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        :   null}
                        {telemetry.missingSections.length > 0 ?
                            <div className="mb-2">
                                <div className="font-semibold uppercase tracking-wide text-[#59678b]">
                                    Missing sections
                                </div>
                                <p>{telemetry.missingSections.join(", ")}</p>
                            </div>
                        :   null}
                        {telemetry.missingFields.length > 0 ?
                            <div className="mb-2">
                                <div className="font-semibold uppercase tracking-wide text-[#59678b]">
                                    Missing fields
                                </div>
                                <p>{telemetry.missingFields.slice(0, 8).join(", ")}</p>
                            </div>
                        :   null}
                        {telemetry.extraLayoutItems.length > 0 ?
                            <div>
                                <div className="font-semibold uppercase tracking-wide text-[#59678b]">
                                    Extra layout items
                                </div>
                                <p>{telemetry.extraLayoutItems.slice(0, 8).join(", ")}</p>
                            </div>
                        :   null}
                    </>
                :   null}
            </div>
        </details>
    );
}
