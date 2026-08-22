import { notFound } from "next/navigation";

import OperationalCardLab from "./OperationalCardLab";

/**
 * Local Design Lab — Operational Card System Expansion.
 *
 * A dev-only review surface for five SPECIFIED cards: Journey, Health & Safety, Staff,
 * Attendance, Billing. It renders them through the real `UniversalCard` shell and the real
 * `alloyOsRuntime.css`, driven by fixture evidence.
 *
 * It is NOT production. None of these cards is registered in `FOCUS_PANEL_CARD_KEYS`,
 * `FOCUS_PANEL_CARDS`, `FOCUS_PANEL_CARD_CATALOG`, `SYSTEM5_CARD_ARCHETYPE`, or
 * `focusPanelCardProviders.ts`, so none can be added to a Surface or enter a Focus Panel
 * composition. Visual approval here is NOT production approval.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md
 */
export default function OperationalCardLabPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalCardLab />;
}
