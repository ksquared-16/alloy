"use client";

import { useMemo } from "react";
import type { DrawerInquirySummaryRightColumnRenderModel } from "@/lib/adminV2/drawerPipeline/types";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import OpportunityOperationalCompactStrip from "@/components/admin/opportunity/OpportunityOperationalCompactStrip";

const GROUP_LABEL =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45";

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
            className="flex min-h-[1.75rem] items-center"
            aria-hidden
            data-inquiry-summary-task-preview-skeleton="true"
        >
            <div className="h-6 w-full max-w-[16rem] skeleton-pulse rounded-full bg-alloy-stone/11" />
        </div>
    );
}

function TasksSection({ model }: { model: DrawerInquirySummaryRightColumnRenderModel["tasks"] }) {
    if (!model.visible) return null;
    const openTasks = model.open_tasks;

    return (
        <div data-operational-strip-group="tasks" data-right-column-slot="tasks">
            <div className={GROUP_LABEL}>Tasks</div>
            <div className="mt-1 flex w-full flex-col gap-1.5">
                {model.state === "skeleton" || model.state === "pending" ? (
                    <>
                        <TaskRowSkeleton />
                        <TaskRowSkeleton />
                    </>
                ) : openTasks.length > 0 ? (
                    <div className="flex w-full flex-wrap gap-1">
                        {openTasks.map((t) => {
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
                        })}
                    </div>
                ) : (
                    <p
                        className="text-[11px] text-alloy-midnight/50"
                        data-inquiry-summary-task-preview-empty="true"
                    >
                        No open tasks
                    </p>
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
};

/**
 * Single atomic right column: tasks + reminders + BOS handoff structure from drawer_primary.
 */
export function OpportunityInquirySummaryRightColumn({
    model,
    opportunityId,
    overviewData,
    entityLabel = null,
    fetchEnabled = true,
}: OpportunityInquirySummaryRightColumnProps) {
    const record = useMemo(() => overviewData, [overviewData]);

    return (
        <div
            className="mt-2 min-h-[10rem] border-t border-alloy-stone/10 pt-2"
            data-inquiry-summary-right-column="true"
            data-right-column-structure={[
                model.tasks.visible ? "tasks" : null,
                model.reminders.visible ? "reminders" : null,
                model.orchestrator_handoff.visible ? "orchestrator_handoff" : null,
            ]
                .filter(Boolean)
                .join(",")}
        >
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
