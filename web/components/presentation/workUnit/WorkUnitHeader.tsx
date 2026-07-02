"use client";

/**
 * Presentation Runtime V2 — WU.HEADER.
 *
 * Work Unit identity: process label as a quiet eyebrow, work unit name as the title.
 * Pure presenter — receives resolved header fields, never fetches.
 */

import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function WorkUnitHeader({
    processLabel,
    workUnitName,
}: {
    processLabel: string | null;
    workUnitName: string;
}) {
    return (
        <header
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitHeader)}
            className="flex flex-col gap-0.5"
        >
            {processLabel ? (
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                    {processLabel}
                </span>
            ) : null}
            <h1 className="text-xl font-semibold leading-tight text-alloy-midnight">{workUnitName}</h1>
        </header>
    );
}
