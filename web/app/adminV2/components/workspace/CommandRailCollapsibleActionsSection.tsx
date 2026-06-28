"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Zap } from "lucide-react";

import { CommandRailFloatingMenu } from "@/app/adminV2/components/workspace/CommandRailFloatingMenu";

type Props = {
    actionCount: number | null;
    children: ReactNode;
    /** Skeleton state — show header without count */
    loading?: boolean;
};

/**
 * Compact collapsible Actions section above the BOS dock in the workspace command rail.
 *
 * Collapsed by default — BOS remains the primary expanded surface. When expanded, the actions
 * body renders in a platform floating menu ({@link CommandRailFloatingMenu}) portaled to
 * `document.body` and anchored to this trigger. This keeps the in-rail section a fixed-height
 * trigger (so opening never reflows the BOS overlay anchor) and floats the menu above the BOS
 * command surface instead of being covered by or clipped within the rail layout.
 */
export function CommandRailCollapsibleActionsSection({ actionCount, children, loading = false }: Props) {
    const [expanded, setExpanded] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const toggle = useCallback(() => {
        setExpanded((prev) => !prev);
    }, []);

    const close = useCallback(() => setExpanded(false), []);

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
                ref={triggerRef}
                type="button"
                className="adminv2-ws-command-rail-actions-trigger"
                aria-expanded={expanded}
                aria-haspopup="menu"
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
            <CommandRailFloatingMenu
                anchorEl={triggerRef.current}
                open={expanded}
                onClose={close}
                ariaLabel="Actions"
                className="adminv2-ws-command-rail-actions-body adminv2-ws-command-rail-actions-body--floating"
                bodyDataAttr={{ "data-command-rail-actions-body": "true" }}
            >
                {children}
            </CommandRailFloatingMenu>
        </section>
    );
}
