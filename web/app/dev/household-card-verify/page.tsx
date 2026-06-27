import { notFound } from "next/navigation";

import HouseholdCardVerify from "./HouseholdCardVerify";

/**
 * Verification harness for the PRODUCTION Household card (Identity archetype).
 *
 * Unlike `/dev/household-card-mock` (a static design mock), this route renders the
 * REAL `HouseholdCard` component against fixture `OperationalContext` values to
 * confirm the implemented card observes the Operational Context boundary and
 * renders every state. Dev-only (404 in production).
 *
 * @see web/components/admin/focusPanel/cards/HouseholdCard.tsx
 * @see docs/platform/operator/operational-context-boundary.md
 */
export default function HouseholdCardVerifyPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <HouseholdCardVerify />;
}
