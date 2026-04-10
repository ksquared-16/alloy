"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import "@/app/adminV2/components/workspace/workspace.css";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";

type Props = {
    /** `departments.key` — resolver fallback when defaults not wired. */
    departmentKey?: string | null;
    /** When API provides department default operational context. */
    departmentDefaultVisualContextKey?: string | null;
    /** Optional explicit shell override (e.g. route). */
    visualContextKey?: string | null;
    briefTitle: string;
    briefSubtitle?: string;
    signalsSlot: ReactNode;
    kpiSlot: ReactNode;
    throughputSlot: ReactNode;
    /** Secondary operational lane — exceptions / attention (matches mock `secondaryQueue` lane). */
    attentionSlot?: ReactNode;
    contextSlot: ReactNode;
    railSlot: ReactNode;
};

/**
 * Admin V2 department geometry for production workspace — same DOM/CSS contract as
 * `app/adminV2/.../DepartmentWorkspace.tsx`, fed by real block data.
 */
export function DepartmentWorkspaceBridgeShell({
    departmentKey,
    departmentDefaultVisualContextKey,
    visualContextKey,
    briefTitle,
    briefSubtitle,
    signalsSlot,
    kpiSlot,
    throughputSlot,
    attentionSlot,
    contextSlot,
    railSlot,
}: Props) {
    const bridgeShellStyle: CSSProperties = useMemo(
        () =>
            operationalWorkspaceShellStyle({
                layer: "department",
                visualContextKey: visualContextKey ?? undefined,
                departmentDefaultVisualContextKey: departmentDefaultVisualContextKey ?? undefined,
                departmentKey: departmentKey ?? undefined,
            }),
        [departmentDefaultVisualContextKey, departmentKey, visualContextKey]
    );

    const hasBrief = Boolean(briefTitle.trim());
    const hasSignals = signalsSlot != null;
    const hasTopStack = hasBrief || hasSignals;
    const hasKpis = kpiSlot != null;
    const hasControlDeck = hasTopStack || hasKpis;
    const hasAttentionLane = attentionSlot != null;

    return (
        <div
            data-ws-surface="department"
            data-production-workspace-bridge="true"
            className="adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2"
            style={bridgeShellStyle}
        >
            <div className="adminv2-ws-dept-v2-contain">
                <div className="adminv2-ws-dept-v2-page-split">
                    <div className="adminv2-ws-dept-v2-primary-column">
                        {hasControlDeck ? (
                            <div className="adminv2-ws-dept-v2-control-deck">
                                {hasTopStack ? (
                                    <div className="adminv2-ws-dept-v2-top-stack">
                                        {hasBrief ? (
                                            <div className="adminv2-ws-dept-v2-brief">
                                                <div className="adminv2-ws-dept-v2-brief-focus-label">Today&apos;s focus</div>
                                                <div className="adminv2-ws-dept-v2-brief-head-row">
                                                    <h2 className="adminv2-ws-dept-v2-brief-headline">{briefTitle}</h2>
                                                </div>
                                                {briefSubtitle ? (
                                                    <p
                                                        style={{
                                                            margin: "6px 0 0",
                                                            fontSize: 12,
                                                            lineHeight: 1.45,
                                                            color: "var(--d-muted)",
                                                        }}
                                                    >
                                                        {briefSubtitle}
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        {hasSignals ? <div className="adminv2-ws-dept-v2-signals">{signalsSlot}</div> : null}
                                    </div>
                                ) : null}
                                {hasKpis ? kpiSlot : null}
                            </div>
                        ) : null}

                        <div
                            className={`adminv2-ws-dept-v2-operational-row ${
                                hasAttentionLane
                                    ? "adminv2-ws-dept-v2-operational-row--triple"
                                    : "adminv2-ws-dept-v2-operational-row--double"
                            }`}
                            aria-label="Operational lanes"
                        >
                            <div
                                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput"
                                data-ws-lane-kind="throughput"
                            >
                                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                                    {throughputSlot}
                                </div>
                            </div>
                            {hasAttentionLane ? (
                                <div
                                    className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention"
                                    data-ws-lane-kind="attention"
                                >
                                    <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot">
                                        {attentionSlot}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {contextSlot ? <div data-workspace-zone="context-lower">{contextSlot}</div> : null}
                    </div>

                    <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
                        <aside
                            className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                            data-adminv2-workspace-command-rail
                            aria-label="Decisions and actions"
                        >
                            {railSlot}
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
