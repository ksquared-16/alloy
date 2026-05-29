"use client";

import type { ReactNode } from "react";
import { oppInqDisplayName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type BackLink = {
    label: string;
    onClick: () => void;
};

type Props = {
    avatar?: ReactNode;
    title: ReactNode;
    badges?: ReactNode;
    chips?: ReactNode;
    backLink?: BackLink | null;
    contextRows?: ReactNode;
    titleClassName?: string;
};

/** Compact premium record header row — entity-specific content via slots. */
export default function RecordDrawerPremiumHeader({
    avatar,
    title,
    badges,
    chips,
    backLink,
    contextRows,
    titleClassName,
}: Props) {
    return (
        <div className="min-w-0 space-y-1" data-record-drawer-premium-header="true">
            {backLink ? (
                <button
                    type="button"
                    onClick={backLink.onClick}
                    className="text-[11px] font-medium text-alloy-blue hover:underline"
                    data-record-drawer-back-link="true"
                >
                    {backLink.label}
                </button>
            ) : null}
            {chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null}
            <div className="flex min-w-0 items-start gap-3">
                {avatar}
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className={[titleClassName ?? oppInqDisplayName, "truncate"].filter(Boolean).join(" ")}>
                            {title}
                        </h3>
                        {badges}
                    </div>
                    {contextRows}
                </div>
            </div>
        </div>
    );
}
