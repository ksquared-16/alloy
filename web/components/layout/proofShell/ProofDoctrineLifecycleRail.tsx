"use client";

/**
 * Live lifecycle rail with ProofRecordModal visual doctrine (sticky header row 4).
 * Uses authoritative VM-resolved steps; styling matches ProofLifecycleRail tokens.
 */

import type { RecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import RecordLifecycleRail from "@/components/admin/drawer/RecordLifecycleRail";

export default function ProofDoctrineLifecycleRail({
    model,
    "data-testid": dataTestId = "opportunity-lifecycle-rail",
    "aria-label": ariaLabel = "Opportunity lifecycle",
}: {
    model: RecordLifecycleRailModel;
    "data-testid"?: string;
    "aria-label"?: string;
}) {
    if (!model.steps.length) return null;

    return (
        <div data-proof-lifecycle-rail="true" data-proof-lifecycle-rail-live="true">
            <RecordLifecycleRail
                model={model}
                data-testid={dataTestId}
                aria-label={ariaLabel}
            />
        </div>
    );
}
