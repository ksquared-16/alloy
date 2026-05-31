"use client";

import { oppInqLeadSummaryShellClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Reserved section shell — holds layout before hydrate without blanking the whole drawer. */
export default function PersonDrawerSectionCoordinatedReserve(props: {
    title: string;
    lines?: number;
}) {
    const lineCount = Math.max(1, Math.min(props.lines ?? 2, 4));
    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-section-reserve="true"
            aria-busy="true"
            aria-label={`${props.title} loading`}
        >
            <div className="text-[13px] font-semibold text-alloy-midnight/85">{props.title}</div>
            <div className="mt-2 space-y-2">
                {Array.from({ length: lineCount }, (_, i) => (
                    <div
                        key={i}
                        className="h-4 w-full skeleton-pulse rounded bg-alloy-stone/10"
                        aria-hidden
                    />
                ))}
            </div>
        </section>
    );
}
