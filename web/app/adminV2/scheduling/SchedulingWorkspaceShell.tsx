"use client";

/**
 * Assignments operational workspace shell — composes the canonical WorkspaceShell
 * (the same chrome Processing / Communications / Work Items / Roster use). Module code
 * supplies only the site picker, the section body, and the section-scoped health band.
 *
 * Assignments owns durable placement and schedule COMMITMENTS. Roster (who is
 * expected where and when) and Attendance (who is actually here) are their own
 * workspace — see `app/adminV2/roster/`.
 *
 * Work | Studio mode switching + per-mode section tabs come from the shared shell; the
 * operational health metrics live in the control band (doctrine V3), never the body.
 */

import type { ReactNode } from "react";
import { CalendarRange, ChevronDown, Plus } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    SCHEDULING_MODES,
    SCHEDULING_STUDIO_TABS,
    SCHEDULING_WORK_TABS,
    type SchedulingMode,
    type SchedulingSection,
    type SchedulingStudioView,
    type SchedulingWorkView,
} from "@/app/adminV2/scheduling/schedulingSections";

export type Site = { id: string; name: string };

export default function SchedulingWorkspaceShell({
    mode,
    workView,
    studioView,
    onModeChange,
    onWorkViewChange,
    onStudioViewChange,
    sites,
    siteId,
    onSiteChange,
    siteName,
    metricsColumn,
    onClose,
    onAddAssignment,
    onBulkCommand,
    children,
}: {
    mode: SchedulingMode;
    workView: SchedulingWorkView;
    studioView: SchedulingStudioView;
    onModeChange: (mode: SchedulingMode) => void;
    onWorkViewChange: (view: SchedulingWorkView) => void;
    onStudioViewChange: (view: SchedulingStudioView) => void;
    sites: Site[] | null;
    siteId: string;
    onSiteChange: (id: string) => void;
    siteName: string;
    /** Section-scoped operational health band (control band, right column). */
    metricsColumn?: ReactNode;
    onClose?: () => void;
    /** Primary Overview / header Add Assignment — opens subject selection when needed. */
    onAddAssignment?: () => void;
    /** Opens the Assignments index with the bulk command toolbar / preview. */
    onBulkCommand?: (command: "assignment" | "room" | "primary" | "archive") => void;
    children: ReactNode;
}) {
    const isWork = mode === "work";

    return (
        <WorkspaceShell
            dataTestId="scheduling-workspace-shell"
            shellDataAttrs={{ "data-adminv2-scheduling-workspace": true, "data-scheduling-mode": mode }}
            header={{
                icon: <CalendarRange className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Assignments",
                subtitle: `${siteName} · operational`,
                titleId: "scheduling-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close assignments",
                actions: isWork ? (
                    <div className="flex items-center gap-2" data-assignment-workspace-header-actions="true">
                        {onAddAssignment ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[12px] font-semibold text-white"
                                onClick={onAddAssignment}
                                data-assignment-add-primary="true"
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                                Add Assignment
                            </button>
                        ) : null}
                        <details className="relative" data-assignment-actions-dropdown="true">
                            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight">
                                Actions
                                <ChevronDown className="h-3.5 w-3.5 text-alloy-slate" aria-hidden />
                            </summary>
                            <div className="absolute right-0 z-20 mt-1 min-w-[240px] rounded-xl border border-alloy-stone/20 bg-white p-1.5 shadow-lg">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-alloy-midnight hover:bg-alloy-stone/30"
                                    onClick={onAddAssignment}
                                    data-assignment-action="add"
                                >
                                    Add Assignment
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-alloy-bend-pine">
                                        Available
                                    </span>
                                </button>
                                {(
                                    [
                                        ["assignment", "Bulk Assignment"],
                                        ["room", "Bulk Room Change"],
                                        ["primary", "Bulk Primary Change"],
                                        ["archive", "Bulk Archive"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-alloy-midnight hover:bg-alloy-stone/30"
                                        data-assignment-action={`bulk-${key}`}
                                        onClick={() => {
                                            // The ledger index, not Roster — these
                                            // commands mutate commitments.
                                            onWorkViewChange("assignments");
                                            onBulkCommand?.(key);
                                        }}
                                    >
                                        {label}
                                        <span className="text-[9px] font-semibold uppercase tracking-wide text-alloy-bend-pine">
                                            Assignments
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </details>
                    </div>
                ) : undefined,
                secondaryActions:
                    sites && sites.length > 1 ? (
                        <label className="flex items-center gap-1.5">
                            <span className="sr-only">Site</span>
                            <AlloySelect
                                value={siteId}
                                onChange={onSiteChange}
                                options={(sites ?? []).map((s) => ({ value: s.id, label: s.name }))}
                                aria-label="Site"
                            />
                        </label>
                    ) : null,
            }}
            modes={SCHEDULING_MODES}
            activeMode={mode}
            onModeChange={onModeChange}
            modeAriaLabel="Assignments mode"
            sectionTabs={isWork ? SCHEDULING_WORK_TABS : SCHEDULING_STUDIO_TABS}
            activeSection={(isWork ? workView : studioView) as SchedulingSection}
            onSectionChange={(key) => {
                if (isWork) onWorkViewChange(key as SchedulingWorkView);
                else onStudioViewChange(key as SchedulingStudioView);
            }}
            sectionAriaLabel={isWork ? "Work sections" : "Studio sections"}
            metricsColumn={metricsColumn}
            navDataAttr="scheduling"
            sectionsDataAttr="scheduling"
        >
            {children}
        </WorkspaceShell>
    );
}
