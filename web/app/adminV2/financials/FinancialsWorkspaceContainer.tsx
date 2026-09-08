"use client";

/**
 * FINANCIALS — the workspace container: mode, section, scope, and the reads each section needs.
 *
 * Sites come from the canonical `/api/admin/workspace/site-filter` route every other workspace
 * uses, so the picker offers exactly the sites the operator is entitled to and nothing here
 * decides that. Choosing one narrows every section; it never widens one, because each server
 * projection intersects the choice with the rights it resolved for itself.
 *
 * ── EACH SECTION PAYS FOR ITS OWN READ ──
 *
 * The hooks are gated by which section is showing. Resolving seven metrics, a position cohort, a
 * payment flow and an activity feed on every open would make the cheapest surface pay for the
 * most expensive one, and an operator who came to post a charge would wait for a subsidy figure
 * they never asked to see.
 *
 * The position cohort is shared by Accounts and Subsidy because it is genuinely the same read —
 * two questions of one projection, not two projections that must be kept in agreement.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import FinancialsKpiStrip from "@/app/adminV2/financials/FinancialsKpiStrip";
import FinancialsWorkspace from "@/app/adminV2/financials/FinancialsWorkspace";
import FinancialsWorkspaceShell, { type FinancialsSite } from "@/app/adminV2/financials/FinancialsWorkspaceShell";
import { useFinancialWorkQueue } from "@/app/adminV2/financials/useFinancialWorkQueue";
import {
    useFinancialsActivity,
    useFinancialsOverviewMetrics,
    useFinancialsPaymentFlow,
    useFinancialsPosition,
} from "@/app/adminV2/financials/useFinancialsReads";
import {
    defaultFinancialsSection,
    type FinancialsMode,
    type FinancialsSection,
    type FinancialsWorkSection,
} from "@/app/adminV2/financials/financialsSections";

export default function FinancialsWorkspaceContainer({ onClose }: { onClose?: () => void }) {
    const [mode, setMode] = useState<FinancialsMode>("work");
    const [section, setSection] = useState<FinancialsSection>("overview");
    const [siteId, setSiteId] = useState("");
    const [sites, setSites] = useState<FinancialsSite[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/workspace/site-filter", { credentials: "include" });
                const json = (await res.json()) as { sites?: Array<{ id: string; label: string }> };
                if (!cancelled) setSites((json.sites ?? []).map((s) => ({ id: s.id, label: s.label })));
            } catch {
                // A site list that cannot be read leaves the picker absent and every section at org
                // scope — the server still bounds what comes back, so this degrades honestly.
                if (!cancelled) setSites([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    /* Switching mode lands on that mode's own section; a Work section key is meaningless in Studio. */
    const changeMode = useCallback((next: FinancialsMode) => {
        setMode(next);
        setSection(defaultFinancialsSection(next));
    }, []);

    const openWorkSection = useCallback((next: FinancialsWorkSection) => {
        setMode("work");
        setSection(next);
    }, []);

    const queue = useFinancialWorkQueue(siteId);
    const metrics = useFinancialsOverviewMetrics(siteId, section === "overview");
    const position = useFinancialsPosition(siteId, section === "accounts" || section === "subsidy");
    const flow = useFinancialsPaymentFlow(siteId, section === "payments");
    const activity = useFinancialsActivity(siteId, section === "activity");

    const scopeLabel = useMemo(() => {
        if (!siteId) return "All sites";
        return sites?.find((s) => s.id === siteId)?.label ?? "Selected site";
    }, [siteId, sites]);

    return (
        <FinancialsWorkspaceShell
            mode={mode}
            onModeChange={changeMode}
            section={section}
            onSectionChange={setSection}
            sites={sites}
            siteId={siteId}
            onSiteChange={setSiteId}
            scopeLabel={scopeLabel}
            onClose={onClose}
            /* Section-scoped health, and only where the section has work to measure. */
            metricsColumn={
                section === "charges" ? <FinancialsKpiStrip queue={queue.data} loading={queue.loading} /> : undefined
            }
        >
            <FinancialsWorkspace
                section={section}
                queue={queue}
                metrics={metrics}
                position={position}
                flow={flow}
                activity={activity}
                scopeLabel={scopeLabel}
                siteSelected={Boolean(siteId)}
                onOpenSection={openWorkSection}
            />
        </FinancialsWorkspaceShell>
    );
}
