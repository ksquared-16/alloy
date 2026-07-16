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
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationQueueItem,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigAttentionPanel,
    ConfigChildObjectMasterDetail,
    ConfigConsequenceLine,
    ConfigObjectHeader,
    ConfigWorkspaceCard,
    type ConfigAttentionItem,
} from "@/components/adminV2/settings/configurationRuntime/workspace";

function roomAttention(params: {
    capacity: string;
    programKey: string;
    thresholds: StaffingThreshold[];
}): ConfigAttentionItem[] {
    const items: ConfigAttentionItem[] = [];
    if (!params.capacity.trim()) {
        items.push({ key: "capacity", grade: "fix", label: "Capacity is not set up yet" });
    }
    if (!params.programKey.trim()) {
        items.push({ key: "program", grade: "fix", label: "Assign this room to a program" });
    }
    if (params.thresholds.length === 0) {
        items.push({ key: "staffing", grade: "fix", label: "Add staffing thresholds" });
    }
    if (items.length === 0) {
        items.push({ key: "all-good", grade: "good", label: "Everything looks good" });
    }
    return items;
}

export default function LocationRoomDetailPanel({
    room,
    siteLabel,
    programOptions,
    ageUnitSelectOptions,
    canMutate,
    onSave,
    rooms,
    selectedRoomId,
    onSelectRoom,
    onAddRoom,
}: {
    room: LocationHierarchyRow | null;
    siteLabel: string;
    programOptions: LocationProgramCategoryRow[];
    ageUnitSelectOptions: readonly { value: string; label: string }[];
    canMutate: boolean;
    onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
    rooms: LocationHierarchyRow[];
    selectedRoomId: string | null;
    onSelectRoom: (roomId: string) => void;
    onAddRoom?: () => void;
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
    const [editing, setEditing] = useState(false);

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
        setEditing(false);
    }, [room]);

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

    const attention = roomAttention({
        capacity,
        programKey,
        thresholds: configuredThresholds,
    });
    const programLabel =
        programOptions.find((program) => program.key === programKey)?.label ??
        (programKey ? programKey : null);

    const detail =
        !room ?
            <ConfigurationEmptyState
                testId="locations-room-workspace-empty"
                title="Select a room"
                description="Choose a classroom to see what it can serve and what still needs setup."
            />
        :   <div className="space-y-3" data-testid="locations-room-detail">
                <ConfigObjectHeader
                    name={label.trim() || "Untitled room"}
                    status={{
                        label: active ? "Active" : "Inactive",
                        tone: active ? "active" : "inactive",
                    }}
                    facts={[programLabel ?? "", siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={() => setEditing((current) => !current)}
                                data-testid="locations-room-toggle-edit"
                            >
                                {editing ? "Done reviewing" : "Adjust room"}
                            </button>
                        :   null
                    }
                    testId="locations-room-header"
                />

                <ConfigConsequenceLine testId="locations-room-consequence">
                    {capacity.trim() ?
                        `Holds ${capacity.trim()} children${
                            configuredThresholds.length > 0 ?
                                ` — staffing ${configuredThresholds.map(formatStaffingThreshold).join(", ")}`
                            :   " — add staffing thresholds to finish capacity"
                        }.`
                    :   "Capacity is not set up yet — this room cannot be counted in location inventory."}
                </ConfigConsequenceLine>

                <div className={`grid gap-3 ${attention.some((item) => item.grade !== "good") ? "lg:grid-cols-2" : ""}`}>
                    {attention.some((item) => item.grade !== "good") ?
                        <ConfigAttentionPanel
                            items={attention}
                            compact
                            testId="locations-room-attention"
                            onResolve={() => setEditing(true)}
                        />
                    :   null}
                    <ConfigWorkspaceCard title="What is configured" compact testId="locations-room-summary">
                        <dl className="space-y-1.5 text-sm text-alloy-midnight/80">
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Capacity</dt>
                                <dd className="font-medium">
                                    {capacity.trim() ? `${capacity.trim()} children` : "Not set up yet"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Program</dt>
                                <dd className="font-medium">{programLabel ?? "Not assigned"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Age range</dt>
                                <dd className="font-medium">
                                    {ageFrom || ageTo ?
                                        `${[ageFrom, ageTo].filter(Boolean).join("–")}${ageUnit ? ` ${ageUnit}` : ""}`
                                    :   "Not set up yet"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Hours</dt>
                                <dd className="font-medium">Uses {siteLabel} hours</dd>
                            </div>
                        </dl>
                    </ConfigWorkspaceCard>
                </div>

                {editing ?
                    <ConfigWorkspaceCard title="Adjust this room" testId="locations-room-editor">
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
                                            <span className="config-typo-meta">Staff → max children</span>
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
                                                                        {
                                                                            ...item,
                                                                            requiredStaff: event.target.value,
                                                                        }
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
                                                                        {
                                                                            ...item,
                                                                            maxChildren: event.target.value,
                                                                        }
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
                                                setEditing(false);
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
                    </ConfigWorkspaceCard>
                :   null}
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Rooms"
            listSummary="Capacity lives on each room"
            listActions={
                canMutate && onAddRoom ?
                    <button
                        type="button"
                        className="text-xs font-semibold text-[#007d68]"
                        onClick={onAddRoom}
                        data-testid="locations-room-add"
                    >
                        + Add
                    </button>
                :   null
            }
            testId="locations-rooms"
            list={
                rooms.length > 0 ?
                    rooms.map((entry) => {
                        const md = readLocationMetadataPresentation(entry.metadata);
                        return (
                            <ConfigurationQueueItem
                                key={entry.id}
                                active={entry.id === selectedRoomId}
                                title={String(entry.label ?? "").trim() || "Untitled room"}
                                subtitle={
                                    md.capacity ? `${md.capacity} children`
                                    :   "Needs capacity setup"
                                }
                                onClick={() => onSelectRoom(entry.id)}
                                testId={`locations-room-${entry.id}`}
                            />
                        );
                    })
                :   <p className="config-typo-sublabel">No rooms yet. Add a room to begin capacity setup.</p>
            }
            detail={detail}
        />
    );
}
