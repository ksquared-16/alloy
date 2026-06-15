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

export function resolveInquiryChildProgramSelectValue(args: {
    useCategoryMode: boolean;
    desired_program_category_id: string;
    desired_program_type: string;
}): string {
    if (args.useCategoryMode) return args.desired_program_category_id.trim();
    return args.desired_program_type.trim();
}

/** Program key for room cascade — resolves from category id when present. */
export function resolveProgramKeyForRoomCascade(args: {
    desired_program_category_id: string;
    desired_program_type: string;
    categories: ReadonlyArray<LocationProgramCategoryRow>;
}): string | undefined {
    const catId = args.desired_program_category_id.trim();
    if (catId) {
        const cat = findLocationProgramCategory({ categories: args.categories, categoryId: catId });
        if (cat?.key) return cat.key;
    }
    const key = args.desired_program_type.trim();
    return key || undefined;
}

/** Maps program picker value → canonical OCM program fields. */
export function applyInquiryChildProgramSelection(args: {
    value: string;
    useCategoryMode: boolean;
    categories: ReadonlyArray<LocationProgramCategoryRow>;
}): { desired_program_category_id: string; desired_program_type: string } {
    const value = args.value.trim();
    if (!value) return { desired_program_category_id: "", desired_program_type: "" };
    if (args.useCategoryMode) {
        const cat = findLocationProgramCategory({ categories: args.categories, categoryId: value });
        return {
            desired_program_category_id: value,
            desired_program_type: cat?.key ?? "",
        };
    }
    const cat = findLocationProgramCategory({ categories: args.categories, key: value });
    return {
        desired_program_category_id: cat?.id ?? "",
        desired_program_type: value,
    };
}
