"use client";

import { oppInqLeadSummaryShellClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

const RESERVE_MIN_H_CLASS: Record<"household" | "address" | "medical" | "generic", string> = {
    household: "min-h-[11rem]",
    address: "min-h-[5.5rem]",
    medical: "min-h-[8rem]",
    generic: "min-h-[4.5rem]",
};

/** Reserved section shell — final layout height from first paint; inner lines hydrate in place. */
export default function PersonDrawerSectionCoordinatedReserve(props: {
    title: string;
    lines?: number;
    variant?: "household" | "address" | "medical" | "generic";
}) {
    const lineCount = Math.max(1, Math.min(props.lines ?? 2, 4));
    const variant = props.variant ?? "generic";
    const minH = RESERVE_MIN_H_CLASS[variant];
    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2 ${minH}`}
            data-person-drawer-section-reserve="true"
            data-person-drawer-section-reserve-variant={variant}
            aria-busy="true"
            aria-label={`${props.title} loading`}
        >
            <div className="text-[13px] font-semibold text-alloy-midnight/85">{props.title}</div>
            <div className="mt-2 space-y-2">
                {Array.from({ length: lineCount }, (_, i) => (
                    <div
                        key={i}
                        className="h-4 w-full rounded bg-alloy-stone/[0.06]"
                        aria-hidden
                    />
                ))}
            </div>
        </section>
    );
}
