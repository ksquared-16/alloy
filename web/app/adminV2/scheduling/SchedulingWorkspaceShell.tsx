"use client";

/**
 * Scheduling operational workspace shell — composes the canonical WorkspaceShell
 * (the same chrome Processing / Communications / Work Items use). Module code supplies
 * only the site picker, the section body, and the section-scoped operational health band.
 *
 * Work | Studio mode switching + per-mode section tabs come from the shared shell; the
 * operational health metrics live in the control band (doctrine V3), never the body.
 */

import type { ReactNode } from "react";
import { CalendarRange } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";
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
    children: ReactNode;
}) {
    const isWork = mode === "work";

    return (
        <WorkspaceShell
            dataTestId="scheduling-workspace-shell"
            shellDataAttrs={{ "data-adminv2-scheduling-workspace": true, "data-scheduling-mode": mode }}
            header={{
                icon: <CalendarRange className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Scheduling",
                subtitle: `${siteName} · this week`,
                titleId: "scheduling-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close scheduling",
                secondaryActions:
                    sites && sites.length > 1 ? (
                        <label className="flex items-center gap-1.5">
                            <span className="sr-only">Site</span>
                            <select
                                className={WS_FIELD_SELECT_CHROME}
                                value={siteId}
                                onChange={(e) => onSiteChange(e.target.value)}
                                aria-label="Site"
                                data-scheduling-site-select="true"
                            >
                                {sites.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null,
            }}
            modes={SCHEDULING_MODES}
            activeMode={mode}
            onModeChange={onModeChange}
            modeAriaLabel="Scheduling mode"
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
