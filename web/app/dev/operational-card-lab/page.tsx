import { notFound } from "next/navigation";

import OperationalCardLab from "./OperationalCardLab";

/**
 * Local Design Lab — candidate operational cards.
 *
 * A dev-only review surface for five candidates: Journey, Health & Safety, Staff, Attendance and
 * Billing. They render through the real `UniversalCard` shell, the real `alloyOsRuntime.css` and
 * the real Focus Panel grid, beside the real Household, Children, Readiness and Current Work
 * cards, from fixture evidence.
 *
 * It is NOT production. No candidate is registered in `FOCUS_PANEL_CARD_KEYS`,
 * `FOCUS_PANEL_CARDS`, `FOCUS_PANEL_CARD_CATALOG`, `SYSTEM5_CARD_ARCHETYPE` or
 * `focusPanelCardProviders`, so none can reach a Surface. Visual approval here is not production
 * approval.
 *
 * @see docs/platform/operator/operational-card-visual-audit.md
 */
export default function OperationalCardLabPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalCardLab />;
}
