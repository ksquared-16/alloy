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
import {
    serializeStaffingThresholds,
    type StaffingThreshold,
} from "@/lib/locations/locationWorkspaceModel";
import type { LocationRoomCreateInput } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";

export default function LocationRoomCreatePanel({
    siteLabel,
    programOptions,
    ageUnitSelectOptions,
    onCancel,
    onCreate,
}: {
    siteLabel: string;
    programOptions: LocationProgramCategoryRow[];
    ageUnitSelectOptions: readonly { value: string; label: string }[];
    onCancel: () => void;
    onCreate: (input: LocationRoomCreateInput) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [programKey, setProgramKey] = useState("");
    const [capacity, setCapacity] = useState("");
    const [requiredStaff, setRequiredStaff] = useState("");
    const [maxChildren, setMaxChildren] = useState("");
    const [ageFrom, setAgeFrom] = useState("");
    const [ageTo, setAgeTo] = useState("");
    const [ageUnit, setAgeUnit] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                <ConfigEditorSection title="Identity" testId="locations-room-create-identity">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Name</span>
                            <input
                                type="text"
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                                className="config-runtime-input"
                                autoFocus
                                data-testid="locations-room-create-name"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Program</span>
                            <select
                                value={programKey}
                                onChange={(event) => setProgramKey(event.target.value)}
                                className="config-runtime-select"
                                data-testid="locations-room-create-program"
                            >
                                <option value="">Not assigned yet</option>
                                {programOptions.map((program) => (
                                    <option key={program.id} value={program.key}>
                                        {program.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => setActive(event.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            data-testid="locations-room-create-active"
                        />
                        <span className="config-typo-sublabel">Active room</span>
                    </label>
                </ConfigEditorSection>

                <ConfigEditorSection
                    title="Capacity"
                    description="How many children this room can hold."
                    testId="locations-room-create-capacity-section"
                >
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
                </ConfigEditorSection>

                <ConfigEditorSection
                    title="Staffing thresholds"
                    description="The first staffing threshold for this room. More can be added after creation."
                    testId="locations-room-create-staffing"
                >
                    <div className="grid max-w-md gap-2 sm:grid-cols-2">
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Staff members</span>
                            <input
                                type="number"
                                min={1}
                                value={requiredStaff}
                                onChange={(event) => setRequiredStaff(event.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-room-create-staff"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Maximum children</span>
                            <input
                                type="number"
                                min={1}
                                value={maxChildren}
                                onChange={(event) => setMaxChildren(event.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-room-create-max-children"
                            />
                        </label>
                    </div>
                </ConfigEditorSection>

                <ConfigEditorSection title="Age range" testId="locations-room-create-age">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <input
                            type="text"
                            value={ageFrom}
                            onChange={(event) => setAgeFrom(event.target.value)}
                            placeholder="From"
                            className="config-runtime-input"
                            data-testid="locations-room-create-age-from"
                        />
                        <input
                            type="text"
                            value={ageTo}
                            onChange={(event) => setAgeTo(event.target.value)}
                            placeholder="To"
                            className="config-runtime-input"
                            data-testid="locations-room-create-age-to"
                        />
                        <select
                            value={ageUnit}
                            onChange={(event) => setAgeUnit(event.target.value)}
                            className="config-runtime-select"
                            data-testid="locations-room-create-age-unit"
                        >
                            <option value="">Unit</option>
                            {ageUnitSelectOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </ConfigEditorSection>

                <ConfigEditorSection
                    title="Hours / operating behavior"
                    description="Rooms inherit the location’s recurring schedule."
                    testId="locations-room-create-hours"
                >
                    <p className="text-sm text-alloy-midnight/75">Uses {siteLabel || "location"} hours</p>
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
                                    const hasPartialThreshold = Boolean(requiredStaff.trim() || maxChildren.trim());
                                    const staffingThresholds: StaffingThreshold[] =
                                        hasPartialThreshold ?
                                            [{
                                                requiredStaff: Number(requiredStaff),
                                                maxChildren: Number(maxChildren),
                                            }]
                                        :   [];
                                    if (
                                        hasPartialThreshold &&
                                        (!Number.isInteger(staffingThresholds[0]?.requiredStaff) ||
                                            (staffingThresholds[0]?.requiredStaff ?? 0) <= 0 ||
                                            !Number.isInteger(staffingThresholds[0]?.maxChildren) ||
                                            (staffingThresholds[0]?.maxChildren ?? 0) <= 0)
                                    ) {
                                        throw new Error("Complete both staffing threshold values.");
                                    }
                                    const metadata: Record<string, unknown> = {};
                                    if (programKey.trim()) metadata.category = programKey.trim();
                                    if (capacity.trim()) metadata.capacity = capacity.trim();
                                    if (ageFrom.trim()) metadata.age_range_from = ageFrom.trim();
                                    if (ageTo.trim()) metadata.age_range_to = ageTo.trim();
                                    if (ageUnit.trim()) metadata.age_range_unit = ageUnit.trim();
                                    if (staffingThresholds.length > 0) {
                                        metadata.student_teacher_ratio =
                                            serializeStaffingThresholds(staffingThresholds);
                                    }
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
