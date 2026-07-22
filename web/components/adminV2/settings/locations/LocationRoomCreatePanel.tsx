"use client";

import { useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { effectiveLocationProgramLabel } from "@/lib/locations/locationProgramCategories";
import { writeRoomProgramsAndScheduleMetadata } from "@/lib/locations/roomOfferingMetadata";
import type { SchedulePatternRow } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { LocationRoomCreateInput } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";

export default function LocationRoomCreatePanel({
    siteLabel,
    programOptions,
    schedulePatterns,
    onCancel,
    onCreate,
}: {
    siteLabel: string;
    programOptions: LocationProgramCategoryRow[];
    schedulePatterns: SchedulePatternRow[];
    onCancel: () => void;
    onCreate: (input: LocationRoomCreateInput) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [supportedKeys, setSupportedKeys] = useState<string[]>([]);
    const [capacity, setCapacity] = useState("");
    const [schedulePatternId, setSchedulePatternId] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleProgram = (key: string) => {
        setSupportedKeys((current) =>
            current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
        );
    };

    return (
        <div className="space-y-3" data-testid="locations-room-create">
            <ConfigObjectHeader
                size="hero"
                name="Add room"
                status={{ label: "Creating", tone: "attention" }}
                facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                actions={
                    <ConfigurationSecondaryButton
                        onClick={onCancel}
                        disabled={saving}
                        data-testid="locations-room-create-cancel"
                    >
                        Cancel
                    </ConfigurationSecondaryButton>
                }
                testId="locations-room-create-header"
            />

            <div className="space-y-2.5">
                <ConfigEditorSection title="Room" testId="locations-room-create-identity">
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Room name</span>
                        <input
                            type="text"
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            className="config-runtime-input"
                            autoFocus
                            data-testid="locations-room-create-name"
                        />
                    </label>
                    <label className="block max-w-36 space-y-1">
                        <span className="config-typo-field-label">Capacity</span>
                        <input
                            type="number"
                            min={0}
                            value={capacity}
                            onChange={(event) => setCapacity(event.target.value)}
                            className="config-runtime-input"
                            data-testid="locations-room-create-capacity"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => setActive(event.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            data-testid="locations-room-create-active"
                        />
                        <span className="config-typo-sublabel">Active</span>
                    </label>
                </ConfigEditorSection>

                <ConfigEditorSection
                    title="Programs supported"
                    description="Programs offered at this location that this room can serve."
                    testId="locations-room-create-programs"
                >
                    {programOptions.length === 0 ?
                        <p className="config-typo-sublabel">
                            Offer Programs at this Location before assigning them to rooms.
                        </p>
                    :   <div className="space-y-2" data-testid="locations-room-create-program-list">
                            {programOptions.map((program) => (
                                <label key={program.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={supportedKeys.includes(program.key)}
                                        onChange={() => toggleProgram(program.key)}
                                        className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                        data-testid={`locations-room-create-program-${program.key}`}
                                    />
                                    <span className="text-sm text-alloy-midnight">
                                        {effectiveLocationProgramLabel(program)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    }
                </ConfigEditorSection>

                <ConfigEditorSection title="Schedule pattern" testId="locations-room-create-schedule">
                    <label className="block max-w-md space-y-1">
                        <span className="config-typo-field-label">Pattern</span>
                        <select
                            value={schedulePatternId}
                            onChange={(event) => setSchedulePatternId(event.target.value)}
                            className="config-runtime-select"
                            data-testid="locations-room-create-schedule-pattern"
                        >
                            <option value="">None</option>
                            {schedulePatterns.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.label}
                                    {!entry.is_active ? " (inactive)" : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                </ConfigEditorSection>

                {error ?
                    <p className="text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                <div className="flex flex-wrap gap-2 pt-1">
                    <ConfigurationPrimaryButton
                        disabled={saving || !label.trim()}
                        data-testid="locations-room-create-save"
                        onClick={() => {
                            void (async () => {
                                setSaving(true);
                                setError(null);
                                try {
                                    const metadata = writeRoomProgramsAndScheduleMetadata({
                                        existing: {},
                                        supportedProgramKeys: supportedKeys,
                                        schedulePatternId: schedulePatternId || null,
                                        capacity: capacity.trim() || null,
                                    });
                                    await onCreate({
                                        label: label.trim(),
                                        is_active: active,
                                        metadata,
                                    });
                                } catch (cause) {
                                    setError(cause instanceof Error ? cause.message : "Room could not be created.");
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Adding…" : "Add room"}
                    </ConfigurationPrimaryButton>
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                </div>
            </div>
        </div>
    );
}
