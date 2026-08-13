"use client";

/**
 * Roster operational workspace shell — the canonical `WorkspaceShell`, the same
 * chrome Processing / Communications / Work Items / Assignments use. Module code
 * supplies only the site picker and the section body.
 *
 * No modes. Assignments needs Work | Studio because it both runs and configures;
 * Roster only runs, so a mode switch with one mode in it would be furniture.
 */

import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { ROSTER_SECTION_TABS, type RosterSection } from "@/app/adminV2/roster/rosterSections";

export type RosterSite = { id: string; name: string };

/** Single mode — the shell suppresses the rail below two, so nothing renders. */
const ROSTER_MODES = [{ key: "work" as const, label: "Work" }];

export default function RosterWorkspaceShell({
    section,
    onSectionChange,
    sites,
    siteId,
    onSiteChange,
    siteName,
    onClose,
    metricsColumn,
    children,
}: {
    section: RosterSection;
    onSectionChange: (section: RosterSection) => void;
    sites: RosterSite[] | null;
    siteId: string;
    onSiteChange: (id: string) => void;
    siteName: string;
    onClose?: () => void;
    /** Section-scoped operational health band (control band, right column). */
    metricsColumn?: ReactNode;
    children: ReactNode;
}) {
    return (
        <WorkspaceShell
            dataTestId="roster-workspace-shell"
            shellDataAttrs={{
                "data-adminv2-roster-workspace": true,
                "data-roster-section": section,
            }}
            header={{
                icon: <CalendarClock className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Roster",
                subtitle: `${siteName} · operational`,
                titleId: "roster-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close roster",
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
            /* One mode, and the rail is opted OUT rather than inferred from the
               mode count — Work Items also declares a single mode, and inferring
               would change its chrome too. */
            modes={ROSTER_MODES}
            activeMode="work"
            onModeChange={() => {}}
            modeAriaLabel="Roster mode"
            showModeRail={false}
            sectionTabs={ROSTER_SECTION_TABS}
            activeSection={section}
            onSectionChange={(key) => onSectionChange(key as RosterSection)}
            sectionAriaLabel="Roster sections"
            metricsColumn={metricsColumn}
            navDataAttr="roster"
            sectionsDataAttr="roster"
        >
            {children}
        </WorkspaceShell>
    );
}
