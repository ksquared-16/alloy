"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DoorOpen } from "lucide-react";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { effectiveLocationProgramLabel } from "@/lib/locations/locationProgramCategories";
import {
    readRoomSchedulePatternId,
    readRoomSupportedProgramKeys,
    writeRoomProgramsAndScheduleMetadata,
} from "@/lib/locations/roomOfferingMetadata";
import {
    formatSchedulePatternSummary,
} from "@/lib/locations/schedulePatternPresentation";
import type { SchedulePatternRow } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationQueueItem,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    CONFIG_OBJECT_CELL,
    ConfigChildObjectMasterDetail,
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import RoomOrganizationCalculationPanel from "@/components/adminV2/settings/locations/RoomOrganizationCalculationPanel";
import RoomCapacitySection from "@/components/adminV2/settings/locations/RoomCapacitySection";
import { resolveRoomCapacityStanding } from "@/lib/locations/capacityAdoptionState";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    presentRoomTopology,
    roomRailTopologySegments,
} from "@/lib/locations/topologyPresentation";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import {
    ROOM_TYPE_OPTIONS,
    roleAcceptsInside,
    roomTypeHint,
    type InsideOption,
} from "@/lib/locations/roomTypeVocabulary";
import {
    committedRoomTopology,
    roomTopologyPatch,
} from "@/lib/locations/roomTopologyEdit";
import { topologyRefusalCopy } from "@/lib/locations/topologyRefusalCopy";
import { topologyRefusalCodeOf } from "@/lib/locations/topologyRefusalError";

