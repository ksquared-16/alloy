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
 *
 * ── WHY THIS NO LONGER SAYS "AWAITING POSTING" (W7-F001) ──
 *
 * It used to show one number: the count of drafts. That number answered a question nobody has.
 * A draft is a draft for one of four unrelated reasons, and only some of them are a person's work —
 * a charge dated into next month is not waiting for anybody, it is waiting for the first of the
 * month. Reporting it beside a charge whose posting failed taught the operator that every draft is
 * a task, which is the habit the Director's walkthrough caught the product teaching.
 *
 * So the band states the two things separately, from the same cohort the list is built from.
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
                /* Work. A failure that will not retry, a review boundary, or an unrecorded reason. */
                key: "needs_a_person",
                label: "Needs a person",
                value: String(counts?.needsAPerson ?? 0),
                tone: "pine",
            },
            {
                /* Not work. The clock posts these, and saying so is the point. */
                key: "waiting_on_a_date",
                label: "Posts on a date",
                value: String(counts?.waitingOnADate ?? 0),
                tone: "midnight",
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
