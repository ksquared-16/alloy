"use client";

import type { ButtonHTMLAttributes } from "react";

const BLUE_OUTLINE =
    "border border-alloy-blue/30 bg-alloy-blue/5 text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45";

/** Class contract for record-header actions (Schedule tour, Update status, Send enrollment packet, …). */
export function opportunityDrawerHeaderActionClassName(inquiryWorkflow: boolean): string {
    return inquiryWorkflow
        ? `px-4 py-2 text-[12px] font-semibold rounded-full ${BLUE_OUTLINE} disabled:opacity-50`
        : `px-3 py-1.5 text-sm font-semibold rounded-md ${BLUE_OUTLINE} disabled:opacity-50`;
}

/** Matches the inner flex row in AdminEntityDrawer header actions rail. */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS = "flex flex-wrap gap-2 items-center";

export type OpportunityDrawerHeaderActionButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "type"
> & {
    label: string;
    inquiryWorkflow?: boolean;
    busy?: boolean;
};

/**
 * Canonical opportunity drawer header action control — same primitive as registry header buttons.
 */
export default function OpportunityDrawerHeaderActionButton({
    label,
    inquiryWorkflow = false,
    busy = false,
    disabled,
    className,
    ...rest
}: OpportunityDrawerHeaderActionButtonProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={[opportunityDrawerHeaderActionClassName(inquiryWorkflow), className].filter(Boolean).join(" ")}
            {...rest}
        >
            {busy ? "…" : label}
        </button>
    );
}
