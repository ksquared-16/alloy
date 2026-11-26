/**
 * Shared OCM placement display for inquiry children (Opportunity) and enrollment mirror (Child drawer).
 * UI label: Program / category — prefers location_program_categories, then legacy option set key.
 */

import {
    resolveLocationProgramCategoryLabel,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";

export type InquiryChildOcmPlacementSource = {
    program_category_id?: string | null;
    /** Stable program key derived from the category FK (or intake default) — display/label resolution only, never persisted. */
    program_key?: string | null;
    desired_program_label?: string | null;
    location_id?: string | null;
    schedule_type?: string | null;
    desired_schedule_label?: string | null;
    program_room_cohort_key?: string | null;
    program_room_cohort_label?: string | null;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export function optionLabelFromLookup(
    lookup: Map<string, string> | ReadonlyMap<string, string>,
    setKey: string,
    itemKey: string | null | undefined
): string | null {
    const k = trimOrNull(itemKey);
    if (!k) return null;
    return lookup.get(`${setKey}\0${k}`) ?? null;
}

/**
 * Program/category label for OCM placement — matches Child `_enrollment_mirror.program_label` resolution.
 */
export function resolveInquiryChildProgramCategoryLabel(args: {
    program_category_id?: string | null;
    /** Stable program key derived from the category FK (or intake default) — label resolution only. */
    program_key?: string | null;
    location_id?: string | null;
    desired_program_label?: string | null;
    demo_program_label?: string | null;
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>;
    locationProgramCategories?: ReadonlyArray<LocationProgramCategoryRow>;
}): string | null {
    const programKey = trimOrNull(args.program_key);
    const categoryId = trimOrNull(args.program_category_id);
    if (!programKey && !categoryId) return null;

    const legacyOptionSetLabel =
        programKey && args.optionLabelLookup != null
            ? optionLabelFromLookup(args.optionLabelLookup, "childcare_program_type", programKey)
            : null;

    const resolved = resolveLocationProgramCategoryLabel({
        categories: args.locationProgramCategories,
        locationId: args.location_id,
        categoryId,
        programKey,
        cachedLabel: args.desired_program_label,
        legacyOptionSetLabel,
    });
    if (resolved) return resolved;

    // Never substitute member/demo program_label when the OCM program category is set.
    return programKey;
}

export function resolveInquiryChildScheduleLabel(args: {
    schedule_type: string | null | undefined;
    desired_schedule_label?: string | null;
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>;
}): string | null {
    const typeKey = trimOrNull(args.schedule_type);
    if (!typeKey) return null;
    const fromRow = trimOrNull(args.desired_schedule_label);
    if (fromRow) return fromRow;
    const fromOptions =
        args.optionLabelLookup != null
            ? optionLabelFromLookup(args.optionLabelLookup, "childcare_schedule_type", typeKey)
            : null;
    return fromOptions ?? typeKey;
}

export function resolveInquiryChildRoomCohortLabel(args: {
    program_room_cohort_key: string | null | undefined;
    program_room_cohort_label?: string | null;
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>;
}): string | null {
    const key = trimOrNull(args.program_room_cohort_key);
    if (!key) return null;
    const fromRow = trimOrNull(args.program_room_cohort_label);
    if (fromRow) return fromRow;
    const fromOptions =
        args.optionLabelLookup != null
            ? optionLabelFromLookup(args.optionLabelLookup, "childcare_program_type", key)
            : null;
    return fromOptions ?? key;
}

/** Apply resolved program/schedule/room labels onto inquiry child rows (immutable). */
export function applyInquiryChildPlacementDisplayLabels<
    T extends InquiryChildOcmPlacementSource,
>(rows: T[], optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>): T[] {
    if (!rows.length) return rows;
    const lookup = optionLabelLookup ?? new Map<string, string>();
    return rows.map((row) => ({
        ...row,
        desired_program_label:
            resolveInquiryChildProgramCategoryLabel({
                program_category_id: row.program_category_id,
                program_key: row.program_key,
                location_id: row.location_id,
                desired_program_label: row.desired_program_label,
                optionLabelLookup: lookup,
            }) ?? row.desired_program_label ?? null,
        desired_schedule_label:
            resolveInquiryChildScheduleLabel({
                schedule_type: row.schedule_type,
                desired_schedule_label: row.desired_schedule_label,
                optionLabelLookup,
            }) ?? row.desired_schedule_label ?? null,
        program_room_cohort_label:
            resolveInquiryChildRoomCohortLabel({
                program_room_cohort_key: row.program_room_cohort_key,
                program_room_cohort_label: row.program_room_cohort_label,
                optionLabelLookup,
            }) ?? row.program_room_cohort_label ?? null,
    }));
}

/** Collect batch pairs for inquiry child OCM placement label resolution. */
export function inquiryChildPlacementOptionLabelPairs(
    rows: ReadonlyArray<InquiryChildOcmPlacementSource>
): { setKey: string; itemKey: string }[] {
    const pairs: { setKey: string; itemKey: string }[] = [];
    const seen = new Set<string>();
    const add = (setKey: string, itemKey: string | null | undefined) => {
        const ik = trimOrNull(itemKey);
        if (!ik) return;
        const cacheKey = `${setKey}\0${ik}`;
        if (seen.has(cacheKey)) return;
        seen.add(cacheKey);
        pairs.push({ setKey, itemKey: ik });
    };
    for (const row of rows) {
        add("childcare_program_type", row.program_key);
        add("childcare_schedule_type", row.schedule_type);
        add("childcare_program_type", row.program_room_cohort_key);
    }
    return pairs;
}
