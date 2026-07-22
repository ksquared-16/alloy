"use client";

import { useState } from "react";
import {
    createSchedulePattern,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";
import {
    isValidScheduleHours,
    resolveScheduleDefinitionWeekdays,
    scheduleDayTypeLabel,
    schedulePatternTypeLabel,
    scheduleTypeKeyFromDayType,
    writeScheduleDefinitionMetadata,
    SCHEDULE_ROTATION_WEEK_MAX,
    type ScheduleDayType,
    type SchedulePatternType,
    type ScheduleWeekDefinition,
} from "@/lib/locations/schedulePatternPresentation";

const WEEKDAY_CHIP_SELECTED =
    "rounded-full border border-alloy-bend-pine bg-alloy-bend-pine text-white";
const WEEKDAY_CHIP_IDLE =
    "rounded-full border border-alloy-forge/20 bg-white text-alloy-midnight/55 hover:border-alloy-bend-pine/40 hover:text-alloy-bend-pine";

const DAY_TYPES: ScheduleDayType[] = ["full_time", "part_time", "hourly"];

function patternKey(label: string): string {
    const stem = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 36);
    return `${stem || "schedule"}_${Date.now().toString(36)}`;
}

function emptyWeek(position: number): ScheduleWeekDefinition {
    return { position, days: [], startTime: null, endTime: null };
}

