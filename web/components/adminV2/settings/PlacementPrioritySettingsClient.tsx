"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";
import {
    parsePlacementPriorityLayer,
    PLACEMENT_EVALUATION_CAP_MAX,
    type PlacementPriorityLayer,
} from "@/lib/orchestration/placement/placementConfigSchema";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import {
    getPlacementProfileFromRegistry,
    listRegisteredPlacementProfileIds,
} from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
    defaultPriorityRuleOrderForProfileId,
    expandOperatorPriorityRuleOrderForProfile,
    sortPriorityRuleEnabledKeysForSave,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import {
    buildWaitlistActivePolicyStatus,
    buildWaitlistRankingPolicySummary,
    resolveEffectivePriorityRuleConfig,
    WAITLIST_RANKING_POLICY_FACTORS,
    WAITLIST_RANKING_TIE_BREAKERS_V1,
} from "@/lib/orchestration/placement/waitlistRankingPolicyFactors";
import {
    filterWaitlistRankingEligibleWorkUnits,
    pickDefaultWaitlistRankingWorkUnitId,
} from "@/lib/orchestration/placement/waitlistRankingPolicyWorkUnits";

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string;
    name: string;
    metadata?: unknown;
    queue_definition?: unknown;
};

const DEFAULT_LAYER: PlacementPriorityLayer = {
    version: 1,
    enabled: false,
    profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id,
    profile_revision: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.revision,
    queue_keys_enabled: ["waitlisted"],
    shadow_mode: false,
    evaluation_cap: 200,
    display: { show_bucket_chip: true, show_sort_hint: true },
};

function layerFromWorkUnitMetadata(metadata: unknown): PlacementPriorityLayer {
    const parsed = parsePlacementPriorityLayer(metadata);
    if (!parsed) return { ...DEFAULT_LAYER };
    return {
        ...DEFAULT_LAYER,
        ...parsed,
        version: 1,
    };
}

function SettingsSection({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section
            className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/60 p-4 shadow-sm"
            data-testid={testId}
        >
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">{title}</h2>
                {description ? (
                    <p className="mt-1 max-w-2xl text-[11px] leading-snug text-alloy-midnight/55">{description}</p>
                ) : null}
            </div>
            {children}
        </section>
    );
}

