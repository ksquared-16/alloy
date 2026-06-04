"use client";

import { useMemo } from "react";
import type { DrawerInquirySummaryRightColumnRenderModel } from "@/lib/adminV2/drawerPipeline/types";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import { scheduledSendUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS,
    INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS,
    INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS,
    INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import type { RemindersSummaryVm } from "@/lib/adminV2/viewModel/drawer/types";

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

type Props = {
    model: DrawerInquirySummaryRightColumnRenderModel;
    reminders?: RemindersSummaryVm;
};

/**
 * VM-only tasks/reminders column — no OperationalCompactStrip, no post-open fetch.
 */
export default function VmInquiryRightColumn({ model, reminders }: Props) {
    const sends = useMemo(() => reminders?.scheduled_sends ?? [], [reminders?.scheduled_sends]);

    return (
        <div
            className={INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS}
            data-inquiry-summary-right-column="true"
            data-vm-runtime-right-column="true"
        >
            {model.tasks.visible ? (
                <div data-operational-strip-group="tasks" data-right-column-slot="tasks">
                    <div className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Tasks</div>
                    <div className={`mt-1 ${INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS}`}>
                        {model.tasks.open_tasks.length > 0 ?
                            model.tasks.open_tasks.map((t) => {
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
                                        {t.due_at ?
                                            <span className="shrink-0 opacity-75">· {shortWhen(t.due_at)}</span>
                                        :   null}
                                    </span>
                                );
                            })
                        :   <span
                                className={INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS}
                                data-inquiry-summary-task-preview-empty="true"
                            >
                                No open tasks
                            </span>
                        }
                    </div>
                </div>
            ) : null}
            {model.reminders.visible ?
                <div data-operational-strip-group="reminders" data-right-column-slot="reminders">
                    <div className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Reminders</div>
                    <div className="mt-1 flex w-full flex-wrap gap-1">
                        {model.reminders.next_follow_up_iso ?
                            <span
                                className={`${CHIP} border-alloy-stone/25 bg-alloy-stone/10 text-alloy-midnight/80`}
                                data-operational-next-follow-up="true"
                            >
                                Follow-up · {shortWhen(model.reminders.next_follow_up_iso)}
                            </span>
                        :   null}
                        {sends.map((s) => {
                            const badge = scheduledSendUrgencyBadge(s);
                            return (
                                <span
                                    key={s.id}
                                    className={`${CHIP} border ${badge.className}`}
                                    data-operational-scheduled-send-chip={s.id}
                                >
                                    {s.channel.toUpperCase()} · {shortWhen(s.scheduled_for)}
                                </span>
                            );
                        })}
                        {!model.reminders.next_follow_up_iso && sends.length === 0 ?
                            <span className={INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS}>No reminders</span>
                        :   null}
                    </div>
                </div>
            :   null}
        </div>
    );
}
