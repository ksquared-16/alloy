/**
 * Location Scheduling configuration — composable vocabularies + operating days.
 *
 * Owners:
 * - Day Types: Organization option set `childcare_schedule_type` (Location enables)
 * - Schedule Types: Location catalog with fixed behaviors continuous|rotating (labels configurable)
 * - Time Windows: Location catalog of named local hours
 * - Operating days: Location metadata (must not invent a second SoR alongside operating windows)
 * - Patterns: `schedule_patterns` table + schedule_pattern_v3 metadata
 *
 * Stored on `locations.metadata.location_scheduling_v1`.
 */

export const LOCATION_SCHEDULING_CONFIG_VERSION = 1 as const;
export const SCHEDULE_PATTERN_CONTRACT_VERSION = 3 as const;

export type ScheduleRecurrenceBehavior = "continuous" | "rotating";

export type LocationTimeWindow = {
    id: string;
    key: string;
    label: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    sortOrder: number;
};

export type LocationScheduleTypeConfig = {
    id: string;
    key: string;
    label: string;
    behavior: ScheduleRecurrenceBehavior;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
};

export type LocationSchedulingConfig = {
    version: typeof LOCATION_SCHEDULING_CONFIG_VERSION;
    /** Weekdays 0–6 the Location may operate. Empty = all seven allowed until configured. */
    operatingDays: number[];
    /** Enabled Day Type keys from org option set `childcare_schedule_type`. Empty = all active org types. */
    enabledDayTypeKeys: string[];
    scheduleTypes: LocationScheduleTypeConfig[];
    timeWindows: LocationTimeWindow[];
};

export const DEFAULT_SCHEDULE_TYPES: LocationScheduleTypeConfig[] = [
    {
        id: "st_continuous",
        key: "every_week",
        label: "Every Week",
        behavior: "continuous",
        description: "The same scheduled days and hours each week.",
        isActive: true,
        sortOrder: 10,
    },
    {
        id: "st_rotating",
        key: "rotating_weeks",
        label: "Rotating Weeks",
        behavior: "rotating",
        description: "A repeating cycle of weekly day/hour definitions.",
        isActive: true,
        sortOrder: 20,
    },
];

export const DEFAULT_LOCATION_SCHEDULING_CONFIG: LocationSchedulingConfig = {
    version: LOCATION_SCHEDULING_CONFIG_VERSION,
    operatingDays: [],
    enabledDayTypeKeys: [],
    scheduleTypes: DEFAULT_SCHEDULE_TYPES,
    timeWindows: [],
};

function asTime(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
    const [h, m] = trimmed.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function asWeekdays(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
        (a, b) => a - b,
    );
}

function newId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function readLocationSchedulingConfig(
    metadata: Record<string, unknown> | null | undefined,
): LocationSchedulingConfig {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const raw = record.location_scheduling_v1;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULT_LOCATION_SCHEDULING_CONFIG, scheduleTypes: [...DEFAULT_SCHEDULE_TYPES] };
    }
    const cfg = raw as Record<string, unknown>;
    const scheduleTypes = Array.isArray(cfg.schedule_types)
        ? cfg.schedule_types
              .map((entry, index) => {
                  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
                  const row = entry as Record<string, unknown>;
                  const behavior =
                      String(row.behavior ?? "").toLowerCase() === "rotating" ? "rotating" : "continuous";
                  const label = String(row.label ?? "").trim();
                  const key = String(row.key ?? "").trim() || behavior;
                  if (!label) return null;
                  return {
                      id: String(row.id ?? "").trim() || newId("st"),
                      key,
                      label,
                      behavior: behavior as ScheduleRecurrenceBehavior,
                      description: String(row.description ?? "").trim() || null,
                      isActive: row.is_active !== false,
                      sortOrder: Number(row.sort_order) || (index + 1) * 10,
                  } satisfies LocationScheduleTypeConfig;
              })
              .filter((row): row is LocationScheduleTypeConfig => row != null)
        : [...DEFAULT_SCHEDULE_TYPES];

    const timeWindows = Array.isArray(cfg.time_windows)
        ? cfg.time_windows
              .map((entry, index) => {
                  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
                  const row = entry as Record<string, unknown>;
                  const label = String(row.label ?? "").trim();
                  const startTime = asTime(row.start_time ?? row.startTime);
                  const endTime = asTime(row.end_time ?? row.endTime);
                  if (!label || !startTime || !endTime) return null;
                  return {
                      id: String(row.id ?? "").trim() || newId("tw"),
                      key: String(row.key ?? "").trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                      label,
                      startTime,
                      endTime,
                      isActive: row.is_active !== false,
                      sortOrder: Number(row.sort_order) || (index + 1) * 10,
                  } satisfies LocationTimeWindow;
              })
              .filter((row): row is LocationTimeWindow => row != null)
        : [];

    return {
        version: LOCATION_SCHEDULING_CONFIG_VERSION,
        operatingDays: asWeekdays(cfg.operating_days),
        enabledDayTypeKeys: Array.isArray(cfg.enabled_day_type_keys)
            ? [...new Set(cfg.enabled_day_type_keys.map((v) => String(v ?? "").trim()).filter(Boolean))]
            : [],
        scheduleTypes: scheduleTypes.length > 0 ? scheduleTypes : [...DEFAULT_SCHEDULE_TYPES],
        timeWindows,
    };
}

