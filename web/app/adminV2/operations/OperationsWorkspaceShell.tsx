"use client";

/**
 * OPERATIONS workspace shell — the canonical `WorkspaceShell`, the same chrome Processing /
 * Communications / Work Items used, with the Work | Studio mode rail Assignments already proved.
 *
 * Module code supplies only the site picker, the section body and the section-scoped health band.
 * Nothing about the shell is new: this composes the existing primitive rather than introducing a
 * second one, which is why Operations looks like one workspace family without any visual work.
 *
 * ── THE MODE RAIL IS NOW REAL ──
 *
 * The Roster shell this replaces declared a single mode and opted OUT of the rail, because a switch
 * with one position in it is furniture. Operations genuinely has two: it RUNS the operating day
 * (Work) and CONFIGURES what that day is made of (Studio). The rail returns because there is finally
 * something to switch between.
 *
 * ── THE OLD ASSIGNMENTS CHROME IS NOT PRESERVED ──
 *
 * Deliberately. The retired workspace's header carried an `Add Assignment` button and an `Actions`
 * dropdown of bulk commands, and neither is reproduced here: single-subject creation belongs to the
 * subject's own record through the canonical Schedule card, and the bulk commands live on the
 * Assignments lens where the selection they act on lives. Carrying that header across would have
 * preserved the old shell inside the new one — the visual half of the duplication this convergence
 * removes.
 */

import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    OPERATIONS_MODES,
    OPERATIONS_STUDIO_TABS,
    OPERATIONS_WORK_TABS,
    type OperationsMode,
    type OperationsSection,
    type OperationsStudioSection,
    type OperationsWorkSection,
} from "@/app/adminV2/operations/operationsSections";

export type OperationsSite = { id: string; name: string };

export default function OperationsWorkspaceShell({
    mode,
    workSection,
    studioSection,
    onModeChange,
    onWorkSectionChange,
    onStudioSectionChange,
    sites,
    siteId,
    onSiteChange,
    siteName,
    onClose,
    metricsColumn,
    children,
}: {
    mode: OperationsMode;
    workSection: OperationsWorkSection;
    studioSection: Exclude<OperationsStudioSection, "templates">;
    onModeChange: (mode: OperationsMode) => void;
    onWorkSectionChange: (section: OperationsWorkSection) => void;
    onStudioSectionChange: (section: Exclude<OperationsStudioSection, "templates">) => void;
    sites: OperationsSite[] | null;
    siteId: string;
    onSiteChange: (id: string) => void;
    siteName: string;
    onClose?: () => void;
    /** Section-scoped operational health band (control band, right column). */
    metricsColumn?: ReactNode;
    children: ReactNode;
}) {
    const isWork = mode === "work";

    return (
        <WorkspaceShell
            dataTestId="operations-workspace-shell"
            shellDataAttrs={{
                "data-adminv2-operations-workspace": true,
                "data-operations-mode": mode,
                "data-operations-section": isWork ? workSection : studioSection,
                /*
                 * The Roster-era attributes, kept as ALIASES.
                 *
                 * Certifications, and the durable-record host's own state assertions, address the
                 * workspace through these. Renaming them in the same change that re-parents the
                 * product would have made every failure ambiguous between "the move broke it" and
                 * "the selector moved". They name the same element; `data-operations-*` above is the
                 * canonical pair.
                 */
                "data-adminv2-roster-workspace": true,
                "data-roster-section": isWork ? workSection : studioSection,
            }}
            header={{
                icon: <CalendarClock className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Operations",
                subtitle: `${siteName} · operational`,
                titleId: "operations-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close operations",
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
            modes={OPERATIONS_MODES}
            activeMode={mode}
            onModeChange={(key) => onModeChange(key as OperationsMode)}
            modeAriaLabel="Operations mode"
            sectionTabs={isWork ? OPERATIONS_WORK_TABS : OPERATIONS_STUDIO_TABS}
            activeSection={(isWork ? workSection : studioSection) as OperationsSection}
            onSectionChange={(key) => {
                if (isWork) onWorkSectionChange(key as OperationsWorkSection);
                else onStudioSectionChange(key as Exclude<OperationsStudioSection, "templates">);
            }}
            sectionAriaLabel={isWork ? "Work sections" : "Studio sections"}
            metricsColumn={metricsColumn}
            navDataAttr="operations"
            sectionsDataAttr="roster"
        >
            {children}
        </WorkspaceShell>
    );
}
