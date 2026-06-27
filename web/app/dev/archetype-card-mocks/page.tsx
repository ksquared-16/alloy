import { notFound } from "next/navigation";

import ArchetypeCardMocksGallery from "./ArchetypeCardMocksGallery";

/**
 * Reviewable visual mocks for the remaining Universal Card archetypes.
 *
 * Static fixture gallery — NOT production cards. One reference card per archetype
 * (Identity is already implemented as Household). Demonstrates Overview,
 * Evidence/expanded, Focused, Empty, Missing/risk, Mobile, and transition notes
 * against the architecture spine:
 *
 *   Operational Context → Focus Panel → Surface/Card layout → Card perspectives
 *
 * No drawer / product-surface language. Disabled in production builds (404).
 *
 * @see docs/platform/operator/card-archetypes.md
 * @see docs/platform/operator/operational-context-boundary.md (runtime spine)
 */
export default function ArchetypeCardMocksPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ArchetypeCardMocksGallery />;
}
