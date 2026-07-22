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
    formatSchedulePatternHours,
    formatSchedulePatternSummary,
    formatWeekdayList,
    operatorTypeFromScheduleTypeKey,
    readSchedulePatternPresentation,
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

function WeekdayChips({
    selected,
    disabled,
    onToggle,
    testId,
}: {
    selected: number[];
    disabled?: boolean;
    onToggle: (value: number) => void;
    testId: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5" data-testid={testId}>
            {WEEKDAY_OPTIONS.map((day) => (
                <button
                    key={day.value}
                    type="button"
                    disabled={disabled}
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

export default function LocationScheduleTemplateDetailPanel({
    pattern,
    siteLabel,
    canMutate,
    onUpdated,
    onError,
}: {
    pattern: SchedulePatternRow | null;
    siteLabel: string;
    canMutate: boolean;
    onUpdated: (row: SchedulePatternRow) => void;
    onError: (message: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [operatorType, setOperatorType] = useState<SchedulePatternOperatorType>("full_day");
    const [weekdays, setWeekdays] = useState<number[]>([]);
    const [week1, setWeek1] = useState<number[]>([]);
    const [week2, setWeek2] = useState<number[]>([]);
    const [opensAt, setOpensAt] = useState("");
    const [closesAt, setClosesAt] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const hydrate = (next: SchedulePatternRow) => {
        const presentation = readSchedulePatternPresentation(next.metadata ?? null, next.schedule_type_key);
        setLabel(next.label);
        setOperatorType(presentation.operatorType);
        setWeekdays([...next.weekdays]);
        setWeek1(presentation.rotation?.week1 ?? []);
        setWeek2(presentation.rotation?.week2 ?? []);
        setOpensAt(presentation.hours.opensAt ?? "");
        setClosesAt(presentation.hours.closesAt ?? "");
        setActive(next.is_active);
    };

    useEffect(() => {
        if (!pattern) return;
        hydrate(pattern);
        setEditing(false);
    }, [pattern]);

    if (!pattern) {
        return (
            <ConfigurationEmptyState
                testId="locations-schedule-workspace-empty"
                title="Select a schedule pattern"
                description="Choose a pattern to review type, days, and hours."
            />
        );
    }

    const toggleList = (value: number, setter: (next: number[]) => void, current: number[]) => {
        const set = new Set(current);
        if (set.has(value)) set.delete(value);
        else set.add(value);
        setter([...set].sort((a, b) => a - b));
    };

    const cancelEdit = () => {
        hydrate(pattern);
        setEditing(false);
    };

    const presentation = readSchedulePatternPresentation(pattern.metadata ?? null, pattern.schedule_type_key);
    const summary = formatSchedulePatternSummary({
        label: pattern.label,
        scheduleTypeKey: pattern.schedule_type_key,
        weekdays: pattern.weekdays,
        metadata: pattern.metadata ?? null,
    });
    const hoursLabel = formatSchedulePatternHours(presentation.hours);

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
                                Edit pattern
                            </ConfigurationSecondaryButton>
                        :   null
                    }
                    testId="locations-schedule-header"
                />
                <ConfigConsequenceLine testId="locations-schedule-consequence">
                    {summary}
                </ConfigConsequenceLine>
                <section className="border-y border-alloy-forge/10 py-4">
                    <h2 className="config-typo-workspace-title mb-3">
                        {presentation.operatorType === "rotating" ? "Rotating weeks" : "Available days"}
                    </h2>
                    {presentation.operatorType === "rotating" && presentation.rotation ?
                        <div className="space-y-3" data-testid="locations-schedule-weekdays-view">
                            <div>
                                <p className="config-typo-field-label mb-1.5">Week 1</p>
                                <p className="text-sm text-alloy-midnight">
                                    {formatWeekdayList(presentation.rotation.week1)}
                                </p>
                            </div>
                            <div>
                                <p className="config-typo-field-label mb-1.5">Week 2</p>
                                <p className="text-sm text-alloy-midnight">
                                    {formatWeekdayList(presentation.rotation.week2)}
                                </p>
                            </div>
                        </div>
                    :   <div className="flex flex-wrap gap-1.5" data-testid="locations-schedule-weekdays-view">
                            {WEEKDAY_OPTIONS.map((day) => (
                                <span
                                    key={day.value}
                                    className={`px-2.5 py-1 text-xs font-semibold ${
                                        pattern.weekdays.includes(day.value) ?
                                            WEEKDAY_CHIP_SELECTED
                                        :   "rounded-full border border-alloy-forge/15 bg-white text-alloy-midnight/35"
                                    }`}
                                >
                                    {day.label}
                                </span>
                            ))}
                        </div>
                    }
                </section>
                <dl className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Type</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {schedulePatternTypeLabel(presentation.operatorType)}
                        </dd>
                    </div>
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Hours</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {hoursLabel ?? "Not set"}
                        </dd>
                    </div>
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
        <div className="space-y-3" data-testid="locations-schedule-edit">
            <ConfigObjectHeader
                size="hero"
                name={label.trim() || "Untitled pattern"}
                status={{ label: "Editing", tone: "attention" }}
                facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                actions={
                    <ConfigurationSecondaryButton onClick={cancelEdit} disabled={saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                }
                testId="locations-schedule-header"
            />
            <ConfigEditorSection title="Pattern details" testId="locations-schedule-editor">
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
                <label className="block max-w-xs space-y-1.5">
                    <span className="config-typo-field-label">Type</span>
                    <select
                        value={operatorType}
                        disabled={!canMutate}
                        onChange={(event) =>
                            setOperatorType(operatorTypeFromScheduleTypeKey(event.target.value))
                        }
                        className="config-runtime-select"
                        data-testid="locations-schedule-type"
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
                                disabled={!canMutate}
                                testId="locations-schedule-week1"
                                onToggle={(value) => toggleList(value, setWeek1, week1)}
                            />
                        </div>
                        <div className="space-y-2">
                            <span className="config-typo-field-label">Week 2 days</span>
                            <WeekdayChips
                                selected={week2}
                                disabled={!canMutate}
                                testId="locations-schedule-week2"
                                onToggle={(value) => toggleList(value, setWeek2, week2)}
                            />
                        </div>
                    </div>
                :   <div className="space-y-2">
                        <span className="config-typo-field-label">Available days</span>
                        <WeekdayChips
                            selected={weekdays}
                            disabled={!canMutate}
                            testId="locations-schedule-weekdays"
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
                            disabled={!canMutate}
                            onChange={(event) => setOpensAt(event.target.value)}
                            className="config-runtime-input"
                            data-testid="locations-schedule-opens-at"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="config-typo-field-label">
                            Closes{hoursRequired ? "" : " (optional)"}
                        </span>
                        <input
                            type="time"
                            value={closesAt}
                            disabled={!canMutate}
                            onChange={(event) => setClosesAt(event.target.value)}
                            className="config-runtime-input"
                            data-testid="locations-schedule-closes-at"
                        />
                    </label>
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={active}
                        disabled={!canMutate}
                        onChange={(event) => setActive(event.target.checked)}
                        className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                        data-testid="locations-schedule-active"
                    />
                    <span className="config-typo-sublabel">Active pattern</span>
                </label>
            </ConfigEditorSection>

            <div className="flex flex-wrap gap-2">
                <ConfigurationPrimaryButton
                    disabled={saving || !canSave}
                    data-testid="locations-schedule-save"
                    onClick={() => {
                        void (async () => {
                            setSaving(true);
                            try {
                                const scheduleTypeKey = scheduleTypeKeyFromOperatorType(operatorType);
                                const metadata = writeSchedulePatternMetadata({
                                    existing: (pattern.metadata ?? {}) as Record<string, unknown>,
                                    operatorType,
                                    hours: {
                                        opensAt: opensAt.trim() || null,
                                        closesAt: closesAt.trim() || null,
                                    },
                                    rotation: operatorType === "rotating" ? { week1, week2 } : null,
                                });
                                const patch = {
                                    label: label.trim(),
                                    schedule_type_key: scheduleTypeKey,
                                    weekdays: resolvedWeekdays,
                                    is_active: active,
                                    metadata,
                                };
                                const updated = await patchSchedulePattern(pattern.id, patch);
                                if (
                                    !mutationResponseContainsPatch(
                                        updated as unknown as Record<string, unknown>,
                                        {
                                            label: patch.label,
                                            schedule_type_key: patch.schedule_type_key,
                                            weekdays: patch.weekdays,
                                            is_active: patch.is_active,
                                        },
                                    )
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
                        })();
                    }}
                >
                    {saving ? "Saving…" : "Save pattern"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton onClick={cancelEdit} disabled={saving}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}
