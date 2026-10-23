/**
 * THE PATTERN AN ASSIGNMENT SAVE WRITES — chosen or derived, never defaulted.
 *
 * The editor's Save used to send `patterns.find(type === chosen) ?? patterns[0]`: with no pattern
 * chosen, the site's FIRST configured pattern decided the schedule type written into the proposal
 * (pre-enrolment) or the assignment (enrolled). At a site whose list began with Before Care, a
 * primary classroom child would have been recorded as `weekly`. And because the editor's draft
 * tuition never sent that invented type, the preview could never match the saved proposal — every
 * create answered `stale_resolution`.
 *
 * The rule now, shared by the draft preview and the Save so they cannot disagree:
 *   - the exact pattern already chosen (applied, or the edited row's own) is kept while the selected
 *     days are its days;
 *   - otherwise a schedule type the operator chose (Use a pattern, or the existing assignment's) is
 *     written through ITS pattern on exactly the selected days — when exactly one fits;
 *   - with none chosen, the selected days decide it only when exactly ONE pattern sits on them;
 *   - two or more fitting patterns are AMBIGUOUS: nothing is written until the operator chooses one
 *     (Before Care and After Care share days and type — picking either would be a guess);
 *   - days NO pattern of the chosen type sits on are a CUSTOM week (V7 S3 / audit A6): the pattern the
 *     operator chose — or the type's only pattern — carries the schedule type, and the days themselves
 *     are kept as the assignment's own Assignment Time. It used to fall back to the type's FIRST
 *     pattern and drop the days silently. With several candidate carriers it is ambiguous instead;
 *   - otherwise nothing is written. Missing is said as missing, not guessed.
 */
export type SchedulePatternLike = {
    id: string;
    weekdays: readonly number[];
    scheduleTypeKey: string | null;
};

export type WrittenSchedulePattern = {
    patternId: string | null;
    scheduleType: string | null;
    /** True when more than one pattern fits and the operator must choose — nothing is written. */
    ambiguous: boolean;
    /** True when the selected days are not the pattern's: they persist as the assignment's own days. */
    custom?: boolean;
};

const dayKey = (days: readonly number[]) => [...new Set(days)].sort((a, b) => a - b).join(",");

export function resolveWrittenSchedulePattern(args: {
    patterns: readonly SchedulePatternLike[];
    chosenScheduleType: string | null | undefined;
    days: readonly number[];
    /**
     * The exact pattern already chosen (applied, or the edited row's own). Kept while the selected
     * days are still its days — two patterns can share days AND type (Before Care, After Care), so
     * re-deriving by type would silently swap one for the other.
     */
    chosenPatternId?: string | null;
}): WrittenSchedulePattern {
    const key = dayKey(args.days);
    const none: WrittenSchedulePattern = { patternId: null, scheduleType: null, ambiguous: false };
    if (!key) return none;
    const sameDays = args.patterns.filter((p) => dayKey(p.weekdays) === key);
    const exact = args.chosenPatternId ? args.patterns.find((p) => p.id === args.chosenPatternId) : undefined;
    if (exact && exact.scheduleTypeKey && dayKey(exact.weekdays) === key) {
        return { patternId: exact.id, scheduleType: exact.scheduleTypeKey, ambiguous: false };
    }
    const chosen = (args.chosenScheduleType ?? "").trim() || (exact?.scheduleTypeKey ?? "");
    if (chosen) {
        const ofType = args.patterns.filter((p) => p.scheduleTypeKey === chosen);
        const fitting = ofType.filter((p) => sameDays.includes(p));
        if (fitting.length === 1) return { patternId: fitting[0].id, scheduleType: chosen, ambiguous: false };
        if (fitting.length > 1) return { ...none, ambiguous: true };
        // A custom week: no pattern of this type sits on these days.
        const carrier = exact?.scheduleTypeKey === chosen ? exact : ofType.length === 1 ? ofType[0] : null;
        if (carrier) return { patternId: carrier.id, scheduleType: chosen, ambiguous: false, custom: true };
        return { ...none, ambiguous: ofType.length > 1 };
    }
    const typed = sameDays.filter((p) => Boolean(p.scheduleTypeKey));
    if (typed.length === 1) return { patternId: typed[0].id, scheduleType: typed[0].scheduleTypeKey, ambiguous: false };
    return { ...none, ambiguous: typed.length > 1 };
}
