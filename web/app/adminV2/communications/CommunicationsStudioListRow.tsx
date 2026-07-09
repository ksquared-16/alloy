"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Studio Channels / Branding list row - matches Digital Mailroom + approved Comms mockups. */
export default function CommunicationsStudioListRow({
    icon,
    title,
    subtitle,
    status,
    statusTone = "neutral",
    onClick,
    selected = false,
    disabled = false,
}: {
    icon: ReactNode;
    title: string;
    subtitle: string;
    status?: string;
    statusTone?: "active" | "neutral" | "muted";
    onClick?: () => void;
    selected?: boolean;
    disabled?: boolean;
}) {
    const statusClass =
        statusTone === "active"
            ? "text-alloy-bend-pine"
            : statusTone === "muted"
              ? "text-alloy-midnight/40"
              : "text-alloy-midnight/55";

    const body = (
        <>
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-alloy-stone/15 bg-alloy-stone/[0.04] text-alloy-midnight/55"
                aria-hidden
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-alloy-midnight">{title}</span>
                <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">{subtitle}</span>
            </span>
            {status ? <span className={`shrink-0 text-[11px] font-semibold ${statusClass}`}>{status}</span> : null}
            <ChevronRight className="h-4 w-4 shrink-0 text-alloy-midnight/25" aria-hidden />
        </>
    );

    const className = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
        selected ? "bg-alloy-bend-pine/[0.04]" : "hover:bg-alloy-stone/[0.03]"
    } ${disabled ? "cursor-default opacity-70" : ""}`;

    if (onClick && !disabled) {
        return (
            <button type="button" onClick={onClick} className={className}>
                {body}
            </button>
        );
    }

    return <div className={className}>{body}</div>;
}
