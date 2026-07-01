"use client";

import type { BosPolicyDenialPresentation } from "@/lib/adminV2/bos/bosGovernanceCopy";
import { neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function BosPolicyDenialNotice({
    denial,
    className,
    footer,
}: {
    denial: BosPolicyDenialPresentation;
    className?: string;
    footer?: React.ReactNode;
}) {
    return (
        <div
            className={["space-y-2 rounded-md border border-amber-200/70 bg-amber-50/40 px-2.5 py-2", className]
                .filter(Boolean)
                .join(" ")}
            data-bos-policy-denial="true"
            role="status"
        >
            <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                {denial.headline} — {denial.reason}
            </p>
            {denial.bullets.length > 0 ?
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug" style={{ color: CMD.textSupporting }}>
                    {denial.bullets.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            :   null}
            {denial.nextStep?.trim() ?
                <p className="text-[10px] leading-snug" style={{ color: CMD.textLabel }}>
                    {denial.nextStep.trim()}
                </p>
            :   null}
            {footer}
        </div>
    );
}
