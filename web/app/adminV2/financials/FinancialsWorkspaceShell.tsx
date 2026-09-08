"use client";

/**
 * FINANCIALS workspace shell — the canonical `WorkspaceShell`, the same chrome Processing,
 * Communications, Work Items and Operations already use.
 *
 * Module code supplies the site picker, the section body and the section-scoped health band. There
 * is deliberately nothing else here: no Financials header, no Financials navigation grammar, no
 * Financials KPI primitive, no accent of its own. A second shell would look like one workspace
 * family for exactly as long as nobody changed the first.
 *
 * THE MODE RAIL IS OFF. Financials has one mode today — running the financial day — and a switch
 * with one position in it is furniture. Operations turned the rail back on only when it genuinely
 * had two things to switch between; the same rule keeps it off here.
 */

import type { ReactNode } from "react";
import { Wallet } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    FINANCIALS_MODES,
    FINANCIALS_SECTIONS,
    type FinancialsSection,
} from "@/app/adminV2/financials/financialsSections";

export type FinancialsSite = { id: string; label: string };

export default function FinancialsWorkspaceShell({
    section,
    onSectionChange,
    sites,
    siteId,
    onSiteChange,
    scopeLabel,
    onClose,
    metricsColumn,
    children,
}: {
    section: FinancialsSection;
    onSectionChange: (section: FinancialsSection) => void;
    sites: FinancialsSite[] | null;
    /** "" means org scope — every site the operator is entitled to. */
    siteId: string;
    onSiteChange: (id: string) => void;
    scopeLabel: string;
    onClose?: () => void;
    metricsColumn?: ReactNode;
    children: ReactNode;
}) {
    return (
        <WorkspaceShell
            dataTestId="financials-workspace-shell"
            shellDataAttrs={{
                "data-adminv2-financials-workspace": true,
                "data-financials-section": section,
                "data-financials-site": siteId || "org",
            }}
            header={{
                icon: <Wallet className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
                title: "Financials",
                /* The scope is stated in the header because every count below it is scoped. */
                subtitle: `${scopeLabel} · operational`,
                titleId: "financials-workspace-title",
                onClose: onClose ?? (() => {}),
                closeLabel: "Close financials",
                secondaryActions:
                    sites && sites.length > 1 ? (
                        <label className="flex items-center gap-1.5">
                            <span className="sr-only">Site</span>
                            <AlloySelect
                                value={siteId}
                                onChange={onSiteChange}
                                options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.label }))]}
                                aria-label="Site"
                            />
                        </label>
                    ) : null,
            }}
            modes={FINANCIALS_MODES}
            activeMode="work"
            onModeChange={() => {}}
            modeAriaLabel="Financials mode"
            showModeRail={false}
            sectionTabs={FINANCIALS_SECTIONS}
            activeSection={section}
            onSectionChange={(key) => onSectionChange(key as FinancialsSection)}
            sectionAriaLabel="Financials sections"
            metricsColumn={metricsColumn}
            navDataAttr="financials"
            sectionsDataAttr="financials"
        >
            {children}
        </WorkspaceShell>
    );
}
