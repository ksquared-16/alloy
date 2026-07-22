"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Layers } from "lucide-react";
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
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { effectiveLocationProgramLabel } from "@/lib/locations/locationProgramCategories";
import {
    buildLocationProgramAvailabilityView,
    deriveLocationProgramOfferingState,
    locationProgramAvailabilityStatusLabel,
} from "@/lib/programs/locationProgramAvailability";
import {
    readEligibleSchedulePatternIds,
    writeEligibleSchedulePatternIds,
} from "@/lib/locations/locationSchedulingConfig";
import { operatorProgramError } from "@/lib/programs/programsOperatorPresentation";
import { readRoomSupportedProgramKeys } from "@/lib/locations/roomOfferingMetadata";

type SchedulePatternOption = {
    id: string;
    label: string;
    is_active: boolean;
};

type RoomOption = {
    id: string;
    label: string;
    is_active: boolean;
    metadata?: unknown;
};

/**
 * Location → Programs — collection → selected → edit (Rooms parity).
 * Offered rows are LPC relationships; selection opens a focused workspace.
 */
export default function LocationProgramsOfferedPanel({
    locationId,
    locationLabel,
    offerings,
    schedulePatterns = [],
    rooms = [],
    canMutate,
    selectedOfferingId,
    onSelectOffering,
    onPatchOffering,
    onRefresh,
    onAddProgram,
    createDetail,
}: {
    locationId: string;
    locationLabel: string;
    offerings: LocationProgramCategoryRow[];
    schedulePatterns?: SchedulePatternOption[];
    rooms?: RoomOption[];
    canMutate: boolean;
    selectedOfferingId: string | null;
    onSelectOffering: (offeringId: string) => void;
    onPatchOffering: (
        categoryId: string,
        patch: {
            local_display_name?: string | null;
            available_from?: string | null;
            available_through?: string | null;
            is_active?: boolean;
            metadata?: Record<string, unknown>;
        },
    ) => Promise<void>;
    onRefresh: () => Promise<void> | void;
    onAddProgram?: () => void;
    createDetail?: ReactNode;
}) {
    const offered = useMemo(
        () => offerings.filter((row) => row.is_active !== false),
        [offerings],
    );
    const notOffered = useMemo(
        () => offerings.filter((row) => row.is_active === false),
        [offerings],
    );

    const effectiveId =
        selectedOfferingId && offerings.some((row) => row.id === selectedOfferingId) ?
            selectedOfferingId
        :   (offered[0]?.id ?? notOffered[0]?.id ?? null);

    const selected = offerings.find((row) => row.id === effectiveId) ?? null;

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localDisplayName, setLocalDisplayName] = useState("");
    const [availableFrom, setAvailableFrom] = useState("");
    const [availableThrough, setAvailableThrough] = useState("");
    const [eligiblePatternIds, setEligiblePatternIds] = useState<string[]>([]);
    const [available, setAvailable] = useState(true);

    const hydrate = (row: LocationProgramCategoryRow) => {
        setLocalDisplayName(row.local_display_name ?? "");
        setAvailableFrom(row.available_from ?? "");
        setAvailableThrough(row.available_through ?? "");
        setEligiblePatternIds(readEligibleSchedulePatternIds(row.metadata));
        setAvailable(row.is_active !== false);
        setError(null);
    };

    useEffect(() => {
        if (!selected) return;
        hydrate(selected);
        setEditing(false);
    }, [selected?.id]);

    const orgName = selected ? String(selected.label ?? "").trim() || "Program" : "Program";
    const displayName = selected ? effectiveLocationProgramLabel(selected) : "";
    const offeringState = selected ?
        deriveLocationProgramOfferingState({ relationship: selected })
    :   "not_offered";
    const statusLabel =
        selected ?
            locationProgramAvailabilityStatusLabel(
                offeringState,
                selected.available_from ?? null,
                selected.available_through ?? null,
            )
        :   "";

    const eligibleRooms = useMemo(() => {
        if (!selected) return [];
        const key = String(selected.key ?? "").trim();
        if (!key) return [];
        return rooms.filter((room) => {
            if (room.is_active === false) return false;
            const md =
                room.metadata != null && typeof room.metadata === "object" && !Array.isArray(room.metadata) ?
                    (room.metadata as Record<string, unknown>)
                :   {};
            return readRoomSupportedProgramKeys(md).includes(key);
        });
    }, [rooms, selected]);

    const removeOffering = async (row: LocationProgramCategoryRow) => {
        setSaving(true);
        setError(null);
        try {
            // Soft-remove (is_active=false) is the Location offering off-switch.
            // Hard-deleting LPC rows fails when enrollments or other FKs reference the row —
            // that path previously surfaced as a generic “highlighted fields” error.
            await onPatchOffering(row.id, { is_active: false });
            setEditing(false);
            await onRefresh();
        } catch (err) {
            setError(
                operatorProgramError(
                    err instanceof Error ? err.message : "This Program could not be removed from the Location.",
                ),
            );
        } finally {
            setSaving(false);
        }
    };

    const restoreOffering = async (row: LocationProgramCategoryRow) => {
        setSaving(true);
        setError(null);
        try {
            await onPatchOffering(row.id, { is_active: true });
            setEditing(false);
            await onRefresh();
        } catch (err) {
            setError(
                operatorProgramError(
                    err instanceof Error ? err.message : "This Program could not be offered again.",
                ),
            );
        } finally {
            setSaving(false);
        }
    };

    const saveEdits = async () => {
        if (!selected) return;
        setSaving(true);
        setError(null);
        try {
            const from = availableFrom.trim() || null;
            const through = availableThrough.trim() || null;
            if (from && through && through < from) {
                throw new Error("Available through must be on or after Available from.");
            }
            await onPatchOffering(selected.id, {
                local_display_name: localDisplayName.trim() || null,
                available_from: from,
                available_through: through,
                is_active: available,
                metadata: writeEligibleSchedulePatternIds(selected.metadata, eligiblePatternIds),
            });
            setEditing(false);
            await onRefresh();
        } catch (err) {
            setError(operatorProgramError(err instanceof Error ? err.message : "Save failed"));
        } finally {
            setSaving(false);
        }
    };

    const view =
        selected ?
            buildLocationProgramAvailabilityView({
                locationId,
                locationLabel,
                organizationProgramName: orgName,
                localDisplayName: selected.local_display_name ?? null,
                availableFrom: selected.available_from ?? null,
                availableThrough: selected.available_through ?? null,
                offered: selected.is_active !== false,
            })
        :   null;

    const detail =
        createDetail ? createDetail
        : !selected ?
            offerings.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-program-workspace-empty"
                    title="No Programs offered"
                    description="Add a Program this Location offers."
                    actions={
                        canMutate && onAddProgram ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={onAddProgram}
                                data-testid="locations-program-empty-add"
                            >
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   null
                    }
                />
            :   <ConfigurationEmptyState
                    testId="locations-program-workspace-empty"
                    title="Select a Program"
                    description="Choose a Program to review availability, rooms, and schedule patterns."
                />
        : editing ?
            <div className="space-y-3" data-testid="locations-program-edit">
                <ConfigObjectHeader
                    size="hero"
                    name={displayName}
                    status={{ label: "Editing", tone: "attention" }}
                    facts={[locationLabel ? `At ${locationLabel}` : ""].filter(Boolean)}
                    actions={
                        <ConfigurationSecondaryButton
                            onClick={() => {
                                hydrate(selected);
                                setEditing(false);
                            }}
                            data-testid="locations-program-cancel-edit"
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                    testId="locations-program-header"
                />
                {error ?
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}
                <ConfigEditorSection title="Availability" testId="locations-program-editor-availability">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={available}
                            disabled={!canMutate || saving}
                            onChange={(event) => setAvailable(event.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            data-testid="locations-program-available"
                        />
                        <span className="config-typo-sublabel">Offered at this Location</span>
                    </label>
                    <label className="mt-3 block space-y-1.5">
                        <span className="config-typo-field-label">Name at this Location</span>
                        <input
                            type="text"
                            value={localDisplayName}
                            disabled={!canMutate}
                            onChange={(event) => setLocalDisplayName(event.target.value)}
                            className="config-runtime-input"
                            placeholder={orgName}
                            data-testid="locations-program-local-name"
                        />
                        <span className="block text-[11px] text-alloy-midnight/45">
                            Leave blank to use “{orgName},” the Organization Program name.
                        </span>
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label>
                            <span className="config-typo-field-label">Available from</span>
                            <input
                                type="date"
                                value={availableFrom}
                                disabled={!canMutate}
                                onChange={(event) => setAvailableFrom(event.target.value)}
                                className="config-runtime-input mt-1"
                                data-testid="locations-program-from"
                            />
                        </label>
                        <label>
                            <span className="config-typo-field-label">Available through</span>
                            <input
                                type="date"
                                value={availableThrough}
                                disabled={!canMutate}
                                onChange={(event) => setAvailableThrough(event.target.value)}
                                className="config-runtime-input mt-1"
                                data-testid="locations-program-through"
                            />
                        </label>
                    </div>
                </ConfigEditorSection>
                <ConfigEditorSection title="Eligible Schedule Patterns" testId="locations-program-editor-patterns">
                    {schedulePatterns.length === 0 ?
                        <p className="config-typo-sublabel">No Patterns at this Location yet.</p>
                    :   <ul className="space-y-1.5">
                            {schedulePatterns.map((pattern) => {
                                const checked = eligiblePatternIds.includes(pattern.id);
                                return (
                                    <li key={pattern.id}>
                                        <label className="flex items-center gap-2 text-[12px] text-alloy-midnight/80">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={!canMutate || !pattern.is_active}
                                                onChange={(event) => {
                                                    setEligiblePatternIds((current) =>
                                                        event.target.checked ?
                                                            [...new Set([...current, pattern.id])]
                                                        :   current.filter((id) => id !== pattern.id),
                                                    );
                                                }}
                                                data-testid={`locations-program-pattern-${pattern.id}`}
                                            />
                                            {pattern.label}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    }
                </ConfigEditorSection>
                {canMutate ?
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            disabled={saving}
                            onClick={() => void saveEdits()}
                            data-testid="locations-program-save"
                        >
                            {saving ? "Saving…" : "Save"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            disabled={saving}
                            onClick={() => {
                                hydrate(selected);
                                setEditing(false);
                            }}
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    </div>
                :   null}
            </div>
        :   <div className="space-y-3" data-testid="locations-program-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={displayName}
                    status={{
                        label: selected.is_active !== false ? "Available" : "Not offered",
                        tone: selected.is_active !== false ? "active" : "inactive",
                    }}
                    facts={[locationLabel ? `At ${locationLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationSecondaryButton
                                    onClick={() => setEditing(true)}
                                    data-testid="locations-program-edit"
                                >
                                    Edit Program
                                </ConfigurationSecondaryButton>
                                {selected.is_active !== false ?
                                    <ConfigurationSecondaryButton
                                        disabled={saving}
                                        onClick={() => void removeOffering(selected)}
                                        data-testid="locations-program-remove"
                                    >
                                        Stop offering
                                    </ConfigurationSecondaryButton>
                                :   <ConfigurationSecondaryButton
                                        disabled={saving}
                                        onClick={() => void restoreOffering(selected)}
                                        data-testid="locations-program-restore"
                                    >
                                        Offer again
                                    </ConfigurationSecondaryButton>
                                }
                            </div>
                        :   null
                    }
                    testId="locations-program-header"
                />
                {error ?
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-program-ops">
                    {[
                        {
                            key: "status",
                            label: "Availability",
                            value: statusLabel || (selected.is_active !== false ? "Available now" : "Not offered"),
                        },
                        {
                            key: "name",
                            label: "Name at this Location",
                            value:
                                view?.localDisplayName && view.localDisplayName !== orgName ?
                                    view.effectiveLabel
                                :   "Uses Organization name",
                        },
                        {
                            key: "rooms",
                            label: "Eligible Rooms",
                            value:
                                eligibleRooms.length > 0 ?
                                    eligibleRooms.map((room) => room.label).join(", ")
                                :   "None yet",
                        },
                        {
                            key: "patterns",
                            label: "Eligible Schedule Patterns",
                            value: (() => {
                                const ids = readEligibleSchedulePatternIds(selected.metadata);
                                if (ids.length === 0) return "All Patterns";
                                const labels = ids
                                    .map((id) => schedulePatterns.find((pattern) => pattern.id === id)?.label)
                                    .filter(Boolean);
                                return labels.length > 0 ? labels.join(", ") : `${ids.length} selected`;
                            })(),
                        },
                    ].map((card) => (
                        <div
                            key={card.key}
                            className={CONFIG_OBJECT_CELL}
                            data-testid={`locations-program-metric-${card.key}`}
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                {card.label}
                            </p>
                            <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">
                                {card.value}
                            </p>
                        </div>
                    ))}
                </div>
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Programs"
            listSummary={`${offered.length} offered`}
            listActions={
                canMutate && onAddProgram ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={onAddProgram}
                        data-testid="locations-programs-add"
                    >
                        + Add Program
                    </ConfigurationPrimaryButton>
                :   null
            }
            testId="locations-programs-offered"
            list={
                offerings.length > 0 ?
                    <>
                        {offered.map((row) => {
                            const selectedRow = row.id === effectiveId && !createDetail;
                            const name = effectiveLocationProgramLabel(row);
                            const state = deriveLocationProgramOfferingState({ relationship: row });
                            return (
                                <ConfigurationQueueItem
                                    key={row.id}
                                    variant="rail"
                                    active={selectedRow}
                                    title={name}
                                    subtitle={locationProgramAvailabilityStatusLabel(
                                        state,
                                        row.available_from ?? null,
                                        row.available_through ?? null,
                                    )}
                                    leading={
                                        <span
                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                                                selectedRow ?
                                                    "bg-alloy-bend-pine/[0.14] text-alloy-bend-pine"
                                                :   "bg-alloy-midnight/[0.04] text-alloy-bend-pine"
                                            }`}
                                        >
                                            <Layers className="h-4 w-4" strokeWidth={2} />
                                        </span>
                                    }
                                    onClick={() => onSelectOffering(row.id)}
                                    testId={`locations-program-${row.id}`}
                                />
                            );
                        })}
                        {notOffered.length > 0 ?
                            <div className="mt-3 border-t border-alloy-forge/10 pt-2">
                                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    Not offered
                                </p>
                                {notOffered.map((row) => {
                                    const selectedRow = row.id === effectiveId && !createDetail;
                                    return (
                                        <ConfigurationQueueItem
                                            key={row.id}
                                            variant="rail"
                                            active={selectedRow}
                                            muted
                                            title={effectiveLocationProgramLabel(row)}
                                            subtitle="Not offered"
                                            onClick={() => onSelectOffering(row.id)}
                                            testId={`locations-program-${row.id}`}
                                        />
                                    );
                                })}
                            </div>
                        :   null}
                    </>
                :   <p className="config-typo-sublabel">No Programs offered yet.</p>
            }
            detail={detail}
        />
    );
}
