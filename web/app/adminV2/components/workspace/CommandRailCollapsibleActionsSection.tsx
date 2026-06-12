"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Zap } from "lucide-react";

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
 * Compact collapsible Actions section above BOS dock in the workspace command rail.
 */
export function CommandRailCollapsibleActionsSection({ actionCount, children, loading = false }: Props) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setExpanded(loadCommandRailActionsExpanded());
    }, []);

    const toggle = useCallback(() => {
        setExpanded((prev) => {
            const next = !prev;
            persistCommandRailActionsExpanded(next);
            return next;
        });
    }, []);

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
                <span className="adminv2-ws-command-rail-actions-trigger-label inline-flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={2.2} />
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
