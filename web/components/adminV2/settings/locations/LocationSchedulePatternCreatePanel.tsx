"use client";

import { useState } from "react";
import {
    createSchedulePattern,
    formatWeekdaySelection,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

function patternKey(label: string): string {
    const stem = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 36);
    return `${stem || "schedule"}_${Date.now().toString(36)}`;
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
    const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleWeekday = (value: number) => {
        setWeekdays((current) =>
            current.includes(value) ?
                current.filter((day) => day !== value)
            :   [...current, value].sort((a, b) => a - b),
        );
    };

    return (
        <section className="process-config-setup-card space-y-4 p-4" data-testid="locations-schedule-create">
            <div>
                <h2 className="config-typo-workspace-title">Add schedule pattern</h2>
                <p className="config-typo-sublabel mt-1">Create another reusable weekly template for this location.</p>
            </div>
            <label className="block space-y-1.5">
                <span className="config-typo-field-label">Pattern name</span>
                <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="e.g. School week"
                    className="config-runtime-input"
                    autoFocus
                />
            </label>
            <div className="space-y-2">
                <span className="config-typo-field-label">Weekdays</span>
                <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map((day) => (
                        <button
                            key={day.value}
                            type="button"
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                weekdays.includes(day.value) ?
                                    "border-[#00a283]/30 bg-[#00a283]/10 text-[#007d68]"
                                :   "border-alloy-forge/15 text-alloy-midnight/55"
                            }`}
                            onClick={() => toggleWeekday(day.value)}
                        >
                            {day.label}
                        </button>
                    ))}
                </div>
                <p className="config-typo-meta">{formatWeekdaySelection(weekdays)}</p>
            </div>
            {error ?
                <p role="alert" className="text-sm text-red-800">
                    {error}
                </p>
            :   null}
            <div className="flex flex-wrap gap-2">
                <ConfigurationPrimaryButton
                    className="config-primary-btn--sm"
                    disabled={saving || !label.trim() || weekdays.length === 0}
                    onClick={() => {
                        void (async () => {
                            setSaving(true);
                            setError(null);
                            try {
                                const created = await createSchedulePattern({
                                    site_location_id: locationId,
                                    key: patternKey(label),
                                    label: label.trim(),
                                    schedule_type_key: "weekly",
                                    weekdays,
                                });
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
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-medium text-alloy-midnight/65"
                    onClick={onCancel}
                    disabled={saving}
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
