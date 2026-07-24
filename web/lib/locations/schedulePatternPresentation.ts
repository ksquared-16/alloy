/**
 * Schedule Definition presentation — independent Day Type + Pattern Type (Repeats).
 *
 * Native columns remain weekdays + schedule_type_key.
 * Versioned metadata owns day_type, pattern_type, weeks[], hours, and optional rotation_anchor_date.
 *
 * V1 compatibility: operator_type full_day|part_time|hourly|rotating maps into day_type + pattern_type.
 */

export const SCHEDULE_DEFINITION_METADATA_VERSION = 2 as const;
/** @deprecated Use SCHEDULE_DEFINITION_METADATA_VERSION */
export const SCHEDULE_PATTERN_METADATA_VERSION = SCHEDULE_DEFINITION_METADATA_VERSION;

export const SCHEDULE_ROTATION_WEEK_MIN = 1;
export const SCHEDULE_ROTATION_WEEK_MAX = 8;

export type ScheduleDayType = "full_time" | "part_time" | "hourly";
export type SchedulePatternType = "continuous" | "rotating";

/** @deprecated Prefer ScheduleDayType + SchedulePatternType */
export type SchedulePatternOperatorType = "full_day" | "part_time" | "hourly" | "rotating";

export type SchedulePatternHours = {
    opensAt: string | null;
    closesAt: string | null;
};

export type ScheduleWeekDefinition = {
    position: number;
    days: number[];
    startTime: string | null;
    endTime: string | null;
};

/** Legacy two-week shape kept for read compat. */
export type SchedulePatternRotation = {
    week1: number[];
    week2: number[];
};

export type ScheduleDefinitionPresentation = {
    version: typeof SCHEDULE_DEFINITION_METADATA_VERSION;
    dayType: ScheduleDayType | null;
    patternType: SchedulePatternType;
    hours: SchedulePatternHours;
    weeks: ScheduleWeekDefinition[];
    rotationAnchorDate: string | null;
    /** Legacy rotating rows without a safe day_type inference. */
    needsDayTypeReview: boolean;
};

/** @deprecated Prefer ScheduleDefinitionPresentation */
export type SchedulePatternPresentation = {
    version: typeof SCHEDULE_DEFINITION_METADATA_VERSION;
    operatorType: SchedulePatternOperatorType;
    hours: SchedulePatternHours;
    rotation: SchedulePatternRotation | null;
};

export type SchedulePatternSchedulingContract = {
    dayType: ScheduleDayType | null;
    patternType: SchedulePatternType;
    days: number[];
    hours: SchedulePatternHours;
    weeks: ScheduleWeekDefinition[];
    rotationAnchorDate: string | null;
    needsDayTypeReview: boolean;
    label: string;
    key: string;
    /** @deprecated Compatibility alias — dayType when continuous, or legacy rotating */
    scheduleType: SchedulePatternOperatorType | ScheduleDayType | "rotating";
    rotation: SchedulePatternRotation | null;
};

const DAY_TYPE_LABELS: Record<ScheduleDayType, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    hourly: "Hourly",
};

const PATTERN_TYPE_LABELS: Record<SchedulePatternType, string> = {
    continuous: "Every week",
    rotating: "Rotating weeks",
};

export function scheduleDayTypeLabel(type: ScheduleDayType): string {
    return DAY_TYPE_LABELS[type];
}

export function schedulePatternTypeLabel(type: SchedulePatternType): string {
    return PATTERN_TYPE_LABELS[type];
}

/** @deprecated */
export function schedulePatternTypeLabelLegacy(type: SchedulePatternOperatorType): string {
    if (type === "full_day") return "Full Time";
    if (type === "rotating") return "Rotating weeks";
    return scheduleDayTypeLabel(type);
}

export function scheduleTypeKeyFromDayType(type: ScheduleDayType): string {
    return type;
}

export function dayTypeFromScheduleTypeKey(value: string | null | undefined): ScheduleDayType | null {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "part_time" || raw === "part-time" || raw === "parttime") return "part_time";
    if (raw === "hourly" || raw === "hour") return "hourly";
    if (
        raw === "full_time" ||
        raw === "full-time" ||
        raw === "fulltime" ||
        raw === "full_day" ||
        raw === "full-day" ||
        raw === "fullday" ||
        raw === "weekly"
    ) {
        return "full_time";
    }
    return null;
}

