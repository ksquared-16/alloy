"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
    recordDrawerHeaderActionClassName,
    recordDrawerHeaderActionsPanelClassName,
    RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS,
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS,
    opportunityDrawerHeaderActionClassName,
    opportunityDrawerHeaderActionsPanelClassName,
} from "@/components/admin/drawer/record/recordDrawerHeaderActionClasses";

export {
    recordDrawerHeaderActionClassName,
    recordDrawerHeaderActionsPanelClassName,
    RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS,
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS,
    opportunityDrawerHeaderActionClassName,
    opportunityDrawerHeaderActionsPanelClassName,
};

export type RecordDrawerHeaderActionButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "type"
> & {
    label: string;
    inquiryWorkflow?: boolean;
    proofLayoutActions?: boolean;
    /** White proof-layout surface for Actions trigger. */
    proofLayoutActionsWhite?: boolean;
    /** Header action color treatment. */
    actionVariant?: "default" | "actions-white" | "juniper";
    leadingIcon?: ReactNode;
    busy?: boolean;
};

export function RecordDrawerHeaderActionButton({
    label,
    inquiryWorkflow = false,
    proofLayoutActions = false,
    proofLayoutActionsWhite = false,
    actionVariant = "default",
    leadingIcon,
    busy = false,
    disabled,
    className,
    ...rest
}: RecordDrawerHeaderActionButtonProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={[
                recordDrawerHeaderActionClassName(
                    inquiryWorkflow,
                    proofLayoutActions,
                    actionVariant !== "default" ? actionVariant : proofLayoutActionsWhite ? "actions-white" : "default",
                ),
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-record-drawer-header-action="true"
            {...rest}
        >
            {leadingIcon ?
                <span className="inline-flex shrink-0 opacity-85" aria-hidden>
                    {leadingIcon}
                </span>
            :   null}
            {busy ? "…" : label}
        </button>
    );
}

type ActionRailProps = {
    children: ReactNode;
    inquiryWorkflow?: boolean;
    align?: "start" | "end";
    className?: string;
    /** When true, omit card chrome — inline header controls only. */
    bare?: boolean;
    "data-drawer-slot"?: string;
};

export function RecordDrawerActionRail({
    children,
    inquiryWorkflow = false,
    align = "end",
    className,
    bare = false,
    "data-drawer-slot": dataDrawerSlot,
}: ActionRailProps) {
    return (
        <div
            className={[recordDrawerHeaderActionsPanelClassName(inquiryWorkflow, align, bare), className]
                .filter(Boolean)
                .join(" ")}
            data-record-drawer-action-rail="true"
            data-opportunity-record-actions={inquiryWorkflow ? "true" : undefined}
            data-opportunity-header-controls-bare={bare ? "true" : undefined}
            data-drawer-slot={dataDrawerSlot}
        >
            {children}
        </div>
    );
}
