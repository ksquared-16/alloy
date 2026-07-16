"use client";

import { useEffect, useState } from "react";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { mergeLocationMetadataField } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import {
    formatStaffingThreshold,
    parseStaffingThresholds,
    serializeStaffingThresholds,
    type StaffingThreshold,
} from "@/lib/locations/locationWorkspaceModel";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

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
    const [staffingThresholds, setStaffingThresholds] = useState<{ requiredStaff: string; maxChildren: string }[]>([]);
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
        const parsedThresholds = parseStaffingThresholds(md.student_teacher_ratio);
        setStaffingThresholds(
            parsedThresholds.length > 0 ?
                parsedThresholds.map((threshold) => ({
                    requiredStaff: String(threshold.requiredStaff),
                    maxChildren: String(threshold.maxChildren),
                }))
            :   [{ requiredStaff: "1", maxChildren: "" }],
        );
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

    const configuredThresholds = staffingThresholds
        .map((threshold) => ({
            requiredStaff: Number(threshold.requiredStaff),
            maxChildren: Number(threshold.maxChildren),
        }))
        .filter(
            (threshold): threshold is StaffingThreshold =>
                Number.isInteger(threshold.requiredStaff) &&
                threshold.requiredStaff > 0 &&
                Number.isInteger(threshold.maxChildren) &&
                threshold.maxChildren > 0,
        )
        .sort((a, b) => a.requiredStaff - b.requiredStaff);

    return (
        <ConfigurationDetailCard testId="locations-room-detail" title={label.trim() || "Untitled room"}>
            <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
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
                    <label className="block space-y-1">
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
                </div>

                <section className="rounded-lg border border-alloy-forge/10 bg-[#00a283]/[0.025] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="config-typo-workspace-title">Capacity & staffing</h3>
                        <span className="text-xs font-medium text-alloy-midnight/65">
                            {capacity.trim() ? `${capacity.trim()} children` : "Capacity not set"}
                        </span>
                    </div>
                    <div className="mt-2 grid gap-3 lg:grid-cols-[9rem_minmax(0,1fr)]">
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Capacity</span>
                            <input
                                type="number"
                                min={0}
                                value={capacity}
                                disabled={!canMutate}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-room-capacity"
                            />
                        </label>
                        <div className="space-y-2" data-testid="locations-room-ratio-thresholds">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="config-typo-field-label">Staffing thresholds</span>
                                <span className="config-typo-meta">Staff members → maximum children</span>
                            </div>
                            {staffingThresholds.map((threshold, index) => (
                                <div
                                    key={index}
                                    className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                >
                                    <label className="block space-y-1">
                                        <span className="config-typo-meta">Staff members</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={threshold.requiredStaff}
                                            disabled={!canMutate}
                                            onChange={(event) =>
                                                setStaffingThresholds((current) =>
                                                    current.map((item, itemIndex) =>
                                                        itemIndex === index ?
                                                            { ...item, requiredStaff: event.target.value }
                                                        :   item,
                                                    ),
                                                )
                                            }
                                            className="config-runtime-input"
                                            data-testid={`locations-room-ratio-${index}-staff`}
                                        />
                                    </label>
                                    <label className="block space-y-1">
                                        <span className="config-typo-meta">Maximum children</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={threshold.maxChildren}
                                            disabled={!canMutate}
                                            onChange={(event) =>
                                                setStaffingThresholds((current) =>
                                                    current.map((item, itemIndex) =>
                                                        itemIndex === index ?
                                                            { ...item, maxChildren: event.target.value }
                                                        :   item,
                                                    ),
                                                )
                                            }
                                            className="config-runtime-input"
                                            data-testid={`locations-room-ratio-${index}-children`}
                                        />
                                    </label>
                                    {staffingThresholds.length > 1 ?
                                        <button
                                            type="button"
                                            className="rounded-md border border-alloy-forge/15 px-2 py-2 text-xs text-alloy-midnight/60"
                                            disabled={!canMutate}
                                            onClick={() =>
                                                setStaffingThresholds((current) =>
                                                    current.filter((_, itemIndex) => itemIndex !== index),
                                                )
                                            }
                                        >
                                            Remove
                                        </button>
                                    :   null}
                                </div>
                            ))}
                            <button
                                type="button"
                                className="text-xs font-medium text-[#007d68] disabled:opacity-40"
                                disabled={!canMutate}
                                onClick={() =>
                                    setStaffingThresholds((current) => [
                                        ...current,
                                        {
                                            requiredStaff: String(current.length + 1),
                                            maxChildren: "",
                                        },
                                    ])
                                }
                                data-testid="locations-room-ratio-add-threshold"
                            >
                                + Add staffing threshold
                            </button>
                        </div>
                    </div>
                    <p className="mt-2 rounded-md border border-[#00a283]/15 bg-white px-2.5 py-1.5 text-xs text-alloy-midnight/70">
                        {capacity.trim() ?
                            `Holds ${capacity.trim()} children${
                                configuredThresholds.length > 0 ?
                                    ` · staffing ${configuredThresholds.map(formatStaffingThreshold).join(", ")}`
                                :   " · add a complete staffing threshold"
                            }.`
                        :   "Capacity is not set up yet."}
                    </p>
                </section>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={active}
                            disabled={!canMutate}
                            onChange={(e) => setActive(e.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                        />
                        <span className="config-typo-sublabel">Active room</span>
                    </label>
                    <p className="config-typo-meta">
                        Uses {siteLabel} hours unless a different room schedule is set.
                    </p>
                </div>

                <div className="space-y-1">
                    <span className="config-typo-field-label">Age range</span>
                    <div className="grid gap-2 sm:grid-cols-3">
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
                                    if (configuredThresholds.length === 0) {
                                        throw new Error("Add at least one complete staffing threshold.");
                                    }
                                    if (
                                        configuredThresholds.some(
                                            (threshold, index) =>
                                                index > 0 &&
                                                (threshold.requiredStaff <=
                                                    configuredThresholds[index - 1]!.requiredStaff ||
                                                    threshold.maxChildren <=
                                                        configuredThresholds[index - 1]!.maxChildren),
                                        )
                                    ) {
                                        throw new Error(
                                            "Each staffing threshold must increase both staff and maximum children.",
                                        );
                                    }
                                    let metadata = mergeLocationMetadataField(
                                        room.metadata,
                                        "capacity",
                                        capacity.trim() || null,
                                    );
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "category",
                                        programKey.trim() || null,
                                    );
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "age_range_from",
                                        ageFrom.trim() || null,
                                    );
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "age_range_to",
                                        ageTo.trim() || null,
                                    );
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "age_range_unit",
                                        ageUnit.trim() || null,
                                    );
                                    metadata = mergeLocationMetadataField(
                                        metadata,
                                        "student_teacher_ratio",
                                        serializeStaffingThresholds(configuredThresholds) || null,
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
            </div>
        </ConfigurationDetailCard>
    );
}