/** @deprecated */
export function operatorTypeFromScheduleTypeKey(value: string | null | undefined): SchedulePatternOperatorType {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "rotating" || raw === "rotating_weeks" || raw === "alternate") return "rotating";
    const day = dayTypeFromScheduleTypeKey(value);
    if (day === "part_time") return "part_time";
    if (day === "hourly") return "hourly";
    return "full_day";
}

/** @deprecated */
export function scheduleTypeKeyFromOperatorType(type: SchedulePatternOperatorType): string {
    if (type === "full_day") return "full_time";
    return type;
}

function asTime(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
    const [h, m] = trimmed.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function asIsoDate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return trimmed;
}

export function asWeekdayList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
        (a, b) => a - b,
    );
}

export function isValidScheduleHours(hours: SchedulePatternHours): boolean {
    if (!hours.opensAt || !hours.closesAt) return false;
    return hours.opensAt < hours.closesAt;
}

function weeksFromV1Rotation(
    rotation: SchedulePatternRotation | null,
    hours: SchedulePatternHours,
): ScheduleWeekDefinition[] {
    if (!rotation) {
        return [{ position: 1, days: [], startTime: hours.opensAt, endTime: hours.closesAt }];
    }
    const weeks: ScheduleWeekDefinition[] = [
        { position: 1, days: asWeekdayList(rotation.week1), startTime: hours.opensAt, endTime: hours.closesAt },
    ];
    if (rotation.week2.length > 0 || rotation.week1.length > 0) {
        weeks.push({
            position: 2,
            days: asWeekdayList(rotation.week2),
            startTime: hours.opensAt,
            endTime: hours.closesAt,
        });
    }
    return weeks;
}

/**
 * Deterministic V1 → V2 compatibility.
 * Rotating V1 rows do not invent a Day Type — they require operator review.
 */
export function migrateV1ScheduleMetadata(
    metadata: Record<string, unknown>,
    scheduleTypeKey?: string | null,
): ScheduleDefinitionPresentation {
    const operatorRaw = String(metadata.operator_type ?? scheduleTypeKey ?? "").trim().toLowerCase();
    const hoursRaw =
        metadata.hours != null && typeof metadata.hours === "object" && !Array.isArray(metadata.hours) ?
            (metadata.hours as Record<string, unknown>)
        :   {};
    const hours: SchedulePatternHours = {
        opensAt: asTime(hoursRaw.opens_at ?? metadata.opens_at) ?? asTime(hoursRaw.opensAt),
        closesAt: asTime(hoursRaw.closes_at ?? metadata.closes_at) ?? asTime(hoursRaw.closesAt),
    };
    const rotationRaw =
        metadata.rotation != null && typeof metadata.rotation === "object" && !Array.isArray(metadata.rotation) ?
            (metadata.rotation as Record<string, unknown>)
        :   null;
    const rotation: SchedulePatternRotation | null =
        rotationRaw ?
            {
                week1: asWeekdayList(rotationRaw.week1 ?? metadata.week1_weekdays),
                week2: asWeekdayList(rotationRaw.week2 ?? metadata.week2_weekdays),
            }
        :   null;

    if (operatorRaw === "rotating" || operatorRaw === "rotating_weeks" || operatorRaw === "alternate") {
        return {
            version: SCHEDULE_DEFINITION_METADATA_VERSION,
            dayType: null,
            patternType: "rotating",
            hours,
            weeks: weeksFromV1Rotation(rotation, hours),
            rotationAnchorDate: null,
            needsDayTypeReview: true,
        };
    }

    const dayType = dayTypeFromScheduleTypeKey(operatorRaw) ?? dayTypeFromScheduleTypeKey(scheduleTypeKey) ?? "full_time";
    return {
        version: SCHEDULE_DEFINITION_METADATA_VERSION,
        dayType,
        patternType: "continuous",
        hours,
        weeks: [
            {
                position: 1,
                days: [],
                startTime: hours.opensAt,
                endTime: hours.closesAt,
            },
        ],
        rotationAnchorDate: null,
        needsDayTypeReview: false,
    };
}

