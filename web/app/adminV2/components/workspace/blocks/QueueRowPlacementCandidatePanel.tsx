"use client";

import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

type SiblingContextProps = {
    row: QueueRowPlacementWaitlistCandidateVm;
};

/** Left column: sibling + link context (secondary to family identity + Child/Program columns). */
export function QueueRowPlacementCandidateContext({ row }: SiblingContextProps) {
    const lines = row.siblingContextLines ?? [];
    const hasLines = lines.length > 0;

    if (!hasLines && !row.linkModeLabel) return null;

    return (
        <div className="adminv2-ws-queue-placement-candidate__context" data-queue-placement="candidate-context">
            {row.linkModeLabel ? (
                <p className="adminv2-ws-queue-placement-candidate__link-note">{row.linkModeLabel}</p>
            ) : null}
            {hasLines ?
                lines.map((line) => (
                    <p
                        key={line}
                        className="adminv2-ws-queue-placement-candidate__sibling-line"
                        data-queue-placement="sibling-context"
                        title={row.siblingContextDiagnostics ?? undefined}
                    >
                        {line}
                    </p>
                ))
            :   null}
        </div>
    );
}

type MetaProps = {
    row: QueueRowPlacementWaitlistCandidateVm;
    siteLabel?: string | null;
};

/** Compact waitlist metadata beside Child/Program columns — bucket, wait since, site. */
export function QueueRowPlacementCandidateMetaChips({ row, siteLabel }: MetaProps) {
    const site = siteLabel?.trim() || null;

    return (
        <div className="adminv2-ws-queue-placement-candidate__meta" data-queue-placement="candidate-meta">
            <div className="adminv2-ws-queue-placement-candidate__meta-row">
                <span className="adminv2-ws-queue-placement-rule-chip" title={row.bucketLabel}>
                    {row.bucketLabel}
                </span>
                {row.waitSinceLabel ? (
                    <span className="adminv2-ws-queue-placement-candidate__meta-chip" title="Waitlisted since">
                        Waitlisted since {row.waitSinceLabel}
                    </span>
                ) : null}
                {site ? (
                    <span className="adminv2-ws-queue-placement-candidate__meta-chip" title="Site">
                        {site}
                    </span>
                ) : null}
                {row.isSyntheticFallback ? (
                    <span className="adminv2-ws-queue-placement-candidate__tag">No child on file</span>
                ) : null}
                {row.hasManualPositionAdjustment ? (
                    <span
                        className="adminv2-ws-queue-placement-v2__override-tag adminv2-ws-queue-placement-v2__manual-adjust-tag"
                        title={row.manualAdjustmentReason ?? "Manual waitlist position adjustment"}
                    >
                        Manually adjusted
                    </span>
                ) : null}
                {row.forecastHints[0] ? (
                    <span
                        className="adminv2-ws-queue-placement-candidate__forecast-chip"
                        title={row.forecastHints[0]}
                    >
                        {row.forecastHints[0]}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

/** @deprecated Use standard CRM fact groups + MetaChips + Context. */
export function QueueRowPlacementCandidatePanel({
    row,
    statusLabel: _statusLabel,
}: {
    row: QueueRowPlacementWaitlistCandidateVm;
    statusLabel?: string;
}) {
    return (
        <>
            <QueueRowPlacementCandidateMetaChips row={row} />
            <QueueRowPlacementCandidateContext row={row} />
        </>
    );
}
