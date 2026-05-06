"use client";

import type { ReactNode } from "react";

/**
 * Grid for two sibling operational panels (e.g. throughput + needs attention).
 * Contract: use with `WorkspacePairedOperPanel`; sizing/alignment lives in `workspace.css` (`.adminv2-ws-paired-oper-*`).
 */
export function WorkspacePairedOperPanelsGrid({ children }: { children: ReactNode }) {
    return (
        <div className="adminv2-ws-paired-oper-grid" role="presentation">
            {children}
        </div>
    );
}

export type WorkspacePairedOperPanelTone = "throughput" | "attention";

type WorkspacePairedOperPanelProps = {
    tone: WorkspacePairedOperPanelTone;
    ariaLabel: string;
    title: string;
    /** e.g. `adminv2-ws-queue-title--section-primary-type` for attention styling */
    titleClassName?: string;
    /** Optional accessory aligned with the title (e.g. info tooltip trigger). */
    titleRight?: ReactNode;
    children: ReactNode;
};

const toneClass: Record<WorkspacePairedOperPanelTone, string> = {
    throughput:
        "adminv2-ws-paired-oper-panel adminv2-ws-paired-oper-panel--throughput adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel",
    attention:
        "adminv2-ws-paired-oper-panel adminv2-ws-paired-oper-panel--attention adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel adminv2-ws-dept-attention-panel--framed",
};

/**
 * Single panel in a paired operational row. Preserves existing `adminv2-ws-dept-qsec` visual tokens.
 */
export function WorkspacePairedOperPanel({
    tone,
    ariaLabel,
    title,
    titleClassName,
    titleRight,
    children,
}: WorkspacePairedOperPanelProps) {
    return (
        <section className={`${toneClass[tone]} flex min-h-0 min-w-0 flex-col`.trim()} aria-label={ariaLabel}>
            <header className="adminv2-ws-queue-header adminv2-ws-paired-oper-panel__header shrink-0">
                <div className="adminv2-ws-queue-title-row adminv2-ws-paired-oper-panel__title-row flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <h3 className={`adminv2-ws-queue-title adminv2-ws-paired-oper-panel__title min-w-0 ${titleClassName ?? ""}`.trim()}>
                        {title}
                    </h3>
                    {titleRight ? <div className="shrink-0">{titleRight}</div> : null}
                </div>
            </header>
            <div className="adminv2-ws-paired-oper-panel__body adminv2-ws-wu-v2 min-h-0 flex-1">
                {children}
            </div>
        </section>
    );
}