export default function PlacementPrioritySettingsClient() {
    const { role } = useAdminAuth();
    const canSave = role === "admin";

    const [items, setItems] = useState<WorkUnitRow[]>([]);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState<string | null>(null);

    const [enabled, setEnabled] = useState(false);
    const [profileId, setProfileId] = useState(DEFAULT_LAYER.profile_id ?? "");
    const [waitlistedLaneOnly, setWaitlistedLaneOnly] = useState(true);
    const [shadowMode, setShadowMode] = useState(false);
    const [engineVersion, setEngineVersion] = useState<"v1" | "v2">("v1");
    const [profileRevision, setProfileRevision] = useState<string>("");
    const [evaluationCap, setEvaluationCap] = useState(200);
    const [showBucketChip, setShowBucketChip] = useState(true);
    const [showSortHint, setShowSortHint] = useState(true);
    const [ruleOrder, setRuleOrder] = useState<string[]>(() => [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]);
    const [ruleEnabledKeys, setRuleEnabledKeys] = useState<Set<string>>(
        () => new Set(CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1)
    );

    const presetIds = useMemo(() => listRegisteredPlacementProfileIds(), []);
    const eligibleItems = useMemo(() => filterWaitlistRankingEligibleWorkUnits(items), [items]);

    const loadList = useCallback(async () => {
        setLoadErr(null);
        try {
            const res = await fetch("/api/admin/work-units", { cache: "no-store" });
            const j = (await res.json()) as { items?: WorkUnitRow[]; error?: string };
            if (!res.ok) throw new Error(j.error || res.statusText);
            const rows = j.items ?? [];
            setItems(rows);
            const eligible = filterWaitlistRankingEligibleWorkUnits(rows);
            setSelectedId((prev) => pickDefaultWaitlistRankingWorkUnitId(eligible, prev));
        } catch (e) {
            setLoadErr(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const selected = eligibleItems.find((x) => x.id === selectedId);

    useEffect(() => {
        if (!selected) return;
        const L = layerFromWorkUnitMetadata(selected.metadata);
        setEnabled(!!L.enabled);
        setProfileId(L.profile_id ?? DEFAULT_LAYER.profile_id!);
        const qk = L.queue_keys_enabled;
        setWaitlistedLaneOnly(Array.isArray(qk) && qk.length === 1 && qk[0] === "waitlisted");
        setShadowMode(L.shadow_mode ?? false);
        setEngineVersion(L.engine_version === "v2" ? "v2" : "v1");
        setProfileRevision(L.profile_revision ?? "");
        setEvaluationCap(typeof L.evaluation_cap === "number" ? L.evaluation_cap : 200);
        setShowBucketChip(L.display?.show_bucket_chip !== false);
        setShowSortHint(L.display?.show_sort_hint !== false);

        const effective = resolveEffectivePriorityRuleConfig({
            profileId: L.profile_id ?? DEFAULT_LAYER.profile_id!,
            priority_rule_order: L.priority_rule_order,
            priority_rule_enabled_keys: L.priority_rule_enabled_keys,
        });
        setRuleOrder(effective.ruleOrder);
        setRuleEnabledKeys(new Set(effective.ruleEnabledKeys));
    }, [selected]);

    const fallbackBucketKey =
        getPlacementProfileFromRegistry(profileId.trim())?.fallback_bucket_key ??
        CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;

    const activePolicy = useMemo(
        () =>
            buildWaitlistActivePolicyStatus({
                workUnitName: selected?.name ?? "",
                enabled,
                shadowMode,
            }),
        [selected?.name, enabled, shadowMode]
    );

    const policySummary = useMemo(
        () =>
            buildWaitlistRankingPolicySummary({
                enabled,
                ruleOrder,
                enabledKeys: ruleEnabledKeys,
                shadowMode,
                fallbackBucketKey,
            }),
        [enabled, ruleOrder, ruleEnabledKeys, shadowMode, fallbackBucketKey]
    );

    const hasRuleEditor = resolveEffectivePriorityRuleConfig({ profileId }).hasFactors;

    const buildLayer = (): PlacementPriorityLayer => {
        const id = profileId.trim() || DEFAULT_LAYER.profile_id!;
        const preset = getPlacementProfileFromRegistry(id);
        const revision = preset?.revision ?? CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.revision;
        const roDef = defaultPriorityRuleOrderForProfileId(id);
        return {
            version: 1,
            enabled,
            ...(engineVersion === "v2" ? { engine_version: "v2" as const } : {}),
            profile_id: id,
            profile_revision: revision,
            queue_keys_enabled: waitlistedLaneOnly ? ["waitlisted"] : ["waitlisted", "ready_to_enroll"],
            shadow_mode: shadowMode,
            evaluation_cap: Math.min(PLACEMENT_EVALUATION_CAP_MAX, Math.max(1, Math.floor(evaluationCap))),
            display: {
                show_bucket_chip: showBucketChip,
                show_sort_hint: showSortHint,
            },
            ...(roDef && preset
                ? {
                      priority_rule_order: expandOperatorPriorityRuleOrderForProfile(preset, ruleOrder),
                      priority_rule_enabled_keys: sortPriorityRuleEnabledKeysForSave(
                          ruleEnabledKeys,
                          expandOperatorPriorityRuleOrderForProfile(preset, ruleOrder)
                      ),
                  }
                : {}),
        };
    };

    const layerPreviewJson = useMemo(() => JSON.stringify(buildLayer(), null, 2), [
        enabled,
        profileId,
        waitlistedLaneOnly,
        shadowMode,
        engineVersion,
        evaluationCap,
        showBucketChip,
        showSortHint,
        ruleOrder,
        ruleEnabledKeys,
    ]);

    const onSave = async () => {
        if (!canSave || !selectedId) return;
        setSaving(true);
        setSaveErr(null);
        setSaveOk(null);
        try {
            const layer = buildLayer();
            const res = await fetch(`/api/admin/work-units/${encodeURIComponent(selectedId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: { placement_priority_v1: layer } }),
            });
            const j = (await res.json()) as { error?: string; issues?: { path: string; message: string }[] };
            if (!res.ok) {
                const detail = j.issues?.length ? ` — ${j.issues.map((i) => i.message).join("; ")}` : "";
                throw new Error((j.error || res.statusText) + detail);
            }
            setSaveOk("Saved.");
            await loadList();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full min-w-0 space-y-5" data-testid="waitlist-ranking-policy-settings">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Waitlist Ranking Policy</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Choose which families receive priority on the waitlist and the order those rules are applied.
                </p>
            </header>

            {loadErr ? <p className="text-sm text-red-700">{loadErr}</p> : null}

            {eligibleItems.length === 0 ? (
                <p className="text-sm text-alloy-midnight/55" data-testid="waitlist-policy-no-eligible-work-units">
                    No waitlist-enabled work units found.
                </p>
            ) : !selected ? (
                <p className="text-sm text-alloy-midnight/55">No waitlist-enabled work units found.</p>
            ) : (
                <fieldset disabled={!canSave} className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-alloy-midnight/70" htmlFor="wu-policy-applies-to">
                            Policy applies to
                        </label>
                        <select
                            id="wu-policy-applies-to"
                            className="w-full max-w-md rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            data-testid="waitlist-policy-work-unit-select"
                        >
                            {eligibleItems.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div
                        className="rounded-md border border-alloy-forge/10 bg-alloy-forge/[0.04] px-3 py-2.5 text-sm leading-snug text-alloy-midnight/80"
                        data-testid="waitlist-policy-active-status"
                    >
                        <p className="font-medium text-alloy-midnight">{activePolicy.appliesToLine}</p>
                        <p className="mt-1 text-[11px] text-alloy-midnight/65">{activePolicy.statusLine}</p>
                        <p className="mt-1 text-[11px] text-alloy-midnight/60">
                            Ranking mode: {activePolicy.rankingModeLine}
                        </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm font-medium text-alloy-midnight">
                        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                        Enable waitlist ranking policy for this work unit
                    </label>

                    <SettingsSection
                        title="Priority Factors"
                        description="When a child matches more than one factor, the highest factor in this list wins."
                        testId="waitlist-policy-section-factors"
                    >
                        {hasRuleEditor ? (
                            <PriorityRuleOrderEditor
                                order={ruleOrder}
                                enabledKeys={ruleEnabledKeys}
                                fallbackBucketKey={fallbackBucketKey}
                                disabled={!canSave}
                                onOrderChange={setRuleOrder}
                                onEnabledKeysChange={setRuleEnabledKeys}
                            />
                        ) : (
                            <p className="text-[11px] text-alloy-midnight/55">
                                Priority factors are not available for the selected profile. Change the profile in
                                Advanced Technical Details.
                            </p>
                        )}
                    </SettingsSection>

                    <SettingsSection title="Ranking Mode" testId="waitlist-policy-section-ranking-mode">
                        <fieldset className="space-y-3">
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="radio"
                                    name="ranking-mode"
                                    className="mt-0.5"
                                    checked={shadowMode}
                                    onChange={() => setShadowMode(true)}
                                />
                                <span>
                                    <span className="font-medium">Preview ranking only</span>
                                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-alloy-midnight/55">
                                        Calculate priority and show preview positions, but keep the current list order.
                                    </span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="radio"
                                    name="ranking-mode"
                                    className="mt-0.5"
                                    checked={!shadowMode}
                                    onChange={() => setShadowMode(false)}
                                />
                                <span>
                                    <span className="font-medium">Order waitlist by ranking policy</span>
                                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-alloy-midnight/55">
                                        Use this ranking policy to order the waitlist.
                                    </span>
                                </span>
                            </label>
                        </fieldset>
                        {!shadowMode ? (
                            <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-snug text-amber-950/90">
                                Use this only after reviewing the preview order with your team.
                            </p>
                        ) : null}
                    </SettingsSection>

                    <SettingsSection
                        title="Tie Breakers"
                        description="When two children match the same priority factor, Alloy uses these tie breakers."
                        testId="waitlist-policy-section-tie-breakers"
                    >
                        <ol className="m-0 list-decimal space-y-1 pl-5 text-sm text-alloy-midnight">
                            {WAITLIST_RANKING_TIE_BREAKERS_V1.map((tb) => (
                                <li key={tb.order}>{tb.label}</li>
                            ))}
                        </ol>
                        <p className="text-[11px] leading-snug text-alloy-midnight/50">
                            Configurable tie breakers are planned for a future phase.
                        </p>
                    </SettingsSection>

                    <SettingsSection title="Apply this policy to" testId="waitlist-policy-section-applies-to">
                        <fieldset className="space-y-2">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="radio"
                                    name="applies-to"
                                    checked={waitlistedLaneOnly}
                                    onChange={() => setWaitlistedLaneOnly(true)}
                                />
                                Waitlisted only
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="radio"
                                    name="applies-to"
                                    checked={!waitlistedLaneOnly}
                                    onChange={() => setWaitlistedLaneOnly(false)}
                                />
                                Waitlisted + Ready to enroll
                            </label>
                        </fieldset>
                    </SettingsSection>

                    <SettingsSection title="Display" testId="waitlist-policy-section-display">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="checkbox"
                                    checked={showBucketChip}
                                    onChange={(e) => setShowBucketChip(e.target.checked)}
                                />
                                Show priority badge on waitlist rows
                            </label>
                            <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="checkbox"
                                    checked={showSortHint}
                                    onChange={(e) => setShowSortHint(e.target.checked)}
                                />
                                Show explanation above waitlist
                            </label>
                            <p className="text-[11px] leading-snug text-alloy-midnight/50">
                                Position labels are shown automatically when ranking is enabled.
                            </p>
                        </div>
                    </SettingsSection>

                    <SettingsSection title="Policy Summary" testId="waitlist-policy-section-summary">
                        <div className="rounded-md border border-alloy-forge/10 bg-alloy-forge/[0.03] px-3 py-2.5 text-sm leading-snug text-alloy-midnight/80">
                            <p data-testid="policy-summary-priority-chain">{policySummary.priorityChain}</p>
                            <p className="mt-2 text-[11px] text-alloy-midnight/60" data-testid="policy-summary-ranking-mode">
                                Ranking mode: {policySummary.rankingMode}
                            </p>
                            {policySummary.disabledFactorLabels.length > 0 ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/55">
                                    Disabled factors: {policySummary.disabledFactorLabels.join(", ")}
                                </p>
                            ) : null}
                        </div>
                    </SettingsSection>

                    <details
                        className="rounded-lg border border-alloy-forge/12 bg-white/40 p-4 shadow-sm"
                        data-testid="waitlist-policy-section-advanced"
                    >
                        <summary className="cursor-pointer text-sm font-semibold text-alloy-midnight">
                            Advanced Technical Details
                        </summary>
                        <div className="mt-4 space-y-4 text-sm text-alloy-midnight">
                            <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Work unit key</dt>
                                    <dd className="font-mono text-alloy-midnight/75">{selected.key}</dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Engine version</dt>
                                    <dd>
                                        <select
                                            className="mt-0.5 w-full max-w-xs rounded border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                                            value={engineVersion}
                                            onChange={(e) => setEngineVersion(e.target.value === "v2" ? "v2" : "v1")}
                                        >
                                            <option value="v1">v1 — opportunity rows</option>
                                            <option value="v2">v2 — placement candidate rows</option>
                                        </select>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Profile ID</dt>
                                    <dd>
                                        <select
                                            className="mt-0.5 w-full max-w-xs rounded border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                                            value={profileId}
                                            onChange={(e) => {
                                                const id = e.target.value;
                                                setProfileId(id);
                                                const effective = resolveEffectivePriorityRuleConfig({ profileId: id });
                                                setRuleOrder(effective.ruleOrder);
                                                setRuleEnabledKeys(new Set(effective.ruleEnabledKeys));
                                            }}
                                        >
                                            {presetIds.map((id) => (
                                                <option key={id} value={id}>
                                                    {id}
                                                </option>
                                            ))}
                                        </select>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Profile revision</dt>
                                    <dd className="font-mono text-alloy-midnight/75">{profileRevision || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Rows evaluated per load</dt>
                                    <dd>
                                        <input
                                            type="number"
                                            min={1}
                                            max={PLACEMENT_EVALUATION_CAP_MAX}
                                            className="mt-0.5 w-32 rounded border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                                            value={evaluationCap}
                                            onChange={(e) => setEvaluationCap(Number(e.target.value))}
                                        />
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-alloy-midnight/60">Shadow mode (backend)</dt>
                                    <dd className="font-mono text-alloy-midnight/75">{String(shadowMode)}</dd>
                                </div>
                            </dl>

                            <div>
                                <p className="text-xs font-semibold text-alloy-midnight/70">Backend bucket keys</p>
                                <ul className="mt-1 space-y-1 text-[11px] text-alloy-midnight/60">
                                    {WAITLIST_RANKING_POLICY_FACTORS.map((f) => (
                                        <li key={f.bucketKey}>
                                            <span className="font-medium text-alloy-midnight/75">{f.label}</span>
                                            <span className="ml-2 font-mono text-[10px] text-alloy-midnight/45">
                                                {f.bucketKey}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-alloy-midnight/70">
                                    Technical metadata preview (save payload)
                                </p>
                                <pre className="mt-1 max-h-64 overflow-auto rounded border border-alloy-forge/10 bg-alloy-forge/[0.04] p-2 text-[10px] leading-snug text-alloy-midnight/70">
                                    {layerPreviewJson}
                                </pre>
                                <p className="mt-1 text-[10px] text-alloy-midnight/45">
                                    Stored as{" "}
                                    <code className="rounded bg-alloy-forge/8 px-1">work_units.metadata.placement_priority_v1</code>
                                </p>
                            </div>
                        </div>
                    </details>

                    {!canSave ? (
                        <p className="text-xs text-alloy-midnight/55">Admin role required to save.</p>
                    ) : (
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void onSave()}
                            data-testid="waitlist-policy-save"
                        >
                            {saving ? "Saving…" : "Save policy"}
                        </button>
                    )}

                    {saveErr ? <p className="text-sm text-red-700">{saveErr}</p> : null}
                    {saveOk ? <p className="text-sm text-alloy-pine">{saveOk}</p> : null}
                </fieldset>
            )}
        </div>
    );
}
