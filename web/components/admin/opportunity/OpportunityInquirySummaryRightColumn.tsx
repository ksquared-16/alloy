"use client";

import { memo, useMemo } from "react";
import type { DrawerInquirySummaryRightColumnRenderModel } from "@/lib/adminV2/drawerPipeline/types";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS,
    INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS,
    INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS,
    INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import OperationalAttentionHeaderStrip from "@/components/admin/drawer/OperationalAttentionHeaderStrip";
import OpportunityOperationalCompactStrip from "@/components/admin/opportunity/OpportunityOperationalCompactStrip";

const CHIP =
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-snug";

function shortWhen(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function TaskRowSkeleton() {
    return (
        <div
            className="h-[1.75rem] w-full max-w-[16rem] skeleton-pulse rounded-full bg-alloy-stone/11"
            aria-hidden
            data-inquiry-summary-task-preview-skeleton="true"
        />
    );
}

function ReviewAssistSkeleton() {
    return (
        <div
            className="min-h-[3.25rem] rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.06] skeleton-pulse"
            data-review-assist-skeleton="true"
            aria-hidden
        />
    );
}

function InquirySummaryReviewAssist({
    overviewData,
    assistLoading,
    opportunityId,
    opportunitySingular = "Inquiry",
    reviewAssistReserved = true,
}: {
    overviewData: Record<string, unknown>;
    assistLoading?: boolean;
    opportunityId: string;
    opportunitySingular?: string;
    /** When true, slot stays in DOM even before BOS payload arrives (loading doctrine). */
    reviewAssistReserved?: boolean;
}) {
    const hasAssist =
        overviewData._operational_recommendation != null || overviewData._operational_attention != null;

    if (!reviewAssistReserved && !assistLoading && !hasAssist) {
        return null;
    }

    return (
        <div
            className="min-w-0 min-h-[3.25rem] shrink-0"
            data-drawer-slot="inquiry_summary_review_assist"
            data-review-assist-slot={hasAssist ? "ready" : assistLoading ? "skeleton" : "reserved"}
        >
            {assistLoading && !hasAssist ? (
                <ReviewAssistSkeleton />
            ) : hasAssist ? (
                <OperationalAttentionHeaderStrip
                    variant="chrome"
                    overviewData={overviewData}
                    suppressSectionBrandLabel
                    bosAssistEntityId={opportunityId}
                    opportunitySingular={opportunitySingular}
                />
            ) : (
                <div
                    className="min-h-[2rem] rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.03]"
                    data-review-assist-placeholder="reserved"
                    aria-hidden
                />
            )}
        </div>
    );
}

function TasksSection({ model }: { model: DrawerInquirySummaryRightColumnRenderModel["tasks"] }) {
    if (!model.visible) return null;
    const openTasks = model.open_tasks;

    return (
        <div data-operational-strip-group="tasks" data-right-column-slot="tasks">
            <div className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Tasks</div>
            <div className={`mt-1 ${INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS}`}>
                {model.state === "skeleton" || model.state === "pending" ? (
                    <TaskRowSkeleton />
                ) : openTasks.length > 0 ? (
                    openTasks.map((t) => {
                        const badge = operationalTaskUrgencyBadge(t);
                        return (
                            <span
                                key={t.id}
                                className={`${CHIP} border ${badge.className}`}
                                data-inquiry-summary-task-preview-row={t.id}
                            >
                                <span className="truncate font-semibold">{t.title}</span>
                                <span
                                    className={`shrink-0 rounded-full border px-1 py-0 text-[8px] font-semibold ${badge.className}`}
                                >
                                    {badge.label}
                                </span>
                                {t.due_at ? (
                                    <span className="shrink-0 opacity-75">· {shortWhen(t.due_at)}</span>
                                ) : null}
                            </span>
                        );
                    })
                ) : (
                    <span
                        className={INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS}
                        data-inquiry-summary-task-preview-empty="true"
                    >
                        No open tasks
                    </span>
                )}
            </div>
        </div>
    );
}

export type OpportunityInquirySummaryRightColumnProps = {
    model: DrawerInquirySummaryRightColumnRenderModel;
    opportunityId: string;
    overviewData: Record<string, unknown>;
    entityLabel?: string | null;
    fetchEnabled?: boolean;
    /** Reserve assist skeleton until primary payload includes BOS fields. */
    reviewAssistLoading?: boolean;
    opportunitySingular?: string;
};

function rightColumnModelEqual(
    a: DrawerInquirySummaryRightColumnRenderModel,
    b: DrawerInquirySummaryRightColumnRenderModel
): boolean {
    if (a === b) return true;
    if (
        a.tasks.visible !== b.tasks.visible ||
        a.tasks.state !== b.tasks.state ||
        a.tasks.open_count !== b.tasks.open_count ||
        a.reminders.visible !== b.reminders.visible ||
        a.reminders.state !== b.reminders.state ||
        a.orchestrator_handoff.visible !== b.orchestrator_handoff.visible ||
        a.orchestrator_handoff.state !== b.orchestrator_handoff.state
    ) {
        return false;
    }
    const aTasks = a.tasks.open_tasks;
    const bTasks = b.tasks.open_tasks;
    if (aTasks.length !== bTasks.length) return false;
    for (let i = 0; i < aTasks.length; i++) {
        if (aTasks[i]!.id !== bTasks[i]!.id) return false;
    }
    return true;
}

/**
 * Single atomic right column: tasks + reminders + BOS handoff structure from drawer_primary.
 */
function OpportunityInquirySummaryRightColumnInner({
    model,
    opportunityId,
    overviewData,
    entityLabel = null,
    fetchEnabled = true,
    reviewAssistLoading = false,
    opportunitySingular = "Inquiry",
}: OpportunityInquirySummaryRightColumnProps) {
    const record = useMemo(() => overviewData, [overviewData]);

    return (
        <div
            className={INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS}
            data-inquiry-summary-right-column="true"
            data-right-column-structure={[
                "review_assist",
                model.tasks.visible ? "tasks" : null,
                model.reminders.visible ? "reminders" : null,
                model.orchestrator_handoff.visible ? "orchestrator_handoff" : null,
            ]
                .filter(Boolean)
                .join(",")}
        >
            <InquirySummaryReviewAssist
                overviewData={record}
                assistLoading={reviewAssistLoading}
                opportunityId={opportunityId}
                opportunitySingular={opportunitySingular}
                reviewAssistReserved
            />
            <TasksSection model={model.tasks} />
            <OpportunityOperationalCompactStrip
                layout="inquiry_summary"
                opportunityId={opportunityId}
                overviewData={record}
                entityLabel={entityLabel}
                fetchEnabled={fetchEnabled}
                tasksLoadMode="auto"
                hideTasksSection
                rightColumnModel={model}
            />
        </div>
    );
}

function reviewAssistPayloadEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>
): boolean {
    return (
        a._operational_recommendation === b._operational_recommendation &&
        a._operational_attention === b._operational_attention &&
        a._operational_attention_error === b._operational_attention_error
    );
}

export const OpportunityInquirySummaryRightColumn = memo(
    OpportunityInquirySummaryRightColumnInner,
    (prev, next) =>
        prev.opportunityId === next.opportunityId &&
        prev.fetchEnabled === next.fetchEnabled &&
        prev.reviewAssistLoading === next.reviewAssistLoading &&
        prev.entityLabel === next.entityLabel &&
        reviewAssistPayloadEqual(prev.overviewData, next.overviewData) &&
        rightColumnModelEqual(prev.model, next.model)
);
