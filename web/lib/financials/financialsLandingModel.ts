/**
 * Financials landing — section launch surfaces (Slice 1).
 *
 * Canonical section routes use history-correct query form:
 *   `/organization/financials?chapter=<section>`
 * Bare `/organization/financials` is the landing (no automatic Tuition selection).
 */

import {
    FINANCIALS_WORKSPACE_CHAPTERS,
    FINANCIALS_WORKSPACE_CHAPTER_META,
    organizationFinancialsChapterHref,
    type FinancialsWorkspaceChapter,
} from "@/lib/commercial/commercialChapterRoutes";
import { CANONICAL_ORGANIZATION_FINANCIALS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const FINANCIALS_LANDING_HREF = CANONICAL_ORGANIZATION_FINANCIALS_HREF;

/** Canonical Tuition (and sibling) section route — query form, Continuity-safe. */
export function financialsSectionHref(section: FinancialsWorkspaceChapter): string {
    return organizationFinancialsChapterHref(section);
}

export type FinancialsLandingSectionTile = {
    id: FinancialsWorkspaceChapter;
    label: string;
    /** One-line product purpose for the tile. */
    summary: string;
    /** Capability bullets from existing product truth (not invented metrics). */
    capabilities: readonly string[];
    /** Utility vs configuration collection. */
    kind: "configuration" | "utility" | "boundary";
    /** Short posture chip when no live aggregation is wired. */
    postureLabel: string;
    href: string;
};

const SECTION_CAPABILITIES: Record<FinancialsWorkspaceChapter, readonly string[]> = {
    tuition: [
        "Organization tuition defaults",
        "Location overrides and inheritance",
        "Cadence-based rates and day-band pricing",
        "Effective dates on rate cells",
    ],
    catalog: [
        "Fees, add-ons, and deposits",
        "Commercial products for Programs",
        "Categories and location/program scoping",
    ],
    policies: [
        "Discount and deposit rules",
        "Commercial policy eligibility",
        "Organization-scoped policy authoring",
    ],
    accounting: [
        "Revenue categories",
        "GL account relationships",
        "Mapping review for commercial charges",
    ],
    simulator: [
        "Preview commercial execution",
        "Program · offering · schedule · cadence",
        "Utility workspace — not a config collection",
    ],
    funding: [
        "Payment responsibility boundary",
        "Owned by Processing — not Financials config",
        "Documents who-pays separation from price",
    ],
};

const SECTION_KIND: Record<FinancialsWorkspaceChapter, FinancialsLandingSectionTile["kind"]> = {
    tuition: "configuration",
    catalog: "configuration",
    policies: "configuration",
    accounting: "configuration",
    simulator: "utility",
    funding: "boundary",
};

const SECTION_POSTURE: Record<FinancialsWorkspaceChapter, string> = {
    tuition: "Rate configuration",
    catalog: "Billable catalog",
    policies: "Rules",
    accounting: "Mappings",
    simulator: "Preview utility",
    funding: "Processing boundary",
};

export function buildFinancialsLandingSections(): readonly FinancialsLandingSectionTile[] {
    return FINANCIALS_WORKSPACE_CHAPTERS.map((id) => {
        const meta = FINANCIALS_WORKSPACE_CHAPTER_META[id];
        return {
            id,
            label: meta.label,
            summary: meta.description,
            capabilities: SECTION_CAPABILITIES[id],
            kind: SECTION_KIND[id],
            postureLabel: SECTION_POSTURE[id],
            href: financialsSectionHref(id),
        };
    });
}

export const FINANCIALS_LANDING_SUBTITLE =
    "Configure tuition, billable items, funding, financial rules, and accounting relationships.";
