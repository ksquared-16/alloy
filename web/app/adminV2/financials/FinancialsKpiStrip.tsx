"use client";

/**
 * Financials operational health — the section-scoped band in the navigation control band.
 *
 * Data-only adapter: it turns the queue's own counts into canonical
 * `WorkspaceOperationalHealth` items and renders nothing of its own. No `FinancialsKpiCard`, no
 * pills, no module accent — the shared primitive owns every pixel, which is the entire reason it
 * exists.
 *
 * The metrics are OPERATIONAL and section-scoped: what is waiting to be posted, and across how many
 * families. They are not inventory totals and not a balance — the workspace owns no money truth, so
 * a band here that showed one would be inventing it.
 */

import { useMemo } from "react";

import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
import type { FinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

export default function FinancialsKpiStrip({
    queue,
    loading,
}: {
    queue: FinancialWorkQueue | null;
    loading: boolean;
}) {
    const items: WorkspaceOperationalHealthItem[] = useMemo(() => {
        const counts = queue?.counts;
        return [
            {
                key: "awaiting_posting",
                label: "Awaiting posting",
                value: String(counts?.actionable ?? 0),
                tone: "pine",
            },
            {
                key: "households",
                label: "Households",
                value: String(counts?.households ?? 0),
                tone: "midnight",
            },
        ];
    }, [queue]);

    return (
        <WorkspaceOperationalHealth
            eyebrow="Charges"
            items={items}
            loading={loading}
            ariaLabel="Financials queue operational health"
            className="w-full"
            data-testid="financials-kpi-band"
        />
    );
}
