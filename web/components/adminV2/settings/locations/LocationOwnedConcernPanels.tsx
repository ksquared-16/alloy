"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import TourAvailabilitySettingsClient from "@/app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient";
import {
    ConfigurationInlineButton,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    parsePlacementPriorityLayer,
    PLACEMENT_EVALUATION_CAP_DEFAULT,
    type PlacementPriorityLayer,
} from "@/lib/orchestration/placement/placementConfigSchema";
import {
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    expandOperatorPriorityRuleOrderForProfile,
    sortPriorityRuleEnabledKeysForSave,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import {
    resolveEffectivePriorityRuleConfig,
    WAITLIST_RANKING_TIE_BREAKERS_V1,
} from "@/lib/orchestration/placement/waitlistRankingPolicyFactors";
import {
    filterWaitlistRankingEligibleWorkUnits,
    pickDefaultWaitlistRankingWorkUnitId,
} from "@/lib/orchestration/placement/waitlistRankingPolicyWorkUnits";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";

function ConcernSurface({
    title,
    consequence,
    status,
    action,
    children,
    testId,
}: {
    title: string;
    consequence: string;
    status: string;
    action?: ReactNode;
    children?: ReactNode;
    testId: string;
}) {
    return (
        <section className="process-config-setup-card p-3" data-testid={testId} aria-label={title}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alloy-forge/10 pb-2">
                <p className="config-typo-sublabel max-w-2xl">{consequence}</p>
                <span className="rounded-full border border-alloy-forge/12 bg-alloy-stone/10 px-2 py-1 text-[11px] text-alloy-midnight/60">
                    {status}
                </span>
            </div>
            {action ?
                <div className="mt-3">{action}</div>
            :   null}
            {children ?
                <div className="mt-3">{children}</div>
            :   null}
        </section>
    );
}

type PlacementWorkUnit = {
    id: string;
    key: string;
    name: string;
    department_id?: string | null;
    metadata?: unknown;
    queue_definition?: unknown;
};

function readPlacementLifecycleValue(metadata: unknown, key: string): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function placementProcessId(workUnit: PlacementWorkUnit): string {
    return readPlacementLifecycleValue(workUnit.metadata, "lifecycle_process_id") ?? `legacy:${workUnit.id}`;
}

function placementStageLabel(workUnit: PlacementWorkUnit): string {
    return readPlacementLifecycleValue(workUnit.metadata, "lifecycle_stage_label") ?? workUnit.name;
}

export function LocationToursPanel({
    locationId,
    locationLabel,
    onMutationCommitted,
}: {
    locationId: string;
    locationLabel: string;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    return (
        <section className="process-config-setup-card p-3" data-testid="locations-tours-surface" aria-label="Tours">
            <p className="config-typo-sublabel mb-3 max-w-2xl">
                Decide when families can visit and how each booking window works.
            </p>
            <TourAvailabilitySettingsClient
                locationId={locationId}
                locationLabel={locationLabel}
                embedded
                onMutationCommitted={onMutationCommitted}
            />
        </section>
    );
}

export function LocationPlacementPanel({
    rooms,
    onReviewRooms,
    canMutate,
}: {
    rooms: LocationHierarchyRow[];
    onReviewRooms: () => void;
    canMutate: boolean;
}) {
    const activeRooms = rooms.filter((room) => room.is_active !== false);
    const [workUnits, setWorkUnits] = useState<PlacementWorkUnit[]>([]);
    const [processNames, setProcessNames] = useState<Record<string, string>>({});
    const [selectedId, setSelectedId] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [shadowMode, setShadowMode] = useState(false);
    const [ruleOrder, setRuleOrder] = useState<string[]>([]);
    const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const loadPolicy = useCallback(async () => {
        setError(null);
        try {
            const [workUnitsResponse, catalogResponse] = await Promise.all([
                fetch("/api/admin/work-units", { cache: "no-store" }),
                fetch("/api/admin/lifecycle-catalog", { cache: "no-store" }),
            ]);
            const json = (await workUnitsResponse.json().catch(() => ({}))) as {
                items?: PlacementWorkUnit[];
                error?: string;
            };
            if (!workUnitsResponse.ok) {
                throw new Error(json.error ?? "Waitlist ranking policy could not be loaded.");
            }
            const eligible = filterWaitlistRankingEligibleWorkUnits(json.items ?? []);
            const canonical = eligible.filter((workUnit) =>
                Boolean(readPlacementLifecycleValue(workUnit.metadata, "lifecycle_process_id")),
            );
            const selectable = canonical.length > 0 ? canonical : eligible;
            const catalog = (await catalogResponse.json().catch(() => ({}))) as {
                items?: { process_id?: string; lifecycle_name?: string }[];
            };
            setProcessNames(
                Object.fromEntries(
                    (catalogResponse.ok ? (catalog.items ?? []) : [])
                        .filter((item) => item.process_id && item.lifecycle_name)
                        .map((item) => [item.process_id as string, item.lifecycle_name as string]),
                ),
            );
            setWorkUnits(selectable);
            setSelectedId((current) => pickDefaultWaitlistRankingWorkUnitId(selectable, current));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Waitlist ranking policy could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPolicy();
    }, [loadPolicy]);

    const selectedWorkUnit = useMemo(
        () => workUnits.find((workUnit) => workUnit.id === selectedId) ?? null,
        [selectedId, workUnits],
    );
    const processOptions = useMemo(() => {
        const unique = new Map<string, string>();
        for (const workUnit of workUnits) {
            const processId = placementProcessId(workUnit);
            unique.set(
                processId,
                processNames[processId] ??
                    readPlacementLifecycleValue(workUnit.metadata, "lifecycle_process_name") ??
                    workUnit.name,
            );
        }
        return [...unique].map(([id, label]) => ({ id, label }));
    }, [processNames, workUnits]);
    const selectedProcessId = selectedWorkUnit ? placementProcessId(selectedWorkUnit) : "";
    const selectedProcessName =
        processOptions.find((process) => process.id === selectedProcessId)?.label ??
        selectedWorkUnit?.name ??
        "this Business Process";
    const stageOptions = workUnits.filter(
        (workUnit) => placementProcessId(workUnit) === selectedProcessId,
    );

    useEffect(() => {
        if (!selectedWorkUnit) return;
        const layer = parsePlacementPriorityLayer(selectedWorkUnit.metadata);
        const profileId = layer?.profile_id ?? CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id;
        const effective = resolveEffectivePriorityRuleConfig({
            profileId,
            priority_rule_order: layer?.priority_rule_order,
            priority_rule_enabled_keys: layer?.priority_rule_enabled_keys,
        });
        setEnabled(layer?.enabled === true);
        setShadowMode(layer?.shadow_mode === true);
        setRuleOrder(effective.ruleOrder);
        setEnabledKeys(new Set(effective.ruleEnabledKeys));
    }, [selectedWorkUnit]);

    const profileId =
        parsePlacementPriorityLayer(selectedWorkUnit?.metadata)?.profile_id ??
        CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id;
    const profile =
        getPlacementProfileFromRegistry(profileId) ??
        CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1;
    const fallbackBucketKey = profile.fallback_bucket_key;

    const savePolicy = async () => {
        if (!canMutate || !selectedWorkUnit) return;
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
            const current = parsePlacementPriorityLayer(selectedWorkUnit.metadata);
            const fullOrder = expandOperatorPriorityRuleOrderForProfile(profile, ruleOrder);
            const layer: PlacementPriorityLayer = {
                ...current,
                version: 1,
                enabled,
                profile_id: profile.profile_id,
                profile_revision: profile.revision,
                queue_keys_enabled: current?.queue_keys_enabled ?? ["waitlisted"],
                shadow_mode: shadowMode,
                evaluation_cap: current?.evaluation_cap ?? PLACEMENT_EVALUATION_CAP_DEFAULT,
                display: current?.display ?? { show_bucket_chip: true, show_sort_hint: true },
                priority_rule_order: fullOrder,
                priority_rule_enabled_keys: sortPriorityRuleEnabledKeysForSave(enabledKeys, fullOrder),
            };
            const response = await fetch(`/api/admin/work-units/${encodeURIComponent(selectedWorkUnit.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: { placement_priority_v1: layer } }),
            });
            const json = (await response.json().catch(() => ({}))) as {
                metadata?: Record<string, unknown>;
                error?: string;
            };
            if (!response.ok) throw new Error(json.error ?? "Waitlist ranking policy could not be saved.");
            if (
                !mutationResponseContainsPatch(json as Record<string, unknown>, {
                    metadata: { placement_priority_v1: layer },
                })
            ) {
                throw new Error("Waitlist ranking save was not confirmed by the authoritative response.");
            }
            await loadPolicy();
            setSaved(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Waitlist ranking policy could not be saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-placement-surface">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="config-typo-sublabel max-w-2xl">
                        Priority order used when more families are waiting than can be placed. Ranking is saved on the
                        governing Business Process — not this location — and applies wherever that process runs.
                    </p>
                </div>
                <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        loading ? "border-alloy-forge/15 bg-alloy-stone/10 text-alloy-midnight/50"
                        : enabled ?
                            "border-alloy-bend-pine/25 bg-alloy-bend-pine/10 text-alloy-bend-pine"
                        :   "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                    }`}
                    data-testid="locations-placement-status"
                >
                    {loading ? "Loading…" : enabled ? "● Ranking active" : "○ Ranking inactive"}
                </span>
            </div>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            {!loading && !selectedWorkUnit ?
                <p className="config-typo-sublabel">No waitlist-enabled Business Process is available for ranking.</p>
            : selectedWorkUnit ?
                <fieldset disabled={!canMutate || saving} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <label className="config-typo-field-label" htmlFor="locations-placement-process">
                                Governing Business Process
                            </label>
                            <select
                                id="locations-placement-process"
                                className="config-runtime-select mt-1"
                                value={selectedProcessId}
                                onChange={(event) => {
                                    const firstStage = workUnits.find(
                                        (workUnit) => placementProcessId(workUnit) === event.target.value,
                                    );
                                    if (firstStage) setSelectedId(firstStage.id);
                                }}
                                data-testid="locations-placement-process"
                            >
                                {processOptions.map((process) => (
                                    <option key={process.id} value={process.id}>
                                        {process.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="config-typo-field-label" htmlFor="locations-placement-stage">
                                Stage
                            </label>
                            <select
                                id="locations-placement-stage"
                                className="config-runtime-select mt-1"
                                value={selectedId}
                                onChange={(event) => setSelectedId(event.target.value)}
                                data-testid="locations-placement-stage"
                            >
                                {stageOptions.map((workUnit) => (
                                    <option key={workUnit.id} value={workUnit.id}>
                                        {placementStageLabel(workUnit)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="rounded-lg border border-alloy-forge/10 px-3 py-2">
                            <p className="config-typo-meta">Rooms at this location</p>
                            <p className="mt-1 text-sm font-medium text-alloy-midnight/80">
                                {activeRooms.length} can participate in placement
                            </p>
                            <ConfigurationInlineButton
                                className="mt-2"
                                onClick={onReviewRooms}
                                data-testid="locations-placement-review-rooms"
                            >
                                Review rooms →
                            </ConfigurationInlineButton>
                        </div>
                    </div>
                    <p className="config-typo-meta" data-testid="locations-placement-persistence-scope">
                        Saved on {selectedProcessName} for the {placementStageLabel(selectedWorkUnit)} stage, not on
                        this location. Applies at every location using this Business Process.
                    </p>

                    <label className="flex items-center gap-2 text-sm font-medium text-alloy-midnight/80">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => setEnabled(event.target.checked)}
                        />
                        Use priority ranking
                    </label>

                    <div className="space-y-2" data-testid="locations-placement-priority-order">
                        <div>
                            <h3 className="config-typo-workspace-title">Priority factors</h3>
                            <p className="config-typo-sublabel mt-1">
                                The first matching factor wins. Move factors to set their order.
                            </p>
                        </div>
                        <PriorityRuleOrderEditor
                            order={ruleOrder}
                            enabledKeys={enabledKeys}
                            fallbackBucketKey={fallbackBucketKey}
                            labels={{
                                [TIER_EMPLOYEE_FAMILY_BUCKET]: "Employee",
                                tier_sibling_enrolled: "Sibling — this location",
                                tier_sister_center: "Sibling — another location",
                                [TIER_GENERAL_WAITLIST_BUCKET]: "Standard waitlist",
                            }}
                            sources={{}}
                            selectableCatalog
                            disabled={!canMutate}
                            onOrderChange={setRuleOrder}
                            onEnabledKeysChange={setEnabledKeys}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Tie-break</p>
                            <ol className="mt-2 space-y-1 text-sm text-alloy-midnight/75">
                                {WAITLIST_RANKING_TIE_BREAKERS_V1.map((tieBreaker, index) => (
                                    <li key={tieBreaker.order}>
                                        {index + 1}.{" "}
                                        {tieBreaker.label === "Waitlist date" ?
                                            "Application / waitlist date"
                                        :   tieBreaker.label}
                                    </li>
                                ))}
                            </ol>
                        </div>
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Ordering mode</p>
                            <fieldset className="mt-2 space-y-2">
                                <label className="flex items-start gap-2 text-sm text-alloy-midnight/75">
                                    <input
                                        className="mt-0.5"
                                        type="radio"
                                        name="locations-placement-ordering-mode"
                                        checked={shadowMode}
                                        onChange={() => setShadowMode(true)}
                                    />
                                    Preview priority without changing waitlist order
                                </label>
                                <label className="flex items-start gap-2 text-sm text-alloy-midnight/75">
                                    <input
                                        className="mt-0.5"
                                        type="radio"
                                        name="locations-placement-ordering-mode"
                                        checked={!shadowMode}
                                        onChange={() => setShadowMode(false)}
                                    />
                                    Order the waitlist by this priority
                                </label>
                            </fieldset>
                        </div>
                    </div>

                    {canMutate ?
                        <ConfigurationPrimaryButton
                            disabled={saving}
                            onClick={() => void savePolicy()}
                            data-testid="locations-placement-save"
                        >
                            {saving ? "Saving…" : "Save ranking"}
                        </ConfigurationPrimaryButton>
                    :   null}
                    {saved ? <p className="text-xs text-alloy-bend-pine">Ranking saved.</p> : null}
                </fieldset>
            :   null}
        </div>
    );
}

type MemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    department_scope: "all" | "restricted";
    department_ids: string[];
    site_scope: "all" | "restricted";
    site_location_ids: string[];
};

export function LocationAccessPanel({
    locationId,
    onMutationCommitted,
}: {
    locationId: string;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [siteLocationIds, setSiteLocationIds] = useState<string[]>([]);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadMembers = useCallback(async (cancelled?: () => boolean) => {
        const response = await fetch("/api/admin/settings/users-roles/members", {
            credentials: "include",
        });
        const json = (await response.json().catch(() => ({}))) as {
            members?: MemberRow[];
            site_locations?: { id: string }[];
            error?: string;
        };
        if (cancelled?.()) return;
        setAuthorized(response.ok);
        if (response.ok) {
            setMembers(json.members ?? []);
            setSiteLocationIds((json.site_locations ?? []).map((site) => site.id));
            setError(null);
        } else {
            setMembers([]);
            setSiteLocationIds([]);
            setError(json.error ?? "Location access is unavailable.");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void loadMembers(() => cancelled);
        return () => {
            cancelled = true;
        };
    }, [loadMembers, locationId]);

    const membersWithAccess = members.filter(
        (member) => member.site_scope === "all" || member.site_location_ids.includes(locationId),
    );
    const adminCount = membersWithAccess.filter((member) => member.role_keys.includes("admin")).length;

    const updateLocationAccess = async (member: MemberRow, grant: boolean) => {
        const currentlyHasAccess = member.site_scope === "all" || member.site_location_ids.includes(locationId);
        if (currentlyHasAccess === grant) return;

        const nextSiteIds =
            grant ? [...new Set([...member.site_location_ids, locationId])]
            : member.site_scope === "all" ? siteLocationIds.filter((id) => id !== locationId)
            : member.site_location_ids.filter((id) => id !== locationId);

        if (nextSiteIds.length === 0) {
            setError(
                "A team member cannot be restricted to no locations. Grant another location before removing this one.",
            );
            return;
        }

        setSavingUserId(member.user_id);
        setError(null);
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(member.user_id)}/access-scope`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_scope: member.department_scope,
                    site_scope: "restricted",
                    department_ids: member.department_scope === "restricted" ? member.department_ids : [],
                    site_location_ids: nextSiteIds,
                }),
            });
            const json = (await response.json().catch(() => ({}))) as {
                site_location_ids?: string[];
                error?: string;
            };
            if (!response.ok) throw new Error(json.error ?? "Location access could not be saved.");
            const confirmedIds = new Set(json.site_location_ids ?? []);
            if (confirmedIds.size !== nextSiteIds.length || nextSiteIds.some((id) => !confirmedIds.has(id))) {
                throw new Error("Location access save was not confirmed by the authoritative response.");
            }
            await loadMembers();
            await onMutationCommitted?.();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Location access could not be saved.");
        } finally {
            setSavingUserId(null);
        }
    };

    return (
        <ConcernSurface
            title="Access"
            consequence="See who can operate this location and adjust location access without leaving the workspace."
            status={
                loading ? "Loading team…"
                : authorized ?
                    `${membersWithAccess.length} team members`
                :   "Permission required"
            }
            testId="locations-access-surface"
            action={
                <div className="space-y-3">
                    {error ?
                        <p
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                            role="alert"
                        >
                            {error}
                        </p>
                    :   null}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Team with access</p>
                            <p className="mt-1 text-lg font-medium text-alloy-midnight">{membersWithAccess.length}</p>
                        </div>
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Administrators</p>
                            <p className="mt-1 text-lg font-medium text-alloy-midnight">{adminCount}</p>
                        </div>
                    </div>
                    {membersWithAccess.length > 0 ?
                        <ul className="divide-y divide-alloy-forge/10">
                            {membersWithAccess.slice(0, 5).map((member) => (
                                <li key={member.user_id} className="flex items-center justify-between gap-3 py-2">
                                    <span className="text-sm text-alloy-midnight/75">
                                        {member.display_name ?? member.email ?? "Team member"}
                                    </span>
                                    <span className="config-typo-meta">{member.role_keys.join(", ") || "Member"}</span>
                                </li>
                            ))}
                        </ul>
                    :   null}
                    {authorized ?
                        <ConfigurationInlineButton
                            onClick={() => setEditing((current) => !current)}
                            data-testid="locations-access-configure"
                        >
                            {editing ? "Close access editor" : "Manage location access"}
                        </ConfigurationInlineButton>
                    :   null}
                    {editing ?
                        <ul className="divide-y divide-alloy-forge/10 rounded-lg border border-alloy-forge/10">
                            {members.map((member) => {
                                const hasAccess =
                                    member.site_scope === "all" || member.site_location_ids.includes(locationId);
                                return (
                                    <li
                                        key={member.user_id}
                                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-alloy-midnight/80">
                                                {member.display_name ?? member.email ?? "Team member"}
                                            </p>
                                            <p className="config-typo-meta">
                                                {member.role_keys.join(", ") || "Member"} ·{" "}
                                                {member.site_scope === "all" ? "All locations" : "Selected locations"}
                                            </p>
                                        </div>
                                        <ConfigurationSecondaryButton
                                            className="px-2.5 py-1.5"
                                            disabled={savingUserId === member.user_id}
                                            onClick={() => void updateLocationAccess(member, !hasAccess)}
                                        >
                                            {savingUserId === member.user_id ?
                                                "Saving…"
                                            : hasAccess ?
                                                "Remove"
                                            :   "Add"}
                                        </ConfigurationSecondaryButton>
                                    </li>
                                );
                            })}
                        </ul>
                    :   null}
                </div>
            }
        />
    );
}
