"use client";

/**
 * @module WorkspaceSection
 *
 * ## Purpose
 * Groups related content under a platform eyebrow/title with optional trailing action.
 *
 * ## When to use
 * Inside `WorkspaceSurface` for labeled content bands (Recent work, Folders, …).
 *
 * ## Do NOT use for
 * - Multi-column workspace zones (use `WorkspaceZonePanel`).
 * - Shell navigation (use `WorkspaceModeNav`).
 */

import type { ReactNode } from "react";
import { PRESENTATION_SECTION_EYEBROW } from "@/lib/presentation/presentationTypography";

export default function WorkspaceSection({
    title,
    action,
    children,
    className = "",
    headingId,
    "data-testid": testId,
}: {
    title?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    headingId?: string;
    "data-testid"?: string;
}) {
    return (
        <section className={className} data-workspace-section={title ? title.toLowerCase().replace(/\s+/g, "-") : "group"} data-testid={testId}>
            {title || action ? (
                <header className="mb-2 flex items-baseline justify-between gap-2">
                    {title ? (
                        <h2 id={headingId} className={PRESENTATION_SECTION_EYEBROW}>
                            {title}
                        </h2>
                    ) : (
                        <span />
                    )}
                    {action}
                </header>
            ) : null}
            {children}
        </section>
    );
}
