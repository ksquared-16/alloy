"use client";

import { useEffect, useState } from "react";
import {
    patchSchedulePattern,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";

const WEEKDAY_CHIP_SELECTED =
    "rounded-full border border-[#00a283]/35 bg-[#00a283]/12 text-[#007d68]";
const WEEKDAY_CHIP_IDLE =
    "rounded-full border border-alloy-forge/15 text-alloy-midnight/55 hover:border-alloy-forge/25";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
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

    useEffect(() => {
        if (!pattern) return;
        setLabel(pattern.label);
        setScheduleTypeKey(pattern.schedule_type_key);
        setWeekdays([...pattern.weekdays]);
        setActive(pattern.is_active);
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

    return (
        <ConfigurationDetailCard testId="locations-schedule-detail" title={label.trim() || "Untitled schedule"}>
            <div className="space-y-4">
                <div>
                    <span className="config-typo-field-label">Location</span>
                    <p className="config-typo-sublabel mt-1">{siteLabel}</p>
                </div>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate}
                        onChange={(e) => setLabel(e.target.value)}
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
                        onChange={(e) => setActive(e.target.checked)}
                        className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    />
                    <span className="config-typo-sublabel">Active</span>
                </label>

                {canMutate ?
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        disabled={saving}
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
                                        throw new Error(
                                            "Schedule save was not confirmed by the authoritative response.",
                                        );
                                    }
                                    onUpdated(updated);
                                } catch (e) {
                                    onError(e instanceof Error ? e.message : "Save failed");
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Saving…" : "Save schedule template"}
                    </ConfigurationPrimaryButton>
                :   null}

            </div>
        </ConfigurationDetailCard>
    );
}
