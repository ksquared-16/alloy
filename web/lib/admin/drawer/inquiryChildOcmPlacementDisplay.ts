/**
 * Shared OCM placement display for inquiry children (Opportunity) and enrollment mirror (Child drawer).
 * UI label: Program / category — canonical key: OCM.desired_program_type (childcare_program_type option set).
 */

export type InquiryChildOcmPlacementSource = {
    desired_program_type?: string | null;
    desired_program_label?: string | null;
    desired_schedule_type?: string | null;
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
 * Data: `desired_program_type` (OCM) → option set `childcare_program_type`.
 */
export function resolveInquiryChildProgramCategoryLabel(args: {
    desired_program_type: string | null | undefined;
    desired_program_label?: string | null;
    demo_program_label?: string | null;
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>;
}): string | null {
    const typeKey = trimOrNull(args.desired_program_type);
    if (!typeKey) return null;
    const fromRow = trimOrNull(args.desired_program_label);
    if (fromRow) return fromRow;
    const fromOptions =
        args.optionLabelLookup != null
            ? optionLabelFromLookup(args.optionLabelLookup, "childcare_program_type", typeKey)
            : null;
    if (fromOptions) return fromOptions;
    // Never substitute member/demo program_label when OCM desired_program_type is set.
    return typeKey;
}

export function resolveInquiryChildScheduleLabel(args: {
    desired_schedule_type: string | null | undefined;
    desired_schedule_label?: string | null;
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>;
}): string | null {
    const typeKey = trimOrNull(args.desired_schedule_type);
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
                desired_program_type: row.desired_program_type,
                desired_program_label: row.desired_program_label,
                optionLabelLookup: lookup,
            }) ?? row.desired_program_label ?? null,
        desired_schedule_label:
            resolveInquiryChildScheduleLabel({
                desired_schedule_type: row.desired_schedule_type,
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
        add("childcare_program_type", row.desired_program_type);
        add("childcare_schedule_type", row.desired_schedule_type);
        add("childcare_program_type", row.program_room_cohort_key);
    }
    return pairs;
}
