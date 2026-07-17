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
import type { LocationProgramCreateInput } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";

export default function LocationProgramCreatePanel({
    siteLabel,
    ageUnitSelectOptions,
    scheduleSummary,
    onCancel,
    onCreate,
}: {
    siteLabel: string;
    ageUnitSelectOptions: readonly { value: string; label: string }[];
    scheduleSummary: string;
    onCancel: () => void;
    onCreate: (input: LocationProgramCreateInput) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [ageFrom, setAgeFrom] = useState("");
    const [ageTo, setAgeTo] = useState("");
    const [ageUnit, setAgeUnit] = useState("");
    const [defaultRoomTypes, setDefaultRoomTypes] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!label.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const metadata: Record<string, unknown> = {};
            if (ageFrom.trim()) metadata.age_range_from = ageFrom.trim();
            if (ageTo.trim()) metadata.age_range_to = ageTo.trim();
            if (ageUnit.trim()) metadata.age_range_unit = ageUnit.trim();
            if (defaultRoomTypes.trim()) metadata.default_room_types = defaultRoomTypes.trim();
            await onCreate({
                label: label.trim(),
                is_active: active,
                metadata,
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Program could not be created.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-program-create">
            <ConfigObjectHeader
                size="hero"
                name="Add program"
                status={{ label: "Creating", tone: "attention" }}
                facts={[siteLabel ? `Offered at ${siteLabel}` : ""].filter(Boolean)}
                actions={
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                }
                testId="locations-program-create-header"
            />

            <div className="space-y-2.5">
                <ConfigEditorSection title="Identity" testId="locations-program-create-identity">
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Name</span>
                        <input
                            type="text"
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            className="config-runtime-input"
                            autoFocus
                            data-testid="locations-program-create-name"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => setActive(event.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            data-testid="locations-program-create-active"
                        />
                        <span className="config-typo-sublabel">Active program</span>
                    </label>
                </ConfigEditorSection>

                <ConfigEditorSection title="Age range" testId="locations-program-create-age">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <input
                            type="text"
                            value={ageFrom}
                            onChange={(event) => setAgeFrom(event.target.value)}
                            placeholder="From"
                            className="config-runtime-input"
                            data-testid="locations-program-create-age-from"
                        />
                        <input
                            type="text"
                            value={ageTo}
                            onChange={(event) => setAgeTo(event.target.value)}
                            placeholder="To"
                            className="config-runtime-input"
                            data-testid="locations-program-create-age-to"
                        />
                        <select
                            value={ageUnit}
                            onChange={(event) => setAgeUnit(event.target.value)}
                            className="config-runtime-select"
                            data-testid="locations-program-create-age-unit"
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
                    title="Schedule"
                    description="Programs follow this location’s recurring hours."
                    testId="locations-program-create-schedule"
                >
                    <p className="text-sm text-alloy-midnight/75">{scheduleSummary}</p>
                </ConfigEditorSection>

                <ConfigEditorSection title="Advanced" testId="locations-program-create-advanced">
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Default room types</span>
                        <input
                            type="text"
                            value={defaultRoomTypes}
                            onChange={(event) => setDefaultRoomTypes(event.target.value)}
                            placeholder="Comma-separated room categories"
                            className="config-runtime-input"
                            data-testid="locations-program-create-room-types"
                        />
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
                        onClick={() => void submit()}
                        data-testid="locations-program-create-save"
                    >
                        {saving ? "Adding…" : "Add program"}
                    </ConfigurationPrimaryButton>
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                </div>
            </div>
        </div>
    );
}
