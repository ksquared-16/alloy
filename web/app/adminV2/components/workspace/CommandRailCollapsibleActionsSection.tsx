"use client";

import { useCallback, useState, type ReactNode } from "react";

import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";
import {
    loadCommandRailActionsExpanded,
    persistCommandRailActionsExpanded,
} from "@/lib/bos/commandRailActionsCollapsePersistence";

type Props = {
    actionCount: number | null;
    children: ReactNode;
    /** Skeleton state — show header without count */
    loading?: boolean;
};

/**
 * Compact collapsible Actions section above BOS dock (right-rail copilot mode).
 */
export function CommandRailCollapsibleActionsSection({ actionCount, children, loading = false }: Props) {
    const bosRailCopilot = isBosRightRailCopilotEnabledClient();
    const [expanded, setExpanded] = useState(() => loadCommandRailActionsExpanded());

    const toggle = useCallback(() => {
        setExpanded((prev) => {
            const next = !prev;
            persistCommandRailActionsExpanded(next);
            return next;
        });
    }, []);

    if (!bosRailCopilot) {
        return <>{children}</>;
    }

    const countLabel =
        loading || actionCount == null ? ""
        : actionCount > 0 ? ` (${actionCount})`
        : " (0)";

    return (
        <section
            className={`adminv2-ws-command-rail-actions-section${expanded ? " adminv2-ws-command-rail-actions-section--expanded" : ""}`}
            data-adminv2-command-rail-actions-section="true"
            aria-label="Actions"
        >
            <button
                type="button"
                className="adminv2-ws-command-rail-actions-trigger"
                aria-expanded={expanded}
                onClick={toggle}
                data-command-rail-actions-toggle="true"
            >
                <span className="adminv2-ws-command-rail-actions-trigger-label">
                    Actions{countLabel}
                </span>
                <span className="adminv2-ws-command-rail-actions-trigger-chevron" aria-hidden>
                    {expanded ? "▼" : "▶"}
                </span>
            </button>
            {expanded ?
                <div className="adminv2-ws-command-rail-actions-body" data-command-rail-actions-body="true">
                    {children}
                </div>
            :   null}
        </section>
    );
}
