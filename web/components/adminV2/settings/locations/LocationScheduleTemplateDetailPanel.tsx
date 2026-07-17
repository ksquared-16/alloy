"use client";

import { useEffect, useState } from "react";
import {
    patchSchedulePattern,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";

const WEEKDAY_CHIP_SELECTED =
    "rounded-full border border-alloy-bend-pine bg-alloy-bend-pine text-white";
const WEEKDAY_CHIP_IDLE =
    "rounded-full border border-alloy-forge/20 bg-white text-alloy-midnight/55 hover:border-alloy-bend-pine/40 hover:text-alloy-bend-pine";
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
    const [scheduleTypeKey, setScheduleTypeKey] = useState("");
    const [weekdays, setWeekdays] = useState<number[]>([]);
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (!pattern) return;
        setLabel(pattern.label);
        setScheduleTypeKey(pattern.schedule_type_key);
        setWeekdays([...pattern.weekdays]);
        setActive(pattern.is_active);
        setEditing(false);
    }, [pattern]);

    if (!pattern) {
        return (
            <ConfigurationEmptyState
                testId="locations-schedule-workspace-empty"
                title="Select a schedule template"
                description="Choose a schedule pattern to edit its label, weekdays, and active status."
            />
        );
    }

    const toggleWeekday = (value: number) => {
        setWeekdays((prev) => {
            const set = new Set(prev);
            if (set.has(value)) set.delete(value);
            else set.add(value);
            return [...set].sort((a, b) => a - b);
        });
    };

    const cancelEdit = () => {
        setLabel(pattern.label);
        setScheduleTypeKey(pattern.schedule_type_key);
        setWeekdays([...pattern.weekdays]);
        setActive(pattern.is_active);
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
                                Edit pattern
                            </ConfigurationSecondaryButton>
                        :   null
                    }
                    testId="locations-schedule-header"
                />
                <ConfigConsequenceLine testId="locations-schedule-consequence">
                    {pattern.is_active ?
                        "This recurring pattern is available for schedule assignment."
                    :   "This pattern is retained for reference but is not available for new assignments."}
                </ConfigConsequenceLine>
                <section className="border-y border-alloy-forge/10 py-4">
                    <h2 className="config-typo-workspace-title mb-3">Recurring weekdays</h2>
                    <div className="flex flex-wrap gap-1.5" data-testid="locations-schedule-weekdays-view">
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
                </section>
                <dl className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5">
                        <dt className="config-typo-field-label">Pattern type</dt>
                        <dd className="mt-1 text-sm font-semibold text-alloy-midnight">Weekly</dd>
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
                <div className="space-y-2">
                    <span className="config-typo-field-label">Weekdays</span>
                    <div className="flex flex-wrap gap-1.5" data-testid="locations-schedule-weekdays">
                        {WEEKDAY_OPTIONS.map((day) => (
                            <button
                                key={day.value}
                                type="button"
                                disabled={!canMutate}
                                aria-pressed={weekdays.includes(day.value)}
                                className={`px-2.5 py-1 text-xs font-semibold ${
                                    weekdays.includes(day.value) ? WEEKDAY_CHIP_SELECTED : WEEKDAY_CHIP_IDLE
                                }`}
                                onClick={() => toggleWeekday(day.value)}
                            >
                                {day.label}
                            </button>
                        ))}
                    </div>
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
                    disabled={saving || !label.trim() || weekdays.length === 0}
                    data-testid="locations-schedule-save"
                    onClick={() => {
                        void (async () => {
                            setSaving(true);
                            try {
                                const patch = {
                                    label: label.trim(),
                                    schedule_type_key: scheduleTypeKey.trim(),
                                    weekdays,
                                    is_active: active,
                                };
                                const updated = await patchSchedulePattern(pattern.id, patch);
                                if (
                                    !mutationResponseContainsPatch(
                                        updated as unknown as Record<string, unknown>,
                                        patch,
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
