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
    ConfigEditorSection,
    ConfigObjectHeader,
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
    return items;
}

function programStatusLabel(summary: LocationProgramOperationalSummary | null, attention: ConfigAttentionItem[]): {
    label: string;
    tone: "active" | "inactive" | "attention";
} {
    if (!summary?.isActive) return { label: "Inactive", tone: "inactive" };
    if (attention.some((item) => item.grade === "fix")) return { label: "Needs setup", tone: "attention" };
    if (attention.some((item) => item.grade === "improve")) return { label: "Active · incomplete", tone: "attention" };
    return { label: "Active · complete", tone: "active" };
}

export default function LocationProgramDetailPanel({
    program,
    summary,
    summaries = [],
    siteLabel,
    canMutate,
    onSave,
    programs,
    selectedProgramId,
    onSelectProgram,
    onAddProgram,
    ageUnitSelectOptions = [],
    locationHasSchedule = false,
    scheduleSummary,
}: {
    program: LocationProgramCategoryRow | null;
    summary: LocationProgramOperationalSummary | null;
    summaries?: LocationProgramOperationalSummary[];
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
    onAddProgram?: () => void;
    ageUnitSelectOptions?: readonly { value: string; label: string }[];
    locationHasSchedule?: boolean;
    scheduleSummary?: string;
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
    const status = programStatusLabel(summary, attention);
    const scheduleLine =
        locationHasSchedule ?
            `Uses ${siteLabel || "location"} hours${scheduleSummary ? ` · ${scheduleSummary}` : ""}`
        :   "Location hours are not set up yet";

    const beginEdit = () => setEditing(true);
    const cancelEdit = () => {
        if (!program) return;
        setLabel(program.label);
        setAgeFrom(readMeta(program.metadata, "age_range_from"));
        setAgeTo(readMeta(program.metadata, "age_range_to"));
        setAgeUnit(readMeta(program.metadata, "age_range_unit"));
        setDefaultRoomTypes(readMeta(program.metadata, "default_room_types"));
        setActive(program.is_active !== false);
        setError(null);
        setEditing(false);
    };

    const detail =
        !program ?
            programs.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-program-workspace-empty"
                    title="No programs offered yet"
                    description="Add a program to define what this location offers families."
                    actions={
                        canMutate && onAddProgram ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={onAddProgram}
                                data-testid="locations-program-empty-add"
                            >
                                Add program
                            </ConfigurationPrimaryButton>
                        :   null
                    }
                />
            :   <ConfigurationEmptyState
                    testId="locations-program-workspace-empty"
                    title="Select a program"
                    description="Choose a program to see what it offers and what still needs setup."
                />
        : editing ?
            <div className="space-y-3" data-testid={`locations-program-edit-${program.id}`}>
                <ConfigObjectHeader
                    name={summary?.label ?? program.label}
                    status={{ label: "Editing", tone: "attention" }}
                    facts={[siteLabel ? `Offered at ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            onClick={cancelEdit}
                            data-testid={`locations-program-cancel-${program.id}`}
                        >
                            Cancel
                        </button>
                    }
                    testId="locations-program-header"
                />

                <div className="space-y-2.5" data-testid="locations-program-editor">
                    <ConfigEditorSection title="Identity" testId="locations-program-editor-identity">
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
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Capacity / participation"
                        description="Participation is derived from rooms assigned to this program."
                        testId="locations-program-editor-participation"
                    >
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="config-typo-sublabel">Rooms using this program</dt>
                                <dd className="font-medium text-alloy-midnight">{summary?.roomCount ?? 0}</dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Configured capacity</dt>
                                <dd className="font-medium text-alloy-midnight">
                                    {summary?.configuredCapacity == null ?
                                        "Not set up yet"
                                    :   `${summary.configuredCapacity} children`}
                                </dd>
                            </div>
                        </dl>
                    </ConfigEditorSection>

                    <ConfigEditorSection title="Age range" testId="locations-program-editor-age">
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
                    </ConfigEditorSection>

                    <ConfigEditorSection
                        title="Hours / operating rules"
                        description="Programs follow this location’s weekly hours."
                        testId="locations-program-editor-schedule"
                    >
                        <p className="text-sm text-alloy-midnight/75">{scheduleLine}</p>
                    </ConfigEditorSection>

                    <ConfigEditorSection title="Advanced" testId="locations-program-editor-advanced">
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
                                onClick={cancelEdit}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                        </div>
                    :   null}
                </div>
            </div>
        :   <div className="space-y-3" data-testid={`locations-program-summary-${program.id}`}>
                <ConfigObjectHeader
                    name={summary?.label ?? program.label}
                    status={{ label: status.label, tone: status.tone }}
                    facts={[siteLabel ? `Offered at ${siteLabel}` : ""].filter(Boolean)}
                    actions={
                        canMutate ?
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={beginEdit}
                                data-testid={`locations-program-edit-${program.id}`}
                            >
                                Edit program
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

                <div
                    className="grid gap-y-3 border-t border-alloy-stone/20 pt-2.5 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3"
                    data-testid="locations-program-ops"
                >
                    {[
                        {
                            key: "status",
                            label: "Status",
                            value: status.label,
                            hint: active ? "Offered at this location" : "Not currently offered",
                            tone: status.tone,
                        },
                        {
                            key: "rooms",
                            label: "Rooms",
                            value: String(summary?.roomCount ?? 0),
                            hint: "Classrooms using this program",
                            tone: (summary?.roomCount ?? 0) === 0 ? "attention" : "ready",
                        },
                        {
                            key: "capacity",
                            label: "Capacity",
                            value:
                                summary?.configuredCapacity == null ?
                                    "Not set"
                                :   String(summary.configuredCapacity),
                            hint:
                                summary?.configuredCapacity == null ?
                                    "From participating rooms"
                                :   "Children across assigned rooms",
                            tone: summary?.configuredCapacity == null ? "attention" : "ready",
                        },
                        {
                            key: "age",
                            label: "Age range",
                            value: ageDisplay === "Age range not set" ? "Not set" : ageDisplay,
                            hint: "Who this program serves",
                            tone:
                                ageDisplay === "Age range not set" || ageDisplay === "Not set" ?
                                    "attention"
                                :   "ready",
                        },
                        {
                            key: "schedule",
                            label: "Operating hours",
                            value: locationHasSchedule ? "Location hours" : "Not set",
                            hint: scheduleLine,
                            tone: locationHasSchedule ? "ready" : "attention",
                        },
                        {
                            key: "ownership",
                            label: "Ownership",
                            value: "Configured here",
                            hint: "Location setting",
                            tone: "ready",
                        },
                    ].map((card) => (
                        <div key={card.key} data-testid={`locations-program-metric-${card.key}`}>
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
                    testId="locations-program-attention"
                    onResolve={beginEdit}
                />
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Programs"
            listSummary="What this location offers"
            testId="locations-programs"
            listActions={
                canMutate && onAddProgram ?
                    <button
                        type="button"
                        className="text-xs font-semibold text-[#007d68]"
                        onClick={onAddProgram}
                        data-testid="locations-program-add"
                    >
                        + Add
                    </button>
                :   null
            }
            list={
                programs.length > 0 ?
                    programs.map((entry) => {
                        const entrySummary = summaries.find((item) => item.id === entry.id);
                        const subtitle =
                            entry.is_active === false ? "Inactive"
                            : entrySummary ?
                                `${entrySummary.roomCount} rooms · ${
                                    entrySummary.configuredCapacity == null ?
                                        "capacity unset"
                                    :   `${entrySummary.configuredCapacity} capacity`
                                }`
                            :   "Active";
                        return (
                            <ConfigurationQueueItem
                                key={entry.id}
                                variant="rail"
                                active={entry.id === selectedProgramId}
                                title={entry.label}
                                subtitle={subtitle}
                                onClick={() => onSelectProgram(entry.id)}
                                testId={`locations-program-${entry.id}`}
                            />
                        );
                    })
                :   <p className="config-typo-sublabel">No programs yet.</p>
            }
            detail={detail}
        />
    );
}
