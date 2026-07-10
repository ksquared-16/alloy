"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { WS_PROCESS_TILE_CHROME_HOVER, WS_TEXT_PRIMARY, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

export type LandingActionTier = "primary" | "secondary" | "tertiary";

/** Approved mockup action tiles — primary / secondary / tertiary hierarchy. */
export default function ProcessingLandingActionCard({
    icon,
    title,
    description,
    cta,
    onClick,
    tier = "secondary",
    disabled = false,
    testId,
    dragHandlers,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    cta: string;
    onClick?: () => void;
    tier?: LandingActionTier;
    disabled?: boolean;
    testId?: string;
    dragHandlers?: {
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: () => void;
        onDrop: (e: React.DragEvent) => void;
        dragActive?: boolean;
    };
}) {
    const isPrimary = tier === "primary";
    const isTertiary = tier === "tertiary";

    const body = (
        <>
            <span
                className={clsx(
                    "mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl ring-1 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[2]",
                    isPrimary
                        ? "bg-alloy-bend-pine/[0.11] text-alloy-bend-pine ring-alloy-bend-pine/28"
                        : isTertiary
                          ? "bg-alloy-midnight/[0.06] text-alloy-midnight-forge ring-alloy-midnight-forge/22"
                          : "bg-alloy-bend-pine/[0.09] text-alloy-bend-pine ring-alloy-bend-pine/22"
                )}
            >
                {icon}
            </span>
            <h3 className={`text-[15px] font-semibold ${WS_TEXT_PRIMARY}`}>{title}</h3>
            <p className={`mt-1.5 min-h-[2.5rem] text-[12px] leading-snug ${WS_TEXT_SECONDARY}`}>{description}</p>
            <span
                className={clsx(
                    "mt-4 inline-flex items-center gap-1 text-[12px] font-semibold group-hover:gap-1.5",
                    isPrimary
                        ? "text-alloy-bend-pine"
                        : isTertiary
                          ? "text-alloy-midnight-forge group-hover:text-alloy-midnight"
                          : "text-alloy-bend-pine"
                )}
            >
                {cta}
                <span aria-hidden>→</span>
            </span>
        </>
    );

    return (
        <div
            data-testid={testId}
            onDragOver={dragHandlers?.onDragOver}
            onDragLeave={dragHandlers?.onDragLeave}
            onDrop={dragHandlers?.onDrop}
            className={clsx(
                "group relative h-full overflow-hidden rounded-2xl bg-white transition-all duration-150",
                isPrimary
                    ? `shadow-[0_4px_24px_rgba(24,39,58,0.1)] ring-1 ring-alloy-bend-pine/20 hover:shadow-[0_10px_36px_rgba(0,162,131,0.14)] hover:ring-alloy-bend-pine/30 ${WS_PROCESS_TILE_CHROME_HOVER}`
                    : isTertiary
                      ? `shadow-[0_2px_10px_rgba(24,39,58,0.07)] ring-1 ring-alloy-midnight-forge/16 hover:shadow-[0_4px_18px_rgba(24,39,58,0.1)] hover:ring-alloy-midnight-forge/24 ${WS_PROCESS_TILE_CHROME_HOVER}`
                      : `shadow-[0_3px_14px_rgba(24,39,58,0.09)] ring-1 ring-alloy-bend-pine/16 hover:shadow-[0_6px_24px_rgba(0,162,131,0.11)] hover:ring-alloy-bend-pine/24 ${WS_PROCESS_TILE_CHROME_HOVER}`,
                dragHandlers?.dragActive && "ring-2 ring-alloy-bend-pine/35",
                disabled && "pointer-events-none opacity-60"
            )}
        >
            {isPrimary ? (
                <div className="pointer-events-none absolute inset-y-3 left-0 w-1 rounded-full bg-alloy-bend-pine" aria-hidden />
            ) : null}
            {onClick ? (
                <button type="button" onClick={onClick} disabled={disabled} className="flex h-full w-full flex-col p-5 pl-6 text-left">
                    {body}
                </button>
            ) : (
                <div className="flex h-full flex-col p-5 pl-6">{body}</div>
            )}
        </div>
    );
}
