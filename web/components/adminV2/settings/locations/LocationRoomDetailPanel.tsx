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
import {
    ordinaryCapacityKindForRole,
    parseOrdinaryCapacityInput,
    readOrdinaryCapacity,
} from "@/lib/locations/objectCapacity";
import type {
    ChildcareCapacityRuleRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import {
    SpaceRatioRead,
    SpaceRatioTierFields,
    type RatioDraftRow,
} from "@/components/adminV2/settings/locations/SpaceRatioSection";
import {
    readObjectRatioTiers,
    resolveObjectRatioStanding,
    sameTiers,
    validateRatioTiers,
} from "@/lib/locations/objectRatio";
import {
    presentRoomTopology,
    roomRailTopologySegments,
} from "@/lib/locations/topologyPresentation";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import {
    roleAcceptsInside,
    roleUsesProgramFields,
    roomTypeHint,
    roomTypeOptionsFor,
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
    ratioRules = [],
    ratioTiers = [],
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
    /**
     * Canonical staffing ratios, for the operational space's own section.
     *
     * Optional because the panel can render before the rules bundle resolves;
     * an absent list reads as "no ratio yet", which is what it looks like. A
     * source guard in tests/location/objectRatioSurface pins that the page
     * really supplies them, so the default cannot quietly become the behaviour.
     */
    ratioRules?: readonly ChildcareRatioRuleRow[];
    ratioTiers?: readonly ChildcareRatioRuleTierRow[];
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
    const [kindFilter, setKindFilter] = useState<"all" | "operational" | "physical">("all");
    const [ratioDraft, setRatioDraft] = useState<RatioDraftRow[]>([]);
    const [confirmingArchive, setConfirmingArchive] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [archiveError, setArchiveError] = useState<string | null>(null);

    /** How this space's two ratio records stand to each other, if it is operational. */
    const ratioStandingFor = (entry: LocationHierarchyRow) =>
        resolveObjectRatioStanding({
            rules: ratioRules,
            tierRows: ratioTiers,
            roomLocationId: entry.id,
            legacyRaw: ((entry.metadata ?? {}) as Record<string, unknown>).student_teacher_ratio,
            todayYmd,
        });

    /**
     * What the ratio editor opens with.
     *
     *   conflict      → NOTHING. Two disagreeing staffing records are a question
     *                   about staffing law, and pre-filling one would answer it
     *                   by accident the moment someone pressed Save.
     *   legacy only   → the recorded tiers, so confirming them is one click.
     *                   Reading them is not deciding anything: no canonical rule
     *                   contradicts them yet.
     *   otherwise     → whatever is canonically in force.
     *
     * Seeded at open rather than only at hydrate, so the form always reflects
     * what the operator can see at the moment they ask to edit.
     */
    const ratioSeedFor = (entry: LocationHierarchyRow) => {
        const standing = ratioStandingFor(entry);
        if (standing.state === "conflict") return [];
        if (standing.state === "legacy_only") return standing.legacy;
        return readObjectRatioTiers(standing) ?? [];
    };

    const hydrateFromRoom = (next: LocationHierarchyRow) => {
        const md = (next.metadata ?? {}) as Record<string, unknown>;
        setLabel((next.label ?? "").trim());
        // The field shows the CANONICAL ordinary capacity for this object's type,
        // because that is what Save writes. Hydrating it from the legacy metadata
        // number would put a value in the box that saving could not reproduce.
        const canonical = readOrdinaryCapacity(
            capacityRules,
            next.id,
            committedRoomTopology(next, siteId).roomType,
            todayYmd,
        );
        setCapacity(canonical != null ? String(canonical) : "");
        setSupportedKeys(readRoomSupportedProgramKeys(md));
        setSchedulePatternId(readRoomSchedulePatternId(md) ?? "");
        setActive(next.is_active !== false);
        // Committed topology, effective — a historical NULL hydrates as Classroom,
        // so the operator never meets a blank or a raw stored value.
        const committed = committedRoomTopology(next, siteId);
        setRoomType(committed.roomType);
        setInsideId(committed.insideId);
        setRatioDraft(
            ratioSeedFor(next).map((t) => ({ staff: String(t.requiredStaff), children: String(t.maxChildren) })),
        );
        setConfirmingArchive(false);
        setArchiveError(null);
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
    // Read-only topology context. There is no Kind or physical-space control in
    // this panel: the server can safely refuse an unsafe change, but adopting an
    // existing location is its own product slice.
    const topology = room ? presentRoomTopology(room, topologyRows) : null;

    /**
     * One typed number, through the canonical authoring service.
     *
     * The server derives the capacity kind from the object's role and decides
     * whether this is a create, a new version, a same-day replacement or a
     * retirement. Nothing about effective dating reaches the operator.
     */
    const saveObjectCapacity = async (
        roomId: string,
        role: CanonicalUnitRole,
        value: number | null,
    ): Promise<void> => {
        const res = await fetch("/api/admin/operational-config/capacity-rules", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "set_object_capacity",
                room_location_id: roomId,
                unit_role: role,
                capacity: value,
            }),
        });
        if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(json.error ?? `Could not save capacity (${res.status})`);
        }
    };

    /** One ratio, through the canonical authoring service. */
    const saveObjectRatio = async (
        roomId: string,
        tiers: readonly { requiredStaff: number; maxChildren: number }[],
    ): Promise<void> => {
        const res = await fetch("/api/admin/operational-config/ratio-rules", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set_object_ratio", room_location_id: roomId, tiers }),
        });
        if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(json.error ?? `Could not save the staffing ratio (${res.status})`);
        }
    };

    /**
     * Archive, through the server's own evaluation.
     *
     * The refusal is the server's, by name — a client-side guess about whether a
     * room still has children placed in it would be a suggestion, and the one
     * that mattered would be the one it got wrong.
     */
    const archiveThisSpace = async () => {
        if (!room) return;
        setArchiving(true);
        setArchiveError(null);
        try {
            const res = await fetch(`/api/admin/locations/${room.id}/archive`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(json.error ?? `Could not archive this space (${res.status})`);
            }
            setConfirmingArchive(false);
            await onCapacityChanged();
        } catch (e) {
            setArchiveError(e instanceof Error ? e.message : "Could not archive this space.");
        } finally {
            setArchiving(false);
        }
    };

    const beginEdit = () => {
        if (room) {
            setRatioDraft(
                ratioSeedFor(room).map((t) => ({ staff: String(t.requiredStaff), children: String(t.maxChildren) })),
            );
        }
        setEditing(true);
    };
    const cancelEdit = () => {
        if (!room) return;
        hydrateFromRoom(room);
        setEditing(false);
    };

    const showsInside = roleAcceptsInside(roomType) && insideOptions.length > 0;

    // Same rule as create: only a Classroom can sit inside a physical room, so a
    // A Kind change away from Operational drops a pending physical space rather than carrying
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

    /** The canonical ordinary capacity for a row, in the rail's own vocabulary. */
    /**
     * The operational spaces this physical space supports, by name.
     *
     * Read from the SAME canonical parent relationship the operational side
     * writes — `parent_location_id` — so the two directions cannot disagree.
     * There is no second association table and no duplicated topology state.
     */
    /*
     * KIND FILTER. Twelve mixed rows is not a site an operator can read at a
     * glance, and the two kinds answer different questions — "where do children
     * go" and "what places exist". Presentation only: it narrows the rail and
     * creates no second classification of anything.
     */
    const kindOf = (entry: LocationHierarchyRow): CanonicalUnitRole =>
        committedRoomTopology(entry, siteId).roomType;
    const kindCounts = {
        all: rooms.length,
        operational: rooms.filter((r) => kindOf(r) === "operational_group").length,
        physical: rooms.filter((r) => kindOf(r) !== "operational_group").length,
    };
    const visibleRooms =
        kindFilter === "all" ? rooms
        : kindFilter === "operational" ? rooms.filter((r) => kindOf(r) === "operational_group")
        : rooms.filter((r) => kindOf(r) !== "operational_group");

    const operationalSpacesIn = (entry: LocationHierarchyRow): string[] =>
        rooms
            .filter((r) => r.parent_location_id === entry.id && r.is_active !== false)
            .map((r) => (r.label ?? "").trim() || "Untitled space")
            .sort((a, b) => a.localeCompare(b));

    const canonicalCapacityFor = (entry: LocationHierarchyRow): number | null =>
        readOrdinaryCapacity(capacityRules, entry.id, committedRoomTopology(entry, siteId).roomType, todayYmd);

    const detail =
        createDetail ? createDetail
        : !room ?
            rooms.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-room-workspace-empty"
                    title="No spaces yet"
                    description="Add a classroom or a physical space to describe how this location operates."
                    actions={
                        canMutate && onAddRoom ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={onAddRoom}
                                data-testid="locations-room-empty-add"
                            >
                                Add space
                            </ConfigurationPrimaryButton>
                        :   null
                    }
                />
            :   <ConfigurationEmptyState
                    testId="locations-room-workspace-empty"
                    title="Select a space"
                    description="Choose a space to review its capacity, programs and schedule."
                />
        : editing ?
            <div className="space-y-3" data-testid="locations-room-edit">
                <ConfigObjectHeader
                    size="hero"
                    name={label.trim() || "Untitled space"}
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
                    <ConfigEditorSection title="Space" testId="locations-room-editor-identity">
                        <label className="block max-w-md space-y-1">
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
                        <label className="block max-w-md space-y-1">
                            <span className="config-typo-field-label">Kind</span>
                            <select
                                value={roomType}
                                disabled={!canMutate}
                                onChange={(e) => changeRoomType(e.target.value as CanonicalUnitRole)}
                                className="config-runtime-select"
                                data-testid="locations-room-type"
                            >
                                {roomTypeOptionsFor(committedRoomTopology(room, siteId).roomType).map((option) => (
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
                                <span className="config-typo-field-label">Physical space</span>
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
                            <p className="config-typo-sublabel" data-testid="locations-room-capacity-hint">
                                {ordinaryCapacityKindForRole(roomType) === "operational" ?
                                    "How many children this class takes."
                                :   "How many people this space holds."}
                            </p>
                        </label>
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

                    {/* Classroom-only. A physical space serves no program and keeps no
                        default pattern, so offering either would author data that
                        nothing reads. */}
                    {roleUsesProgramFields(roomType) ?
                    <>
                    <ConfigEditorSection
                        title="Programs supported"
                        description="Programs offered at this location that this space can serve."
                        testId="locations-room-editor-programs"
                    >
                        {programOptions.length === 0 ?
                            <p className="config-typo-sublabel">
                                Offer Programs at this Location before assigning them to classrooms.
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
                        title="Staffing ratio"
                        description="One step per staffing threshold. Two staff for up to 11 children is a different promise from two for up to 10, so each step is kept as you enter it."
                        testId="locations-room-editor-ratio"
                    >
                        <SpaceRatioTierFields draft={ratioDraft} disabled={!canMutate} onChange={setRatioDraft} />
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Default schedule"
                        description="Optional default Schedule Definition for this space. Enrollment still chooses from the Location catalog."
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
                    </>
                    :   null}

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
                                        let capacityWritten = false;
                                        try {
                                            // ORDER MATTERS. Capacity is the part a domain
                                            // rule can refuse, so it goes first: a refusal
                                            // then leaves nothing half-saved and the
                                            // operator can fix the number in place. The
                                            // location patch that follows is idempotent, so
                                            // a retry after a later failure is harmless.
                                            const parsed = parseOrdinaryCapacityInput(capacity);
                                            if (!parsed.ok) throw new Error(parsed.message);
                                            // Only when it actually changed. An ordinary
                                            // rename should not cost a capacity round-trip,
                                            // and a Save that touches nothing should reach
                                            // the rule engine not at all.
                                            if (parsed.value !== canonicalCapacityFor(room)) {
                                                await saveObjectCapacity(room.id, roomType, parsed.value);
                                                capacityWritten = true;
                                            }
                                            // Ratio rides in the SAME save. Only an
                                            // operational space has one, and only a real
                                            // change reaches the rule engine.
                                            if (roleUsesProgramFields(roomType)) {
                                                const rows = ratioDraft.filter(
                                                    (d) => d.staff.trim() !== "" || d.children.trim() !== "",
                                                );
                                                const check = validateRatioTiers(
                                                    rows.map((d) => ({
                                                        requiredStaff: Number(d.staff),
                                                        maxChildren: Number(d.children),
                                                    })),
                                                );
                                                if (!check.ok) throw new Error(check.message);
                                                /*
                                                 * ONLY WHEN THE OPERATOR ACTUALLY CHANGED IT.
                                                 *
                                                 * A conflicted space opens its ratio editor
                                                 * EMPTY on purpose — pre-filling one of two
                                                 * disagreeing records would settle a
                                                 * staffing-law question by accident. But an
                                                 * empty draft then looked exactly like "the
                                                 * operator cleared every tier", so opening
                                                 * Infant A to change its name and pressing
                                                 * Save RETIRED its canonical ratio. Measured
                                                 * on staging: rule 31bc3220 came back with
                                                 * effective_end set to that day and no
                                                 * replacement.
                                                 *
                                                 * Comparing against the seed makes clearing
                                                 * an explicit act again: a space that opened
                                                 * empty and stayed empty writes nothing.
                                                 */
                                                if (!sameTiers(check.tiers, ratioSeedFor(room))) {
                                                    await saveObjectRatio(room.id, check.tiers);
                                                    capacityWritten = true;
                                                }
                                            }
                                            // `capacity` is deliberately NOT passed: an
                                            // ordinary save no longer writes
                                            // locations.metadata.capacity, and omitting the
                                            // key leaves an unreviewed legacy value intact
                                            // for the existing review flow to resolve.
                                            const metadata = writeRoomProgramsAndScheduleMetadata({
                                                existing: (room.metadata ?? {}) as Record<string, unknown>,
                                                supportedProgramKeys: supportedKeys,
                                                schedulePatternId: schedulePatternId || null,
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
                                            if (capacityWritten) await onCapacityChanged();
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
                                {saving ? "Saving…" : "Save space"}
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
                    name={label.trim() || "Untitled space"}
                    status={{ label: statusLabel, tone: active ? "active" : "inactive" }}
                    facts={[siteLabel ? `At ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationSecondaryButton
                                    onClick={beginEdit}
                                    data-testid="locations-room-toggle-edit"
                                >
                                    Edit space
                                </ConfigurationSecondaryButton>
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setArchiveError(null);
                                        setConfirmingArchive(true);
                                    }}
                                    data-testid="locations-room-archive"
                                >
                                    Archive space
                                </ConfigurationSecondaryButton>
                            </div>
                        :   null
                    }
                    testId="locations-room-header"
                />

                {confirmingArchive ?
                    <div
                        className="rounded-lg border border-alloy-ember/35 bg-alloy-ember/[0.06] px-3 py-2.5 text-[12px] text-alloy-midnight"
                        data-testid="locations-room-archive-confirm"
                    >
                        <p className="text-sm font-semibold">
                            Archive {label.trim() || "this space"}?
                        </p>
                        <p className="mt-1 text-alloy-midnight/75">
                            It leaves this site&rsquo;s spaces and stops being offered for assignments,
                            scheduling and new configuration. Everything already recorded about it —
                            attendance, placements, schedules — stays exactly as it is and keeps naming it.
                        </p>
                        <p className="mt-1 text-alloy-midnight/75">
                            This is not the same as making a space <strong>Inactive</strong>. Inactive keeps
                            it here, paused, for when it comes back.
                        </p>
                        {archiveError ?
                            <p className="mt-2 text-sm text-red-800" role="alert" data-testid="locations-room-archive-error">
                                {archiveError}
                            </p>
                        :   null}
                        <div className="mt-2 flex flex-wrap gap-2">
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={archiving}
                                onClick={() => void archiveThisSpace()}
                                data-testid="locations-room-archive-commit"
                            >
                                {archiving ? "Archiving…" : "Archive space"}
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton
                                disabled={archiving}
                                onClick={() => {
                                    setConfirmingArchive(false);
                                    setArchiveError(null);
                                }}
                                data-testid="locations-room-archive-cancel"
                            >
                                Keep it
                            </ConfigurationSecondaryButton>
                        </div>
                    </div>
                :   null}

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-room-ops">
                    {[
                        {
                            key: "type",
                            label: "Kind",
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
                        // A relationship, not a nesting lesson. Shown only when the
                        // operational space actually names one.
                        ...(topology!.containingSpaceLabel ?
                            [{ key: "inside", label: "Physical space", value: topology!.containingSpaceLabel }]
                        :   []),
                        // The other side of that relationship. A physical space that
                        // supports operational ones should say so from its own page,
                        // rather than making the operator open each group to find out.
                        ...(operationalSpacesIn(room).length > 0 ?
                            [
                                {
                                    key: "operational-spaces",
                                    label:
                                        operationalSpacesIn(room).length === 1 ?
                                            "Operational space"
                                        :   "Operational spaces",
                                    value: operationalSpacesIn(room).join(", "),
                                },
                            ]
                        :   []),
                        {
                            // The AUTHORED number for this object, never the derived
                            // binding figure. Binding can be lower for reasons this field
                            // did not author — a licensed ceiling, a ratio, staffing — and
                            // showing it here would make the object look like it holds a
                            // value nobody typed. When they differ, the capacity section
                            // below says so in words.
                            key: "capacity",
                            label: "Capacity",
                            value: canonicalCapacityFor(room) != null ? String(canonicalCapacityFor(room)) : "Not set",
                        },
                        // Programs and schedule are operational facts. A physical space has
                        // neither, and an em dash for a property that cannot apply reads
                        // as missing data rather than as an inapplicable field.
                        ...(roleUsesProgramFields(committedRoomTopology(room, siteId).roomType) ?
                            [
                                {
                                    key: "programs",
                                    label: "Programs",
                                    value: programLabels.length > 0 ? programLabels.join(", ") : "None",
                                },
                            ]
                        :   []),
                        ...(roleUsesProgramFields(committedRoomTopology(room, siteId).roomType) ?
                            [
                                {
                                    key: "schedule",
                                    label: "Schedule pattern",
                                    value: pattern?.label ?? "None",
                                    hint:
                                        patternSummary && pattern ?
                                            patternSummary.replace(`${pattern.label} · `, "")
                                        :   undefined,
                                },
                            ]
                        :   []),
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

                {/*
                  * Staffing ratio reads here and is EDITED in the space's own edit
                  * form, beside name and capacity. The rule-engine sections that
                  * used to sit below this point are gone from ordinary detail:
                  * the engine, its history, its effective dating and its routes
                  * are all intact, but space management stops advertising them.
                  */}
                {roleUsesProgramFields(committedRoomTopology(room, siteId).roomType) ?
                    <SpaceRatioRead standing={ratioStandingFor(room)} />
                :   null}

                <RoomOrganizationCalculationPanel roomId={room.id} />
            </div>
        ;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Spaces"
            listSummary={`${visibleRooms.length} ${visibleRooms.length === 1 ? "space" : "spaces"}`}
            listFilter={
                <div className="flex flex-wrap gap-1" data-testid="locations-room-kind-filter" role="group" aria-label="Filter spaces by kind">
                    {([
                        ["all", "All", kindCounts.all],
                        ["operational", "Operational", kindCounts.operational],
                        ["physical", "Physical", kindCounts.physical],
                    ] as const).map(([key, label, count]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setKindFilter(key)}
                            data-testid={`locations-room-kind-filter-${key}`}
                            aria-pressed={kindFilter === key}
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                                kindFilter === key ?
                                    "bg-alloy-bend-pine/[0.14] text-alloy-bend-pine"
                                :   "text-alloy-midnight/55 hover:bg-alloy-midnight/[0.04]"
                            }`}
                        >
                            {label} {count}
                        </button>
                    ))}
                </div>
            }
            listActions={
                canMutate && onAddRoom ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={onAddRoom}
                        data-testid="locations-room-add"
                    >
                        + Add space
                    </ConfigurationPrimaryButton>
                :   null
            }
            testId="locations-rooms"
            list={
                visibleRooms.length > 0 ?
                    visibleRooms.map((entry) => {
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
                            // CANONICAL, not the legacy metadata number. The rail used to
                            // read `metadata.capacity` while the detail read the rules, so
                            // one screen could say "8 capacity" beside "No capacity
                            // configured for this room". A room whose only value is the
                            // untyped legacy one says so, rather than showing a number the
                            // object cannot edit and the resolver does not honour.
                            canonicalCapacityFor(entry) != null ? `${canonicalCapacityFor(entry)} capacity`
                            : capacityMd.capacity ? "capacity needs review"
                            : null,
                            keys.length > 0 ? `${keys.length} program${keys.length === 1 ? "" : "s"}` : null,
                        ].filter(Boolean);
                        return (
                            <ConfigurationQueueItem
                                key={entry.id}
                                variant="rail"
                                active={selected}
                                title={String(entry.label ?? "").trim() || "Untitled space"}
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
