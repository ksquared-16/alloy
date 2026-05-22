"use client";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import type { BosExecutionReceiptPresentation } from "@/lib/adminV2/bos/bosExecutionReceipt";
import { formatBosExecutionReceiptTimestamp } from "@/lib/adminV2/bos/bosExecutionReceipt";
import { neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function outcomeTone(outcome: BosExecutionReceiptPresentation["outcome"]): {
    border: string;
    bg: string;
    headlineColor: string;
} {
    switch (outcome) {
        case "failed":
            return {
                border: "border-red-200/70",
                bg: "bg-red-50/30",
                headlineColor: semantic.warning,
            };
        case "partial":
            return {
                border: "border-amber-200/70",
                bg: "bg-amber-50/35",
                headlineColor: CMD.textBody,
            };
        case "applied":
        case "sent":
        case "scheduled":
        case "created":
        case "saved":
            return {
                border: "border-emerald-200/70",
                bg: "bg-emerald-50/30",
                headlineColor: CMD.textBody,
            };
        default:
            return {
                border: "border-alloy-stone/22",
                bg: "bg-alloy-stone/[0.02]",
                headlineColor: CMD.textBody,
            };
    }
}

export function BosExecutionReceiptNotice({
    receipt,
    compact = false,
    className,
}: {
    receipt: BosExecutionReceiptPresentation;
    compact?: boolean;
    className?: string;
}) {
    const tone = outcomeTone(receipt.outcome);
    const ts = formatBosExecutionReceiptTimestamp(receipt.occurredAt);

    return (
        <div
            className={[
                "space-y-1.5 rounded-md border px-2.5 py-2 transition-opacity duration-150",
                tone.border,
                tone.bg,
                compact ? "text-[10px]" : "text-[11px]",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-bos-execution-receipt="true"
            data-bos-execution-receipt-outcome={receipt.outcome}
            role="status"
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="font-semibold leading-snug" style={{ color: tone.headlineColor }}>
                    {receipt.headline}
                    <span className="font-normal" style={{ color: CMD.textSupporting }}>
                        {" "}
                        — {receipt.detail}
                    </span>
                </p>
                {ts ?
                    <span className="shrink-0 text-[9px]" style={{ color: CMD.textLabel }}>
                        {ts}
                    </span>
                :   null}
            </div>

            {receipt.operationRows && receipt.operationRows.length > 0 ?
                <ul
                    className="space-y-0.5 border-t border-alloy-stone/15 pt-1.5"
                    data-bos-execution-receipt-operations="true"
                >
                    {receipt.operationRows.map((row) => (
                        <li
                            key={`${row.label}-${row.statusLabel}`}
                            className="flex items-baseline justify-between gap-2 leading-snug"
                        >
                            <span style={{ color: CMD.textBody }}>{row.label}</span>
                            <span className="shrink-0 font-medium" style={{ color: CMD.textSupporting }}>
                                {row.statusLabel}
                            </span>
                        </li>
                    ))}
                </ul>
            :   null}

            {receipt.followUp?.trim() ?
                <p className="leading-snug" style={{ color: CMD.textSupporting }}>
                    {receipt.followUp.trim()}
                </p>
            :   null}

            {receipt.link ?
                <CommandSurfaceCardLink
                    href={receipt.link.href}
                    className="inline-block text-[10px] font-semibold text-alloy-blue hover:underline"
                >
                    {receipt.link.label}
                </CommandSurfaceCardLink>
            :   null}
        </div>
    );
}

export function BosExecutionReceiptFrameReceipt({ receipt }: { receipt: BosExecutionReceiptPresentation }) {
    return <BosExecutionReceiptNotice receipt={receipt} compact />;
}
