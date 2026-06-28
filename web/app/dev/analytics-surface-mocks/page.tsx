import { notFound } from "next/navigation";

import AnalyticsSurfaceMocksGallery from "./AnalyticsSurfaceMocksGallery";

/**
 * Dev-only preview of the Analytics / Dashboard Design Surface composition.
 *
 * Demonstrates the re-chromed Metric archetype cards (Universal Card / Alloy Card
 * Language) and the new Health + Breakdown renderers across sample surfaces:
 * Executive Performance, Operational Intelligence, Enrollment Analytics, Financial
 * Performance, a Metric Card Gallery, and density examples.
 *
 * Static fixtures only — no API, no OIP calculation. Disabled in production (404).
 *
 * @see docs/sprints/06_2026/analytics-operational-intelligence-platform/mockups
 */
export default function AnalyticsSurfaceMocksPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <AnalyticsSurfaceMocksGallery />;
}
