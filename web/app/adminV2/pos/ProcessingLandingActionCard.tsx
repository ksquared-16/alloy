"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

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
                    "mb-4 flex h-11 w-11 items-center justify-center rounded-xl",
                    isPrimary
                        ? "bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                        : isTertiary
                          ? "bg-alloy-stone/40 text-alloy-midnight/40"
                          : "bg-alloy-midnight/[0.04] text-alloy-midnight/55"
                )}
            >
                {icon}
            </span>
            <h3 className="text-[15px] font-semibold text-alloy-midnight">{title}</h3>
            <p className="mt-1.5 min-h-[2.5rem] text-[12px] leading-snug text-alloy-midnight/50">{description}</p>
            <span
                className={clsx(
                    "mt-4 inline-flex items-center gap-1 text-[12px] font-semibold group-hover:gap-1.5",
                    isPrimary
                        ? "text-alloy-bend-pine"
                        : isTertiary
                          ? "text-alloy-midnight/45 group-hover:text-alloy-midnight/65"
                          : "text-alloy-midnight/55 group-hover:text-alloy-midnight"
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
                    ? "shadow-[0_4px_24px_rgba(24,39,58,0.08)] ring-1 ring-alloy-bend-pine/15 hover:shadow-[0_8px_32px_rgba(0,162,131,0.12)]"
                    : isTertiary
                      ? "shadow-[0_1px_4px_rgba(24,39,58,0.04)] hover:shadow-[0_4px_16px_rgba(24,39,58,0.06)]"
                      : "shadow-[0_2px_12px_rgba(24,39,58,0.06)] hover:shadow-[0_4px_20px_rgba(24,39,58,0.08)]",
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
