"use client";

import type { ReactNode } from "react";

/**
 * Operational Workspace Doctrine V2 — contained zone panel (continue / recent lists).
 */
export default function WorkspaceZonePanel({
    title,
    action,
    onAction,
    children,
}: {
    title: string;
    action?: string;
    onAction?: () => void;
    children: ReactNode;
}) {
    return (
        <section
            className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3"
            data-workspace-zone-panel="true"
        >
            <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-alloy-midnight">{title}</h2>
                {action && onAction ? (
                    <button
                        type="button"
                        onClick={onAction}
                        className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    >
                        {action} -&gt;
                    </button>
                ) : null}
            </header>
            {children}
        </section>
    );
}

export function WorkspaceZoneEmptyHint({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/20 px-3 py-8 text-center text-[12px] text-alloy-midnight/45">
            {children}
        </div>
    );
}
