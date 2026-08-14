"use client";

/**
 * Records operational workspace shell — the canonical `WorkspaceShell`, the same chrome Processing /
 * Communications / Work Items / Assignments / Roster use. Module code supplies only the section body.
 *
 * No modes. Records manages records; it configures nothing, so a Work | Studio switch with one mode
 * in it would be furniture. The mode rail is opted OUT explicitly rather than inferred from the mode
 * count — Work Items also declares a single mode, and inferring would silently change its chrome.
 * (That exact inference shipped once and changed Work Items as collateral.)
 */

import type { ReactNode } from "react";
import { Contact } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { RECORDS_SECTION_TABS, type RecordsSection } from "@/app/adminV2/records/recordsSections";

/** Single mode — the shell suppresses the rail below two, so nothing renders. */
const RECORDS_MODES = [{ key: "work" as const, label: "Work" }];

export default function RecordsWorkspaceShell({
    section,
    onSectionChange,
    onClose,
    sectionTrailing,
    metricsColumn,
    children,
}: {
    section: RecordsSection;
    onSectionChange: (section: RecordsSection) => void;
    onClose?: () => void;
    /** Section-scoped controls (cohort tabs, filter, Add Staff) — never body chrome. */
    sectionTrailing?: ReactNode;
    metricsColumn?: ReactNode;
    children: ReactNode;
}) {
    return (
        <WorkspaceShell
            dataTestId="records-workspace-shell"
            shellDataAttrs={{
                "data-adminv2-records-workspace": true,
                "data-records-section": section,
            }}
            header={{
                icon: <Contact className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Records",
                subtitle: "people and children · durable",
                titleId: "records-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close records",
            }}
            modes={RECORDS_MODES}
            activeMode="work"
            onModeChange={() => {}}
            modeAriaLabel="Records mode"
            showModeRail={false}
            sectionTabs={RECORDS_SECTION_TABS}
            activeSection={section}
            onSectionChange={onSectionChange}
            sectionAriaLabel="Records section"
            sectionsDataAttr="records-sections"
            sectionTrailing={sectionTrailing}
            metricsColumn={metricsColumn}
        >
            {children}
        </WorkspaceShell>
    );
}
