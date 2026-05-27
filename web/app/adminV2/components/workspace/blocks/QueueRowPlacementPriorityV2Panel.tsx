"use client";

import { useCallback, useState } from "react";
import type { QueueRowPlacementPriorityV2Vm } from "@/lib/ui-v2/workspace-types";

type PanelProps = {
    preview: QueueRowPlacementPriorityV2Vm;
    /** `statusColumn` stacks under CRM status (enrollment scan rows). */
    layout?: "default" | "statusColumn";
    statusLabel?: string;
};

/**
 * Family-row placement V2 — summary strip + collapsed child candidate detail (Card 4).
 */
export function QueueRowPlacementPriorityV2Panel({ preview, layout = "default", statusLabel }: PanelProps) {
    const [expanded, setExpanded] = useState(false);
    const statusCol = layout === "statusColumn";
    const canExpand = preview.candidates.length > 0;

    const toggleExpand = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!canExpand) return;
            setExpanded((v) => !v);
        },
        [canExpand]
    );

    const strictNote = preview.blockedByStrictLink
        ? "Sibling link — family position uses slowest child in group."
        : preview.strictLinkCrossOpportunityIncomplete
          ? "Sibling link may include children on other records."
          : null;

    return (
        <div
            className={`adminv2-ws-queue-placement-v2${statusCol ? " adminv2-ws-queue-placement-v2--status-column" : ""}`}
            data-queue-placement="v2"
        >
            {statusCol && statusLabel?.trim() ? (
                <p className="adminv2-ws-queue-placement-strip__status-line m-0 text-[11px] leading-snug text-alloy-midnight/80">
                    <span className="font-semibold text-alloy-midnight/55">Status:</span> {statusLabel.trim()}
                </p>
            ) : null}

            <div className="adminv2-ws-queue-placement-v2__summary">
                {preview.showPlacementV2Badge ? (
                    <span className="adminv2-ws-queue-placement-v2__badge" title="Placement priority V2 preview">
                        Placement V2
                    </span>
                ) : null}
                <span className="adminv2-ws-queue-placement-v2__cohort" title={preview.primaryCohortLabel}>
                    {preview.primaryCohortLabel}
                </span>
                <span className="adminv2-ws-queue-placement-rule-chip" title={preview.familyBucketLabel}>
                    {preview.familyBucketLabel}
                </span>
                <span className="adminv2-ws-queue-placement-v2__children">{preview.childCountLabel}</span>
            </div>

            {strictNote ? (
                <p className="adminv2-ws-queue-placement-v2__strict-note" role="note">
                    {strictNote}
                </p>
            ) : null}

            {preview.shadowMode ? (
                <p className="adminv2-ws-queue-placement-v2__shadow-note" role="note">
                    Preview only — list order may not match priority.
                </p>
            ) : null}

            {canExpand ? (
                <>
                    <button
                        type="button"
                        className="adminv2-ws-queue-placement-v2__toggle"
                        aria-expanded={expanded}
                        onClick={toggleExpand}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") toggleExpand(e);
                        }}
                    >
                        <span className="adminv2-ws-queue-placement-v2__toggle-chevron" aria-hidden>
                            {expanded ? "▾" : "▸"}
                        </span>
                        <span>{expanded ? "Hide child placement detail" : "Show child placement detail"}</span>
                        <span className="adminv2-ws-queue-placement-v2__toggle-count">({preview.candidateCount})</span>
                    </button>
                    {expanded ? (
                        <ul className="adminv2-ws-queue-placement-v2__candidates" role="list">
                            {preview.candidates.map((c) => (
                                <li key={c.placementCandidateId} className="adminv2-ws-queue-placement-v2__candidate-line">
                                    <span className="adminv2-ws-queue-placement-v2__candidate-text">{c.detailLine}</span>
                                    {c.hasActiveOverride ? (
                                        <span
                                            className="adminv2-ws-queue-placement-v2__override-tag"
                                            title={`Active override: ${c.activeOverrideKinds.join(", ")}`}
                                        >
                                            Override
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
