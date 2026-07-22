"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { ProgramOperatorFields } from "@/lib/programs/programsOperatorClient";
import type { ProgramAgeUnit } from "@/lib/programs/programsOperatorPresentation";

function AgeFields({
    fields,
    onChange,
    idPrefix,
}: {
    fields: ProgramOperatorFields;
    onChange: (next: ProgramOperatorFields) => void;
    idPrefix: string;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
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
                    id={`${idPrefix}-age-unit`}
                    value={fields.ageUnit}
                    onChange={(event) =>
                        onChange({ ...fields, ageUnit: event.target.value as ProgramAgeUnit })
                    }
                    className="config-runtime-select mt-1"
                    data-testid={`${idPrefix}-age-unit`}
                >
                    <option value="years">Years</option>
                    <option value="months">Months</option>
                </select>
            </label>
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
                <AgeFields fields={fields} onChange={onChange} idPrefix={idPrefix} />
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
    onSubmit: (input: { fields: ProgramOperatorFields; locationIds: string[] }) => void;
}) {
    const [fields, setFields] = useState<ProgramOperatorFields>({
        name: "",
        description: "",
        minimumAge: "",
        maximumAge: "",
        ageUnit: "years",
    });
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set());

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
                        onClick={() => onSubmit({ fields, locationIds: [...selected] })}
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

export function ProgramManageLocationsDialog({
    locations,
    initialSelectedIds,
    busy,
    error,
    blockedReasons,
    onCancel,
    onSubmit,
}: {
    locations: readonly { id: string; label: string }[];
    initialSelectedIds: readonly string[];
    busy: boolean;
    error: string | null;
    blockedReasons: ReadonlyMap<string, string>;
    onCancel: () => void;
    onSubmit: (locationIds: string[]) => void;
}) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedIds));

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
                            return (
                                <li key={location.id}>
                                    <label
                                        className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                                            blocked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-alloy-stone/10"
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
                        onClick={() => onSubmit([...selected])}
                    >
                        {busy ? "Saving…" : "Save Changes"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}
