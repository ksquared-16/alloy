/**
 * Inquiry child placement scope — site + waitlist cohort (Card 2).
 * No site→program catalog yet; cohort options use childcare program option-set keys.
 */

import { validateChildPlacementScope } from "@/lib/orchestration/placement/validateChildPlacementScope";

export type InquiryChildLocationOption = {
    id: string;
    label: string;
};

export type InquiryChildCohortOption = {
    cohort_key: string;
    label: string;
};

export const INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION =
    "Program/category is org-level; classrooms are site-level. Select a child site before program or cohort. Site-scoped rates and classroom catalogs are deferred.";

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

/** Dev-only hint when child site/cohort missing for waitlist priority facts (Card 3). */
export function inquiryChildPlacementScopeDiagnosticHint(params: {
    locationId?: string | null;
    programRoomCohortKey?: string | null;
}): string | null {
    if (process.env.NODE_ENV === "production") return null;
    const missingSite = !(params.locationId ?? "").trim();
    const missingCohort = !(params.programRoomCohortKey ?? "").trim();
    if (!missingSite && !missingCohort) return null;
    const parts: string[] = [];
    if (missingSite) parts.push("site");
    if (missingCohort) parts.push("room/cohort");
    return `Missing child ${parts.join(" and ")} — same-site sibling priority will not apply until set.`;
}

export type InquiryChildPlacementPatchValidation = {
    ok: boolean;
    issues: Array<{ code: string; message: string }>;
    limitation_notes: string[];
};

export function validateInquiryChildPlacementPatch(input: {
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    desired_program_type?: string | null;
}): InquiryChildPlacementPatchValidation {
    const location_id = (input.location_id ?? "").trim() || null;
    const program_room_cohort_key = (input.program_room_cohort_key ?? "").trim() || null;
    const desired_program_type = (input.desired_program_type ?? "").trim() || null;

    const issues: Array<{ code: string; message: string }> = [];
    const limitation_notes: string[] = [];

    const scope = validateChildPlacementScope({ location_id, program_room_cohort_key });
    for (const issue of scope.issues) {
        issues.push({ code: issue.code, message: issue.message });
    }
    limitation_notes.push(...scope.deferred_checks);

    if (inquiryChildPlacementFieldsRequireSite()) {
        if ((desired_program_type || program_room_cohort_key) && !location_id) {
            issues.push({
                code: "program_without_site",
                message: "Select a child site before program or room/cohort.",
            });
        }
    }

    return { ok: issues.length === 0, issues, limitation_notes };
}

/** Suggest cohort key when operator picks program and cohort is empty. */
export function suggestCohortKeyFromProgramType(programType: string | null | undefined): string | null {
    const k = (programType ?? "").trim();
    return k || null;
}
