"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";

export default function ProcessingActionCard({
    icon,
    title,
    description,
    onClick,
    primary = false,
    disabled = false,
    testId,
    children,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    onClick?: () => void;
    primary?: boolean;
    disabled?: boolean;
    testId?: string;
    children?: ReactNode;
}) {
    return (
        <div
            data-testid={testId}
            className={clsx(
                "group relative overflow-hidden rounded-xl border bg-white text-left shadow-sm transition-all duration-150",
                primary
                    ? "border-alloy-bend-pine/35 ring-1 ring-alloy-bend-pine/10 hover:border-alloy-bend-pine/50 hover:shadow-md"
                    : "border-alloy-stone/20 hover:border-alloy-midnight/20 hover:shadow-md",
                disabled && "pointer-events-none opacity-60"
            )}
        >
            <div
                className={clsx(
                    "pointer-events-none absolute inset-y-0 left-0 w-1",
                    primary ? "bg-alloy-bend-pine" : "bg-alloy-midnight"
                )}
                aria-hidden
            />
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    className="flex w-full items-start gap-3 px-4 py-3.5 pr-10 text-left"
                >
                    <ActionCardBody icon={icon} title={title} description={description} primary={primary} />
                </button>
            ) : (
                <div className="flex items-start gap-3 px-4 py-3.5 pr-10">
                    <ActionCardBody icon={icon} title={title} description={description} primary={primary} />
                </div>
            )}
            <ArrowRight
                className={clsx(
                    "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-transform group-hover:translate-x-0.5",
                    primary ? "text-alloy-bend-pine" : "text-alloy-midnight/30 group-hover:text-alloy-bend-pine/70"
                )}
                aria-hidden
            />
            {children}
        </div>
    );
}

function ActionCardBody({
    icon,
    title,
    description,
    primary,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    primary?: boolean;
}) {
    return (
        <>
            <span
                className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                    primary
                        ? "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                        : "border-alloy-stone/15 bg-alloy-stone/[0.06] text-alloy-midnight/55"
                )}
            >
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-alloy-midnight">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/50">{description}</span>
            </span>
        </>
    );
}
