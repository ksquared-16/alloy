"use client";

import { BosWorkingState } from "@/app/adminV2/components/bos/identity/BosWorkingState";

type AlloyCanonicalLoadingSurfaceProps = {
    message: string;
    className?: string;
    "data-testid"?: string;
};

/** Canonical Alloy/BOS loading visual for drawers, work-units, and transitions. */
export function AlloyCanonicalLoadingSurface({
    message,
    className = "",
    "data-testid": dataTestId = "alloy-canonical-loading-surface",
}: AlloyCanonicalLoadingSurfaceProps) {
    return (
        <div
            className={`flex min-h-[12rem] items-center justify-center ${className}`.trim()}
            data-alloy-canonical-loading="true"
            data-testid={dataTestId}
        >
            <BosWorkingState message={message} markSize="md" />
        </div>
    );
}
