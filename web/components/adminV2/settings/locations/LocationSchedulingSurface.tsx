"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Clock3, Layers3, Repeat2, SunMedium } from "lucide-react";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationQueueItem,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigChildObjectMasterDetail,
    ConfigEditorSection,
    ConfigObjectHeader,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    useLocationSchedulingVm,
    type SchedulingSubNav,
} from "@/lib/locations/useLocationSchedulingVm";
import { WEEKDAY_OPTIONS } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { ScheduleRecurrenceBehavior } from "@/lib/locations/locationSchedulingConfig";

const SUB_NAV: Array<{ key: SchedulingSubNav; label: string }> = [
    { key: "patterns", label: "Patterns" },
    { key: "day_types", label: "Day Types" },
    { key: "schedule_types", label: "Schedule Types" },
    { key: "hours", label: "Hours" },
    { key: "operating_days", label: "Operating days" },
];

type Props = {
    orgId: string;
    locationId: string;
    locationMetadata: Record<string, unknown> | null | undefined;
    patternCount: number;
    canMutate: boolean;
    onSaveMetadata: (metadata: Record<string, unknown>) => Promise<void>;
    onAddPattern: () => void;
    patternsPanel: ReactNode;
};

export default function LocationSchedulingSurface({
    orgId,
    locationId,
    locationMetadata,
    patternCount,
    canMutate,
    onSaveMetadata,
    onAddPattern,
    patternsPanel,
}: Props) {
    const vm = useLocationSchedulingVm({
        orgId,
        locationId,
        locationMetadata,
        onSaveMetadata,
    });

    return (
        <div className="space-y-3" data-testid="locations-scheduling">
            <div
                className="flex flex-wrap gap-1 border-b border-alloy-forge/10 pb-2"
                data-testid="locations-scheduling-subnav"
            >
                {SUB_NAV.map((item) => {
                    const active = item.key === vm.subNav;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                                active ?
                                    "bg-alloy-bend-pine/[0.12] text-alloy-bend-pine"
                                :   "text-alloy-midnight/55 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight"
                            }`}
                            onClick={() => vm.setSubNav(item.key)}
                            data-testid={`locations-scheduling-nav-${item.key}`}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>

            {vm.error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {vm.error}
                </p>
            :   null}

            {vm.subNav === "patterns" ? patternsPanel : null}
            {vm.subNav === "day_types" ?
                <DayTypesCatalog vm={vm} canMutate={canMutate} />
            :   null}
            {vm.subNav === "schedule_types" ?
                <ScheduleTypesCatalog vm={vm} canMutate={canMutate} />
            :   null}
            {vm.subNav === "hours" ?
                <HoursCatalog vm={vm} canMutate={canMutate} />
            :   null}
            {vm.subNav === "operating_days" ?
                <OperatingDaysPanel vm={vm} canMutate={canMutate} />
            :   null}

            {/* Compact counts for operators landing on Patterns — no readiness. */}
            {vm.subNav === "patterns" && patternCount === 0 ?
                <p className="sr-only">
                    {vm.enabledDayTypes.length} Day Types ·{" "}
                    {vm.config.scheduleTypes.filter((row) => row.isActive).length} Schedule Types ·{" "}
                    {vm.config.timeWindows.filter((row) => row.isActive).length} Hours
                </p>
            :   null}
        </div>
    );
}

type Vm = ReturnType<typeof useLocationSchedulingVm>;

function DayTypesCatalog({ vm, canMutate }: { vm: Vm; canMutate: boolean }) {
    const [creating, setCreating] = useState(false);
    const [draftLabel, setDraftLabel] = useState("");
    const [editing, setEditing] = useState(false);
    const [editLabel, setEditLabel] = useState("");
    const active = useMemo(
        () => vm.orgDayTypes.filter((row) => !row.archived),
        [vm.orgDayTypes],
    );
    const archived = useMemo(
        () => vm.orgDayTypes.filter((row) => row.archived),
        [vm.orgDayTypes],
    );
    const effectiveKey =
        vm.selectedDayTypeKey && vm.orgDayTypes.some((row) => row.key === vm.selectedDayTypeKey) ?
            vm.selectedDayTypeKey
        :   (active[0]?.key ?? archived[0]?.key ?? null);
    const selected = vm.orgDayTypes.find((row) => row.key === effectiveKey) ?? null;
    const locationEnabled =
        !selected ? false
        : vm.config.enabledDayTypeKeys.length === 0 ? selected.isActive
        : vm.config.enabledDayTypeKeys.includes(selected.key);

    const detail =
        creating ?
            <div className="space-y-3" data-testid="locations-scheduling-day-type-create">
                <ConfigObjectHeader
                    size="hero"
                    name="Add Day Type"
                    status={{ label: "New", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton onClick={() => setCreating(false)}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <label className="block max-w-md space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={draftLabel}
                        onChange={(event) => setDraftLabel(event.target.value)}
                        className="config-runtime-input"
                        placeholder="e.g. Drop-In"
                        data-testid="locations-scheduling-day-type-name"
                    />
                </label>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !draftLabel.trim()}
                    data-testid="locations-scheduling-day-type-create-save"
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.createDayType(draftLabel);
                                setDraftLabel("");
                                setCreating(false);
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ? cause.message : "Day Type could not be created.",
                                );
                            }
                        })();
                    }}
                >
                    Add Day Type
                </ConfigurationPrimaryButton>
            </div>
        : !selected ?
            <ConfigurationEmptyState
                title={vm.dayTypesReady ? "No Day Types yet" : "Day Types"}
                description={
                    vm.dayTypesReady ?
                        "Add Day Types for Patterns to use. Organization owns the vocabulary."
                    :   "Preparing Day Types…"
                }
                actions={
                    canMutate ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            onClick={() => setCreating(true)}
                        >
                            Add Day Type
                        </ConfigurationPrimaryButton>
                    :   null
                }
            />
        : editing ?
            <div className="space-y-3" data-testid="locations-scheduling-day-type-edit">
                <ConfigObjectHeader
                    size="hero"
                    name={editLabel || selected.label}
                    status={{ label: "Editing", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton
                            onClick={() => {
                                setEditLabel(selected.label);
                                setEditing(false);
                            }}
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <ConfigEditorSection title="Day Type">
                    <label className="block max-w-md space-y-1.5">
                        <span className="config-typo-field-label">Name</span>
                        <input
                            type="text"
                            value={editLabel}
                            onChange={(event) => setEditLabel(event.target.value)}
                            className="config-runtime-input"
                            data-testid="locations-scheduling-day-type-edit-name"
                        />
                    </label>
                </ConfigEditorSection>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !editLabel.trim()}
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.renameDayType(selected.id, editLabel);
                                setEditing(false);
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ? cause.message : "Day Type could not be renamed.",
                                );
                            }
                        })();
                    }}
                >
                    Save
                </ConfigurationPrimaryButton>
            </div>
        :   <div className="space-y-3" data-testid="locations-scheduling-day-type-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={selected.label}
                    status={{
                        label: selected.archived ? "Archived" : "Active",
                        tone: selected.archived ? "inactive" : "active",
                    }}
                    facts={["Organization vocabulary"]}
                    actions={
                        canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setEditLabel(selected.label);
                                        setEditing(true);
                                    }}
                                    data-testid="locations-scheduling-day-type-edit"
                                >
                                    Edit
                                </ConfigurationSecondaryButton>
                                <ConfigurationSecondaryButton
                                    disabled={vm.saving}
                                    onClick={() =>
                                        void vm.archiveDayType(selected.id, !selected.archived).catch((cause) =>
                                            vm.setError(
                                                cause instanceof Error ?
                                                    cause.message
                                                :   "Day Type could not be updated.",
                                            ),
                                        )
                                    }
                                >
                                    {selected.archived ? "Restore" : "Archive"}
                                </ConfigurationSecondaryButton>
                            </div>
                        :   null
                    }
                />
                <ConfigEditorSection title="At this Location">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={locationEnabled && !selected.archived}
                            disabled={!canMutate || vm.saving || selected.archived}
                            onChange={(event) =>
                                void vm
                                    .setLocationDayTypeEnabled(selected.key, event.target.checked)
                                    .catch((cause) =>
                                        vm.setError(
                                            cause instanceof Error ?
                                                cause.message
                                            :   "Could not update Location enablement.",
                                        ),
                                    )
                            }
                            data-testid={`locations-scheduling-day-type-enabled-${selected.key}`}
                        />
                        <span className="config-typo-sublabel">Enabled for Patterns at this Location</span>
                    </label>
                </ConfigEditorSection>
                {canMutate && !selected.archived ?
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationSecondaryButton
                            disabled={vm.saving}
                            onClick={() => void vm.reorderDayType(selected.id, -1)}
                        >
                            Move up
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton
                            disabled={vm.saving}
                            onClick={() => void vm.reorderDayType(selected.id, 1)}
                        >
                            Move down
                        </ConfigurationSecondaryButton>
                    </div>
                :   null}
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Day Types"
            listSummary={`${active.length} active`}
            testId="locations-scheduling-day-types"
            listActions={
                canMutate ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={() => {
                            setCreating(true);
                            setDraftLabel("");
                        }}
                        data-testid="locations-scheduling-day-type-add"
                    >
                        + Add
                    </ConfigurationPrimaryButton>
                :   null
            }
            list={
                vm.orgDayTypes.length > 0 ?
                    <>
                        {active.map((row) => (
                            <ConfigurationQueueItem
                                key={row.id}
                                variant="rail"
                                active={row.key === effectiveKey && !creating}
                                title={row.label}
                                subtitle={
                                    vm.config.enabledDayTypeKeys.length === 0 ||
                                    vm.config.enabledDayTypeKeys.includes(row.key) ?
                                        "Enabled here"
                                    :   "Not enabled here"
                                }
                                leading={
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-alloy-midnight/[0.04] text-alloy-bend-pine">
                                        <Layers3 className="h-4 w-4" strokeWidth={2} />
                                    </span>
                                }
                                onClick={() => {
                                    setCreating(false);
                                    setEditing(false);
                                    vm.setSelectedDayTypeKey(row.key);
                                }}
                                testId={`locations-scheduling-day-type-${row.key}`}
                            />
                        ))}
                        {archived.length > 0 ?
                            <div className="mt-2 border-t border-alloy-forge/10 pt-2">
                                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    Archived
                                </p>
                                {archived.map((row) => (
                                    <ConfigurationQueueItem
                                        key={row.id}
                                        variant="rail"
                                        muted
                                        active={row.key === effectiveKey && !creating}
                                        title={row.label}
                                        subtitle="Archived"
                                        onClick={() => {
                                            setCreating(false);
                                            vm.setSelectedDayTypeKey(row.key);
                                        }}
                                    />
                                ))}
                            </div>
                        :   null}
                    </>
                :   <p className="config-typo-sublabel">
                        {vm.dayTypesReady ? "No Day Types yet." : "Preparing…"}
                    </p>
            }
            detail={detail}
        />
    );
}

function ScheduleTypesCatalog({ vm, canMutate }: { vm: Vm; canMutate: boolean }) {
    const [creating, setCreating] = useState(false);
    const [draftLabel, setDraftLabel] = useState("");
    const [draftBehavior, setDraftBehavior] = useState<ScheduleRecurrenceBehavior>("continuous");
    const [editing, setEditing] = useState(false);
    const [editLabel, setEditLabel] = useState("");
    const active = vm.config.scheduleTypes.filter((row) => row.isActive);
    const archived = vm.config.scheduleTypes.filter((row) => !row.isActive);
    const effectiveId =
        vm.selectedScheduleTypeId &&
        vm.config.scheduleTypes.some((row) => row.id === vm.selectedScheduleTypeId) ?
            vm.selectedScheduleTypeId
        :   (active[0]?.id ?? archived[0]?.id ?? null);
    const selected = vm.config.scheduleTypes.find((row) => row.id === effectiveId) ?? null;

    const detail =
        creating ?
            <div className="space-y-3" data-testid="locations-scheduling-schedule-type-create">
                <ConfigObjectHeader
                    size="hero"
                    name="Add Schedule Type"
                    status={{ label: "New", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton onClick={() => setCreating(false)}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <label className="block max-w-md space-y-1.5">
                    <span className="config-typo-field-label">Operator label</span>
                    <input
                        type="text"
                        value={draftLabel}
                        onChange={(event) => setDraftLabel(event.target.value)}
                        className="config-runtime-input"
                        placeholder="e.g. Same Every Week"
                        data-testid="locations-scheduling-schedule-type-name"
                    />
                </label>
                <label className="block max-w-md space-y-1.5">
                    <span className="config-typo-field-label">Behavior</span>
                    <select
                        value={draftBehavior}
                        onChange={(event) =>
                            setDraftBehavior(event.target.value as ScheduleRecurrenceBehavior)
                        }
                        className="config-runtime-select"
                        data-testid="locations-scheduling-schedule-type-behavior"
                    >
                        <option value="continuous">Continuous (every week)</option>
                        <option value="rotating">Rotating weeks</option>
                    </select>
                    <span className="block text-[11px] text-alloy-midnight/45">
                        Behavior is owned by the platform. Labels may be renamed later.
                    </span>
                </label>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !draftLabel.trim()}
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.addScheduleType(draftLabel, draftBehavior);
                                setCreating(false);
                                setDraftLabel("");
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ?
                                        cause.message
                                    :   "Schedule Type could not be created.",
                                );
                            }
                        })();
                    }}
                >
                    Add Schedule Type
                </ConfigurationPrimaryButton>
            </div>
        : !selected ?
            <ConfigurationEmptyState
                title="No Schedule Types"
                description="Add a Schedule Type using a supported behavior template."
            />
        : editing ?
            <div className="space-y-3">
                <ConfigObjectHeader
                    size="hero"
                    name={editLabel || selected.label}
                    status={{ label: "Editing", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton onClick={() => setEditing(false)}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <label className="block max-w-md space-y-1.5">
                    <span className="config-typo-field-label">Operator label</span>
                    <input
                        type="text"
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-scheduling-schedule-type-edit-name"
                    />
                </label>
                <p className="text-[12px] text-alloy-midnight/50">
                    Behavior stays <span className="font-medium">{selected.behavior}</span> and cannot be changed.
                </p>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !editLabel.trim()}
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.updateScheduleTypeLabel(selected.id, editLabel);
                                setEditing(false);
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ?
                                        cause.message
                                    :   "Schedule Type could not be renamed.",
                                );
                            }
                        })();
                    }}
                >
                    Save
                </ConfigurationPrimaryButton>
            </div>
        :   <div className="space-y-3" data-testid="locations-scheduling-schedule-type-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={selected.label}
                    status={{
                        label: selected.isActive ? "Active" : "Archived",
                        tone: selected.isActive ? "active" : "inactive",
                    }}
                    facts={[`Behavior · ${selected.behavior}`]}
                    actions={
                        canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setEditLabel(selected.label);
                                        setEditing(true);
                                    }}
                                    data-testid="locations-scheduling-schedule-type-edit"
                                >
                                    Edit
                                </ConfigurationSecondaryButton>
                                <ConfigurationSecondaryButton
                                    disabled={vm.saving}
                                    onClick={() =>
                                        void vm
                                            .archiveScheduleType(selected.id, selected.isActive)
                                            .catch((cause) =>
                                                vm.setError(
                                                    cause instanceof Error ?
                                                        cause.message
                                                    :   "Schedule Type could not be updated.",
                                                ),
                                            )
                                    }
                                >
                                    {selected.isActive ? "Archive" : "Restore"}
                                </ConfigurationSecondaryButton>
                            </div>
                        :   null
                    }
                />
                {selected.description ?
                    <p className="config-typo-sublabel">{selected.description}</p>
                :   null}
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Schedule Types"
            listSummary={`${active.length} active`}
            testId="locations-scheduling-schedule-types"
            listActions={
                canMutate ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={() => setCreating(true)}
                        data-testid="locations-scheduling-schedule-type-add"
                    >
                        + Add
                    </ConfigurationPrimaryButton>
                :   null
            }
            list={
                vm.config.scheduleTypes.length > 0 ?
                    vm.config.scheduleTypes.map((row) => (
                        <ConfigurationQueueItem
                            key={row.id}
                            variant="rail"
                            active={row.id === effectiveId && !creating}
                            muted={!row.isActive}
                            title={row.label}
                            subtitle={row.behavior}
                            leading={
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-alloy-midnight/[0.04] text-alloy-bend-pine">
                                    <Repeat2 className="h-4 w-4" strokeWidth={2} />
                                </span>
                            }
                            onClick={() => {
                                setCreating(false);
                                setEditing(false);
                                vm.setSelectedScheduleTypeId(row.id);
                            }}
                            testId={`locations-scheduling-schedule-type-${row.key}`}
                        />
                    ))
                :   <p className="config-typo-sublabel">No Schedule Types yet.</p>
            }
            detail={detail}
        />
    );
}

function HoursCatalog({ vm, canMutate }: { vm: Vm; canMutate: boolean }) {
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ label: "", startTime: "08:00", endTime: "15:00" });
    const active = vm.config.timeWindows.filter((row) => row.isActive);
    const archived = vm.config.timeWindows.filter((row) => !row.isActive);
    const effectiveId =
        vm.selectedTimeWindowId &&
        vm.config.timeWindows.some((row) => row.id === vm.selectedTimeWindowId) ?
            vm.selectedTimeWindowId
        :   (active[0]?.id ?? archived[0]?.id ?? null);
    const selected = vm.config.timeWindows.find((row) => row.id === effectiveId) ?? null;

    const detail =
        creating ?
            <div className="space-y-3" data-testid="locations-scheduling-hours-create">
                <ConfigObjectHeader
                    size="hero"
                    name="Add Hours"
                    status={{ label: "New", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton onClick={() => setCreating(false)}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <div className="grid max-w-lg gap-2 sm:grid-cols-3">
                    <label className="sm:col-span-3">
                        <span className="config-typo-field-label">Name</span>
                        <input
                            type="text"
                            value={draft.label}
                            onChange={(event) => setDraft((c) => ({ ...c, label: event.target.value }))}
                            className="config-runtime-input mt-1"
                            placeholder="School Day"
                            data-testid="locations-scheduling-window-name"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Start</span>
                        <input
                            type="time"
                            value={draft.startTime}
                            onChange={(event) => setDraft((c) => ({ ...c, startTime: event.target.value }))}
                            className="config-runtime-input mt-1"
                            data-testid="locations-scheduling-window-start"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">End</span>
                        <input
                            type="time"
                            value={draft.endTime}
                            onChange={(event) => setDraft((c) => ({ ...c, endTime: event.target.value }))}
                            className="config-runtime-input mt-1"
                            data-testid="locations-scheduling-window-end"
                        />
                    </label>
                </div>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !draft.label.trim() || draft.endTime <= draft.startTime}
                    data-testid="locations-scheduling-window-add"
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.addTimeWindow(draft);
                                setCreating(false);
                                setDraft({ label: "", startTime: "08:00", endTime: "15:00" });
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ? cause.message : "Hours could not be created.",
                                );
                            }
                        })();
                    }}
                >
                    Add Hours
                </ConfigurationPrimaryButton>
            </div>
        : !selected ?
            <ConfigurationEmptyState
                title="No Hours yet"
                description="Add reusable Time Windows Patterns can reference."
                actions={
                    canMutate ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            onClick={() => setCreating(true)}
                        >
                            Add Hours
                        </ConfigurationPrimaryButton>
                    :   null
                }
            />
        : editing ?
            <div className="space-y-3">
                <ConfigObjectHeader
                    size="hero"
                    name={draft.label || selected.label}
                    status={{ label: "Editing", tone: "attention" }}
                    actions={
                        <ConfigurationSecondaryButton onClick={() => setEditing(false)}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                />
                <div className="grid max-w-lg gap-2 sm:grid-cols-3">
                    <label className="sm:col-span-3">
                        <span className="config-typo-field-label">Name</span>
                        <input
                            type="text"
                            value={draft.label}
                            onChange={(event) => setDraft((c) => ({ ...c, label: event.target.value }))}
                            className="config-runtime-input mt-1"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Start</span>
                        <input
                            type="time"
                            value={draft.startTime}
                            onChange={(event) => setDraft((c) => ({ ...c, startTime: event.target.value }))}
                            className="config-runtime-input mt-1"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">End</span>
                        <input
                            type="time"
                            value={draft.endTime}
                            onChange={(event) => setDraft((c) => ({ ...c, endTime: event.target.value }))}
                            className="config-runtime-input mt-1"
                        />
                    </label>
                </div>
                <ConfigurationPrimaryButton
                    disabled={vm.saving || !draft.label.trim() || draft.endTime <= draft.startTime}
                    onClick={() => {
                        void (async () => {
                            try {
                                await vm.updateTimeWindow(selected.id, {
                                    label: draft.label.trim(),
                                    startTime: draft.startTime,
                                    endTime: draft.endTime,
                                });
                                setEditing(false);
                            } catch (cause) {
                                vm.setError(
                                    cause instanceof Error ? cause.message : "Hours could not be saved.",
                                );
                            }
                        })();
                    }}
                >
                    Save
                </ConfigurationPrimaryButton>
            </div>
        :   <div className="space-y-3" data-testid="locations-scheduling-hours-detail">
                <ConfigObjectHeader
                    size="hero"
                    name={selected.label}
                    status={{
                        label: selected.isActive ? "Active" : "Archived",
                        tone: selected.isActive ? "active" : "inactive",
                    }}
                    facts={[`${selected.startTime}–${selected.endTime}`]}
                    actions={
                        canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setDraft({
                                            label: selected.label,
                                            startTime: selected.startTime,
                                            endTime: selected.endTime,
                                        });
                                        setEditing(true);
                                    }}
                                    data-testid="locations-scheduling-hours-edit"
                                >
                                    Edit
                                </ConfigurationSecondaryButton>
                                <ConfigurationSecondaryButton
                                    disabled={vm.saving}
                                    onClick={() =>
                                        void vm
                                            .archiveTimeWindow(selected.id, selected.isActive)
                                            .catch((cause) =>
                                                vm.setError(
                                                    cause instanceof Error ?
                                                        cause.message
                                                    :   "Hours could not be updated.",
                                                ),
                                            )
                                    }
                                >
                                    {selected.isActive ? "Archive" : "Restore"}
                                </ConfigurationSecondaryButton>
                            </div>
                        :   null
                    }
                />
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Hours"
            listSummary={`${active.length} windows`}
            testId="locations-scheduling-hours"
            listActions={
                canMutate ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={() => {
                            setCreating(true);
                            setDraft({ label: "", startTime: "08:00", endTime: "15:00" });
                        }}
                        data-testid="locations-scheduling-hours-add"
                    >
                        + Add
                    </ConfigurationPrimaryButton>
                :   null
            }
            list={
                vm.config.timeWindows.length > 0 ?
                    vm.config.timeWindows.map((row) => (
                        <ConfigurationQueueItem
                            key={row.id}
                            variant="rail"
                            active={row.id === effectiveId && !creating}
                            muted={!row.isActive}
                            title={row.label}
                            subtitle={`${row.startTime}–${row.endTime}`}
                            leading={
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-alloy-midnight/[0.04] text-alloy-bend-pine">
                                    <Clock3 className="h-4 w-4" strokeWidth={2} />
                                </span>
                            }
                            onClick={() => {
                                setCreating(false);
                                setEditing(false);
                                vm.setSelectedTimeWindowId(row.id);
                            }}
                            testId={`locations-scheduling-window-${row.id}`}
                        />
                    ))
                :   <p className="config-typo-sublabel">No Hours yet.</p>
            }
            detail={detail}
        />
    );
}

function OperatingDaysPanel({ vm, canMutate }: { vm: Vm; canMutate: boolean }) {
    const selected = vm.allowedWeekdays;
    const allUnset = vm.config.operatingDays.length === 0;

    return (
        <ConfigWorkspaceCard compact testId="locations-scheduling-operating-days">
            <div className="mb-3 flex items-start gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-alloy-midnight/[0.04] text-alloy-bend-pine">
                    <SunMedium className="h-4 w-4" strokeWidth={2} />
                </span>
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Operating days</h3>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                        Days this Location may operate. Pattern scheduled days must stay within this set.
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="locations-scheduling-operating-days-chips">
                {WEEKDAY_OPTIONS.map((day) => {
                    const on = allUnset || selected.includes(day.value);
                    return (
                        <button
                            key={day.value}
                            type="button"
                            disabled={!canMutate || vm.saving}
                            aria-pressed={on}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                on ?
                                    "border-alloy-bend-pine bg-alloy-bend-pine text-white"
                                :   "border-alloy-forge/20 bg-white text-alloy-midnight/55"
                            }`}
                            onClick={() => {
                                const current =
                                    vm.config.operatingDays.length === 0 ?
                                        [0, 1, 2, 3, 4, 5, 6]
                                    :   [...vm.config.operatingDays];
                                const next = current.includes(day.value) ?
                                    current.filter((value) => value !== day.value)
                                :   [...current, day.value].sort((a, b) => a - b);
                                void vm.setOperatingDays(next).catch((cause) =>
                                    vm.setError(
                                        cause instanceof Error ?
                                            cause.message
                                        :   "Operating days could not be saved.",
                                    ),
                                );
                            }}
                            data-testid={`locations-scheduling-operating-day-${day.value}`}
                        >
                            {day.label}
                        </button>
                    );
                })}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-alloy-midnight/45">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
                Loaded with this Location — no separate fetch.
            </p>
        </ConfigWorkspaceCard>
    );
}
