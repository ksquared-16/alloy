/**
 * Schedule pattern presentation — hours + rotating weeks in metadata.
 * Native columns remain weekdays + schedule_type_key; metadata carries Scheduling-ready detail.
 */

export const SCHEDULE_PATTERN_METADATA_VERSION = 1 as const;

export type SchedulePatternOperatorType = "full_day" | "part_time" | "hourly" | "rotating";

export type SchedulePatternHours = {
    opensAt: string | null;
    closesAt: string | null;
};

export type SchedulePatternRotation = {
    week1: number[];
    week2: number[];
};

export type SchedulePatternPresentation = {
    version: typeof SCHEDULE_PATTERN_METADATA_VERSION;
    operatorType: SchedulePatternOperatorType;
    hours: SchedulePatternHours;
    rotation: SchedulePatternRotation | null;
};

export type SchedulePatternSchedulingContract = {
    scheduleType: SchedulePatternOperatorType;
    days: number[];
    hours: SchedulePatternHours;
    rotation: SchedulePatternRotation | null;
    label: string;
    key: string;
};

const TYPE_LABELS: Record<SchedulePatternOperatorType, string> = {
    full_day: "Full Day",
    part_time: "Part Time",
    hourly: "Hourly",
    rotating: "Rotating",
};

const TYPE_TO_KEY: Record<SchedulePatternOperatorType, string> = {
    full_day: "full_day",
    part_time: "part_time",
    hourly: "hourly",
    rotating: "rotating",
};

export function schedulePatternTypeLabel(type: SchedulePatternOperatorType): string {
    return TYPE_LABELS[type];
}

export function scheduleTypeKeyFromOperatorType(type: SchedulePatternOperatorType): string {
    return TYPE_TO_KEY[type];
}

export function operatorTypeFromScheduleTypeKey(value: string | null | undefined): SchedulePatternOperatorType {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "part_time" || raw === "part-time" || raw === "parttime") return "part_time";
    if (raw === "hourly" || raw === "hour") return "hourly";
    if (raw === "rotating" || raw === "rotating_weeks" || raw === "alternate") return "rotating";
    if (raw === "full_day" || raw === "full-day" || raw === "fullday" || raw === "weekly") return "full_day";
    return "full_day";
}

function asTime(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
    const [h, m] = trimmed.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function asWeekdayList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
        (a, b) => a - b,
    );
}

export function readSchedulePatternPresentation(
    metadata: Record<string, unknown> | null | undefined,
    scheduleTypeKey?: string | null,
): SchedulePatternPresentation {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const operatorType =
        record.operator_type != null
            ? operatorTypeFromScheduleTypeKey(String(record.operator_type))
            : operatorTypeFromScheduleTypeKey(scheduleTypeKey);
    const hoursRaw =
        record.hours != null && typeof record.hours === "object" && !Array.isArray(record.hours) ?
            (record.hours as Record<string, unknown>)
        :   {};
    const rotationRaw =
        record.rotation != null && typeof record.rotation === "object" && !Array.isArray(record.rotation) ?
            (record.rotation as Record<string, unknown>)
        :   null;
    return {
        version: SCHEDULE_PATTERN_METADATA_VERSION,
        operatorType,
        hours: {
            opensAt: asTime(hoursRaw.opens_at ?? record.opens_at) ?? asTime(hoursRaw.opensAt),
            closesAt: asTime(hoursRaw.closes_at ?? record.closes_at) ?? asTime(hoursRaw.closesAt),
        },
        rotation:
            operatorType === "rotating" ?
                {
                    week1: asWeekdayList(rotationRaw?.week1 ?? record.week1_weekdays),
                    week2: asWeekdayList(rotationRaw?.week2 ?? record.week2_weekdays),
                }
            :   null,
    };
}

export function writeSchedulePatternMetadata(input: {
    existing?: Record<string, unknown> | null;
    operatorType: SchedulePatternOperatorType;
    hours: SchedulePatternHours;
    rotation: SchedulePatternRotation | null;
}): Record<string, unknown> {
    const base =
        input.existing != null && typeof input.existing === "object" && !Array.isArray(input.existing) ?
            { ...input.existing }
        :   {};
    base.version = SCHEDULE_PATTERN_METADATA_VERSION;
    base.operator_type = input.operatorType;
    base.hours = {
        opens_at: input.hours.opensAt,
        closes_at: input.hours.closesAt,
    };
    if (input.operatorType === "rotating" && input.rotation) {
        base.rotation = {
            week1: [...input.rotation.week1].sort((a, b) => a - b),
            week2: [...input.rotation.week2].sort((a, b) => a - b),
        };
    } else {
        delete base.rotation;
        delete base.week1_weekdays;
        delete base.week2_weekdays;
    }
    return base;
}

/** Union of weekdays for the native column (required non-empty by DB). */
export function resolveSchedulePatternWeekdays(input: {
    operatorType: SchedulePatternOperatorType;
    weekdays: number[];
    rotation: SchedulePatternRotation | null;
}): number[] {
    if (input.operatorType === "rotating" && input.rotation) {
        return [...new Set([...input.rotation.week1, ...input.rotation.week2])]
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            .sort((a, b) => a - b);
    }
    return [...new Set(input.weekdays)]
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);
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

export function formatSchedulePatternSummary(input: {
    label: string;
    scheduleTypeKey: string | null | undefined;
    weekdays: number[];
    metadata: Record<string, unknown> | null | undefined;
}): string {
    const presentation = readSchedulePatternPresentation(input.metadata, input.scheduleTypeKey);
    const typeLabel = schedulePatternTypeLabel(presentation.operatorType);
    const days =
        presentation.operatorType === "rotating" && presentation.rotation ?
            `Wk1 ${formatWeekdayList(presentation.rotation.week1)} · Wk2 ${formatWeekdayList(presentation.rotation.week2)}`
        :   formatWeekdayList(input.weekdays);
    const hours = formatSchedulePatternHours(presentation.hours);
    return [typeLabel, days, hours].filter(Boolean).join(" · ");
}

/** Shape Scheduling can consume without a translation layer. */
export function toSchedulePatternSchedulingContract(input: {
    label: string;
    key: string;
    scheduleTypeKey: string | null | undefined;
    weekdays: number[];
    metadata: Record<string, unknown> | null | undefined;
}): SchedulePatternSchedulingContract {
    const presentation = readSchedulePatternPresentation(input.metadata, input.scheduleTypeKey);
    return {
        scheduleType: presentation.operatorType,
        days: [...input.weekdays],
        hours: presentation.hours,
        rotation: presentation.rotation,
        label: input.label,
        key: input.key,
    };
}
