import { notFound } from "next/navigation";

import HouseholdCardMockGallery from "./HouseholdCardMockGallery";

/**
 * Reviewable visual mock for the Household Card (Identity archetype).
 *
 * Static fixture gallery — NOT the production card. Demonstrates every state,
 * density, and transition against the new architecture spine:
 *
 *   Operational Context → Focus Panel → Surface/Card layout → Household Card perspectives
 *
 * No drawer / product-surface language. Disabled in production builds (404).
 *
 * @see docs/platform/operator/household-reference-card.md (design freeze)
 * @see docs/platform/operator/operational-context-boundary.md (runtime spine)
 */
export default function HouseholdCardMockPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <HouseholdCardMockGallery />;
}
