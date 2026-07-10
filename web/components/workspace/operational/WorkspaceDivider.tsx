"use client";

import { WS_DIVIDER } from "@/components/workspace/workspaceTokens";

/**
 * Operational Workspace Doctrine V2 — hairline separator between shell regions.
 */
export default function WorkspaceDivider({ className = "" }: { className?: string }) {
    return <div className={`shrink-0 border-b ${WS_DIVIDER} ${className}`} data-workspace-divider="true" aria-hidden />;
}
