"use client";

import type { DrawerSubjectFocusPresentation } from "@/lib/admin/drawer/resolveDrawerSubjectFocusPresentation";

type Props = {
    presentation: DrawerSubjectFocusPresentation;
};

/** Queue-row subject focus line — shown when drawer opened with child/group subject context. */
export default function OpportunityDrawerSubjectFocusStrip({ presentation }: Props) {
    if (!presentation.showFocusStrip || !presentation.stripLabel) return null;

    return (
        <div
            className="mb-2 flex min-w-0 items-center gap-2 rounded-md border border-alloy-blue/15 bg-alloy-blue/[0.06] px-3 py-1.5 text-xs text-alloy-midnight/82"
            data-opportunity-drawer-subject-focus-strip="true"
            {...presentation.dataAttributes}
        >
            <span
                className="shrink-0 font-semibold uppercase tracking-wide text-alloy-blue/75"
                data-drawer-subject-focus-eyebrow="true"
            >
                Queue focus
            </span>
            <span className="min-w-0 truncate font-medium" data-drawer-subject-focus-label="true">
                {presentation.stripLabel}
            </span>
        </div>
    );
}
