"use client";

import clsx from "clsx";
import type { IdentityBuilderBreadcrumbSegment } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

type Props = {
    segments: IdentityBuilderBreadcrumbSegment[];
    onNavigate: (frameIndex: number) => void;
    className?: string;
};

/**
 * Persistent identity Builder drill breadcrumb.
 * Derived from IdentityBuilderNavigationState — mirrors runtime disclosure cognition.
 */
export default function IdentityBuilderBreadcrumb({ segments, onNavigate, className }: Props) {
    if (segments.length === 0) return null;

    return (
        <nav
            className={clsx("identity-builder-breadcrumb", className)}
            aria-label="Identity builder location"
            data-identity-builder-breadcrumb="true"
        >
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-snug text-alloy-midnight/50">
                {segments.map((segment, index) => {
                    const isCurrent = index === segments.length - 1;
                    return (
                        <li key={segment.id} className="flex min-w-0 items-center gap-1">
                            {index > 0 ? (
                                <span aria-hidden className="text-alloy-midnight/30">
                                    →
                                </span>
                            ) : null}
                            {isCurrent ? (
                                <span
                                    className="truncate font-semibold text-alloy-midnight"
                                    aria-current="page"
                                    data-identity-breadcrumb-current={segment.id}
                                >
                                    {segment.label}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="truncate font-medium text-alloy-pine hover:underline"
                                    data-identity-breadcrumb-segment={segment.id}
                                    onClick={() => {
                                        if (segment.frameIndex != null) onNavigate(segment.frameIndex);
                                    }}
                                >
                                    {segment.label}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
