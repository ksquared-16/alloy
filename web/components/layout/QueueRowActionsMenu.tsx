"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";
import {
    partitionQueueRowActions,
    queueQuickActionDispatchId,
    queueRowBosPlaceholderAction,
} from "@/lib/ui-v2/queueRowQuickActionHelpers";
import { BOS_ASSIST_CTA_DRAWER } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { RecordDrawerHeaderActionButton } from "@/components/admin/drawer/record/RecordDrawerActionRail";
import { recordDrawerHeaderActionClassName } from "@/components/admin/drawer/record/recordDrawerHeaderActionClasses";

type Props = {
    actions: QueueItemQuickActionVm[];
    onSelect: (qa: QueueItemQuickActionVm, dispatchId: string) => void;
    pending?: boolean;
    showWorkWithBos?: boolean;
    showActionsMenu?: boolean;
};

export default function QueueRowActionRail({
    actions,
    onSelect,
    pending = false,
    showWorkWithBos = true,
    showActionsMenu = true,
}: Props) {
    const { menuActions, bosAction } = partitionQueueRowActions(actions);
    const resolvedBosAction =
        bosAction ?? (showWorkWithBos ? queueRowBosPlaceholderAction() : null);
    const showRail = Boolean((showWorkWithBos && resolvedBosAction) || showActionsMenu);
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const actionsBtnClass = recordDrawerHeaderActionClassName(true, true, "actions-white");

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    if (!showRail) return null;

    return (
        <div
            ref={rootRef}
            className="operational-queue-row__action-rail"
            data-queue-row-actions-menu="true"
            data-queue-row-action-rail="true"
            data-queue-row-interactive="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {showWorkWithBos && resolvedBosAction ?
                <RecordDrawerHeaderActionButton
                    label={BOS_ASSIST_CTA_DRAWER}
                    inquiryWorkflow
                    proofLayoutActions
                    disabled={pending}
                    leadingIcon={<BosMark size="sm" color="#ffffff" />}
                    className="operational-queue-row__drawer-action-btn operational-queue-row__bos-btn shrink-0"
                    data-queue-row-bos-button="true"
                    data-record-drawer-header-action="true"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(resolvedBosAction, queueQuickActionDispatchId(resolvedBosAction));
                    }}
                />
            :   null}
            {showActionsMenu ?
                <div className="operational-queue-row__actions-menu relative shrink-0">
                    <button
                        type="button"
                        disabled={pending}
                        className={`${actionsBtnClass} operational-queue-row__drawer-action-btn operational-queue-row__actions-trigger inline-flex items-center gap-1 transition-colors ${
                            pending ? "cursor-not-allowed opacity-55" : ""
                        }`}
                        data-record-drawer-header-action="true"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (pending) return;
                            setOpen((v) => !v);
                        }}
                    >
                        <Zap className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden strokeWidth={2.2} />
                        <span>Actions</span>
                        <span className="text-[10px] opacity-60" aria-hidden>
                            ▾
                        </span>
                    </button>
                    {open ?
                        <div
                            id={menuId}
                            role="menu"
                            className="operational-queue-row__actions-dropdown"
                            data-queue-row-actions-dropdown="true"
                            aria-label="Queue row actions"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        >
                            {menuActions.length ?
                                menuActions.map((qa) => {
                                    const dispatchId = queueQuickActionDispatchId(qa);
                                    return (
                                        <button
                                            key={`${qa.id}-${dispatchId}`}
                                            type="button"
                                            role="menuitem"
                                            className="operational-queue-row__actions-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpen(false);
                                                onSelect(qa, dispatchId);
                                            }}
                                        >
                                            {qa.label}
                                        </button>
                                    );
                                })
                            :   <p
                                    className="operational-queue-row__actions-empty px-3 py-2 text-[11px] text-alloy-midnight/50"
                                    role="presentation"
                                    data-queue-row-actions-empty="true"
                                >
                                    No lifecycle actions configured
                                </p>
                            }
                        </div>
                    :   null}
                </div>
            :   null}
        </div>
    );
}
