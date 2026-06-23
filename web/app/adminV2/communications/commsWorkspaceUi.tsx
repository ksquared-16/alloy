"use client";

import type { HTMLAttributes, ReactNode } from "react";

/** Shared Alloy card + field styling for Communications modal workspaces. */
export const COMMS_CARD_CLASS =
    "rounded-xl border border-alloy-stone/20 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]";
export const COMMS_FIELD_LABEL_CLASS = "text-[11px] font-medium text-alloy-midnight/70";
export const COMMS_INPUT_CLASS =
    "w-full rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-[12px] text-alloy-midnight shadow-sm focus:border-alloy-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-pine/15";
export const COMMS_SELECT_CLASS = COMMS_INPUT_CLASS;
export const COMMS_SECTION_TITLE_CLASS = "text-[11px] font-semibold tracking-wide text-alloy-midnight/85";
export const COMMS_SECTION_HELPER_CLASS = "mt-0.5 text-[10px] leading-snug text-alloy-midnight/50";
export const COMMS_PRIMARY_BTN_CLASS =
    "rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-pine/90 disabled:opacity-50";
export const COMMS_SECONDARY_BTN_CLASS =
    "rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/8 disabled:opacity-50";

export function CommsSectionCard({
    title,
    helper,
    children,
    className,
    ...rest
}: {
    title: string;
    helper?: string;
    children: ReactNode;
    className?: string;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div {...rest} className={`${COMMS_CARD_CLASS} ${className ?? ""}`}>
            <div className="mb-3 border-b border-alloy-stone/12 pb-2">
                <div className={COMMS_SECTION_TITLE_CLASS}>{title}</div>
                {helper ? <p className={COMMS_SECTION_HELPER_CLASS}>{helper}</p> : null}
            </div>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}
