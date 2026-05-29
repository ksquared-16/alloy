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
    titleMeta?: ReactNode;
    badges?: ReactNode;
    chips?: ReactNode;
    backLink?: BackLink | null;
    contextRows?: ReactNode;
    titleRight?: ReactNode;
    titleClassName?: string;
    /** split: name/meta left, role pills + context right (Person drawer). */
    layout?: "default" | "split";
};

function BackLinkButton({ backLink }: { backLink: BackLink }) {
    return (
        <button
            type="button"
            onClick={backLink.onClick}
            className="text-[11px] font-medium text-alloy-blue hover:underline"
            data-record-drawer-back-link="true"
        >
            {backLink.label}
        </button>
    );
}

/** Compact premium record header row — entity-specific content via slots. */
export default function RecordDrawerPremiumHeader({
    avatar,
    title,
    titleMeta,
    badges,
    chips,
    backLink,
    contextRows,
    titleRight,
    titleClassName,
    layout = "default",
}: Props) {
    if (layout === "split") {
        return (
            <div className="min-w-0 space-y-1" data-record-drawer-premium-header="true" data-record-drawer-header-layout="split">
                {backLink ? <BackLinkButton backLink={backLink} /> : null}
                <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        {title ? (
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <h3 className={[titleClassName ?? oppInqDisplayName, "truncate"].filter(Boolean).join(" ")}>
                                    {title}
                                </h3>
                                {titleMeta}
                            </div>
                        ) : titleMeta ? (
                            <div className="min-w-0">{titleMeta}</div>
                        ) : null}
                    </div>
                    {titleRight ? (
                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">{titleRight}</div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-1" data-record-drawer-premium-header="true">
            {backLink ? <BackLinkButton backLink={backLink} /> : null}
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