export default function LocationRoomDetailPanel({
    room,
    siteLabel,
    topologyRows,
    siteId,
    insideOptions,
    capacityRules,
    todayYmd,
    onCapacityChanged,
    programOptions,
    schedulePatterns,
    canMutate,
    onSave,
    rooms,
    selectedRoomId,
    onSelectRoom,
    onAddRoom,
    createDetail,
}: {
    room: LocationHierarchyRow | null;
    siteLabel: string;
    /** Sites + rooms, so topology context resolves through canonical ancestry. */
    topologyRows: readonly LocationHierarchyRow[];
    /** The site this room belongs to, for "directly at the site" containment. */
    siteId: string | null;
    /** Physical rooms this room may be moved inside — the SAME provider create uses. */
    insideOptions: InsideOption[];
    /** Canonical capacity rules, for capacity standing and the canonical display. */
    capacityRules: readonly ChildcareCapacityRuleRow[];
    todayYmd: string;
    onCapacityChanged: () => Promise<void> | void;
    programOptions: LocationProgramCategoryRow[];
    schedulePatterns: SchedulePatternRow[];
    canMutate: boolean;
    onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
    rooms: LocationHierarchyRow[];
    selectedRoomId: string | null;
    onSelectRoom: (roomId: string) => void;
    onAddRoom?: () => void;
    createDetail?: ReactNode;
}) {
    const [label, setLabel] = useState("");
    const [capacity, setCapacity] = useState("");
    const [supportedKeys, setSupportedKeys] = useState<string[]>([]);
    const [schedulePatternId, setSchedulePatternId] = useState("");
    const [active, setActive] = useState(true);
    const [roomType, setRoomType] = useState<CanonicalUnitRole>("operational_group");
    const [insideId, setInsideId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    const hydrateFromRoom = (next: LocationHierarchyRow) => {
        const md = (next.metadata ?? {}) as Record<string, unknown>;
        const capacityMd = readLocationMetadataPresentation(next.metadata);
        setLabel((next.label ?? "").trim());
        setCapacity(capacityMd.capacity ?? "");
        setSupportedKeys(readRoomSupportedProgramKeys(md));
        setSchedulePatternId(readRoomSchedulePatternId(md) ?? "");
        setActive(next.is_active !== false);
        // Committed topology, effective — a historical NULL hydrates as Classroom,
        // so the operator never meets a blank or a raw stored value.
        const committed = committedRoomTopology(next, siteId);
        setRoomType(committed.roomType);
        setInsideId(committed.insideId);
        setError(null);
    };

    useEffect(() => {
        if (!room) return;
        hydrateFromRoom(room);
        setEditing(false);
    }, [room]);

    const programLabels = supportedKeys
        .map((key) => {
            const match = programOptions.find((program) => program.key === key);
            return match ? effectiveLocationProgramLabel(match) : key;
        })
        .filter(Boolean);
    const pattern = schedulePatterns.find((entry) => entry.id === schedulePatternId) ?? null;
    const patternSummary =
        pattern ?
            formatSchedulePatternSummary({
                label: pattern.label,
                scheduleTypeKey: pattern.schedule_type_key,
                weekdays: pattern.weekdays,
                metadata: pattern.metadata ?? null,
            })
        :   null;
    const statusLabel = active ? "Active" : "Inactive";
    // Read-only topology context. There is no Type or Inside control anywhere in
    // this panel: the server can safely refuse an unsafe change, but adopting an
    // existing location is its own product slice.
    const topology = room ? presentRoomTopology(room, topologyRows) : null;
    // Once canonical capacity exists, the untyped field stops being current truth.
    // Two ordinary editors maintaining Canonical = 12 and Legacy = 14 is exactly
    // the ambiguity this convergence removes.
    const capacityStanding = room ? resolveRoomCapacityStanding(room, capacityRules) : null;
    const canEditLegacyCapacity = (capacityStanding?.canonicalRules.length ?? 0) === 0;

    const beginEdit = () => setEditing(true);
    const cancelEdit = () => {
        if (!room) return;
        hydrateFromRoom(room);
        setEditing(false);
    };

    const showsInside = roleAcceptsInside(roomType) && insideOptions.length > 0;

    // Same rule as create: only a Classroom can sit inside a physical room, so a
    // Type change away from Classroom drops a pending Inside rather than carrying
    // an impossible pair into the payload.
    const changeRoomType = (next: CanonicalUnitRole) => {
        setRoomType(next);
        if (!roleAcceptsInside(next)) setInsideId("");
        setError(null);
    };

    const toggleProgram = (key: string) => {
        setSupportedKeys((current) =>
            current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
        );
    };

    const detail =
        createDetail ? createDetail
        : !room ?
            rooms.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-room-workspace-empty"
                    title="No rooms yet"
                    description="Add a room to track capacity for this location."
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
                    description="Choose a room to review capacity, programs, and schedule pattern."
                />
        : editing ?
            <div className="space-y-3" data-testid="locations-room-edit">
                <ConfigObjectHeader
                    size="hero"
                    name={label.trim() || "Untitled room"}
                    status={{ label: "Editing", tone: "attention" }}
                    facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        <ConfigurationSecondaryButton
                            onClick={cancelEdit}
                            data-testid="locations-room-cancel-edit"
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                    testId="locations-room-header"
                />

                <div className="space-y-2.5" data-testid="locations-room-editor">
                    <ConfigEditorSection title="Room" testId="locations-room-editor-identity">
                        <label className="block max-w-md space-y-1">
                            <span className="config-typo-field-label">Room name</span>
                            <input
                                type="text"
                                value={label}
                                disabled={!canMutate}
                                onChange={(e) => setLabel(e.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-room-name"
                            />
                        </label>
                        <label className="block max-w-md space-y-1">
                            <span className="config-typo-field-label">Type</span>
                            <select
                                value={roomType}
                                disabled={!canMutate}
                                onChange={(e) => changeRoomType(e.target.value as CanonicalUnitRole)}
                                className="config-runtime-select"
                                data-testid="locations-room-type"
                            >
                                {ROOM_TYPE_OPTIONS.map((option) => (
                                    <option key={option.role} value={option.role}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="config-typo-sublabel" data-testid="locations-room-type-hint">
                                {roomTypeHint(roomType)}
                            </p>
                        </label>

                        {showsInside ?
                            <label className="block max-w-md space-y-1">
                                <span className="config-typo-field-label">Inside</span>
                                <select
                                    value={insideId}
                                    disabled={!canMutate}
                                    onChange={(e) => setInsideId(e.target.value)}
                                    className="config-runtime-select"
                                    data-testid="locations-room-inside"
                                >
                                    <option value="">
                                        {siteLabel ? `${siteLabel} (no physical room)` : "No physical room"}
                                    </option>
                                    {insideOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        :   null}

                        {canEditLegacyCapacity ?
                            <label className="block max-w-36 space-y-1">
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
                        :   <p className="config-typo-sublabel" data-testid="locations-room-capacity-canonical-owned">
                                Capacity for this room is set in Operational Rules.
                            </p>
                        }
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={active}
                                disabled={!canMutate}
                                onChange={(e) => setActive(e.target.checked)}
                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                data-testid="locations-room-active"
                            />
                            <span className="config-typo-sublabel">Active</span>
                        </label>
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Programs supported"
                        description="Programs offered at this location that this room can serve."
                        testId="locations-room-editor-programs"
                    >
                        {programOptions.length === 0 ?
                            <p className="config-typo-sublabel">
                                Offer Programs at this Location before assigning them to rooms.
                            </p>
                        :   <div className="space-y-2" data-testid="locations-room-programs">
                                {programOptions.map((program) => {
                                    const checked = supportedKeys.includes(program.key);
                                    return (
                                        <label key={program.id} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={!canMutate}
                                                onChange={() => toggleProgram(program.key)}
                                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                                data-testid={`locations-room-program-${program.key}`}
                                            />
                                            <span className="text-sm text-alloy-midnight">
                                                {effectiveLocationProgramLabel(program)}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        }
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Default schedule"
                        description="Optional default Schedule Definition for this room. Enrollment still chooses from the Location catalog."
                        testId="locations-room-editor-schedule"
                    >
                        <label className="block max-w-md space-y-1">
                            <span className="config-typo-field-label">Pattern</span>
                            <select
                                value={schedulePatternId}
                                disabled={!canMutate}
                                onChange={(e) => setSchedulePatternId(e.target.value)}
                                className="config-runtime-select"
                                data-testid="locations-room-schedule-pattern"
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

                    {canMutate ?
                        <div className="flex flex-wrap gap-2 pt-1">
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={saving || !label.trim()}
                                data-testid="locations-room-save"
                                onClick={() => {
                                    void (async () => {
                                        setSaving(true);
                                        setError(null);
                                        try {
                                            const metadata = writeRoomProgramsAndScheduleMetadata({
                                                existing: (room.metadata ?? {}) as Record<string, unknown>,
                                                supportedProgramKeys: supportedKeys,
                                                schedulePatternId: schedulePatternId || null,
                                                capacity: capacity.trim() || null,
                                            });
                                            await onSave(room.id, {
                                                label: label.trim() || null,
                                                is_active: active,
                                                metadata,
                                                // Empty unless the operator actually moved
                                                // topology, so an ordinary rename patches
                                                // exactly what it always did.
                                                ...roomTopologyPatch(
                                                    committedRoomTopology(room, siteId),
                                                    { roomType, insideId },
                                                    siteId,
                                                ),
                                            });
                                            setEditing(false);
                                        } catch (e) {
                                            // A refusal is a normal product state. Explain it
                                            // from the named code; stay in edit mode so the
                                            // rejected topology is never visually committed.
                                            const fallback = e instanceof Error ? e.message : "Save failed";
                                            setError(topologyRefusalCopy(topologyRefusalCodeOf(e), fallback));
                                        } finally {
                                            setSaving(false);
                                        }
                                    })();
                                }}
                            >
                                {saving ? "Saving…" : "Save room"}
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton onClick={cancelEdit} disabled={saving}>
                                Cancel
                            </ConfigurationSecondaryButton>
                        </div>
                    :   null}
                </div>
            </div>
        :   <div className="space-y-3" data-testid="locations-room-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={label.trim() || "Untitled room"}
                    status={{ label: statusLabel, tone: active ? "active" : "inactive" }}
                    facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <ConfigurationSecondaryButton
                                onClick={beginEdit}
                                data-testid="locations-room-toggle-edit"
                            >
                                Edit room
                            </ConfigurationSecondaryButton>
                        :   null
                    }
                    testId="locations-room-header"
                />

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-room-ops">
                    {[
                        {
                            key: "type",
                            label: "Type",
                            value: topology!.typeLabel,
                        },
                        {
                            key: "site",
                            label: "Site",
                            value: topology!.siteLabel ?? siteLabel ?? "Not set",
                        },
                        // Omitted entirely when the room hangs off the site — the detail
                        // grid shows properties that apply, rather than an em dash for
                        // one that cannot.
                        ...(topology!.containingSpaceLabel ?
                            [{ key: "inside", label: "Inside", value: topology!.containingSpaceLabel }]
                        :   []),
                        {
                            key: "programs",
                            label: "Programs",
                            value: programLabels.length > 0 ? programLabels.join(", ") : "None",
                        },
                        {
                            key: "schedule",
                            label: "Schedule pattern",
                            value: pattern?.label ?? "None",
                            hint: patternSummary && pattern ? patternSummary.replace(`${pattern.label} · `, "") : undefined,
                        },
                        {
                            key: "status",
                            label: "Status",
                            value: statusLabel,
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
                            <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">
                                {card.value}
                            </p>
                            {"hint" in card && card.hint ?
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{card.hint}</p>
                            :   null}
                        </div>
                    ))}
                </div>

                <RoomCapacitySection
                    room={room}
                    siteId={siteId}
                    capacityRules={capacityRules}
                    todayYmd={todayYmd}
                    canMutate={canMutate}
                    onAdopted={onCapacityChanged}
                    onSaveRoom={onSave}
                />

                <RoomOrganizationCalculationPanel roomId={room.id} />
            </div>
        ;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Rooms"
            listSummary={`${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
            listActions={
                canMutate && onAddRoom ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={onAddRoom}
                        data-testid="locations-room-add"
                    >
                        + Add room
                    </ConfigurationPrimaryButton>
                :   null
            }
            testId="locations-rooms"
            list={
                rooms.length > 0 ?
                    rooms.map((entry) => {
                        const md = (entry.metadata ?? {}) as Record<string, unknown>;
                        const capacityMd = readLocationMetadataPresentation(entry.metadata);
                        const inactive = entry.is_active === false;
                        const selected = entry.id === selectedRoomId;
                        const keys = readRoomSupportedProgramKeys(md);
                        // Type first, then the physical room containing it. The campus is
                        // the page you are already standing on, so repeating it in every
                        // row would be noise.
                        const subtitleParts = [
                            ...roomRailTopologySegments(entry, topologyRows),
                            inactive ? "Inactive" : "Active",
                            capacityMd.capacity ? `${capacityMd.capacity} capacity` : null,
                            keys.length > 0 ? `${keys.length} program${keys.length === 1 ? "" : "s"}` : null,
                        ].filter(Boolean);
                        return (
                            <ConfigurationQueueItem
                                key={entry.id}
                                variant="rail"
                                active={selected}
                                title={String(entry.label ?? "").trim() || "Untitled room"}
                                subtitle={subtitleParts.join(" · ")}
                                muted={inactive}
                                leading={
                                    <span
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                                            inactive ?
                                                "bg-alloy-midnight/[0.04] text-alloy-midnight/35"
                                            : selected ?
                                                "bg-alloy-bend-pine/[0.14] text-alloy-bend-pine"
                                            :   "bg-alloy-midnight/[0.04] text-alloy-bend-pine"
                                        }`}
                                    >
                                        <DoorOpen className="h-4 w-4" strokeWidth={2} />
                                    </span>
                                }
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
