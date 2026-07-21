"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import type { LocationProgramOperationalSummary } from "@/lib/locations/locationWorkspaceModel";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationQueueItem,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigAttentionPanel,
    ConfigChildObjectMasterDetail,
    ConfigConsequenceLine,
    ConfigEditorSection,
    ConfigObjectHeader,
    type ConfigAttentionItem,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigMutationScopeSelector } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigMutationScopeSelector";
import { ConfigOwnershipSourceBadge } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigOwnershipSourceBadge";
import { ProgramOwnershipEditPrototype } from "@/components/adminV2/settings/programs/ProgramOwnershipEditPrototype";
import {
    resolveProgramOfferingOwnership,
    type ConfigurationMutationScope,
} from "@/lib/configRuntime/organizationLocationScope";
import { isProgramLocationAvailabilityPrototype } from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";

function readMeta(metadata: LocationProgramCategoryRow["metadata"], key: string): string {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    return String((metadata as Record<string, unknown>)[key] ?? "").trim();
}

function programAttention(summary: LocationProgramOperationalSummary | null, ageRange: string): ConfigAttentionItem[] {
    const items: ConfigAttentionItem[] = [];
    if (!ageRange || ageRange === "Age range not set" || ageRange === "Not set") {
        items.push({
            key: "age",
            grade: "fix",
            label: "Age range is not set",
            consequence: "Families cannot tell who this program serves.",
            nextLabel: "Set age range",
        });
    }
    if ((summary?.roomCount ?? 0) === 0) {
        items.push({
            key: "rooms",
            grade: "improve",
            label: "No rooms are assigned yet",
            consequence: "This program has no classrooms participating.",
            nextLabel: "Review rooms",
        });
    }
    if (summary?.configuredCapacity == null && (summary?.roomCount ?? 0) > 0) {
        items.push({
            key: "capacity",
            grade: "fix",
            label: "Participating rooms need capacity",
            consequence: "Program capacity cannot be counted yet.",
            nextLabel: "Set capacity",
        });
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
    createDetail,
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
            local_description_override?: string | null;
            local_authorization_evidence?: string | null;
        },
    ) => Promise<void>;
    programs: LocationProgramCategoryRow[];
    selectedProgramId: string | null;
    onSelectProgram: (programId: string) => void;
    onAddProgram?: () => void;
    ageUnitSelectOptions?: readonly { value: string; label: string }[];
    locationHasSchedule?: boolean;
    scheduleSummary?: string;
    createDetail?: ReactNode;
}) {
    const [label, setLabel] = useState("");
    const [ageFrom, setAgeFrom] = useState("");
    const [ageTo, setAgeTo] = useState("");
    const [ageUnit, setAgeUnit] = useState("");
    const [defaultRoomTypes, setDefaultRoomTypes] = useState("");
    const [localDescription, setLocalDescription] = useState("");
    const [localAuthorizationEvidence, setLocalAuthorizationEvidence] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [ownershipPrototypeOpen, setOwnershipPrototypeOpen] = useState(false);
    const [mutationScope, setMutationScope] = useState<ConfigurationMutationScope>("location_only");

    useEffect(() => {
        if (!program) return;
        setLabel(program.label);
        setAgeFrom(readMeta(program.metadata, "age_range_from"));
        setAgeTo(readMeta(program.metadata, "age_range_to"));
        setAgeUnit(readMeta(program.metadata, "age_range_unit"));
        setDefaultRoomTypes(readMeta(program.metadata, "default_room_types"));
        setLocalDescription(program.local_description_override ?? "");
        setLocalAuthorizationEvidence(program.local_authorization_evidence ?? "");
        setActive(program.is_active !== false);
        setError(null);
        setEditing(false);
        setMutationScope("location_only");
    }, [program]);

    const ageDisplay = summary?.ageRange ?? "Not set";
    const attention = programAttention(summary, ageDisplay);
    const status = programStatusLabel(summary, attention);
    const scheduleLine =
        locationHasSchedule ?
            `Uses ${siteLabel || "location"} hours${scheduleSummary ? ` · ${scheduleSummary}` : ""}`
        :   "Location hours are not set up yet";

    const ownershipSource = useMemo(
        () =>
            resolveProgramOfferingOwnership({
                hasProgramRevision: Boolean(program?.program_revision_id),
                hasLocalDescriptionOverride: Boolean(program?.local_description_override?.trim()),
            }),
        [program?.local_description_override, program?.program_revision_id],
    );

    const organizationScopeDisabledReason = program?.program_revision_id
        ? "This Location editor only changes offering state and permitted local overrides. Organization definition edits belong on the Programs workspace after an explicit Organization-default confirmation."
        : "This row is a legacy local Program without an Organization definition link.";

    const beginEdit = () => setEditing(true);
    const cancelEdit = () => {
        if (!program) return;
        setLabel(program.label);
        setAgeFrom(readMeta(program.metadata, "age_range_from"));
        setAgeTo(readMeta(program.metadata, "age_range_to"));
        setAgeUnit(readMeta(program.metadata, "age_range_unit"));
        setDefaultRoomTypes(readMeta(program.metadata, "default_room_types"));
        setLocalDescription(program.local_description_override ?? "");
        setLocalAuthorizationEvidence(program.local_authorization_evidence ?? "");
        setActive(program.is_active !== false);
        setError(null);
        setEditing(false);
        setMutationScope("location_only");
    };

    const saveLocationOnly = async () => {
        if (!program) return;
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
                ...(program.program_revision_id ? {} : { label: label.trim() }),
                is_active: active,
                metadata,
                ...(program.program_revision_id
                    ? {
                          local_description_override: localDescription.trim() || null,
                          local_authorization_evidence: localAuthorizationEvidence.trim() || null,
                      }
                    : {}),
            });
            setEditing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const restoreOrganizationDescription = async () => {
        if (!program?.program_revision_id) return;
        setSaving(true);
        setError(null);
        try {
            await onSave(program.id, { local_description_override: null });
            setLocalDescription("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Restore failed");
        } finally {
            setSaving(false);
        }
    };

    const detail =
        createDetail ? createDetail
        : !program ?
            programs.length === 0 ?
                <ConfigurationEmptyState
                    testId="locations-program-workspace-empty"
                    title="No programs offered yet"
                    description="Add a program to define what this location offers families."
                    actions={
                        canMutate && onAddProgram ?
                            <ConfigurationPrimaryButton
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
                    size="hero"
                    name={summary?.label ?? program.label}
                    status={{ label: "Editing", tone: "attention" }}
                    facts={[
                        siteLabel ? `Offered at ${siteLabel}` : "",
                        program.program_revision_id ? "Identity from Organization" : "Legacy local Program",
                        program.program_id ? "Organization Program identity retained" : "",
                    ].filter(Boolean)}
                    actions={
                        <ConfigurationSecondaryButton
                            onClick={cancelEdit}
                            data-testid={`locations-program-cancel-${program.id}`}
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    }
                    testId="locations-program-header"
                />

                <div className="flex flex-wrap gap-2" data-testid="locations-program-ownership">
                    <ConfigOwnershipSourceBadge source={ownershipSource} locationLabel={siteLabel} />
                </div>

                <ConfigMutationScopeSelector
                    value={mutationScope}
                    onChange={setMutationScope}
                    locationLabel={siteLabel || "this Location"}
                    organizationDisabled
                    organizationDisabledReason={organizationScopeDisabledReason}
                    testId="locations-program-mutation-scope"
                />

                <div className="space-y-2.5" data-testid="locations-program-editor">
                    <ConfigEditorSection title="Identity" testId="locations-program-editor-identity">
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">
                                Name · {program.program_revision_id ? "Organization (locked here)" : "Legacy local"}
                            </span>
                            <input
                                type="text"
                                value={label}
                                disabled={!canMutate || Boolean(program.program_revision_id)}
                                onChange={(e) => setLabel(e.target.value)}
                                className="config-runtime-input"
                                data-testid="locations-program-name"
                            />
                        </label>
                        {program.program_revision_id ?
                            <p className="text-xs text-alloy-midnight/50">
                                Program identity comes from the published Organization revision and cannot be changed
                                here. Location-only is the only supported mutation scope on this surface.
                            </p>
                        :   null}
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={active}
                                disabled={!canMutate}
                                onChange={(e) => setActive(e.target.checked)}
                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            />
                            <span className="config-typo-sublabel">Active / offered at this Location</span>
                        </label>
                    </ConfigEditorSection>

                    {program.program_revision_id ?
                        <ConfigEditorSection
                            title="Permitted local difference"
                            description="The Organization owns Program identity. This Location may provide a local description."
                            testId="locations-program-editor-override"
                        >
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Local description</span>
                                <textarea
                                    value={localDescription}
                                    disabled={!canMutate}
                                    onChange={(e) => setLocalDescription(e.target.value)}
                                    className="config-runtime-input min-h-20"
                                    placeholder="Uses the Organization description"
                                    data-testid="locations-program-local-description"
                                />
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                                <ConfigOwnershipSourceBadge
                                    source={localDescription.trim() ? "location_override" : "inherited"}
                                    locationLabel={siteLabel}
                                    testId="locations-program-description-source"
                                />
                                {canMutate && localDescription.trim() ?
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-alloy-bend-pine"
                                        disabled={saving}
                                        onClick={() => void restoreOrganizationDescription()}
                                        data-testid="locations-program-restore-description"
                                    >
                                        Restore Organization default
                                    </button>
                                :   null}
                            </div>
                        </ConfigEditorSection>
                    :   null}

                    <ConfigEditorSection
                        title="Capacity"
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

                    <ConfigEditorSection
                        title="Age range"
                        description="Stored on this Location offering (metadata). Not an Organization draft field."
                        testId="locations-program-editor-age"
                    >
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
                        title="Schedule"
                        description="Programs follow this location’s weekly hours."
                        testId="locations-program-editor-schedule"
                    >
                        <p className="text-sm text-alloy-midnight/75">{scheduleLine}</p>
                    </ConfigEditorSection>

                    <ConfigEditorSection title="Advanced" testId="locations-program-editor-advanced">
                        {program.program_revision_id ?
                            <label className="mb-3 block space-y-1">
                                <span className="config-typo-field-label">Local authorization evidence</span>
                                <textarea
                                    value={localAuthorizationEvidence}
                                    disabled={!canMutate}
                                    onChange={(e) => setLocalAuthorizationEvidence(e.target.value)}
                                    placeholder="License, approval, or local authorization reference"
                                    className="config-runtime-input min-h-20"
                                />
                                <span className="block text-xs text-alloy-midnight/45">
                                    Source: Location · required for local readiness
                                </span>
                            </label>
                        :   null}
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
                                disabled={saving || mutationScope !== "location_only"}
                                data-testid="locations-program-save"
                                onClick={() => void saveLocationOnly()}
                            >
                                {saving ? "Saving…" : "Save Location offering"}
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton onClick={cancelEdit} disabled={saving}>
                                Cancel
                            </ConfigurationSecondaryButton>
                        </div>
                    :   null}
                </div>
            </div>
        :   <div className="space-y-4" data-testid={`locations-program-summary-${program.id}`}>
                <ConfigObjectHeader
                    size="hero"
                    name={summary?.label ?? program.label}
                    status={{ label: status.label, tone: status.tone }}
                    facts={[
                        siteLabel ? `Offered at ${siteLabel}` : "",
                        program.program_revision_id ? "Published by Organization" : "Legacy local Program",
                        program.program_id ? "Organization Program identity" : "",
                    ].filter(Boolean)}
                    actions={
                        canMutate ?
                            isProgramLocationAvailabilityPrototype() ?
                                <ConfigurationSecondaryButton
                                    onClick={() => setOwnershipPrototypeOpen(true)}
                                    data-testid={`locations-program-ownership-edit-${program.id}`}
                                >
                                    Edit configuration
                                </ConfigurationSecondaryButton>
                            :   <ConfigurationSecondaryButton
                                    onClick={beginEdit}
                                    data-testid={`locations-program-edit-${program.id}`}
                                >
                                    Edit program
                                </ConfigurationSecondaryButton>
                        :   null
                    }
                    testId="locations-program-header"
                />

                {ownershipPrototypeOpen ?
                    <ProgramOwnershipEditPrototype
                        programId={String(program.program_id ?? program.id)}
                        programLabel={summary?.label ?? program.label}
                        locationId={program.location_id}
                        locationLabel={siteLabel}
                        hasLocalDescription={Boolean(program.local_description_override?.trim())}
                        organizationDescription=""
                        onClose={() => setOwnershipPrototypeOpen(false)}
                    />
                :   null}

                <div className="flex flex-wrap gap-2" data-testid="locations-program-summary-ownership">
                    <ConfigOwnershipSourceBadge source={ownershipSource} locationLabel={siteLabel} />
                </div>

                <ConfigConsequenceLine testId="locations-program-consequence">
                    {(summary?.roomCount ?? 0) > 0 ?
                        `Serves ${summary?.roomCount} ${(summary?.roomCount ?? 0) === 1 ? "room" : "rooms"}${
                            summary?.configuredCapacity != null ?
                                ` · ${summary.configuredCapacity} children configured`
                            :   " · capacity not fully set"
                        }.`
                    :   "No rooms are assigned to this program yet."}
                </ConfigConsequenceLine>

                {program.program_revision_id ?
                    <section
                        className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/8 px-4 py-3"
                        data-testid="locations-program-effective-sources"
                    >
                        <h2 className="config-typo-field-label">Effective value sources</h2>
                        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-alloy-midnight/45">Identity and requirements</dt>
                                <dd className="font-medium text-alloy-midnight">Organization default</dd>
                            </div>
                            <div>
                                <dt className="text-alloy-midnight/45">Description</dt>
                                <dd className="font-medium text-alloy-midnight">
                                    {program.local_description_override?.trim()
                                        ? `Overridden by ${siteLabel || "Location"}`
                                        : "Inherited from Organization"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-alloy-midnight/45">Offered here and authorization</dt>
                                <dd className="font-medium text-alloy-midnight">Location must supply</dd>
                            </div>
                            <div>
                                <dt className="text-alloy-midnight/45">Resources, capacity, schedule</dt>
                                <dd className="font-medium text-alloy-midnight">Runtime derived</dd>
                            </div>
                        </dl>
                    </section>
                :   null}

                <section className="border-y border-alloy-forge/10 py-4" data-testid="locations-program-ops">
                    <h2 className="config-typo-workspace-title mb-3">Operating picture</h2>
                    <dl className="grid grid-cols-2">
                        {[
                            {
                                key: "rooms",
                                label: "Participating rooms",
                                value: String(summary?.roomCount ?? 0),
                                hint: "Classrooms using this program",
                                attention: (summary?.roomCount ?? 0) === 0,
                            },
                            {
                                key: "capacity",
                                label: "Capacity",
                                value:
                                    summary?.configuredCapacity == null ?
                                        "Not set"
                                    :   String(summary.configuredCapacity),
                                hint: "Across participating rooms",
                                attention: summary?.configuredCapacity == null,
                            },
                            {
                                key: "age",
                                label: "Age range",
                                value: ageDisplay === "Age range not set" ? "Not set" : ageDisplay,
                                hint: "Who this program serves",
                                attention: ageDisplay === "Age range not set" || ageDisplay === "Not set",
                            },
                            {
                                key: "schedule",
                                label: "Schedule",
                                value: locationHasSchedule ? "Location hours" : "Not set",
                                hint: scheduleSummary || "Weekly hours unavailable",
                                attention: !locationHasSchedule,
                            },
                        ].map((metric) => (
                            <div
                                key={metric.key}
                                className="min-w-0 border-t border-alloy-forge/10 px-3 py-3 odd:pl-0 even:border-l first:border-t-0 [&:nth-child(2)]:border-t-0"
                                data-testid={`locations-program-metric-${metric.key}`}
                            >
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    {metric.label}
                                </dt>
                                <dd
                                    className={`mt-1 text-lg font-semibold leading-tight ${
                                        metric.attention ? "text-alloy-ember" : "text-alloy-midnight"
                                    }`}
                                >
                                    {metric.value}
                                </dd>
                                <dd className="mt-1 text-[11px] leading-snug text-alloy-midnight/50">{metric.hint}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <ConfigAttentionPanel
                    items={attention}
                    compact
                    embedded
                    actionAlign="trailing"
                    testId="locations-program-attention"
                    onResolve={beginEdit}
                />
            </div>;

    return (
        <ConfigChildObjectMasterDetail
            listTitle="Programs"
            listSummary={`${programs.length} ${programs.length === 1 ? "program" : "programs"} · Organization associations`}
            testId="locations-programs"
            listActions={
                canMutate && onAddProgram ?
                    <ConfigurationPrimaryButton
                        className="px-2 py-1 text-[11px]"
                        onClick={onAddProgram}
                        data-testid="locations-program-add"
                    >
                        + Add Program
                    </ConfigurationPrimaryButton>
                :   null
            }
            list={
                programs.length > 0 ?
                    programs.map((entry) => {
                        const entrySummary = summaries.find((item) => item.id === entry.id);
                        const roomCount = entrySummary?.roomCount ?? 0;
                        const source = resolveProgramOfferingOwnership({
                            hasProgramRevision: Boolean(entry.program_revision_id),
                            hasLocalDescriptionOverride: Boolean(entry.local_description_override?.trim()),
                        });
                        const sourceLabel =
                            source === "location_override" ? "Overridden locally"
                            : source === "inherited" ? "Inherited"
                            : entry.program_revision_id ? "Assigned"
                            : "Legacy local";
                        const subtitle =
                            entry.is_active === false ? `Inactive · ${sourceLabel}`
                            : roomCount === 0 ? `Active · no rooms · ${sourceLabel}`
                            : entrySummary?.configuredCapacity == null ?
                                `Active · ${roomCount} ${roomCount === 1 ? "room" : "rooms"} · ${sourceLabel}`
                            :   `Active · ${roomCount} ${roomCount === 1 ? "room" : "rooms"} · ${entrySummary.configuredCapacity} capacity · ${sourceLabel}`;
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
                :   <p className="config-typo-sublabel">No programs associated yet.</p>
            }
            detail={detail}
        />
    );
}
