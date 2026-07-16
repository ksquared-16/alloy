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
    CONFIG_OBJECT_CELL,
    ConfigAttentionPanel,
    ConfigChildObjectMasterDetail,
    ConfigConsequenceLine,
    ConfigEditorSection,
    ConfigObjectHeader,
    type ConfigAttentionItem,
} from "@/components/adminV2/settings/configurationRuntime/workspace";

function roomAttention(params: {
    capacity: string;
    programKey: string;
    thresholds: StaffingThreshold[];
}): ConfigAttentionItem[] {
    const items: ConfigAttentionItem[] = [];
    if (!params.capacity.trim()) {
        items.push({
            key: "capacity",
            grade: "fix",
            label: "Capacity is not set",
            consequence: "This room cannot count toward location inventory.",
            nextLabel: "Set capacity",
        });
    }
    if (!params.programKey.trim()) {
        items.push({
            key: "program",
            grade: "fix",
            label: "No program assigned",
            consequence: "Placement cannot route children into this room.",
            nextLabel: "Assign program",
        });
    }
    if (params.thresholds.length === 0) {
        items.push({
            key: "staffing",
            grade: "fix",
            label: "Staffing thresholds are missing",
            consequence: "Ratio guidance stays incomplete for this room.",
            nextLabel: "Add staffing",
        });
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

    const hydrateFromRoom = (next: LocationHierarchyRow) => {
        const md = readLocationMetadataPresentation(next.metadata);
        setLabel((next.label ?? "").trim());
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
        setActive(next.is_active !== false);
        setError(null);
    };

    useEffect(() => {
        if (!room) return;
        hydrateFromRoom(room);
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
    const ageDisplay =
        ageFrom || ageTo ?
            `${[ageFrom, ageTo].filter(Boolean).join("–")}${ageUnit ? ` ${ageUnit}` : ""}`
        :   "Not set";
    const statusLabel =
        !active ? "Inactive"
        : attention.some((item) => item.grade === "fix") ? "Needs setup"
        :   "Active · ready";
    const statusTone =
        !active ? "inactive"
        : attention.some((item) => item.grade === "fix") ? "attention"
        :   "active";

    const beginEdit = () => setEditing(true);
    const cancelEdit = () => {
        if (!room) return;
        hydrateFromRoom(room);
        setEditing(false);
    };

    const detail =
        !room ?
            rooms.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-room-workspace-empty"
                    title="No rooms yet"
                    description="Add a room to begin tracking capacity for this location."
                    actions={
                        canMutate && onAddRoom ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={onAddRoom}
                                data-testid="locations-room-empty-add"
                            >
                                Add room
                            </ConfigurationPrimaryButton>
                        :   null
                    }
                />
            :   <ConfigurationEmptyState
                    testId="locations-room-workspace-empty"
                    title="Select a room"
                    description="Choose a classroom to see what it can serve and what still needs setup."
                />
        : editing ?
            <div className="space-y-3" data-testid="locations-room-edit">
                <ConfigObjectHeader
                    size="hero"
                    name={label.trim() || "Untitled room"}
                    status={{ label: "Editing", tone: "attention" }}
                    facts={[programLabel ?? "", siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            onClick={cancelEdit}
                            data-testid="locations-room-cancel-edit"
                        >
                            Cancel
                        </button>
                    }
                    testId="locations-room-header"
                />

                <div className="space-y-2.5" data-testid="locations-room-editor">
                    <ConfigEditorSection title="Identity" testId="locations-room-editor-identity">
                        <div className="grid gap-2.5 sm:grid-cols-2">
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
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Capacity / participation"
                        description="How many children this room can hold, and staffing thresholds."
                        testId="locations-room-editor-capacity"
                    >
                        <div className="grid gap-3 lg:grid-cols-[9rem_minmax(0,1fr)]">
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
                    </ConfigEditorSection>

                    <ConfigEditorSection title="Age range" testId="locations-room-editor-age">
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
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Hours / operating rules"
                        description="Rooms follow this location’s weekly hours."
                        testId="locations-room-editor-schedule"
                    >
                        <p className="text-sm text-alloy-midnight/75">Uses {siteLabel} hours</p>
                    </ConfigEditorSection>

                    {error ?
                        <p className="text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}

                    {canMutate ?
                        <div className="flex flex-wrap gap-2 pt-1">
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
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-medium text-alloy-midnight/65"
                                onClick={cancelEdit}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                        </div>
                    :   null}
                </div>
            </div>
        :   <div className="space-y-3" data-testid="locations-room-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={label.trim() || "Untitled room"}
                    status={{ label: statusLabel, tone: statusTone }}
                    facts={[programLabel ?? "", siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={beginEdit}
                                data-testid="locations-room-toggle-edit"
                            >
                                Adjust room
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

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-room-ops">
                    {[
                        {
                            key: "capacity",
                            label: "Capacity",
                            value: capacity.trim() ? capacity.trim() : "Not set",
                            hint: capacity.trim() ? "Children this room can hold" : "Required for inventory",
                            tone: capacity.trim() ? "ready" : "attention",
                        },
                        {
                            key: "staffing",
                            label: "Staffing",
                            value:
                                configuredThresholds.length > 0 ?
                                    configuredThresholds.map(formatStaffingThreshold).join(", ")
                                :   "Not set",
                            hint: "Staff → max children",
                            tone: configuredThresholds.length > 0 ? "ready" : "attention",
                        },
                        {
                            key: "program",
                            label: "Program",
                            value: programLabel ?? "Not assigned",
                            hint: "Participation",
                            tone: programLabel ? "ready" : "attention",
                        },
                        {
                            key: "age",
                            label: "Age range",
                            value: ageDisplay,
                            hint: "Who this room serves",
                            tone: ageDisplay === "Not set" ? "attention" : "ready",
                        },
                        {
                            key: "hours",
                            label: "Hours",
                            value: "Location hours",
                            hint: `Uses ${siteLabel} hours`,
                            tone: "ready",
                        },
                        {
                            key: "status",
                            label: "Status",
                            value: statusLabel,
                            hint: active ? "Participates in placement" : "Not active",
                            tone: statusTone === "attention" ? "attention" : "ready",
                        },
                    ].map((card) => (
                        <div
                            key={card.key}
                            className={CONFIG_OBJECT_CELL}
                            data-testid={`locations-room-metric-${card.key}`}
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                {card.label}
                            </p>
                            <p
                                className={`mt-0.5 text-base font-semibold leading-tight ${
                                    card.tone === "attention" ? "text-alloy-ember" : "text-alloy-midnight"
                                }`}
                            >
                                {card.value}
                            </p>
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{card.hint}</p>
                        </div>
                    ))}
                </div>

                <ConfigAttentionPanel
                    items={attention}
                    compact
                    embedded
                    testId="locations-room-attention"
                    onResolve={beginEdit}
                />
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Rooms"
            listSummary="Capacity per room"
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
                                variant="rail"
                                active={entry.id === selectedRoomId}
                                title={String(entry.label ?? "").trim() || "Untitled room"}
                                subtitle={md.capacity ? `${md.capacity} capacity` : "No capacity"}
                                onClick={() => onSelectRoom(entry.id)}
                                testId={`locations-room-${entry.id}`}
                            />
                        );
                    })
                :   <p className="config-typo-sublabel">No rooms yet.</p>
            }
            detail={detail}
        />
    );
}
