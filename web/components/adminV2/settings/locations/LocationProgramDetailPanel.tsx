"use client";

import { useEffect, useState } from "react";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import type { LocationProgramOperationalSummary } from "@/lib/locations/locationWorkspaceModel";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

function readMeta(metadata: LocationProgramCategoryRow["metadata"], key: string): string {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    return String((metadata as Record<string, unknown>)[key] ?? "").trim();
}

export default function LocationProgramDetailPanel({
    program,
    summary,
    siteLabel,
    canMutate,
    onSave,
}: {
    program: LocationProgramCategoryRow | null;
    summary: LocationProgramOperationalSummary | null;
    siteLabel: string;
    canMutate: boolean;
    onSave: (
        id: string,
        patch: {
            label?: string;
            is_active?: boolean;
            sort_order?: number;
            metadata?: Record<string, unknown>;
        },
    ) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [ageFrom, setAgeFrom] = useState("");
    const [ageTo, setAgeTo] = useState("");
    const [ageUnit, setAgeUnit] = useState("");
    const [defaultRoomTypes, setDefaultRoomTypes] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (!program) return;
        setLabel(program.label);
        setAgeFrom(readMeta(program.metadata, "age_range_from"));
        setAgeTo(readMeta(program.metadata, "age_range_to"));
        setAgeUnit(readMeta(program.metadata, "age_range_unit"));
        setDefaultRoomTypes(readMeta(program.metadata, "default_room_types"));
        setActive(program.is_active !== false);
        setError(null);
        setEditing(false);
    }, [program]);

    if (!program) {
        return (
            <ConfigurationEmptyState
                testId="locations-program-workspace-empty"
                title="Select a program"
                description="Choose a program offering to edit its name, age range, and active status."
            />
        );
    }

    return (
        <ConfigurationDetailCard
            testId={`locations-program-summary-${program.id}`}
            title={summary?.label ?? (label.trim() || "Untitled program")}
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="config-typo-sublabel">Offered at {siteLabel}</p>
                    <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            summary?.isActive === false ?
                                "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                            :   "border-[#00a283]/25 bg-[#00a283]/10 text-[#007d68]"
                        }`}
                    >
                        {summary?.isActive === false ? "Inactive" : "Active"}
                    </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-alloy-forge/10 py-3 sm:grid-cols-4">
                    <div>
                        <dt className="config-typo-meta">Program</dt>
                        <dd className="mt-1 text-sm font-medium text-alloy-midnight/85">
                            {summary?.label ?? program.label}
                        </dd>
                    </div>
                    <div>
                        <dt className="config-typo-meta">Rooms</dt>
                        <dd className="mt-1 text-sm font-medium text-alloy-midnight/85">{summary?.roomCount ?? 0}</dd>
                    </div>
                    <div>
                        <dt className="config-typo-meta">Capacity</dt>
                        <dd className="mt-1 text-sm font-medium text-alloy-midnight/85">
                            {summary?.configuredCapacity == null ?
                                "Not set up"
                            :   `${summary.configuredCapacity} children`}
                        </dd>
                    </div>
                    <div>
                        <dt className="config-typo-meta">Age range</dt>
                        <dd className="mt-1 text-sm font-medium text-alloy-midnight/85">
                            {summary?.ageRange ?? "Age range not set"}
                        </dd>
                    </div>
                </dl>

                {!editing ?
                    canMutate ?
                        <button
                            type="button"
                            className="text-xs font-medium text-[#007d68]"
                            onClick={() => setEditing(true)}
                            data-testid={`locations-program-edit-${program.id}`}
                        >
                            Edit program
                        </button>
                    :   null
                :   <div className="space-y-4 rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.04] p-4">
                        <label className="block space-y-1.5">
                            <span className="config-typo-field-label">Name</span>
                            <input
                                type="text"
                                value={label}
                                disabled={!canMutate}
                                onChange={(e) => setLabel(e.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-program-name"
                            />
                        </label>

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
                                <input
                                    type="text"
                                    value={ageUnit}
                                    disabled={!canMutate}
                                    onChange={(e) => setAgeUnit(e.target.value)}
                                    placeholder="Unit"
                                    className="config-runtime-input"
                                />
                            </div>
                        </div>

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

                        <label className="block space-y-1.5">
                            <span className="config-typo-field-label">Default room types</span>
                            <input
                                type="text"
                                value={defaultRoomTypes}
                                disabled={!canMutate}
                                onChange={(e) => setDefaultRoomTypes(e.target.value)}
                                placeholder="Comma-separated room categories"
                                className="config-runtime-input"
                            />
                        </label>

                        {error ?
                            <p className="text-sm text-red-800" role="alert">
                                {error}
                            </p>
                        :   null}

                        {canMutate ?
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    className="config-primary-btn--sm"
                                    disabled={saving}
                                    data-testid="locations-program-save"
                                    onClick={() => {
                                        void (async () => {
                                            setSaving(true);
                                            setError(null);
                                            try {
                                                const base =
                                                    program.metadata != null && typeof program.metadata === "object" ?
                                                        {
                                                            ...(program.metadata as Record<string, unknown>),
                                                        }
                                                    :   {};
                                                const metadata: Record<string, unknown> = { ...base };
                                                for (const [k, v] of [
                                                    ["age_range_from", ageFrom],
                                                    ["age_range_to", ageTo],
                                                    ["age_range_unit", ageUnit],
                                                    ["default_room_types", defaultRoomTypes],
                                                ] as const) {
                                                    if (v.trim()) metadata[k] = v.trim();
                                                    else delete metadata[k];
                                                }
                                                await onSave(program.id, {
                                                    label: label.trim(),
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
                                    {saving ? "Saving…" : "Save program"}
                                </ConfigurationPrimaryButton>
                                <button
                                    type="button"
                                    className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-medium text-alloy-midnight/65"
                                    onClick={() => setEditing(false)}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                            </div>
                        :   null}
                    </div>
                }
            </div>
        </ConfigurationDetailCard>
    );
}
