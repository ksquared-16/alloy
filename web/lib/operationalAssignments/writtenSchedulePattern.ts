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
 *   - a schedule type the operator chose (Use a pattern, or the existing assignment's) is written,
 *     preferring that type's pattern whose weekdays are the selected days;
 *   - with none chosen, the selected days decide it only when every pattern on exactly those days
 *     carries ONE schedule type (patterns sharing days and type are interchangeable for what is
 *     written: weekdays and type);
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
    /** True when the selected days match patterns of more than one schedule type. */
    ambiguous: boolean;
};

const dayKey = (days: readonly number[]) => [...new Set(days)].sort((a, b) => a - b).join(",");

export function resolveWrittenSchedulePattern(args: {
    patterns: readonly SchedulePatternLike[];
    chosenScheduleType: string | null | undefined;
    days: readonly number[];
}): WrittenSchedulePattern {
    const key = dayKey(args.days);
    const sameDays = args.patterns.filter((p) => dayKey(p.weekdays) === key);
    const chosen = (args.chosenScheduleType ?? "").trim();
    if (chosen) {
        const ofType = args.patterns.filter((p) => p.scheduleTypeKey === chosen);
        const pick = ofType.find((p) => sameDays.includes(p)) ?? ofType[0] ?? null;
        return { patternId: pick?.id ?? null, scheduleType: pick ? chosen : null, ambiguous: false };
    }
    if (!key) return { patternId: null, scheduleType: null, ambiguous: false };
    const types = new Set(sameDays.map((p) => p.scheduleTypeKey).filter((t): t is string => Boolean(t)));
    if (types.size !== 1) return { patternId: null, scheduleType: null, ambiguous: types.size > 1 };
    const [type] = [...types];
    const pick = sameDays.find((p) => p.scheduleTypeKey === type)!;
    return { patternId: pick.id, scheduleType: type!, ambiguous: false };
}