export function readScheduleDefinitionPresentation(
    metadata: Record<string, unknown> | null | undefined,
    scheduleTypeKey?: string | null,
    weekdays?: readonly number[],
): ScheduleDefinitionPresentation {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const version = Number(record.version ?? 0);

    if (version >= 2 || record.day_type != null || record.pattern_type != null) {
        const patternType: SchedulePatternType =
            String(record.pattern_type ?? "").toLowerCase() === "rotating" ? "rotating" : "continuous";
        const dayType =
            dayTypeFromScheduleTypeKey(
                record.day_type != null ? String(record.day_type) : scheduleTypeKey,
            ) ?? null;
        const hoursRaw =
            record.hours != null && typeof record.hours === "object" && !Array.isArray(record.hours) ?
                (record.hours as Record<string, unknown>)
            :   {};
        const hours: SchedulePatternHours = {
            opensAt: asTime(hoursRaw.opens_at ?? hoursRaw.opensAt),
            closesAt: asTime(hoursRaw.closes_at ?? hoursRaw.closesAt),
        };
        let weeks: ScheduleWeekDefinition[] = [];
        if (Array.isArray(record.weeks)) {
            weeks = record.weeks
                .map((entry, index) => {
                    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
                    const row = entry as Record<string, unknown>;
                    return {
                        position: Number(row.position) > 0 ? Number(row.position) : index + 1,
                        days: asWeekdayList(row.days ?? row.weekdays),
                        startTime: asTime(row.start_time ?? row.startTime) ?? hours.opensAt,
                        endTime: asTime(row.end_time ?? row.endTime) ?? hours.closesAt,
                    } satisfies ScheduleWeekDefinition;
                })
                .filter((week): week is ScheduleWeekDefinition => week != null)
                .sort((a, b) => a.position - b.position)
                .map((week, index) => ({ ...week, position: index + 1 }));
        }
        if (weeks.length === 0) {
            weeks = [
                {
                    position: 1,
                    days: asWeekdayList(weekdays),
                    startTime: hours.opensAt,
                    endTime: hours.closesAt,
                },
            ];
        }
        const needsDayTypeReview = patternType === "rotating" && dayType == null;
        return {
            version: SCHEDULE_DEFINITION_METADATA_VERSION,
            dayType,
            patternType,
            hours:
                patternType === "continuous" ?
                    {
                        opensAt: weeks[0]?.startTime ?? hours.opensAt,
                        closesAt: weeks[0]?.endTime ?? hours.closesAt,
                    }
                :   hours,
            weeks,
            rotationAnchorDate: asIsoDate(record.rotation_anchor_date ?? record.rotationAnchorDate),
            needsDayTypeReview,
        };
    }

    // V1 or bare native columns
    if (record.operator_type != null || record.hours != null || record.rotation != null) {
        const migrated = migrateV1ScheduleMetadata(record, scheduleTypeKey);
        if (migrated.patternType === "continuous" && weekdays && weekdays.length > 0) {
            migrated.weeks = [
                {
                    position: 1,
                    days: asWeekdayList(weekdays),
                    startTime: migrated.hours.opensAt,
                    endTime: migrated.hours.closesAt,
                },
            ];
        }
        return migrated;
    }

    const dayType = dayTypeFromScheduleTypeKey(scheduleTypeKey);
    const isRotatingKey = String(scheduleTypeKey ?? "").toLowerCase() === "rotating";
    return {
        version: SCHEDULE_DEFINITION_METADATA_VERSION,
        dayType: isRotatingKey ? null : dayType ?? "full_time",
        patternType: isRotatingKey ? "rotating" : "continuous",
        hours: { opensAt: null, closesAt: null },
        weeks: [
            {
                position: 1,
                days: asWeekdayList(weekdays),
                startTime: null,
                endTime: null,
            },
        ],
        rotationAnchorDate: null,
        needsDayTypeReview: isRotatingKey,
    };
}

/** @deprecated Prefer readScheduleDefinitionPresentation */
export function readSchedulePatternPresentation(
    metadata: Record<string, unknown> | null | undefined,
    scheduleTypeKey?: string | null,
): SchedulePatternPresentation {
    const def = readScheduleDefinitionPresentation(metadata, scheduleTypeKey);
    const operatorType: SchedulePatternOperatorType =
        def.patternType === "rotating" ? "rotating"
        : def.dayType === "part_time" ? "part_time"
        : def.dayType === "hourly" ? "hourly"
        : "full_day";
    return {
        version: SCHEDULE_DEFINITION_METADATA_VERSION,
        operatorType,
        hours: def.hours,
        rotation:
            def.patternType === "rotating" ?
                {
                    week1: def.weeks[0]?.days ?? [],
                    week2: def.weeks[1]?.days ?? [],
                }
            :   null,
    };
}