export function writeLocationSchedulingConfig(
    existingMetadata: Record<string, unknown> | null | undefined,
    config: LocationSchedulingConfig,
): Record<string, unknown> {
    const base =
        existingMetadata != null && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
            ? { ...existingMetadata }
            : {};
    base.location_scheduling_v1 = {
        version: LOCATION_SCHEDULING_CONFIG_VERSION,
        operating_days: asWeekdays(config.operatingDays),
        enabled_day_type_keys: [...config.enabledDayTypeKeys],
        schedule_types: config.scheduleTypes.map((row, index) => ({
            id: row.id,
            key: row.key,
            label: row.label,
            behavior: row.behavior,
            description: row.description,
            is_active: row.isActive,
            sort_order: row.sortOrder || (index + 1) * 10,
        })),
        time_windows: config.timeWindows.map((row, index) => ({
            id: row.id,
            key: row.key,
            label: row.label,
            start_time: row.startTime,
            end_time: row.endTime,
            is_active: row.isActive,
            sort_order: row.sortOrder || (index + 1) * 10,
        })),
    };
    return base;
}

export function allowedPatternWeekdays(operatingDays: readonly number[]): number[] {
    if (operatingDays.length === 0) return [0, 1, 2, 3, 4, 5, 6];
    return asWeekdays(operatingDays);
}

export function createTimeWindow(input: {
    label: string;
    startTime: string;
    endTime: string;
}): LocationTimeWindow {
    const label = input.label.trim();
    return {
        id: newId("tw"),
        key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "hours",
        label,
        startTime: asTime(input.startTime) ?? "08:00",
        endTime: asTime(input.endTime) ?? "17:00",
        isActive: true,
        sortOrder: 100,
    };
}

export function renameScheduleTypeLabel(
    types: LocationScheduleTypeConfig[],
    id: string,
    label: string,
): LocationScheduleTypeConfig[] {
    const next = label.trim();
    if (!next) return types;
    return types.map((row) => (row.id === id ? { ...row, label: next } : row));
}

/** Behavior is immutable once defined — labels may change. */
export function scheduleTypeBehaviorLocked(type: LocationScheduleTypeConfig): ScheduleRecurrenceBehavior {
    return type.behavior;
}

export type DayTypeOption = { key: string; label: string; isActive: boolean };

export function resolveEnabledDayTypes(
    orgDayTypes: readonly DayTypeOption[],
    enabledKeys: readonly string[],
): DayTypeOption[] {
    const active = orgDayTypes.filter((row) => row.isActive);
    if (enabledKeys.length === 0) return active;
    const allowed = new Set(enabledKeys);
    return active.filter((row) => allowed.has(row.key));
}

/** LPC metadata: eligible Schedule Pattern IDs for this offering. */
export function readEligibleSchedulePatternIds(
    metadata: Record<string, unknown> | null | undefined,
): string[] {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    if (!Array.isArray(record.eligible_schedule_pattern_ids)) return [];
    return [...new Set(record.eligible_schedule_pattern_ids.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

export function writeEligibleSchedulePatternIds(
    existing: Record<string, unknown> | null | undefined,
    patternIds: readonly string[],
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
    base.eligible_schedule_pattern_ids = [...new Set(patternIds.map((id) => id.trim()).filter(Boolean))];
    return base;
}

/**
 * Scheduling eligibility resolution for the next sprint:
 * eligible = Program Offering.eligible_schedule_pattern_ids
 *          ∩ Patterns active at Location
 *          ∩ (optional) Room.default or Rooms supporting Program key
 */
export function resolveEligiblePatternsForProgramRoom(input: {
    offeringPatternIds: readonly string[];
    locationPatternIds: readonly string[];
    roomDefaultPatternId: string | null;
    roomSupportsProgram: boolean;
}): { patternIds: string[]; roomDefaultIncluded: boolean } {
    const locationSet = new Set(input.locationPatternIds);
    const fromOffering = input.offeringPatternIds.filter((id) => locationSet.has(id));
    const patternIds =
        fromOffering.length > 0 ? fromOffering : input.locationPatternIds.filter((id) => locationSet.has(id));
    if (!input.roomSupportsProgram) {
        return { patternIds: [], roomDefaultIncluded: false };
    }
    return {
        patternIds,
        roomDefaultIncluded: Boolean(
            input.roomDefaultPatternId && patternIds.includes(input.roomDefaultPatternId),
        ),
    };
}
