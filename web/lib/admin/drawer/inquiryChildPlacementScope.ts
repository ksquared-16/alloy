/**
 * Inquiry child placement scope — site (physical) + room/classroom (site-scoped unit).
 * Program offerings are derived from active unit `metadata.category` under the selected site.
 */

import { validateChildPlacementScope } from "@/lib/orchestration/placement/validateChildPlacementScope";
import { resolveRoomsForSiteAndProgram } from "@/lib/admin/location/inquiryChildPlacementOptions";

export type InquiryChildLocationOption = {
    id: string;
    label: string;
};

export type InquiryChildCohortOption = {
    cohort_key: string;
    label: string;
};

export type InquiryChildLocationHierarchyRow = {
    id: string;
    label?: string | null;
    location_type?: string | null;
    parent_location_id?: string | null;
    is_active?: boolean;
    metadata?: unknown;
};

export const INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION =
    "Program and room options depend on the selected school. Choose a location first.";

/** Physical campuses/centers only — same filter as workspace header site filter. */
export function filterInquiryChildSiteLocationOptions(
    locations: InquiryChildLocationHierarchyRow[]
): InquiryChildLocationOption[] {
    return locations
        .filter((loc) => String(loc.location_type ?? "").trim() === "site")
        .map((loc) => ({
            id: String(loc.id),
            label: (loc.label ?? loc.id).trim() || String(loc.id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Classrooms/rooms under the selected physical site (`location_type = unit`). */
export function buildInquiryChildRoomOptionsForSite(
    locations: InquiryChildLocationHierarchyRow[],
    siteId: string | null | undefined,
    programKey?: string | null
): InquiryChildCohortOption[] {
    return resolveRoomsForSiteAndProgram(locations, siteId, programKey).map((opt) => ({
        cohort_key: opt.value,
        label: opt.label,
    }));
}

/** @deprecated Use {@link buildInquiryChildRoomOptionsForSite} — program items are org-level, not rooms. */
export function buildInquiryChildCohortOptionsFromProgramItems(
    programItems: Array<{ item_key: string; label: string | null }>
): InquiryChildCohortOption[] {
    return programItems.map((i) => ({
        cohort_key: i.item_key.trim(),
        label: (i.label ?? i.item_key).trim() || i.item_key,
    }));
}

/** Program/cohort fields require child site until a site→program catalog exists. */
export function inquiryChildPlacementFieldsRequireSite(): boolean {
    return true;
}

export function isInquiryChildPlacementProgramFieldDisabled(siteId: string | null | undefined): boolean {
    if (!inquiryChildPlacementFieldsRequireSite()) return false;
    return !(siteId ?? "").trim();
}

/** Dev-only hint when child site/cohort missing for waitlist priority facts (Card 3). Hidden from operator drawer UX. */
export function inquiryChildPlacementScopeDiagnosticHint(_params: {
    locationId?: string | null;
    programRoomCohortKey?: string | null;
}): string | null {
    return null;
}

export type InquiryChildPlacementPatchValidation = {
    ok: boolean;
    issues: Array<{ code: string; message: string }>;
    limitation_notes: string[];
};

export function validateInquiryChildPlacementPatch(input: {
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    program_category_id?: string | null;
}): InquiryChildPlacementPatchValidation {
    const location_id = (input.location_id ?? "").trim() || null;
    const program_room_cohort_key = (input.program_room_cohort_key ?? "").trim() || null;
    const program_category_id = (input.program_category_id ?? "").trim() || null;

    const issues: Array<{ code: string; message: string }> = [];
    const limitation_notes: string[] = [];

    const scope = validateChildPlacementScope({ location_id, program_room_cohort_key });
    for (const issue of scope.issues) {
        issues.push({ code: issue.code, message: issue.message });
    }
    limitation_notes.push(...scope.deferred_checks);

    if (inquiryChildPlacementFieldsRequireSite()) {
        if ((program_category_id || program_room_cohort_key) && !location_id) {
            issues.push({
                code: "program_without_site",
                message: "Select a child site before program or room/cohort.",
            });
        }
    }

    return { ok: issues.length === 0, issues, limitation_notes };
}

/** Suggest cohort key when operator picks program and cohort is empty. */
export function suggestCohortKeyFromProgramType(_programType: string | null | undefined): string | null {
    return null;
}
