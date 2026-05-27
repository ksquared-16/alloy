"use client";

import clsx from "clsx";
import { useCallback, useState } from "react";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import { SubmissionQuickReviewDrawer } from "@/components/forms/workspace/SubmissionQuickReviewDrawer";
import {
    SubmissionInboxRowView,
    submissionDetailHref,
} from "@/components/forms/workspace/SubmissionInboxRowView";
import {
    groupSubmissionsIntoInboxLanes,
    SUBMISSION_INBOX_LANE_COPY,
    type SubmissionInboxLaneKey,
    type SubmissionInboxPrimaryLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";
import {
    opCaseFileCanvas,
    opGroupedSurface,
    opMetadata,
    opOrientationSurface,
    opRegionSeparator,
    opStackPage,
} from "@/lib/operational/ui/operationalVisualTokens";

const PRIMARY_LANES: SubmissionInboxPrimaryLaneKey[] = [
    "needsReview",
    "needsLinking",
    "drafts",
    "recentlySubmitted",
];

type Props = {
    rows: SubmissionInboxRow[];
    formsById: Record<string, string>;
    viewerTz: string;
    loading?: boolean;
    error?: string | null;
    emptyMessage?: string;
    orientationLead?: string;
    onRefresh?: () => void;
};

function InboxLaneSection({
    laneKey,
    rows,
    formsById,
    viewerTz,
    emphasize,
    onQuickReview,
}: {
    laneKey: SubmissionInboxLaneKey;
    rows: SubmissionInboxRow[];
    formsById: Record<string, string>;
    viewerTz: string;
    emphasize?: boolean;
    onQuickReview: (row: SubmissionInboxRow) => void;
}) {
    const copy = SUBMISSION_INBOX_LANE_COPY[laneKey];
    const quickReviewEnabled = laneKey !== "drafts";

    return (
        <IntakeWorkspaceRegion title={copy.title} lead={copy.lead} data-testid={copy.testId}>
            {rows.length === 0 ?
                <p className={opMetadata}>{copy.empty}</p>
            :   <ul className={clsx(opGroupedSurface, emphasize && "overflow-hidden")}>
                    {rows.map((row) => (
                        <SubmissionInboxRowView
                            key={row.id}
                            row={row}
                            formName={formsById[row.form_definition_id] ?? "Form"}
                            lane={laneKey}
                            viewerTz={viewerTz}
                            href={submissionDetailHref(row.form_definition_id, row.id)}
                            emphasize={emphasize}
                            onQuickReview={quickReviewEnabled ? () => onQuickReview(row) : undefined}
                        />
                    ))}
                </ul>
            }
        </IntakeWorkspaceRegion>
    );
}

/** Grouped submissions inbox (OW-6 / OI-4). */
export function SubmissionsInboxView({
    rows,
    formsById,
    viewerTz,
    loading = false,
    error = null,
    emptyMessage = "No submissions yet.",
    orientationLead = "Prioritized intake review across your forms.",
    onRefresh,
}: Props) {
    const lanes = groupSubmissionsIntoInboxLanes(rows);
    const attentionCount = lanes.needsReview.length + lanes.needsLinking.length;
    const [quickReviewRow, setQuickReviewRow] = useState<SubmissionInboxRow | null>(null);
    const closeDrawer = useCallback(() => setQuickReviewRow(null), []);

    if (loading) return <p className={opMetadata}>Loading submissions…</p>;
    if (error) return <p className="text-sm text-alloy-ember">{error}</p>;
    if (rows.length === 0) return <p className={opMetadata}>{emptyMessage}</p>;

    return (
        <>
            <div className={clsx(opCaseFileCanvas, opStackPage)} data-testid="submissions-inbox">
                <div className={opOrientationSurface}>
                    <p className={opMetadata}>{orientationLead}</p>
                    <p className={clsx("mt-1", opMetadata)}>
                        {attentionCount > 0 ?
                            `${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`
                        :   "No linkage flags in this list"}
                        {" · "}
                        {lanes.drafts.length} draft{lanes.drafts.length === 1 ? "" : "s"}
                        {" · "}
                        {lanes.recentlySubmitted.length} recently submitted
                    </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    <InboxLaneSection
                        laneKey="needsReview"
                        rows={lanes.needsReview}
                        formsById={formsById}
                        viewerTz={viewerTz}
                        emphasize
                        onQuickReview={setQuickReviewRow}
                    />
                    <InboxLaneSection
                        laneKey="needsLinking"
                        rows={lanes.needsLinking}
                        formsById={formsById}
                        viewerTz={viewerTz}
                        emphasize
                        onQuickReview={setQuickReviewRow}
                    />
                </div>

                <div className={clsx(opRegionSeparator, "grid gap-5 lg:grid-cols-2")}>
                    <InboxLaneSection
                        laneKey="drafts"
                        rows={lanes.drafts}
                        formsById={formsById}
                        viewerTz={viewerTz}
                        onQuickReview={setQuickReviewRow}
                    />
                    <InboxLaneSection
                        laneKey="recentlySubmitted"
                        rows={lanes.recentlySubmitted}
                        formsById={formsById}
                        viewerTz={viewerTz}
                        onQuickReview={setQuickReviewRow}
                    />
                </div>
            </div>

            {quickReviewRow ?
                <SubmissionQuickReviewDrawer
                    open
                    onClose={closeDrawer}
                    row={quickReviewRow}
                    formName={formsById[quickReviewRow.form_definition_id] ?? "Form"}
                    viewerTz={viewerTz}
                    onUpdated={onRefresh}
                />
            :   null}
        </>
    );
}
