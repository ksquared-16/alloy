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
    operatorTypeFromScheduleTypeKey,
    resolveSchedulePatternWeekdays,
    schedulePatternTypeLabel,
    scheduleTypeKeyFromOperatorType,
    writeSchedulePatternMetadata,
    type SchedulePatternOperatorType,
} from "@/lib/locations/schedulePatternPresentation";

const WEEKDAY_CHIP_SELECTED =
    "rounded-full border border-alloy-bend-pine bg-alloy-bend-pine text-white";
const WEEKDAY_CHIP_IDLE =
    "rounded-full border border-alloy-forge/20 bg-white text-alloy-midnight/55 hover:border-alloy-bend-pine/40 hover:text-alloy-bend-pine";

const OPERATOR_TYPES: SchedulePatternOperatorType[] = ["full_day", "part_time", "hourly", "rotating"];

function patternKey(label: string): string {
    const stem = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 36);
    return `${stem || "schedule"}_${Date.now().toString(36)}`;
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
    const [operatorType, setOperatorType] = useState<SchedulePatternOperatorType>("full_day");
    const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [week1, setWeek1] = useState<number[]>([1, 2, 3, 4, 5]);
    const [week2, setWeek2] = useState<number[]>([1, 2, 3]);
    const [opensAt, setOpensAt] = useState("08:00");
    const [closesAt, setClosesAt] = useState("17:00");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleList = (value: number, setter: (next: number[]) => void, current: number[]) => {
        setter(
            current.includes(value) ?
                current.filter((day) => day !== value)
            :   [...current, value].sort((a, b) => a - b),
        );
    };

    const hoursRequired = operatorType === "full_day" || operatorType === "part_time";
    const resolvedWeekdays = resolveSchedulePatternWeekdays({
        operatorType,
        weekdays,
        rotation: operatorType === "rotating" ? { week1, week2 } : null,
    });
    const canSave =
        Boolean(label.trim()) &&
        resolvedWeekdays.length > 0 &&
        (!hoursRequired || (Boolean(opensAt.trim()) && Boolean(closesAt.trim())));

    return (
        <section className="process-config-setup-card space-y-4 p-4" data-testid="locations-schedule-create">
            <div>
                <h2 className="config-typo-workspace-title">Add schedule pattern</h2>
                <p className="config-typo-sublabel mt-1">Reusable days and hours for this location.</p>
            </div>
            <label className="block space-y-1.5">
                <span className="config-typo-field-label">Pattern name</span>
                <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="e.g. Full day"
                    className="config-runtime-input"
                    autoFocus
                    data-testid="locations-schedule-create-name"
                />
            </label>
            <label className="block max-w-xs space-y-1.5">
                <span className="config-typo-field-label">Type</span>
                <select
                    value={operatorType}
                    onChange={(event) => setOperatorType(operatorTypeFromScheduleTypeKey(event.target.value))}
                    className="config-runtime-select"
                    data-testid="locations-schedule-create-type"
                >
                    {OPERATOR_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {schedulePatternTypeLabel(type)}
                        </option>
                    ))}
                </select>
            </label>
            {operatorType === "rotating" ?
                <div className="space-y-3">
                    <div className="space-y-2">
                        <span className="config-typo-field-label">Week 1 days</span>
                        <WeekdayChips
                            selected={week1}
                            testId="locations-schedule-create-week1"
                            onToggle={(value) => toggleList(value, setWeek1, week1)}
                        />
                    </div>
                    <div className="space-y-2">
                        <span className="config-typo-field-label">Week 2 days</span>
                        <WeekdayChips
                            selected={week2}
                            testId="locations-schedule-create-week2"
                            onToggle={(value) => toggleList(value, setWeek2, week2)}
                        />
                    </div>
                </div>
            :   <div className="space-y-2">
                    <span className="config-typo-field-label">Available days</span>
                    <WeekdayChips
                        selected={weekdays}
                        testId="locations-schedule-create-weekdays"
                        onToggle={(value) => toggleList(value, setWeekdays, weekdays)}
                    />
                </div>
            }
            <div className="grid max-w-md gap-2 sm:grid-cols-2">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">
                        Opens{hoursRequired ? "" : " (optional)"}
                    </span>
                    <input
                        type="time"
                        value={opensAt}
                        onChange={(event) => setOpensAt(event.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-schedule-create-opens-at"
                    />
                </label>
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">
                        Closes{hoursRequired ? "" : " (optional)"}
                    </span>
                    <input
                        type="time"
                        value={closesAt}
                        onChange={(event) => setClosesAt(event.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-schedule-create-closes-at"
                    />
                </label>
            </div>
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    data-testid="locations-schedule-create-active"
                />
                <span className="config-typo-sublabel">Active pattern</span>
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
                                const scheduleTypeKey = scheduleTypeKeyFromOperatorType(operatorType);
                                const metadata = writeSchedulePatternMetadata({
                                    operatorType,
                                    hours: {
                                        opensAt: opensAt.trim() || null,
                                        closesAt: closesAt.trim() || null,
                                    },
                                    rotation: operatorType === "rotating" ? { week1, week2 } : null,
                                });
                                const input = {
                                    site_location_id: locationId,
                                    key: patternKey(label),
                                    label: label.trim(),
                                    schedule_type_key: scheduleTypeKey,
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
                                    cause instanceof Error ? cause.message : "Schedule pattern could not be created.",
                                );
                            } finally {
                                setSaving(false);
                            }
                        })();
                    }}
                >
                    {saving ? "Adding…" : "Add schedule pattern"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </section>
    );
}
