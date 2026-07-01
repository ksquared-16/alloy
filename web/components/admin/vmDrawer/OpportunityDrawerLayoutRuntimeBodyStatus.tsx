"use client";

/**
 * C1b staging/debug — layout runtime overview body status (non-operator when flags off).
 */

import Link from "next/link";
import type { OpportunityLayoutRuntimeBodyPhase } from "@/lib/layout/runtime/useOpportunityDrawerLayoutRuntimeBody";

type Props = {
    phase: OpportunityLayoutRuntimeBodyPhase;
    layoutSource: string | null;
    layoutKey: string | null;
    lastError: string | null;
    opportunityId: string;
};

function statusLabel(phase: OpportunityLayoutRuntimeBodyPhase, lastError: string | null): string {
    switch (phase) {
        case "idle":
            return "idle";
        case "loading":
            return "loading";
        case "ready":
            return "layout";
        case "fallback":
            return lastError ? `fallback (${lastError})` : "fallback";
        default:
            return phase;
    }
}

export default function OpportunityDrawerLayoutRuntimeBodyStatus({
    phase,
    layoutSource,
    layoutKey,
    lastError,
    opportunityId,
}: Props) {
    const inspectorHref = `/adminV2/settings/layouts/effective?entity_type=opportunities&surface=drawer&opportunity_id=${encodeURIComponent(opportunityId)}`;

    return (
        <details className="rounded-md border border-dashed border-alloy-stone/30 bg-alloy-stone/5 px-2.5 py-1.5 text-[11px] text-alloy-midnight/70">
            <summary className="cursor-pointer font-medium text-alloy-midnight/80">
                Layout runtime (C1b debug)
            </summary>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <dt className="font-medium">Body status</dt>
                <dd data-layout-runtime-body-status={statusLabel(phase, lastError)}>
                    {statusLabel(phase, lastError)}
                </dd>
                <dt className="font-medium">Layout source</dt>
                <dd>{layoutSource ?? "—"}</dd>
                <dt className="font-medium">Layout key</dt>
                <dd>{layoutKey ?? "—"}</dd>
                {lastError && phase === "fallback" ?
                    <>
                        <dt className="font-medium">Fallback reason</dt>
                        <dd>{lastError}</dd>
                    </>
                :   null}
            </dl>
            <p className="mt-1.5">
                <Link href={inspectorHref} className="text-alloy-blue underline">
                    Effective layout inspector
                </Link>
            </p>
        </details>
    );
}
