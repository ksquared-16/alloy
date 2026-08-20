"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
    invalidateLocationConcernCaches,
    loadLocationAccessMembers,
    loadLocationPlacementPolicy,
    peekLocationAccessMembers,
    peekLocationPlacementPolicy,
    type LocationAccessMembersSnapshot,
} from "@/lib/locations/locationConcernCache";
import { projectMemberScope, scopeSummary } from "@/lib/access/memberIdentityProjection";
import {
    projectLocationConcernTransition,
    shouldApplyLocationConcernResponse,
} from "@/lib/locations/locationConcernContract";

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
    orgId,
    locationId,
    locationLabel,
    onMutationCommitted,
}: {
    orgId: string;
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
                orgId={orgId}
                locationId={locationId}
                locationLabel={locationLabel}
                embedded
                onMutationCommitted={onMutationCommitted}
            />
        </section>
    );
}

export function LocationPlacementPanel({
    orgId,
    rooms,
    onReviewRooms,
    canMutate,
    onMutationCommitted,
}: {
    orgId: string;
    rooms: LocationHierarchyRow[];
    onReviewRooms: () => void;
    canMutate: boolean;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    const activeRooms = rooms.filter((room) => room.is_active !== false);
    const peeked = orgId ? peekLocationPlacementPolicy(orgId) : null;
    const [workUnits, setWorkUnits] = useState<PlacementWorkUnit[]>(() => peeked?.workUnits ?? []);
    const [processNames, setProcessNames] = useState<Record<string, string>>(
        () => peeked?.processNames ?? {},
    );
    const [selectedId, setSelectedId] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [shadowMode, setShadowMode] = useState(false);
    const [ruleOrder, setRuleOrder] = useState<string[]>([]);
    const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
    const hasDataRef = useRef(Boolean(peeked?.workUnits.length));
    const [loading, setLoading] = useState(!hasDataRef.current);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const requestSeq = useRef(0);

    const applyEligible = useCallback(
        (raw: PlacementWorkUnit[], names: Record<string, string>) => {
            const eligible = filterWaitlistRankingEligibleWorkUnits(raw);
            const canonical = eligible.filter((workUnit) =>
                Boolean(readPlacementLifecycleValue(workUnit.metadata, "lifecycle_process_id")),
            );
            const selectable = canonical.length > 0 ? canonical : eligible;
            setProcessNames(names);
            setWorkUnits(selectable);
            setSelectedId((current) => pickDefaultWaitlistRankingWorkUnitId(selectable, current));
            hasDataRef.current = selectable.length > 0 || hasDataRef.current;
        },
        [],
    );

    const loadPolicy = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!orgId.trim()) {
                setLoading(false);
                setError("Organization context is required.");
                return;
            }
            const seq = ++requestSeq.current;
            const hadData = hasDataRef.current;
            if (hadData) setRefreshing(true);
            else setLoading(true);
            setError(null);
            try {
                const { snapshot } = await loadLocationPlacementPolicy(orgId, { force: opts?.force });
                if (
                    !shouldApplyLocationConcernResponse({
                        requestSeq: seq,
                        latestSeq: requestSeq.current,
                        requestLocationId: orgId,
                        activeLocationId: orgId,
                        requestConcern: "placement",
                        activeConcern: "placement",
                    })
                ) {
                    return;
                }
                applyEligible(snapshot.workUnits as PlacementWorkUnit[], snapshot.processNames);
            } catch (cause) {
                if (seq !== requestSeq.current) return;
                setError(cause instanceof Error ? cause.message : "Waitlist ranking policy could not be loaded.");
            } finally {
                if (seq === requestSeq.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [applyEligible, orgId],
    );

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

    const transition = projectLocationConcernTransition({
        hasPriorContent: hasDataRef.current || workUnits.length > 0,
        loading,
        refreshing,
        error,
        isEmptyResult: !loading && !refreshing && !selectedWorkUnit && !error,
    });

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
            invalidateLocationConcernCaches(orgId, "placement", {
                reason: "placement-policy-saved",
            });
            await loadPolicy({ force: true });
            await onMutationCommitted?.();
            setSaved(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Waitlist ranking policy could not be saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-placement-surface" data-transition={transition}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="config-typo-sublabel max-w-2xl">
                        Priority order used when more families are waiting than can be placed. Ranking is saved on the
                        governing Business Process — not this location — and applies wherever that process runs.
                    </p>
                </div>
                <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        transition === "cold" ? "border-alloy-forge/15 bg-alloy-stone/10 text-alloy-midnight/50"
                        : enabled ?
                            "border-alloy-bend-pine/25 bg-alloy-bend-pine/10 text-alloy-bend-pine"
                        :   "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                    }`}
                    data-testid="locations-placement-status"
                >
                    {transition === "cold" ? "Loading…"
                    : transition === "refreshing" ? (enabled ? "● Ranking active · refreshing" : "○ Ranking inactive · refreshing")
                    : enabled ? "● Ranking active"
                    :   "○ Ranking inactive"}
                </span>
            </div>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            {transition === "empty" ?
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

/**
 * **W-47 consumer correction.** This was a hand-written duplicate of the cache snapshot's member
 * shape, and it went stale the moment `unset` became representable: the panel still declared
 * `"all" | "restricted"`, so it did not compile against the projection that now emits three values.
 * Deriving it from the snapshot means there is one shape, and a fourth state would reach here as a
 * type error rather than as a wrong roster.
 */
type MemberRow = LocationAccessMembersSnapshot["members"][number];

/**
 * What the platform enforces for a membership with **no access profile row** — obtained by *calling*
 * the projection with an absent row, never by restating `ABSENT_PROFILE_ENFORCEMENT` here. `IA-R4`:
 * effective access "MUST NOT have a second implementation". When `W-7` flips that constant from
 * `legacy-all` to `deny`, this panel follows without an edit.
 */
const ABSENT_PROFILE_ENFORCED = projectMemberScope({
    profileRow: null,
    departmentIds: [],
    siteLocationIds: [],
});

/**
 * Does this member actually *reach* this location today?
 *
 * The question is about enforcement, so it reads `effective_site_scope` — the enforcing resolver's
 * answer — and not `site_scope`, which is what an operator configured. Before `W-47` the two were
 * the same value; they are not any more, and for an `unset` membership they disagree: nothing is
 * configured, and legacy enforcement grants everything.
 *
 * `effective_site_scope` is optional only because a cache entry written by an older build predates
 * it. In that case the configured value is used when it is definite, and an `unset` membership
 * falls back to the enforced answer above.
 */
function enforcedSiteScope(member: MemberRow): "all" | "restricted" {
    if (member.effective_site_scope) return member.effective_site_scope;
    return member.site_scope === "unset" ? ABSENT_PROFILE_ENFORCED.effective_site_scope : member.site_scope;
}

/** As {@link enforcedSiteScope}, for the department dimension the access-scope PATCH must preserve. */
function enforcedDepartmentScope(member: MemberRow): "all" | "restricted" {
    if (member.effective_department_scope) return member.effective_department_scope;
    return member.department_scope === "unset" ?
            ABSENT_PROFILE_ENFORCED.effective_department_scope
        :   member.department_scope;
}

export function LocationAccessPanel({
    orgId,
    locationId,
    onMutationCommitted,
}: {
    orgId: string;
    locationId: string;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    const peeked = orgId && locationId ? peekLocationAccessMembers(orgId, locationId) : null;
    const [members, setMembers] = useState<MemberRow[]>(() => peeked?.members ?? []);
    const [siteLocationIds, setSiteLocationIds] = useState<string[]>(() => peeked?.siteLocationIds ?? []);
    const [editing, setEditing] = useState(false);
    const hasDataRef = useRef(Boolean(peeked));
    const [loading, setLoading] = useState(!hasDataRef.current);
    const [refreshing, setRefreshing] = useState(false);
    const [authorized, setAuthorized] = useState(peeked?.authorized ?? false);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);
    const activeLocationRef = useRef(locationId);
    activeLocationRef.current = locationId;

    const loadMembers = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!orgId.trim() || !locationId.trim()) {
                setLoading(false);
                setError("Organization and location context are required.");
                return;
            }
            const seq = ++requestSeq.current;
            const requestLocationId = locationId;
            const hadData = hasDataRef.current;
            if (hadData) setRefreshing(true);
            else setLoading(true);
            try {
                const { snapshot } = await loadLocationAccessMembers(orgId, locationId, {
                    force: opts?.force,
                });
                if (
                    !shouldApplyLocationConcernResponse({
                        requestSeq: seq,
                        latestSeq: requestSeq.current,
                        requestLocationId,
                        activeLocationId: activeLocationRef.current,
                        requestConcern: "access",
                        activeConcern: "access",
                    })
                ) {
                    return;
                }
                setAuthorized(snapshot.authorized);
                if (snapshot.authorized) {
                    setMembers(snapshot.members);
                    setSiteLocationIds(snapshot.siteLocationIds);
                    setError(null);
                    hasDataRef.current = true;
                } else {
                    if (!hadData) {
                        setMembers([]);
                        setSiteLocationIds([]);
                    }
                    setError("Location access is unavailable.");
                }
            } catch (cause) {
                if (seq !== requestSeq.current || requestLocationId !== activeLocationRef.current) return;
                if (!hadData) {
                    setMembers([]);
                    setSiteLocationIds([]);
                }
                setError(cause instanceof Error ? cause.message : "Location access is unavailable.");
            } finally {
                if (seq === requestSeq.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [locationId, orgId],
    );

    useEffect(() => {
        void loadMembers();
    }, [loadMembers]);

    const membersWithAccess = members.filter(
        (member) => enforcedSiteScope(member) === "all" || member.site_location_ids.includes(locationId),
    );
    const adminCount = membersWithAccess.filter((member) => member.role_keys.includes("admin")).length;

    const transition = projectLocationConcernTransition({
        hasPriorContent: hasDataRef.current || members.length > 0,
        loading,
        refreshing,
        error,
        forbidden: !authorized && !loading && !refreshing,
        isEmptyResult: authorized && !loading && !refreshing && membersWithAccess.length === 0,
    });

    const updateLocationAccess = async (member: MemberRow, grant: boolean) => {
        const currentSiteScope = enforcedSiteScope(member);
        const currentlyHasAccess = currentSiteScope === "all" || member.site_location_ids.includes(locationId);
        if (currentlyHasAccess === grant) return;

        const nextSiteIds =
            grant ? [...new Set([...member.site_location_ids, locationId])]
            : currentSiteScope === "all" ? siteLocationIds.filter((id) => id !== locationId)
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
                    // `member.department_scope` may now be `unset`, which is not a value the
                    // access-scope PATCH accepts — sending it would either be rejected or persist a
                    // configuration the operator never chose. Granting a location must not silently
                    // decide the department dimension, so this writes back what is *enforced* today,
                    // leaving that dimension's behaviour exactly as it was.
                    department_scope: enforcedDepartmentScope(member),
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
            invalidateLocationConcernCaches(orgId, "access", {
                locationId,
                reason: "location-access-saved",
            });
            invalidateLocationConcernCaches(orgId, "owned-setup", {
                locationId,
                reason: "location-access-saved",
                publishBus: false,
            });
            await loadMembers({ force: true });
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
                transition === "cold" ? "Loading team…"
                : transition === "refreshing" ? "Refreshing team…"
                : transition === "forbidden" ? "Permission required"
                :   `${membersWithAccess.length} team members`
            }
            testId="locations-access-surface"
            action={
                <div className="space-y-3" data-transition={transition}>
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
                                    enforcedSiteScope(member) === "all" ||
                                    member.site_location_ids.includes(locationId);
                                // W-47 reached this label too: `site_scope === "all" ? … : "Selected
                                // locations"` renders a membership with *no profile row* as
                                // "Selected locations", which is a configuration nobody made. The
                                // projection's own summary is used so the three states stay three.
                                const scopeLine = scopeSummary({
                                    configured: member.site_scope,
                                    ids: member.site_location_ids,
                                    labelFor: () => null,
                                    allLabel: "All locations",
                                    noneLabel: "No locations",
                                    unitSingular: "location",
                                    unitPlural: "locations",
                                });
                                return (
                                    <li
                                        key={member.user_id}
                                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-alloy-midnight/80">
                                                {member.display_name ?? member.email ?? "Team member"}
                                            </p>
                                            <p
                                                className="config-typo-meta"
                                                data-capability={scopeLine.certainty === "unset" ? "unset" : undefined}
                                            >
                                                {member.role_keys.join(", ") || "Member"} · {scopeLine.label}
                                                {scopeLine.certainty === "unset" ?
                                                    <span className="text-alloy-midnight/45">
                                                        {" "}
                                                        (currently enforced as{" "}
                                                        {enforcedSiteScope(member) === "all" ?
                                                            "all locations"
                                                        :   "selected locations"}
                                                        )
                                                    </span>
                                                :   null}
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
