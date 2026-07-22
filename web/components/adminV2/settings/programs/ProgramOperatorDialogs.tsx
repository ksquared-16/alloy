"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    emptyProgramOperatorFields,
    type LocationProgramAssignmentConfig,
    type ProgramOperatorFields,
} from "@/lib/programs/programsOperatorClient";
import type { ProgramAgeUnit } from "@/lib/programs/programsOperatorPresentation";
import type { LocationProgramAvailabilityView } from "@/lib/programs/locationProgramAvailability";

const AGE_UNITS: { value: ProgramAgeUnit; label: string }[] = [
    { value: "weeks", label: "Weeks" },
    { value: "months", label: "Months" },
    { value: "years", label: "Years" },
];

function AgeBoundaryFields({
    fields,
    onChange,
    idPrefix,
}: {
    fields: ProgramOperatorFields;
    onChange: (next: ProgramOperatorFields) => void;
    idPrefix: string;
}) {
    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <label>
                    <span className="config-typo-field-label">Minimum age</span>
                    <input
                        id={`${idPrefix}-min-age`}
                        type="number"
                        min={0}
                        step={1}
                        value={fields.minimumAge}
                        onChange={(event) => onChange({ ...fields, minimumAge: event.target.value })}
                        className="config-runtime-input mt-1"
                        data-testid={`${idPrefix}-min-age`}
                    />
                </label>
                <label>
                    <span className="config-typo-field-label">Unit</span>
                    <select
                        id={`${idPrefix}-min-unit`}
                        value={fields.minimumAgeUnit}
                        onChange={(event) =>
                            onChange({
                                ...fields,
                                minimumAgeUnit: event.target.value as ProgramAgeUnit,
                            })
                        }
                        className="config-runtime-select mt-1"
                        data-testid={`${idPrefix}-min-unit`}
                    >
                        {AGE_UNITS.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                                {unit.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <label>
                    <span className="config-typo-field-label">Maximum age</span>
                    <input
                        id={`${idPrefix}-max-age`}
                        type="number"
                        min={0}
                        step={1}
                        value={fields.maximumAge}
                        onChange={(event) => onChange({ ...fields, maximumAge: event.target.value })}
                        className="config-runtime-input mt-1"
                        data-testid={`${idPrefix}-max-age`}
                    />
                </label>
                <label>
                    <span className="config-typo-field-label">Unit</span>
                    <select
                        id={`${idPrefix}-max-unit`}
                        value={fields.maximumAgeUnit}
                        onChange={(event) =>
                            onChange({
                                ...fields,
                                maximumAgeUnit: event.target.value as ProgramAgeUnit,
                            })
                        }
                        className="config-runtime-select mt-1"
                        data-testid={`${idPrefix}-max-unit`}
                    >
                        {AGE_UNITS.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                                {unit.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </div>
    );
}

export function ProgramFormFields({
    fields,
    onChange,
    idPrefix,
}: {
    fields: ProgramOperatorFields;
    onChange: (next: ProgramOperatorFields) => void;
    idPrefix: string;
}) {
    return (
        <div className="grid gap-3">
            <label>
                <span className="config-typo-field-label">
                    Program name <span className="text-alloy-midnight/40">*</span>
                </span>
                <input
                    value={fields.name}
                    onChange={(event) => onChange({ ...fields, name: event.target.value })}
                    className="config-runtime-input mt-1"
                    data-testid={`${idPrefix}-name`}
                    autoFocus
                />
            </label>
            <label>
                <span className="config-typo-field-label">Description</span>
                <textarea
                    value={fields.description}
                    onChange={(event) => onChange({ ...fields, description: event.target.value })}
                    className="config-runtime-input mt-1 min-h-[5.5rem] resize-y"
                    data-testid={`${idPrefix}-description`}
                />
            </label>
            <div>
                <p className="config-typo-field-label mb-2">Age range</p>
                <AgeBoundaryFields fields={fields} onChange={onChange} idPrefix={idPrefix} />
            </div>
        </div>
    );
}

export function ProgramCreateDialog({
    locations,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    locations: readonly { id: string; label: string }[];
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: {
        fields: ProgramOperatorFields;
        locationIds: string[];
        sharedAvailability: { availableFrom: string; availableThrough: string } | null;
    }) => void;
}) {
    const [fields, setFields] = useState<ProgramOperatorFields>(() => emptyProgramOperatorFields());
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [setDates, setSetDates] = useState(false);
    const [availableFrom, setAvailableFrom] = useState("");
    const [availableThrough, setAvailableThrough] = useState("");

    const visibleLocations = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return [...locations];
        return locations.filter((location) => location.label.toLowerCase().includes(query));
    }, [locations, search]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-create-title"
            data-testid="program-create-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="program-create-title" className="text-lg font-semibold text-alloy-midnight">
                        Add Program
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">
                        Define a service your organization offers.
                    </p>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
                    <section>
                        <h3 className="mb-3 text-sm font-semibold text-alloy-midnight">Program details</h3>
                        <ProgramFormFields fields={fields} onChange={setFields} idPrefix="program-create" />
                    </section>
                    {locations.length > 0 ?
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-alloy-midnight">
                                Available at Locations
                            </h3>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search Locations…"
                                className="config-runtime-input mb-2"
                                data-testid="program-create-location-search"
                            />
                            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-alloy-stone/20 p-2">
                                {visibleLocations.map((location) => {
                                    const checked = selected.has(location.id);
                                    return (
                                        <li key={location.id}>
                                            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-alloy-stone/10">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setSelected((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(location.id)) next.delete(location.id);
                                                            else next.add(location.id);
                                                            return next;
                                                        });
                                                    }}
                                                    data-testid={`program-create-location-${location.id}`}
                                                />
                                                <span>{location.label}</span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                            {selected.size > 0 ?
                                <div className="mt-3 space-y-2">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight/75">
                                        <input
                                            type="checkbox"
                                            checked={setDates}
                                            onChange={(event) => setSetDates(event.target.checked)}
                                            data-testid="program-create-set-dates"
                                        />
                                        <span>Set availability dates</span>
                                    </label>
                                    {setDates ?
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label>
                                                <span className="config-typo-field-label">Available from</span>
                                                <input
                                                    type="date"
                                                    value={availableFrom}
                                                    onChange={(event) => setAvailableFrom(event.target.value)}
                                                    className="config-runtime-input mt-1"
                                                    data-testid="program-create-available-from"
                                                />
                                            </label>
                                            <label>
                                                <span className="config-typo-field-label">Available through</span>
                                                <input
                                                    type="date"
                                                    value={availableThrough}
                                                    onChange={(event) => setAvailableThrough(event.target.value)}
                                                    className="config-runtime-input mt-1"
                                                    data-testid="program-create-available-through"
                                                />
                                            </label>
                                        </div>
                                    :   null}
                                </div>
                            :   null}
                        </section>
                    :   null}
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}
                </div>
                <div className="flex justify-end gap-2 border-t border-alloy-stone/20 px-5 py-3">
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={!fields.name.trim() || busy}
                        data-testid="program-create-submit"
                        onClick={() =>
                            onSubmit({
                                fields,
                                locationIds: [...selected],
                                sharedAvailability:
                                    setDates && selected.size > 0
                                        ? { availableFrom, availableThrough }
                                        : null,
                            })
                        }
                    >
                        {busy ? "Creating…" : "Create Program"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}

export function ProgramEditDialog({
    initial,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    initial: ProgramOperatorFields;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (fields: ProgramOperatorFields) => void;
}) {
    const [fields, setFields] = useState<ProgramOperatorFields>(initial);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-edit-title"
            data-testid="program-edit-dialog"
        >
            <div className="w-full max-w-lg rounded-xl border border-alloy-stone/25 bg-white p-5 shadow-sm">
                <h2 id="program-edit-title" className="text-lg font-semibold text-alloy-midnight">
                    Edit Program
                </h2>
                <p className="mt-1 text-sm text-alloy-midnight/55">
                    Changes update the shared Program used by selected Locations.
                </p>
                <div className="mt-4">
                    <ProgramFormFields fields={fields} onChange={setFields} idPrefix="program-edit" />
                </div>
                {error ?
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}
                <div className="mt-5 flex justify-end gap-2">
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={!fields.name.trim() || busy}
                        data-testid="program-edit-submit"
                        onClick={() => onSubmit(fields)}
                    >
                        {busy ? "Saving…" : "Save Changes"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}

type ManageRowState = {
    localDisplayName: string;
    availableFrom: string;
    availableThrough: string;
    expanded: boolean;
};

export function ProgramManageLocationsDialog({
    locations,
    organizationProgramName,
    initialSelectedIds,
    initialAvailability,
    busy,
    error,
    blockedReasons,
    onCancel,
    onSubmit,
}: {
    locations: readonly { id: string; label: string }[];
    organizationProgramName: string;
    initialSelectedIds: readonly string[];
    initialAvailability: readonly LocationProgramAvailabilityView[];
    busy: boolean;
    error: string | null;
    blockedReasons: ReadonlyMap<string, string>;
    onCancel: () => void;
    onSubmit: (input: {
        locationIds: string[];
        configs: LocationProgramAssignmentConfig[];
    }) => void;
}) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedIds));
    const [rows, setRows] = useState<Record<string, ManageRowState>>(() => {
        const next: Record<string, ManageRowState> = {};
        for (const location of locations) {
            const existing = initialAvailability.find((row) => row.locationId === location.id);
            next[location.id] = {
                localDisplayName: existing?.localDisplayName ?? "",
                availableFrom: existing?.availableFrom ?? "",
                availableThrough: existing?.availableThrough ?? "",
                expanded: false,
            };
        }
        return next;
    });

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return [...locations];
        return locations.filter((location) => location.label.toLowerCase().includes(query));
    }, [locations, search]);

    const selectAllShown = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const location of visible) {
                if (!blockedReasons.has(location.id) || prev.has(location.id)) {
                    next.add(location.id);
                }
            }
            return next;
        });
    };

    const clearShown = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const location of visible) {
                if (!blockedReasons.has(location.id)) next.delete(location.id);
            }
            return next;
        });
    };

    const updateRow = (locationId: string, patch: Partial<ManageRowState>) => {
        setRows((prev) => ({
            ...prev,
            [locationId]: { ...prev[locationId], ...patch },
        }));
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-manage-locations-title"
            data-testid="program-manage-locations-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="program-manage-locations-title" className="text-lg font-semibold text-alloy-midnight">
                        Manage Locations
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">
                        Choose the Locations where this Program is available.
                    </p>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search Locations…"
                        className="config-runtime-input"
                        data-testid="program-manage-locations-search"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-alloy-midnight/60">
                        <span data-testid="program-manage-locations-count">{selected.size} selected</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="font-medium text-alloy-bend-pine hover:underline"
                                onClick={selectAllShown}
                                data-testid="program-manage-locations-select-all"
                            >
                                Select all shown
                            </button>
                            <button
                                type="button"
                                className="font-medium text-alloy-midnight/55 hover:underline"
                                onClick={clearShown}
                                data-testid="program-manage-locations-clear"
                            >
                                Clear shown
                            </button>
                        </div>
                    </div>
                    <ul className="space-y-1 rounded-lg border border-alloy-stone/20 p-2">
                        {visible.map((location) => {
                            const blocked = blockedReasons.get(location.id);
                            const checked = selected.has(location.id);
                            const row = rows[location.id] ?? {
                                localDisplayName: "",
                                availableFrom: "",
                                availableThrough: "",
                                expanded: false,
                            };
                            return (
                                <li key={location.id} className="rounded-md">
                                    <div className="flex items-start gap-2 px-2 py-1.5">
                                        <label
                                            className={`flex min-w-0 flex-1 items-start gap-2 text-sm ${
                                                blocked
                                                    ? "cursor-not-allowed opacity-70"
                                                    : "cursor-pointer"
                                            }`}
                                            title={blocked}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                checked={checked}
                                                disabled={Boolean(blocked) && checked}
                                                onChange={() => {
                                                    if (blocked && checked) return;
                                                    setSelected((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(location.id)) next.delete(location.id);
                                                        else next.add(location.id);
                                                        return next;
                                                    });
                                                }}
                                                data-testid={`program-manage-location-${location.id}`}
                                            />
                                            <span>
                                                <span className="block text-alloy-midnight">{location.label}</span>
                                                {blocked ?
                                                    <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">
                                                        {blocked}
                                                    </span>
                                                :   null}
                                            </span>
                                        </label>
                                        {checked && !blocked ?
                                            <button
                                                type="button"
                                                className="shrink-0 text-xs font-medium text-alloy-bend-pine hover:underline"
                                                onClick={() =>
                                                    updateRow(location.id, { expanded: !row.expanded })
                                                }
                                                data-testid={`program-manage-configure-${location.id}`}
                                            >
                                                {row.expanded ? "Hide" : "Configure"}
                                            </button>
                                        :   null}
                                    </div>
                                    {checked && row.expanded ?
                                        <div
                                            className="mb-2 ml-8 space-y-2 rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.04] p-3"
                                            data-testid={`program-manage-config-panel-${location.id}`}
                                        >
                                            <label className="block">
                                                <span className="config-typo-field-label">
                                                    Name at this Location
                                                </span>
                                                <input
                                                    type="text"
                                                    value={row.localDisplayName}
                                                    onChange={(event) =>
                                                        updateRow(location.id, {
                                                            localDisplayName: event.target.value,
                                                        })
                                                    }
                                                    className="config-runtime-input mt-1"
                                                    placeholder={organizationProgramName}
                                                    data-testid={`program-manage-local-name-${location.id}`}
                                                />
                                                <span className="mt-1 block text-[11px] text-alloy-midnight/45">
                                                    Leave blank to use “{organizationProgramName},” the Organization
                                                    Program name.
                                                </span>
                                            </label>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <label>
                                                    <span className="config-typo-field-label">Available from</span>
                                                    <input
                                                        type="date"
                                                        value={row.availableFrom}
                                                        onChange={(event) =>
                                                            updateRow(location.id, {
                                                                availableFrom: event.target.value,
                                                            })
                                                        }
                                                        className="config-runtime-input mt-1"
                                                        data-testid={`program-manage-from-${location.id}`}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">
                                                        Available through
                                                    </span>
                                                    <input
                                                        type="date"
                                                        value={row.availableThrough}
                                                        onChange={(event) =>
                                                            updateRow(location.id, {
                                                                availableThrough: event.target.value,
                                                            })
                                                        }
                                                        className="config-runtime-input mt-1"
                                                        data-testid={`program-manage-through-${location.id}`}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    :   null}
                                </li>
                            );
                        })}
                    </ul>
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}
                </div>
                <div className="flex justify-end gap-2 border-t border-alloy-stone/20 px-5 py-3">
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy}
                        data-testid="program-manage-locations-submit"
                        onClick={() => {
                            const locationIds = [...selected];
                            const configs = locationIds.map((locationId) => {
                                const row = rows[locationId];
                                return {
                                    locationId,
                                    localDisplayName: row?.localDisplayName ?? "",
                                    availableFrom: row?.availableFrom ?? "",
                                    availableThrough: row?.availableThrough ?? "",
                                };
                            });
                            onSubmit({ locationIds, configs });
                        }}
                    >
                        {busy ? "Saving…" : "Save Changes"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}