function WeekdayChips({
    selected,
    onToggle,
    testId,
}: {
    selected: number[];
    onToggle: (value: number) => void;
    testId: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5" data-testid={testId}>
            {WEEKDAY_OPTIONS.map((day) => (
                <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected.includes(day.value)}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                        selected.includes(day.value) ? WEEKDAY_CHIP_SELECTED : WEEKDAY_CHIP_IDLE
                    }`}
                    onClick={() => onToggle(day.value)}
                >
                    {day.label}
                </button>
            ))}
        </div>
    );
}

export default function LocationSchedulePatternCreatePanel({
    locationId,
    onCancel,
    onCreated,
}: {
    locationId: string;
    onCancel: () => void;
    onCreated: (pattern: SchedulePatternRow) => void;
}) {
    const [label, setLabel] = useState("");
    const [dayType, setDayType] = useState<ScheduleDayType>("full_time");
    const [patternType, setPatternType] = useState<SchedulePatternType>("continuous");
    const [weeks, setWeeks] = useState<ScheduleWeekDefinition[]>([emptyWeek(1)]);
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleDay = (weekIndex: number, value: number) => {
        setWeeks((current) =>
            current.map((week, index) => {
                if (index !== weekIndex) return week;
                const days = week.days.includes(value) ?
                    week.days.filter((day) => day !== value)
                :   [...week.days, value].sort((a, b) => a - b);
                return { ...week, days };
            }),
        );
    };

    const updateWeekHours = (weekIndex: number, patch: Partial<ScheduleWeekDefinition>) => {
        setWeeks((current) =>
            current.map((week, index) => (index === weekIndex ? { ...week, ...patch } : week)),
        );
    };

    const resolvedWeekdays = resolveScheduleDefinitionWeekdays({ patternType, weeks });
    const primaryHours = {
        opensAt: weeks[0]?.startTime ?? null,
        closesAt: weeks[0]?.endTime ?? null,
    };
    const hoursRequired = dayType !== "hourly";
    const hoursOk =
        !hoursRequired ||
        (patternType === "continuous" ?
            isValidScheduleHours(primaryHours)
        :   weeks.every((week) =>
                isValidScheduleHours({ opensAt: week.startTime, closesAt: week.endTime }),
            ));
    const weeksOk =
        patternType === "continuous" ?
            (weeks[0]?.days.length ?? 0) > 0
        :   weeks.length >= 1 && weeks.every((week) => week.days.length > 0);
    const canSave = Boolean(label.trim()) && weeksOk && hoursOk;

    return (
        <section className="process-config-setup-card space-y-4 p-4" data-testid="locations-schedule-create">
            <div>
                <h2 className="config-typo-workspace-title">Add schedule definition</h2>
                <p className="config-typo-sublabel mt-1">
                    Name the schedule, choose day type and how it repeats, then set days and hours.
                </p>
            </div>

            <label className="block space-y-1.5">
                <span className="config-typo-field-label">Name</span>
                <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="e.g. Full Time · School Week"
                    className="config-runtime-input"
                    autoFocus
                    data-testid="locations-schedule-create-name"
                />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Day type</span>
                    <select
                        value={dayType}
                        onChange={(event) => setDayType(event.target.value as ScheduleDayType)}
                        className="config-runtime-select"
                        data-testid="locations-schedule-create-day-type"
                    >
                        {DAY_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {scheduleDayTypeLabel(type)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Repeats</span>
                    <select
                        value={patternType}
                        onChange={(event) => {
                            const next = event.target.value as SchedulePatternType;
                            setPatternType(next);
                            if (next === "rotating" && weeks.length < 2) {
                                setWeeks([emptyWeek(1), emptyWeek(2)]);
                            }
                            if (next === "continuous") {
                                setWeeks([weeks[0] ?? emptyWeek(1)]);
                            }
                        }}
                        className="config-runtime-select"
                        data-testid="locations-schedule-create-repeats"
                    >
                        <option value="continuous">{schedulePatternTypeLabel("continuous")}</option>
                        <option value="rotating">{schedulePatternTypeLabel("rotating")}</option>
                    </select>
                </label>
            </div>

            {patternType === "rotating" ?
                <p className="text-sm text-alloy-midnight/60" data-testid="locations-schedule-create-cycle">
                    {weeks.length}-week rotation
                </p>
            :   null}

            {weeks.map((week, weekIndex) => (
                <div
                    key={week.position}
                    className="space-y-3 rounded-lg border border-alloy-forge/10 p-3"
                    data-testid={`locations-schedule-create-week-${weekIndex + 1}`}
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-alloy-midnight">
                            {patternType === "rotating" ? `Week ${weekIndex + 1}` : "Available days"}
                        </p>
                        {patternType === "rotating" && weeks.length > 1 ?
                            <ConfigurationSecondaryButton
                                className="px-2 py-1 text-[11px]"
                                onClick={() =>
                                    setWeeks((current) =>
                                        current
                                            .filter((_, index) => index !== weekIndex)
                                            .map((entry, index) => ({ ...entry, position: index + 1 })),
                                    )
                                }
                            >
                                Remove week
                            </ConfigurationSecondaryButton>
                        :   null}
                    </div>
                    <WeekdayChips
                        selected={week.days}
                        testId={
                            patternType === "rotating" ?
                                `locations-schedule-create-week${weekIndex + 1}-days`
                            :   "locations-schedule-create-weekdays"
                        }
                        onToggle={(value) => toggleDay(weekIndex, value)}
                    />
                    <div className="grid max-w-md gap-2 sm:grid-cols-2">
                        <label className="block space-y-1.5">
                            <span className="config-typo-field-label">
                                Start{dayType === "hourly" ? " (optional)" : ""}
                            </span>
                            <input
                                type="time"
                                value={week.startTime ?? ""}
                                onChange={(event) =>
                                    updateWeekHours(weekIndex, { startTime: event.target.value || null })
                                }
                                className="config-runtime-input"
                                data-testid={`locations-schedule-create-week${weekIndex + 1}-start`}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="config-typo-field-label">
                                End{dayType === "hourly" ? " (optional)" : ""}
                            </span>
                            <input
                                type="time"
                                value={week.endTime ?? ""}
                                onChange={(event) =>
                                    updateWeekHours(weekIndex, { endTime: event.target.value || null })
                                }
                                className="config-runtime-input"
                                data-testid={`locations-schedule-create-week${weekIndex + 1}-end`}
                            />
                        </label>
                    </div>
                </div>
            ))}

            {patternType === "rotating" && weeks.length < SCHEDULE_ROTATION_WEEK_MAX ?
                <ConfigurationSecondaryButton
                    className="px-2 py-1 text-[11px]"
                    onClick={() => setWeeks((current) => [...current, emptyWeek(current.length + 1)])}
                    data-testid="locations-schedule-create-add-week"
                >
                    + Add week
                </ConfigurationSecondaryButton>
            :   null}

            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    data-testid="locations-schedule-create-active"
                />
                <span className="config-typo-sublabel">Active schedule</span>
            </label>
            {error ?
                <p role="alert" className="text-sm text-red-800">
                    {error}
                </p>
            :   null}
            <div className="flex flex-wrap gap-2">
                <ConfigurationPrimaryButton
                    className="config-primary-btn--sm"
                    disabled={saving || !canSave}
                    data-testid="locations-schedule-create-save"
                    onClick={() => {
                        void (async () => {
                            setSaving(true);
                            setError(null);
                            try {
                                if (!weeksOk) throw new Error("Select at least one day for each week.");
                                if (!hoursOk) {
                                    throw new Error("End time must be after start time.");
                                }
                                const hours = {
                                    opensAt: weeks[0]?.startTime ?? null,
                                    closesAt: weeks[0]?.endTime ?? null,
                                };
                                const metadata = writeScheduleDefinitionMetadata({
                                    dayType,
                                    patternType,
                                    hours,
                                    weeks,
                                    rotationAnchorDate: null,
                                });
                                const input = {
                                    site_location_id: locationId,
                                    key: patternKey(label),
                                    label: label.trim(),
                                    schedule_type_key: scheduleTypeKeyFromDayType(dayType),
                                    weekdays: resolvedWeekdays,
                                    is_active: active,
                                    metadata,
                                };
                                const created = await createSchedulePattern(input);
                                if (
                                    !mutationResponseContainsPatch(
                                        created as unknown as Record<string, unknown>,
                                        {
                                            site_location_id: input.site_location_id,
                                            label: input.label,
                                            schedule_type_key: input.schedule_type_key,
                                            weekdays: input.weekdays,
                                            is_active: input.is_active,
                                        },
                                    )
                                ) {
                                    throw new Error(
                                        "Schedule creation was not confirmed by the authoritative response.",
                                    );
                                }
                                onCreated(created);
                            } catch (cause) {
                                setError(
                                    cause instanceof Error ? cause.message : "Schedule definition could not be created.",
                                );
                            } finally {
                                setSaving(false);
                            }
                        })();
                    }}
                >
                    {saving ? "Adding…" : "Add schedule definition"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </section>
    );
}