export function writeScheduleDefinitionMetadata(input: {
    existing?: Record<string, unknown> | null;
    dayType: ScheduleDayType | null;
    patternType: SchedulePatternType;
    hours: SchedulePatternHours;
    weeks: ScheduleWeekDefinition[];
    rotationAnchorDate?: string | null;
}): Record<string, unknown> {
    const base =
        input.existing != null && typeof input.existing === "object" && !Array.isArray(input.existing) ?
            { ...input.existing }
        :   {};
    const weeks = input.weeks
        .slice(0, SCHEDULE_ROTATION_WEEK_MAX)
        .map((week, index) => ({
            position: index + 1,
            days: asWeekdayList(week.days),
            start_time: week.startTime,
            end_time: week.endTime,
        }));

    base.version = SCHEDULE_DEFINITION_METADATA_VERSION;
    if (input.dayType) base.day_type = input.dayType;
    else delete base.day_type;
    base.pattern_type = input.patternType;
    base.hours = {
        opens_at: input.hours.opensAt,
        closes_at: input.hours.closesAt,
    };
    base.weeks = weeks;
    if (input.patternType === "rotating" && input.rotationAnchorDate) {
        base.rotation_anchor_date = input.rotationAnchorDate;
    } else {
        delete base.rotation_anchor_date;
    }
    // Drop V1 keys so consumers prefer V2.
    delete base.operator_type;
    delete base.rotation;
    delete base.week1_weekdays;
    delete base.week2_weekdays;
    return base;
}

/** @deprecated Prefer writeScheduleDefinitionMetadata */
export function writeSchedulePatternMetadata(input: {
    existing?: Record<string, unknown> | null;
    operatorType: SchedulePatternOperatorType;
    hours: SchedulePatternHours;
    rotation: SchedulePatternRotation | null;
}): Record<string, unknown> {
    if (input.operatorType === "rotating") {
        return writeScheduleDefinitionMetadata({
            existing: input.existing,
            dayType: null,
            patternType: "rotating",
            hours: input.hours,
            weeks: weeksFromV1Rotation(input.rotation, input.hours),
        });
    }
    const dayType: ScheduleDayType =
        input.operatorType === "part_time" ? "part_time"
        : input.operatorType === "hourly" ? "hourly"
        : "full_time";
    return writeScheduleDefinitionMetadata({
        existing: input.existing,
        dayType,
        patternType: "continuous",
        hours: input.hours,
        weeks: [
            {
                position: 1,
                days: [],
                startTime: input.hours.opensAt,
                endTime: input.hours.closesAt,
            },
        ],
    });
}

export function resolveScheduleDefinitionWeekdays(input: {
    patternType: SchedulePatternType;
    weeks: ScheduleWeekDefinition[];
    weekdays?: number[];
}): number[] {
    if (input.patternType === "rotating") {
        return asWeekdayList(input.weeks.flatMap((week) => week.days));
    }
    if (input.weeks[0]) return asWeekdayList(input.weeks[0].days);
    return asWeekdayList(input.weekdays);
}

