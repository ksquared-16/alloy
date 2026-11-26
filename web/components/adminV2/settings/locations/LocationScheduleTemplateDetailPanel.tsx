"use client";

import { useEffect, useState } from "react";
import {
    patchSchedulePattern,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigConsequenceLine,
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";
import {
    formatScheduleDefinitionSummary,
    formatSchedulePatternHours,
    formatWeekdayList,
    isValidScheduleHours,
    isValidRotationAnchorDate,
    readScheduleDefinitionPresentation,
    resolveScheduleDefinitionWeekdays,
    rotatingPatternRequiresAnchor,
    scheduleDayTypeLabel,
    schedulePatternTypeLabel,
    scheduleTypeKeyFromDayType,
    writeScheduleDefinitionMetadata,
    ROTATION_ANCHOR_SCHEDULING_BLOCKER,
    SCHEDULE_ROTATION_WEEK_MAX,
    type ScheduleDayType,
    type SchedulePatternType,
    type ScheduleWeekDefinition,
} from "@/lib/locations/schedulePatternPresentation";
import { allowedPatternWeekdays } from "@/lib/locations/locationSchedulingConfig";

const WEEKDAY_CHIP_SELECTED =
    "rounded-full border border-alloy-bend-pine bg-alloy-bend-pine text-white";
const WEEKDAY_CHIP_IDLE =
    "rounded-full border border-alloy-forge/20 bg-white text-alloy-midnight/55 hover:border-alloy-bend-pine/40 hover:text-alloy-bend-pine";
const WEEKDAY_CHIP_DISABLED =
    "rounded-full border border-alloy-forge/10 bg-alloy-stone/[0.04] text-alloy-midnight/25 cursor-not-allowed";

const DAY_TYPES: ScheduleDayType[] = ["full_time", "part_time", "hourly"];

function emptyWeek(position: number): ScheduleWeekDefinition {
    return { position, days: [], startTime: null, endTime: null };
}

function WeekdayChips({
    selected,
    allowedDays,
    disabled,
    onToggle,
    testId,
}: {
    selected: number[];
    allowedDays: number[];
    disabled?: boolean;
    onToggle: (value: number) => void;
    testId: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5" data-testid={testId}>
            {WEEKDAY_OPTIONS.map((day) => {
                const allowed = allowedDays.includes(day.value);
                return (
                    <button
                        key={day.value}
                        type="button"
                        disabled={disabled || !allowed}
                        aria-pressed={selected.includes(day.value)}
                        className={`px-2.5 py-1 text-xs font-semibold ${
                            !allowed ? WEEKDAY_CHIP_DISABLED
                            : selected.includes(day.value) ? WEEKDAY_CHIP_SELECTED
                            : WEEKDAY_CHIP_IDLE
                        }`}
                        onClick={() => {
                            if (allowed) onToggle(day.value);
                        }}
                    >
                        {day.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function LocationScheduleTemplateDetailPanel({
    pattern,
    siteLabel,
    canMutate,
    operatingDays,
    onUpdated,
    onError,
}: {
    pattern: SchedulePatternRow | null;
    siteLabel: string;
    canMutate: boolean;
    operatingDays?: readonly number[] | null;
    onUpdated: (row: SchedulePatternRow) => void;
    onError: (message: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [dayType, setDayType] = useState<ScheduleDayType | "">("");
    const [patternType, setPatternType] = useState<SchedulePatternType>("continuous");
    const [weeks, setWeeks] = useState<ScheduleWeekDefinition[]>([emptyWeek(1)]);
    const [rotationAnchorDate, setRotationAnchorDate] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const allowedDays = allowedPatternWeekdays(operatingDays ?? []);

    const hydrate = (next: SchedulePatternRow) => {
        const presentation = readScheduleDefinitionPresentation(
            next.metadata ?? null,
            next.schedule_type_key,
            next.weekdays,
        );
        setLabel(next.label);
        setDayType(presentation.dayType ?? "");
        setPatternType(presentation.patternType);
        setRotationAnchorDate(presentation.rotationAnchorDate ?? "");
        setWeeks(
            presentation.weeks.length > 0 ?
                presentation.weeks
            :   [
                    {
                        position: 1,
                        days: [...next.weekdays],
                        startTime: presentation.hours.opensAt,
                        endTime: presentation.hours.closesAt,
                    },
                ],
        );
        setActive(next.is_active);
    };

    useEffect(() => {
        if (!pattern) return;
        hydrate(pattern);
        // Enter edit mode when the operator can mutate so header Save matches Studio Patterns.
        setEditing(canMutate);
    }, [pattern, canMutate]);

    if (!pattern) {
        return (
            <ConfigurationEmptyState
                testId="locations-schedule-workspace-empty"
                title="Select a schedule definition"
                description="Choose a schedule to review day type, repeats, days, and hours."
            />
        );
    }

    const presentation = readScheduleDefinitionPresentation(
        pattern.metadata ?? null,
        pattern.schedule_type_key,
        pattern.weekdays,
    );
    const summary = formatScheduleDefinitionSummary({
        label: pattern.label,
        scheduleTypeKey: pattern.schedule_type_key,
        weekdays: pattern.weekdays,
        metadata: pattern.metadata ?? null,
    });

    const toggleDay = (weekIndex: number, value: number) => {
        if (!allowedDays.includes(value)) return;
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

    const cancelEdit = () => {
        hydrate(pattern);
        setEditing(false);
    };

    if (!editing) {
        return (
            <div className="space-y-4" data-testid="locations-schedule-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={pattern.label}
                    status={{
                        label: pattern.is_active ? "Active" : "Inactive",
                        tone: pattern.is_active ? "active" : "inactive",
                    }}
                    facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <ConfigurationSecondaryButton
                                onClick={() => setEditing(true)}
                                data-testid="locations-schedule-edit"
                            >
                                Edit schedule
                            </ConfigurationSecondaryButton>
                        :   null
                    }
                    testId="locations-schedule-header"
                />
                <ConfigConsequenceLine testId="locations-schedule-consequence">
                    {summary}
                </ConfigConsequenceLine>
                {presentation.needsDayTypeReview ?
                    <p
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                        data-testid="locations-schedule-day-type-review"
                    >
                        This rotating schedule needs a Day Type (Full Time, Part Time, or Hourly) before it is
                        complete. Days and hours were preserved.
                    </p>
                :   null}
                {presentation.patternType === "rotating" && !presentation.rotationAnchorDate ?
                    <p className="config-typo-sublabel" data-testid="locations-schedule-anchor-note">
                        {ROTATION_ANCHOR_SCHEDULING_BLOCKER}
                    </p>
                :   null}
                <section className="border-y border-alloy-forge/10 py-4">
                    <h2 className="config-typo-workspace-title mb-3">
                        {presentation.patternType === "rotating" ?
                            `${presentation.weeks.length}-week rotation`
                        :   "Scheduled days"}
                    </h2>
                    <div className="space-y-3" data-testid="locations-schedule-weekdays-view">
                        {presentation.weeks.map((week) => (
                            <div key={week.position}>
                                {presentation.patternType === "rotating" ?
                                    <p className="config-typo-field-label mb-1">Week {week.position} days</p>
                                :   null}
                                <p className="text-sm text-alloy-midnight">
                                    {formatWeekdayList(week.days.length ? week.days : pattern.weekdays)}
                                    {formatSchedulePatternHours({
                                        opensAt: week.startTime,
                                        closesAt: week.endTime,
                                    }) ?
                                        ` · ${formatSchedulePatternHours({
                                            opensAt: week.startTime,
                                            closesAt: week.endTime,
                                        })}`
                                    :   ""}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Day type</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {presentation.dayType ?
                                scheduleDayTypeLabel(presentation.dayType)
                            :   "Needs selection"}
                        </dd>
                    </div>
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Schedule type</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {schedulePatternTypeLabel(presentation.patternType)}
                        </dd>
                    </div>
                    {presentation.patternType === "rotating" ?
                        <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                            <dt className="config-typo-field-label">Rotation begins</dt>
                            <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                                {presentation.rotationAnchorDate ?? "Required"}
                            </dd>
                        </div>
                    :   null}
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Status</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {pattern.is_active ? "Active" : "Inactive"}
                        </dd>
                    </div>
                </dl>
            </div>
        );
    }

    const resolvedWeekdays = resolveScheduleDefinitionWeekdays({ patternType, weeks });
    const hoursRequired = dayType !== "hourly";
    /** Hours may be unset on enrichment Patterns — allow Save when both ends empty. */
    const hoursOk =
        !hoursRequired ||
        weeks.every((week) => {
            const opensAt = week.startTime;
            const closesAt = week.endTime;
            if (!opensAt && !closesAt) return true;
            return isValidScheduleHours({ opensAt, closesAt });
        });
    const weeksOk =
        patternType === "continuous" ?
            (weeks[0]?.days.length ?? 0) > 0
        :   weeks.length >= 1 && weeks.every((week) => week.days.length > 0);
    const anchorOk = patternType !== "rotating" || isValidRotationAnchorDate(rotationAnchorDate);
    const canSave = Boolean(label.trim()) && Boolean(dayType) && weeksOk && hoursOk && anchorOk && canMutate;

    const persist = async () => {
        setSaving(true);
        try {
            if (!dayType) throw new Error("Select a Day Type.");
            if (!weeksOk) throw new Error("Select at least one day for each week.");
            if (!hoursOk) throw new Error("End time must be after start time when hours are set.");
            if (rotatingPatternRequiresAnchor(patternType, rotationAnchorDate)) {
                throw new Error("Rotation begins is required for rotating Patterns.");
            }
            const hours = {
                opensAt: weeks[0]?.startTime ?? null,
                closesAt: weeks[0]?.endTime ?? null,
            };
            const metadata = writeScheduleDefinitionMetadata({
                existing: (pattern.metadata ?? {}) as Record<string, unknown>,
                dayType,
                patternType,
                hours,
                weeks,
                rotationAnchorDate: patternType === "rotating" ? rotationAnchorDate : null,
            });
            const patch = {
                label: label.trim(),
                schedule_type_key: scheduleTypeKeyFromDayType(dayType),
                weekdays: resolvedWeekdays,
                is_active: active,
                metadata,
            };
            const updated = await patchSchedulePattern(pattern.id, patch);
            if (
                !mutationResponseContainsPatch(updated as unknown as Record<string, unknown>, {
                    label: patch.label,
                    schedule_type_key: patch.schedule_type_key,
                    weekdays: patch.weekdays,
                    is_active: patch.is_active,
                })
            ) {
                throw new Error("Schedule save was not confirmed by the authoritative response.");
            }
            onUpdated(updated);
            setEditing(false);
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-schedule-editor" data-locations-schedule-editing="true">
            <ConfigObjectHeader
                size="hero"
                name={label.trim() || "Untitled schedule"}
                status={{ label: "Editing", tone: "attention" }}
                facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                actions={
                    <div className="flex flex-wrap items-center gap-2" data-locations-schedule-header-actions="true">
                        <ConfigurationSecondaryButton onClick={cancelEdit} disabled={saving}>
                            Cancel
                        </ConfigurationSecondaryButton>
                        {canMutate ? (
                            <ConfigurationPrimaryButton
                                disabled={saving || !canSave}
                                data-testid="locations-schedule-save"
                                title={
                                    !canSave
                                        ? !dayType
                                            ? "Select a Day Type to enable Save"
                                            : !weeksOk
                                              ? "Select at least one day for each week"
                                              : !hoursOk
                                                ? "End time must be after start time when hours are set"
                                                : !anchorOk
                                                  ? "Rotation begins is required for rotating Patterns"
                                                  : "Complete required fields to save"
                                        : saving
                                          ? "Saving…"
                                          : "Save schedule"
                                }
                                onClick={() => {
                                    void persist();
                                }}
                            >
                                {saving ? "Saving…" : !canSave ? "Save schedule (complete required fields)" : "Save schedule"}
                            </ConfigurationPrimaryButton>
                        ) : null}
                    </div>
                }
                testId="locations-schedule-header"
            />
            <ConfigEditorSection title="Schedule identity" testId="locations-schedule-editor-identity">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate}
                        onChange={(event) => setLabel(event.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-schedule-name"
                    />
                </label>
            </ConfigEditorSection>

            <ConfigEditorSection title="Day type & repeats" testId="locations-schedule-editor-types">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                        <span className="config-typo-field-label">Day type</span>
                        <select
                            value={dayType}
                            disabled={!canMutate}
                            onChange={(event) => setDayType(event.target.value as ScheduleDayType | "")}
                            className="config-runtime-select"
                            data-testid="locations-schedule-day-type"
                        >
                            <option value="">Select day type</option>
                            {DAY_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {scheduleDayTypeLabel(type)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block space-y-1.5">
                        <span className="config-typo-field-label">Schedule type</span>
                        <select
                            value={patternType}
                            disabled={!canMutate}
                            onChange={(event) => {
                                const next = event.target.value as SchedulePatternType;
                                setPatternType(next);
                                if (next === "rotating" && weeks.length < 2) {
                                    setWeeks([weeks[0] ?? emptyWeek(1), emptyWeek(2)]);
                                }
                                if (next === "continuous") {
                                    setWeeks([weeks[0] ?? emptyWeek(1)]);
                                }
                            }}
                            className="config-runtime-select"
                            data-testid="locations-schedule-repeats"
                        >
                            <option value="continuous">{schedulePatternTypeLabel("continuous")}</option>
                            <option value="rotating">{schedulePatternTypeLabel("rotating")}</option>
                        </select>
                    </label>
                </div>
                {patternType === "rotating" ?
                    <label className="mt-3 block space-y-1.5">
                        <span className="config-typo-field-label">Rotation begins</span>
                        <input
                            type="date"
                            value={rotationAnchorDate}
                            disabled={!canMutate}
                            onChange={(event) => setRotationAnchorDate(event.target.value)}
                            className="config-runtime-input max-w-xs"
                            data-testid="locations-schedule-rotation-anchor"
                            required
                        />
                        <span className="block text-[11px] text-alloy-midnight/45">
                            Week 1 contains this date. Required for calendar projection.
                        </span>
                    </label>
                :   null}
            </ConfigEditorSection>

            <ConfigEditorSection
                title={patternType === "rotating" ? `${weeks.length}-week rotation` : "Days and hours"}
                testId="locations-schedule-editor-weeks"
            >
                {weeks.map((week, weekIndex) => (
                    <div
                        key={week.position}
                        className="space-y-3 rounded-lg border border-alloy-forge/10 p-3"
                        data-testid={`locations-schedule-week-${weekIndex + 1}`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-alloy-midnight">
                                {patternType === "rotating" ? `Week ${weekIndex + 1} days` : "Scheduled days"}
                            </p>
                            {patternType === "rotating" && weeks.length > 1 ?
                                <ConfigurationSecondaryButton
                                    className="px-2 py-1 text-[11px]"
                                    disabled={!canMutate}
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
                            allowedDays={allowedDays}
                            disabled={!canMutate}
                            testId={
                                patternType === "rotating" ?
                                    `locations-schedule-week${weekIndex + 1}-days`
                                :   "locations-schedule-weekdays"
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
                                    disabled={!canMutate}
                                    onChange={(event) =>
                                        setWeeks((current) =>
                                            current.map((entry, index) =>
                                                index === weekIndex ?
                                                    { ...entry, startTime: event.target.value || null }
                                                :   entry,
                                            ),
                                        )
                                    }
                                    className="config-runtime-input"
                                    data-testid={`locations-schedule-week${weekIndex + 1}-start`}
                                />
                            </label>
                            <label className="block space-y-1.5">
                                <span className="config-typo-field-label">
                                    End{dayType === "hourly" ? " (optional)" : ""}
                                </span>
                                <input
                                    type="time"
                                    value={week.endTime ?? ""}
                                    disabled={!canMutate}
                                    onChange={(event) =>
                                        setWeeks((current) =>
                                            current.map((entry, index) =>
                                                index === weekIndex ?
                                                    { ...entry, endTime: event.target.value || null }
                                                :   entry,
                                            ),
                                        )
                                    }
                                    className="config-runtime-input"
                                    data-testid={`locations-schedule-week${weekIndex + 1}-end`}
                                />
                            </label>
                        </div>
                    </div>
                ))}
                {patternType === "rotating" && weeks.length < SCHEDULE_ROTATION_WEEK_MAX ?
                    <ConfigurationSecondaryButton
                        className="px-2 py-1 text-[11px]"
                        disabled={!canMutate}
                        onClick={() => setWeeks((current) => [...current, emptyWeek(current.length + 1)])}
                        data-testid="locations-schedule-add-week"
                    >
                        + Add week
                    </ConfigurationSecondaryButton>
                :   null}
            </ConfigEditorSection>

            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={active}
                    disabled={!canMutate}
                    onChange={(event) => setActive(event.target.checked)}
                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    data-testid="locations-schedule-active"
                />
                <span className="config-typo-sublabel">Active schedule</span>
            </label>
        </div>
    );
}
