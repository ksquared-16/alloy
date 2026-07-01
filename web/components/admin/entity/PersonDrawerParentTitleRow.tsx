"use client";

import type { ReactNode } from "react";
import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { resolvePersonDrawerParentSummaryModel } from "@/lib/admin/person/personDrawerParentSummaryModel";
import { resolvePersonDrawerProfileFromRecordWithParentHint } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";

function RolePill({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <span className={`${personDrawerRolePillClassName} ${className}`}>{children}</span>;
}

/** Parent name + role pills + opt-out / household context on the title rail. */
export default function PersonDrawerParentTitleRow({
    record,
    chromeHint,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerParentChromeHint | null;
}) {
    const summary = resolvePersonDrawerParentSummaryModel(record);
    const profile = resolvePersonDrawerProfileFromRecordWithParentHint(record, chromeHint);
    const rolePill =
        profile.badgeLabels.find((l) => /parent|guardian/i.test(l)) ?? profile.badgeLabels[0] ?? "Parent / Guardian";

    const contextParts = [
        summary.primary_household_label,
        summary.primary_child_label ? `Child: ${summary.primary_child_label}` : null,
    ].filter(Boolean);

    return (
        <div
            className="flex min-w-0 flex-col gap-1"
            data-person-drawer-parent-title-row="true"
        >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="truncate text-lg font-semibold leading-tight text-alloy-midnight">
                    {summary.display_name}
                </span>
                <RolePill>{rolePill}</RolePill>
                {summary.communication_opt_out ? (
                    <RolePill className="border-amber-200/80 bg-amber-50/90 text-amber-900/90">
                        Opted out
                    </RolePill>
                ) : null}
            </div>
            {contextParts.length > 0 ? (
                <p className="text-[11px] leading-snug text-alloy-midnight/55">{contextParts.join(" · ")}</p>
            ) : null}
        </div>
    );
}
