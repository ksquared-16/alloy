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
 * THE MODE RAIL IS ON, because Financials genuinely has two things to switch between: running
 * the financial day, and the configuration the day is made of. Thread 4 kept it off when Work was
 * the only mode — a switch with one position in it is furniture — and Studio earns it by being a
 * launch surface over `/organization/financials` rather than a second copy of it.
 *
 * THE ICON IS MONEY, AND IT IS THE PLATFORM'S EXISTING ONE. `Wallet` reads as a personal purse
 * and was the same glyph the Scheduling card uses for a rate chip — two different subjects wearing
 * one mark. `Banknote` is already what the configuration plane shows for Financials
 * (`configurationModeNavIcons`, `OrganizationConfigurationPage`), so adopting it here makes the
 * sidebar, this header and the configuration launch surfaces agree rather than adding a fourth
 * financial glyph to a platform that already had three.
 */

import type { ReactNode } from "react";
import { Banknote } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    FINANCIALS_MODES,
    financialsSectionsForMode,
    type FinancialsMode,
    type FinancialsSection,
} from "@/app/adminV2/financials/financialsSections";

export type FinancialsSite = { id: string; label: string };

export default function FinancialsWorkspaceShell({
    mode,
    onModeChange,
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
    mode: FinancialsMode;
    onModeChange: (mode: FinancialsMode) => void;
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
                "data-financials-mode": mode,
                "data-financials-section": section,
                "data-financials-site": siteId || "org",
            }}
            header={{
                icon: <Banknote className="h-4 w-4" aria-hidden strokeWidth={1.9} />,
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
            activeMode={mode}
            onModeChange={(key) => onModeChange(key as FinancialsMode)}
            modeAriaLabel="Financials mode"
            sectionTabs={financialsSectionsForMode(mode)}
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
