"use client";

import { useEffect, useState } from "react";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import type { LocationProgramOperationalSummary } from "@/lib/locations/locationWorkspaceModel";
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

function readMeta(metadata: LocationProgramCategoryRow["metadata"], key: string): string {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    return String((metadata as Record<string, unknown>)[key] ?? "").trim();
}

function programAttention(summary: LocationProgramOperationalSummary | null, ageRange: string): ConfigAttentionItem[] {
    const items: ConfigAttentionItem[] = [];
    if (!ageRange || ageRange === "Age range not set" || ageRange === "Not set") {
        items.push({ key: "age", grade: "fix", label: "Age range is not set up yet" });
    }
    if ((summary?.roomCount ?? 0) === 0) {
        items.push({ key: "rooms", grade: "improve", label: "No rooms are assigned to this program yet" });
    }
    if (summary?.configuredCapacity == null && (summary?.roomCount ?? 0) > 0) {
        items.push({ key: "capacity", grade: "fix", label: "Participating rooms need capacity setup" });
    }
    if (items.length === 0) {
        items.push({ key: "all-good", grade: "good", label: "Everything looks good" });
    }
    return items;
}

export default function LocationProgramDetailPanel({
    program,
    summary,
    siteLabel,
    canMutate,
    onSave,
    programs,
    selectedProgramId,
    onSelectProgram,
    ageUnitSelectOptions = [],
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
    programs: LocationProgramCategoryRow[];
    selectedProgramId: string | null;
    onSelectProgram: (programId: string) => void;
    ageUnitSelectOptions?: readonly { value: string; label: string }[];
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

    const ageDisplay = summary?.ageRange ?? "Not set";
    const attention = programAttention(summary, ageDisplay);
    const hasIssues = attention.some((item) => item.grade !== "good");

    const detail =
        !program ?
            <ConfigurationEmptyState
                testId="locations-program-workspace-empty"
                title="Select a program"
                description="Choose a program to see what it offers and what still needs setup."
            />
        :   <div className="space-y-3" data-testid={`locations-program-summary-${program.id}`}>
                <ConfigObjectHeader
                    name={summary?.label ?? program.label}
                    status={{
                        label: active ? "Active" : "Inactive",
                        tone: active ? "active" : "inactive",
                    }}
                    facts={[siteLabel ? `Offered at ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={() => setEditing((current) => !current)}
                                data-testid={`locations-program-edit-${program.id}`}
                            >
                                {editing ? "Done reviewing" : "Edit program"}
                            </button>
                        :   null
                    }
                    testId="locations-program-header"
                />

                <ConfigConsequenceLine testId="locations-program-consequence">
                    {(summary?.roomCount ?? 0) > 0 ?
                        `Serves ${summary?.roomCount} ${(summary?.roomCount ?? 0) === 1 ? "room" : "rooms"}${
                            summary?.configuredCapacity != null ?
                                ` · ${summary.configuredCapacity} children configured`
                            :   " · capacity not fully set"
                        }.`
                    :   "No rooms are assigned to this program yet."}
                </ConfigConsequenceLine>

                <div className={`grid gap-3 ${hasIssues ? "lg:grid-cols-2" : ""}`}>
                    {hasIssues ?
                        <ConfigAttentionPanel
                            items={attention}
                            compact
                            testId="locations-program-attention"
                            onResolve={() => setEditing(true)}
                        />
                    :   null}
                    <ConfigWorkspaceCard title="What is configured" compact testId="locations-program-configured">
                        <dl className="space-y-1.5 text-sm text-alloy-midnight/80">
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Rooms</dt>
                                <dd className="font-medium">{summary?.roomCount ?? 0}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Capacity</dt>
                                <dd className="font-medium">
                                    {summary?.configuredCapacity == null ?
                                        "Not set up yet"
                                    :   `${summary.configuredCapacity} children`}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Age range</dt>
                                <dd className="font-medium">{ageDisplay}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="config-typo-sublabel">Ownership</dt>
                                <dd className="font-medium">Configured at this location</dd>
                            </div>
                        </dl>
                    </ConfigWorkspaceCard>
                </div>

                {editing ?
                    <ConfigWorkspaceCard title="Adjust this program" testId="locations-program-editor">
                        <div className="space-y-3">
                            <label className="block space-y-1">
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
                                        data-testid="locations-program-age-unit"
                                    >
                                        <option value="">Unit</option>
                                        {ageUnitSelectOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
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
                                <span className="config-typo-sublabel">Active program</span>
                            </label>

                            <label className="block space-y-1">
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
                                                            { ...(program.metadata as Record<string, unknown>) }
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
                    </ConfigWorkspaceCard>
                :   null}
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Programs"
            listSummary="What this location offers"
            testId="locations-programs"
            list={
                programs.length > 0 ?
                    programs.map((entry) => (
                        <ConfigurationQueueItem
                            key={entry.id}
                            active={entry.id === selectedProgramId}
                            title={entry.label}
                            subtitle={entry.is_active === false ? "Inactive" : "Active"}
                            onClick={() => onSelectProgram(entry.id)}
                            testId={`locations-program-${entry.id}`}
                        />
                    ))
                :   <p className="config-typo-sublabel">No programs offered yet.</p>
            }
            detail={detail}
        />
    );
}
