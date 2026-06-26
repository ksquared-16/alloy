"use client";

import { useEffect, useState } from "react";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { mergeLocationMetadataField } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import ConfigurationAdvancedSection from "@/components/adminV2/settings/locations/ConfigurationAdvancedSection";

export default function LocationRoomDetailPanel({
    room,
    siteLabel,
    programOptions,
    ageUnitSelectOptions,
    canMutate,
    onSave,
}: {
    room: LocationHierarchyRow | null;
    siteLabel: string;
    programOptions: LocationProgramCategoryRow[];
    ageUnitSelectOptions: readonly { value: string; label: string }[];
    canMutate: boolean;
    onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [capacity, setCapacity] = useState("");
    const [programKey, setProgramKey] = useState("");
    const [ageFrom, setAgeFrom] = useState("");
    const [ageTo, setAgeTo] = useState("");
    const [ageUnit, setAgeUnit] = useState("");
    const [studentTeacherRatio, setStudentTeacherRatio] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!room) return;
        const md = readLocationMetadataPresentation(room.metadata);
        setLabel((room.label ?? "").trim());
        setCapacity(md.capacity ?? "");
        setProgramKey(md.category ?? "");
        setAgeFrom(md.age_range_from ?? "");
        setAgeTo(md.age_range_to ?? "");
        setAgeUnit(md.age_range_unit ?? "");
        setStudentTeacherRatio(md.student_teacher_ratio ?? "");
        setActive(room.is_active !== false);
        setError(null);
    }, [room]);

    if (!room) {
        return (
            <ConfigurationEmptyState
                testId="locations-room-workspace-empty"
                title="Select a room"
                description="Choose a classroom to edit name, capacity, program assignment, and active status."
            />
        );
    }

    return (
        <ConfigurationDetailCard testId="locations-room-detail" title={label.trim() || "Untitled room"}>
            <div className="space-y-4">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate}
                        onChange={(e) => setLabel(e.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-room-name"
                    />
                </label>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Program</span>
                    <select
                        value={programKey}
                        disabled={!canMutate}
                        onChange={(e) => setProgramKey(e.target.value)}
                        className="config-runtime-select"
                        data-testid="locations-room-program"
                    >
                        <option value="">—</option>
                        {programOptions.map((p) => (
                            <option key={p.id} value={p.key}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Capacity</span>
                    <input
                        type="number"
                        min={0}
                        value={capacity}
                        disabled={!canMutate}
                        onChange={(e) => setCapacity(e.target.value)}
                        className="config-runtime-input max-w-[8rem]"
                        data-testid="locations-room-capacity"
                    />
                </label>

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

                {error ?
                    <p className="text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                {canMutate ?
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        disabled={saving}
                        data-testid="locations-room-save"
                        onClick={() => {
                            void (async () => {
                                setSaving(true);
                                setError(null);
                                try {
                                    let metadata = mergeLocationMetadataField(room.metadata, "capacity", capacity.trim() || null);
                                    metadata = mergeLocationMetadataField(metadata, "category", programKey.trim() || null);
                                    metadata = mergeLocationMetadataField(metadata, "age_range_from", ageFrom.trim() || null);
                                    metadata = mergeLocationMetadataField(metadata, "age_range_to", ageTo.trim() || null);
                                    metadata = mergeLocationMetadataField(metadata, "age_range_unit", ageUnit.trim() || null);
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "student_teacher_ratio",
                                        studentTeacherRatio.trim() || null,
                                    );
                                    await onSave(room.id, {
                                        label: label.trim() || null,
                                        is_active: active,
                                        metadata,
                                    });
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Save failed");
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Saving…" : "Save room"}
                    </ConfigurationPrimaryButton>
                :   null}

                <ConfigurationAdvancedSection testId="locations-room-advanced">
                    <div>
                        <span className="config-typo-field-label">Location</span>
                        <p className="config-typo-sublabel mt-1">{siteLabel}</p>
                    </div>
                    <div className="space-y-2">
                        <span className="config-typo-field-label">Age range</span>
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                            <input
                                type="text"
                                value={ageFrom}
                                disabled={!canMutate}
                                onChange={(e) => setAgeFrom(e.target.value)}
                                placeholder="From"
                                className="config-runtime-input"
                            />
                            <input
                                type="text"
                                value={ageTo}
                                disabled={!canMutate}
                                onChange={(e) => setAgeTo(e.target.value)}
                                placeholder="To"
                                className="config-runtime-input"
                            />
                            <select
                                value={ageUnit}
                                disabled={!canMutate}
                                onChange={(e) => setAgeUnit(e.target.value)}
                                className="config-runtime-select"
                            >
                                <option value="">Unit</option>
                                {ageUnitSelectOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <label className="block space-y-1.5">
                        <span className="config-typo-field-label">Student:teacher ratio</span>
                        <input
                            type="text"
                            value={studentTeacherRatio}
                            disabled={!canMutate}
                            onChange={(e) => setStudentTeacherRatio(e.target.value)}
                            className="config-runtime-input max-w-[8rem]"
                        />
                    </label>
                    <div>
                        <span className="config-typo-field-label">Room ID</span>
                        <p className="config-typo-meta mt-1 font-mono text-[11px]">{room.id}</p>
                    </div>
                    <div>
                        <span className="config-typo-field-label">Parent location ID</span>
                        <p className="config-typo-meta mt-1 font-mono text-[11px]">{room.parent_location_id ?? "—"}</p>
                    </div>
                </ConfigurationAdvancedSection>
            </div>
        </ConfigurationDetailCard>
    );
}
