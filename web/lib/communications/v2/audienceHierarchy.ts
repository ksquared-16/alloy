/**
 * Audience hierarchy helpers — map locations + program categories for comms audience builder.
 * Pure logic; mirrors staging payload shapes from /locations?hierarchy=1 and location-program-categories.
 */

import type { InquiryChildPlacementHierarchyRow } from "@/lib/admin/location/inquiryChildPlacementOptions";
import { filterInquiryChildSiteLocationOptions } from "@/lib/admin/drawer/inquiryChildPlacementScope";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import type { ProgramOptionRow } from "@/lib/communications/v2/audienceOptionLabels";

export function normalizeProgramToken(raw: string): string {
    return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Collect category match tokens stored on a unit/classroom row. */
export function unitProgramCategoryTokens(row: InquiryChildPlacementHierarchyRow): string[] {
    const tokens = new Set<string>();
    const presentation = readLocationMetadataPresentation(row.metadata);
    if (presentation.category?.trim()) tokens.add(presentation.category.trim());

    if (row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
        const meta = row.metadata as Record<string, unknown>;
        for (const key of ["program_category_id", "program_category_key", "desired_program_type", "category"]) {
            const value = meta[key];
            if (typeof value === "string" && value.trim()) tokens.add(value.trim());
        }
    }
    return [...tokens];
}

export function unitMatchesProgramCategoryRow(
    row: InquiryChildPlacementHierarchyRow,
    programRow: ProgramOptionRow
): boolean {
    const tokens = unitProgramCategoryTokens(row);
    if (tokens.length === 0) return false;

    const programKey = programRow.key.trim();
    const programId = programRow.id.trim();
    const programLabel = programRow.label.trim();
    const normalizedKey = programKey ? normalizeProgramToken(programKey) : "";
    const normalizedLabel = programLabel ? normalizeProgramToken(programLabel) : "";

    for (const token of tokens) {
        if (programId && token === programId) return true;
        if (programKey && token === programKey) return true;
        if (programLabel && token.toLowerCase() === programLabel.toLowerCase()) return true;
        const normalizedToken = normalizeProgramToken(token);
        if (normalizedKey && normalizedToken === normalizedKey) return true;
        if (normalizedLabel && normalizedToken === normalizedLabel) return true;
    }
    return false;
}

export function countActiveUnitsUnderSite(
    hierarchy: InquiryChildPlacementHierarchyRow[],
    siteId: string
): number {
    const site = siteId.trim();
    if (!site) return 0;
    return hierarchy.filter((row) => {
        if (String(row.location_type ?? "").trim() !== "unit") return false;
        if (row.is_active === false) return false;
        return String(row.parent_location_id ?? "").trim() === site;
    }).length;
}

/** Keep program categories attached to physical site rows only. */
export function parseProgramOptionRowsFromApi(
    raw: ReadonlyArray<Record<string, unknown>>,
    hierarchy: InquiryChildPlacementHierarchyRow[]
): ProgramOptionRow[] {
    const siteIds = new Set(
        filterInquiryChildSiteLocationOptions(hierarchy).map((s) => String(s.id))
    );
    return raw
        .map((p) => ({
            id: String(p.id ?? ""),
            label: String(p.label ?? p.id ?? ""),
            location_id: String(p.location_id ?? ""),
            key: String(p.key ?? ""),
        }))
        .filter((p) => p.id && p.label && p.location_id && siteIds.has(p.location_id));
}

/** Staging-shaped fixture: three sites, seeded categories, units tagged via field_values merge. */
export function stagingAudienceHierarchyFixture(): {
    hierarchy: InquiryChildPlacementHierarchyRow[];
    programCategories: ProgramOptionRow[];
} {
    const hierarchy: InquiryChildPlacementHierarchyRow[] = [
        { id: "site-north", label: "North Campus", location_type: "site", parent_location_id: null, is_active: true },
        { id: "site-south", label: "South Campus", location_type: "site", parent_location_id: null, is_active: true },
        { id: "site-west", label: "West Campus", location_type: "site", parent_location_id: null, is_active: true },
        {
            id: "room-north-toddler-a",
            label: "Toddler Room A",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { semantic_kind: "classroom", category: "toddler" },
        },
        {
            id: "room-north-toddler-b",
            label: "Toddler Room B",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { semantic_kind: "classroom" },
        },
        {
            id: "room-south-preschool",
            label: "Preschool 1",
            location_type: "unit",
            parent_location_id: "site-south",
            is_active: true,
            metadata: { category: "preschool" },
        },
    ];

    const programCategories: ProgramOptionRow[] = [
        { id: "cat-n-infant", label: "Infant", location_id: "site-north", key: "infant" },
        { id: "cat-n-toddler", label: "Toddler", location_id: "site-north", key: "toddler" },
        { id: "cat-n-preschool", label: "Preschool", location_id: "site-north", key: "preschool" },
        { id: "cat-n-prek", label: "Pre-K", location_id: "site-north", key: "pre_k" },
        { id: "cat-n-school", label: "School Age", location_id: "site-north", key: "school_age" },
        { id: "cat-n-toddler-dup", label: "Toddler", location_id: "site-north", key: "toddler" },
        { id: "cat-s-toddler", label: "Toddler", location_id: "site-south", key: "toddler" },
    ];

    return { hierarchy, programCategories };
}
