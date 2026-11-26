import { ENROLLMENT_PLACEMENT_LOCATION_MISMATCH_NOTICE } from "@/lib/fields/enrollmentPlacementDoctrine";
import {
    findLocationProgramCategory,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";

export type InquiryChildLocationMismatchState = {
    /** True when child site differs from lead/opportunity site and both are set. */
    mismatched: boolean;
    leadLocationId: string | null;
    childLocationId: string | null;
    notice: string | null;
};

function trimId(v: string | null | undefined): string | null {
    const s = (v ?? "").trim();
    return s || null;
}

/**
 * Detects intentional multi-location families: child enrollment site ≠ lead site.
 * Non-blocking — callers show notice only; save is allowed.
 */
export function resolveInquiryChildLocationMismatch(args: {
    leadLocationId?: string | null;
    childLocationId?: string | null;
}): InquiryChildLocationMismatchState {
    const leadLocationId = trimId(args.leadLocationId);
    const childLocationId = trimId(args.childLocationId);
    if (!leadLocationId || !childLocationId || leadLocationId === childLocationId) {
        return {
            mismatched: false,
            leadLocationId,
            childLocationId,
            notice: null,
        };
    }
    return {
        mismatched: true,
        leadLocationId,
        childLocationId,
        notice: ENROLLMENT_PLACEMENT_LOCATION_MISMATCH_NOTICE,
    };
}

/** Clear program selection when it is not valid for the new location's offerings. */
export function clearProgramValueIfNotOffered(
    programValue: string,
    programOptions: ReadonlyArray<{ value: string }>
): string {
    const current = programValue.trim();
    if (!current) return "";
    if (programOptions.some((o) => o.value === current)) return current;
    return "";
}

/** True when location_program_categories are configured for program pickers. */
export function inquiryChildProgramUsesCategoryIdMode(
    categories: ReadonlyArray<LocationProgramCategoryRow>
): boolean {
    return categories.some((c) => c.is_active !== false);
}

/** Program select value for OCM-persisting pickers — the stored value IS the category FK. */
export function resolveInquiryChildProgramSelectValue(args: {
    program_category_id: string;
}): string {
    return args.program_category_id.trim();
}

/** Program key for room cascade — derived from the category FK (sole OCM program field). */
export function resolveProgramKeyForRoomCascade(args: {
    program_category_id: string;
    categories: ReadonlyArray<LocationProgramCategoryRow>;
}): string | undefined {
    const catId = args.program_category_id.trim();
    if (!catId) return undefined;
    const cat = findLocationProgramCategory({ categories: args.categories, categoryId: catId });
    return cat?.key || undefined;
}

/** Maps program picker value (category id) → canonical FK + derived stable key. */
export function applyInquiryChildProgramSelection(args: {
    value: string;
    categories: ReadonlyArray<LocationProgramCategoryRow>;
}): { program_category_id: string; program_key: string } {
    const value = args.value.trim();
    if (!value) return { program_category_id: "", program_key: "" };
    const cat = findLocationProgramCategory({ categories: args.categories, categoryId: value });
    return {
        program_category_id: value,
        program_key: cat?.key ?? "",
    };
}
