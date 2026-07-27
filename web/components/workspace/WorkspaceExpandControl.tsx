"use client";

import { Maximize2, Minimize2 } from "lucide-react";

import { useWorkspaceExpand } from "@/components/workspace/WorkspaceExpandContext";
import { WS_TEXT_MUTED } from "@/components/workspace/workspaceTokens";

/**
 * Shared Expand / Restore control for every Operational Workspace.
 * Keyboard: button is focusable; Enter/Space activate via native button semantics.
 */
export default function WorkspaceExpandControl() {
    const { expanded, toggle } = useWorkspaceExpand();

    return (
        <button
            type="button"
            onClick={toggle}
            className={`inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold ${WS_TEXT_MUTED} hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight`}
            data-workspace-expand-control="true"
            data-workspace-expanded={expanded ? "true" : "false"}
            aria-pressed={expanded}
            aria-label={expanded ? "Restore Workspace" : "Expand Workspace"}
            title={expanded ? "Restore Workspace" : "Expand Workspace"}
        >
            {expanded ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
            ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
            )}
            {expanded ? "Restore" : "Expand"}
        </button>
    );
}
