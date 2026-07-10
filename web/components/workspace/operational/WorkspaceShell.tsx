"use client";

import type { ReactNode } from "react";

/**
 * Operational Workspace Doctrine V2 — outer modal chrome.
 * Certified reference: Processing (Digital Mailroom). Communications and Work Items adopt this shell.
 */
export default function WorkspaceShell({
    children,
    testId,
    dataModule,
    version = "doctrine-v2",
    className = "",
}: {
    children: ReactNode;
    testId?: string;
    /** Module identifier for data attributes (e.g. comms, mailroom, work-items). */
    dataModule?: string;
    version?: string;
    className?: string;
}) {
    return (
        <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white ${className}`}
            data-workspace-shell={dataModule ?? "true"}
            data-workspace-shell-version={version}
            data-testid={testId}
        >
            {children}
        </div>
    );
}