/** @deprecated */
export function resolveSchedulePatternWeekdays(input: {
    operatorType: SchedulePatternOperatorType;
    weekdays: number[];
    rotation: SchedulePatternRotation | null;
}): number[] {
    if (input.operatorType === "rotating") {
        return resolveScheduleDefinitionWeekdays({
            patternType: "rotating",
            weeks: weeksFromV1Rotation(input.rotation, { opensAt: null, closesAt: null }),
        });
    }
    return asWeekdayList(input.weekdays);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatWeekdayList(weekdays: readonly number[]): string {
    if (weekdays.length === 0) return "No days";
    if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "Mon–Fri";
    return weekdays.map((d) => WEEKDAY_SHORT[d] ?? String(d)).join(", ");
}

export function formatSchedulePatternHours(hours: SchedulePatternHours): string | null {
    if (!hours.opensAt && !hours.closesAt) return null;
    if (hours.opensAt && hours.closesAt) return `${hours.opensAt}–${hours.closesAt}`;
    if (hours.opensAt) return `From ${hours.opensAt}`;
    return `Until ${hours.closesAt}`;
}

export function formatScheduleDefinitionSummary(input: {
    label: string;
    scheduleTypeKey: string | null | undefined;
    weekdays: number[];
    metadata: Record<string, unknown> | null | undefined;
}): string {
    const def = readScheduleDefinitionPresentation(input.metadata, input.scheduleTypeKey, input.weekdays);
    const dayLabel = def.dayType ? scheduleDayTypeLabel(def.dayType) : "Day type needed";
    if (def.patternType === "rotating") {
        const cycle = `${def.weeks.length}-week rotation`;
        const weekBits = def.weeks
            .map((week) => `Wk${week.position} ${formatWeekdayList(week.days)}`)
            .join(" · ");
        return [dayLabel, cycle, weekBits].filter(Boolean).join(" · ");
    }
    const days = formatWeekdayList(def.weeks[0]?.days?.length ? def.weeks[0].days : input.weekdays);
    const hours = formatSchedulePatternHours({
        opensAt: def.weeks[0]?.startTime ?? def.hours.opensAt,
        closesAt: def.weeks[0]?.endTime ?? def.hours.closesAt,
    });
    return [dayLabel, schedulePatternTypeLabel("continuous"), days, hours].filter(Boolean).join(" · ");
}

/** @deprecated Prefer formatScheduleDefinitionSummary */
export function formatSchedulePatternSummary(input: {
    label: string;
    scheduleTypeKey: string | null | undefined;
    weekdays: number[];
    metadata: Record<string, unknown> | null | undefined;
}): string {
    return formatScheduleDefinitionSummary(input);
}

export function toSchedulePatternSchedulingContract(input: {
    label: string;
    key: string;
    scheduleTypeKey: string | null | undefined;
    weekdays: number[];
    metadata: Record<string, unknown> | null | undefined;
}): SchedulePatternSchedulingContract {
    const def = readScheduleDefinitionPresentation(input.metadata, input.scheduleTypeKey, input.weekdays);
    const scheduleType: SchedulePatternSchedulingContract["scheduleType"] =
        def.patternType === "rotating" && !def.dayType ? "rotating"
        : def.dayType === "part_time" ? "part_time"
        : def.dayType === "hourly" ? "hourly"
        : def.dayType === "full_time" ? "full_time"
        : "full_day";
    return {
        dayType: def.dayType,
        patternType: def.patternType,
        days: [...input.weekdays],
        hours: def.hours,
        weeks: def.weeks,
        rotationAnchorDate: def.rotationAnchorDate,
        needsDayTypeReview: def.needsDayTypeReview,
        label: input.label,
        key: input.key,
        scheduleType,
        rotation:
            def.patternType === "rotating" ?
                {
                    week1: def.weeks[0]?.days ?? [],
                    week2: def.weeks[1]?.days ?? [],
                }
            :   null,
    };
}

/**
 * Rotation begins (rotation_anchor_date) is required for rotating Patterns.
 * Week 1 contains the anchor date. Platform default week-start is Sunday (weekday 0)
 * unless Location/org week-start config exists.
 */
export const ROTATION_ANCHOR_SCHEDULING_BLOCKER =
    "Rotating Patterns require Rotation begins (ISO date). Week 1 contains that date; projection uses Location week-start (platform default: Sunday).";

export const PLATFORM_DEFAULT_WEEK_START_WEEKDAY = 0 as const; // Sunday

export function isValidRotationAnchorDate(value: string | null | undefined): boolean {
    if (typeof value !== "string") return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Which rotation week (1-based) applies on `asOfYmd` given an anchor date.
 * Week 1 contains the calendar week of the anchor (week starts on weekStartWeekday).
 */
export function resolveRotationWeekPosition(input: {
    asOfYmd: string;
    rotationAnchorDate: string;
    weekCount: number;
    weekStartWeekday?: number;
}): number | null {
    if (!isValidRotationAnchorDate(input.asOfYmd) || !isValidRotationAnchorDate(input.rotationAnchorDate)) {
        return null;
    }
    const weekCount = Math.max(1, Math.floor(input.weekCount));
    const weekStart = Number.isInteger(input.weekStartWeekday) ?
        Math.min(6, Math.max(0, input.weekStartWeekday as number))
    :   PLATFORM_DEFAULT_WEEK_START_WEEKDAY;

    const toUtcDate = (ymd: string) => {
        const [y, m, d] = ymd.split("-").map(Number);
        return Date.UTC(y!, m! - 1, d!);
    };
    const startOfWeek = (ymd: string) => {
        const ms = toUtcDate(ymd);
        const day = new Date(ms).getUTCDay();
        const delta = (day - weekStart + 7) % 7;
        return ms - delta * 86_400_000;
    };

    const anchorWeek = startOfWeek(input.rotationAnchorDate);
    const asOfWeek = startOfWeek(input.asOfYmd);
    const weeksApart = Math.floor((asOfWeek - anchorWeek) / (7 * 86_400_000));
    const mod = ((weeksApart % weekCount) + weekCount) % weekCount;
    return mod + 1;
}

export function rotatingPatternRequiresAnchor(patternType: SchedulePatternType, anchor: string | null | undefined): boolean {
    if (patternType !== "rotating") return false;
    return !isValidRotationAnchorDate(anchor);
}
