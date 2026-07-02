"use client";

/**
 * Presentation Runtime V2 — WU.HEADER.
 *
 * Work Unit identity: the CONFIGURED parent process label as the title, with the active
 * configured Work View's label as a quiet subtitle line. Configured labels only — internal
 * work-unit names/keys and humanized slugs never render here.
 * Pure presenter — receives resolved header fields, never fetches.
 */

import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function WorkUnitHeader({
    processLabel,
    workViewLabel,
}: {
    processLabel: string | null;
    workViewLabel: string | null;
}) {
    return (
        <header
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitHeader)}
            data-alloy-section="WU.HEADER"
            className="flex flex-col gap-0.5"
        >
            <h1 className="text-xl font-semibold leading-tight text-alloy-midnight">
                {processLabel ?? ""}
            </h1>
            {workViewLabel ? (
                <span className="text-sm font-medium leading-snug text-alloy-midnight/65">{workViewLabel}</span>
            ) : null}
        </header>
    );
}
