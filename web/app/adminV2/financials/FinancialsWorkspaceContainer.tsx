"use client";

/**
 * FINANCIALS — the workspace container: state, scope, and the one read everything below shares.
 *
 * Sites come from the canonical `/api/admin/workspace/site-filter` route every other workspace uses,
 * so the picker offers exactly the sites the operator is entitled to and nothing here decides that.
 * Choosing one narrows the queue; it never widens it, because the server intersects the choice with
 * the rights it resolved for itself.
 */

import { useEffect, useMemo, useState } from "react";

import FinancialsKpiStrip from "@/app/adminV2/financials/FinancialsKpiStrip";
import FinancialsWorkspace from "@/app/adminV2/financials/FinancialsWorkspace";
import FinancialsWorkspaceShell, { type FinancialsSite } from "@/app/adminV2/financials/FinancialsWorkspaceShell";
import { useFinancialWorkQueue } from "@/app/adminV2/financials/useFinancialWorkQueue";
import type { FinancialsSection } from "@/app/adminV2/financials/financialsSections";

export default function FinancialsWorkspaceContainer({ onClose }: { onClose?: () => void }) {
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
                // A site list that cannot be read leaves the picker absent and the queue at org
                // scope — the server still bounds what comes back, so this degrades honestly.
                if (!cancelled) setSites([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const queue = useFinancialWorkQueue(siteId);

    const scopeLabel = useMemo(() => {
        if (!siteId) return "All sites";
        return sites?.find((s) => s.id === siteId)?.label ?? "Selected site";
    }, [siteId, sites]);

    return (
        <FinancialsWorkspaceShell
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
            <FinancialsWorkspace section={section} queue={queue} scopeLabel={scopeLabel} />
        </FinancialsWorkspaceShell>
    );
}
