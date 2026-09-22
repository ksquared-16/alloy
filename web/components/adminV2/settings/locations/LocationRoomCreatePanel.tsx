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
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import {
    ordinaryCapacityKindForRole,
    parseOrdinaryCapacityInput,
} from "@/lib/locations/objectCapacity";
import {
    DEFAULT_ROOM_TYPE,
    ROOM_TYPE_OPTIONS,
    roleAcceptsInside,
    roleUsesProgramFields,
    roomTypeHint,
    type InsideOption,
} from "@/lib/locations/roomTypeVocabulary";
import { topologyRefusalCopy } from "@/lib/locations/topologyRefusalCopy";
import { topologyRefusalCodeOf } from "@/lib/locations/topologyRefusalError";

export default function LocationRoomCreatePanel({
    siteLabel,
    programOptions,
    schedulePatterns,
    insideOptions,
    onCancel,
    onCreate,
}: {
    siteLabel: string;
    programOptions: LocationProgramCategoryRow[];
    schedulePatterns: SchedulePatternRow[];
    /** Physical rooms at this site a classroom may be created inside. */
    insideOptions: InsideOption[];
    onCancel: () => void;
    onCreate: (input: LocationRoomCreateInput) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [roomType, setRoomType] = useState<CanonicalUnitRole>(DEFAULT_ROOM_TYPE);
    const [insideId, setInsideId] = useState("");
    const [supportedKeys, setSupportedKeys] = useState<string[]>([]);
    const [capacity, setCapacity] = useState("");
    const [schedulePatternId, setSchedulePatternId] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const showsInside = roleAcceptsInside(roomType) && insideOptions.length > 0;
    const showsProgramFields = roleUsesProgramFields(roomType);

    // Only a classroom can sit inside a physical room, so a Type change away from
    // Classroom drops a selection that would no longer be meaningful — the payload
    // must never carry an Inside the chosen Type cannot have.
    const changeRoomType = (next: CanonicalUnitRole) => {
        setRoomType(next);
        if (!roleAcceptsInside(next)) setInsideId("");
        if (!roleUsesProgramFields(next)) {
            setSupportedKeys([]);
            setSchedulePatternId("");
        }
        setError(null);
    };

    const toggleProgram = (key: string) => {
        setSupportedKeys((current) =>
            current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
        );
    };

    return (
        <div className="space-y-3" data-testid="locations-room-create">
            <ConfigObjectHeader
                size="hero"
                name="Add space"
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
                    <label className="block max-w-md space-y-1">
                        <span className="config-typo-field-label">Type</span>
                        <select
                            value={roomType}
                            onChange={(event) => changeRoomType(event.target.value as CanonicalUnitRole)}
                            className="config-runtime-select"
                            data-testid="locations-room-create-type"
                        >
                            {ROOM_TYPE_OPTIONS.map((option) => (
                                <option key={option.role} value={option.role}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <p className="config-typo-sublabel" data-testid="locations-room-create-type-hint">
                            {roomTypeHint(roomType)}
                        </p>
                    </label>

                    {showsInside ?
                        <label className="block max-w-md space-y-1">
                            <span className="config-typo-field-label">Inside</span>
                            <select
                                value={insideId}
                                onChange={(event) => setInsideId(event.target.value)}
                                className="config-runtime-select"
                                data-testid="locations-room-create-inside"
                            >
                                <option value="">{siteLabel ? `${siteLabel} (no physical room)` : "No physical room"}</option>
                                {insideOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    :   null}

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
                        <p className="config-typo-sublabel" data-testid="locations-room-create-capacity-hint">
                            {ordinaryCapacityKindForRole(roomType) === "operational" ?
                                "How many children this class takes. Optional."
                            :   "How many people this space holds. Optional."}
                        </p>
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

                {showsProgramFields ?
                <>
                <ConfigEditorSection
                    title="Programs supported"
                    description="Programs offered at this location that this room can serve."
                    testId="locations-room-create-programs"
                >
                    {programOptions.length === 0 ?
                        <p className="config-typo-sublabel">
                            Offer Programs at this Location before assigning them to classrooms.
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

                <ConfigEditorSection
                    title="Default schedule"
                    description="Optional default Schedule Definition for this room."
                    testId="locations-room-create-schedule"
                >
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
                </>
                :   null}

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
                                    // NOT into metadata. A new space records its capacity
                                    // as a typed canonical rule like every other edit does;
                                    // writing the untyped legacy key here would mint the
                                    // very debt the review flow exists to clear.
                                    const parsedCapacity = parseOrdinaryCapacityInput(capacity);
                                    if (!parsedCapacity.ok) throw new Error(parsedCapacity.message);
                                    const metadata = writeRoomProgramsAndScheduleMetadata({
                                        existing: {},
                                        supportedProgramKeys: showsProgramFields ? supportedKeys : [],
                                        schedulePatternId: showsProgramFields ? schedulePatternId || null : null,
                                    });
                                    await onCreate({
                                        capacity: parsedCapacity.value,
                                        label: label.trim(),
                                        is_active: active,
                                        metadata,
                                        unit_role: roomType,
                                        // Only a classroom can carry one, and `showsInside`
                                        // is false for every other type, so this is already
                                        // empty — spelling it out keeps an impossible
                                        // payload impossible rather than merely unlikely.
                                        inside_location_id: roleAcceptsInside(roomType) ? insideId || null : null,
                                    });
                                } catch (cause) {
                                    // Explain the refusal from the server's NAMED code, never
                                    // from its sentence.
                                    const fallback =
                                        cause instanceof Error ? cause.message : "Room could not be created.";
                                    setError(topologyRefusalCopy(topologyRefusalCodeOf(cause), fallback));
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Adding…" : "Add space"}
                    </ConfigurationPrimaryButton>
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                </div>
            </div>
        </div>
    );
}
