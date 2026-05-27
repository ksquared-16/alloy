"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
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
    sortPriorityRuleEnabledKeysForSave,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string;
    name: string;
    metadata?: unknown;
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
    const [evaluationCap, setEvaluationCap] = useState(200);
    const [showBucketChip, setShowBucketChip] = useState(true);
    const [showSortHint, setShowSortHint] = useState(true);
    const [ruleOrder, setRuleOrder] = useState<string[]>(() => [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]);
    const [ruleEnabledKeys, setRuleEnabledKeys] = useState<Set<string>>(
        () => new Set(CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1)
    );

    const presetIds = useMemo(() => listRegisteredPlacementProfileIds(), []);

    const loadList = useCallback(async () => {
        setLoadErr(null);
        try {
            const res = await fetch("/api/admin/work-units", { cache: "no-store" });
            const j = (await res.json()) as { items?: WorkUnitRow[]; error?: string };
            if (!res.ok) throw new Error(j.error || res.statusText);
            const rows = j.items ?? [];
            setItems(rows);
            setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
        } catch (e) {
            setLoadErr(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const selected = items.find((x) => x.id === selectedId);

    useEffect(() => {
        if (!selected) return;
        const L = layerFromWorkUnitMetadata(selected.metadata);
        setEnabled(!!L.enabled);
        setProfileId(L.profile_id ?? DEFAULT_LAYER.profile_id!);
        const qk = L.queue_keys_enabled;
        setWaitlistedLaneOnly(
            Array.isArray(qk) && qk.length === 1 && qk[0] === "waitlisted"
        );
        setShadowMode(L.shadow_mode ?? false);
        setEvaluationCap(typeof L.evaluation_cap === "number" ? L.evaluation_cap : 200);
        setShowBucketChip(L.display?.show_bucket_chip !== false);
        setShowSortHint(L.display?.show_sort_hint !== false);
        const pid = L.profile_id ?? DEFAULT_LAYER.profile_id!;
        const defRo = defaultPriorityRuleOrderForProfileId(pid) ?? [];
        const fromMeta = L.priority_rule_order;
        setRuleOrder(
            Array.isArray(fromMeta) && fromMeta.length > 0 ? [...fromMeta] : defRo.length ? [...defRo] : []
        );
        const fb = getPlacementProfileFromRegistry(pid)?.fallback_bucket_key ?? CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;
        const fromEn = L.priority_rule_enabled_keys;
        if (Array.isArray(fromEn) && fromEn.length > 0 && defRo.length) {
            const next = new Set<string>();
            for (const k of fromEn) {
                if (typeof k === "string" && k.trim()) next.add(k.trim());
            }
            next.add(fb);
            setRuleEnabledKeys(new Set(defRo.filter((k) => next.has(k))));
        } else {
            setRuleEnabledKeys(new Set(defRo));
        }
    }, [selected]);

    const buildLayer = (): PlacementPriorityLayer => {
        const id = profileId.trim() || DEFAULT_LAYER.profile_id!;
        const preset = getPlacementProfileFromRegistry(id);
        const revision = preset?.revision ?? CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.revision;
        const roDef = defaultPriorityRuleOrderForProfileId(id);
        return {
            version: 1,
            enabled,
            profile_id: id,
            profile_revision: revision,
            queue_keys_enabled: waitlistedLaneOnly ? ["waitlisted"] : ["waitlisted", "ready_to_enroll"],
            shadow_mode: shadowMode,
            evaluation_cap: Math.min(PLACEMENT_EVALUATION_CAP_MAX, Math.max(1, Math.floor(evaluationCap))),
            display: {
                show_bucket_chip: showBucketChip,
                show_sort_hint: showSortHint,
            },
            ...(roDef
                ? {
                      priority_rule_order: ruleOrder,
                      priority_rule_enabled_keys: sortPriorityRuleEnabledKeysForSave(ruleEnabledKeys, ruleOrder),
                  }
                : {}),
        };
    };

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
        <div className="w-full min-w-0 space-y-5">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Waitlist priority</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    These settings control <strong>this work unit&apos;s</strong> waitlist behavior in Admin V2 (which lanes
                    show priority, how rows are ordered on each load, and what appears on each row).
                </p>
                <p className="mt-2 max-w-2xl text-xs leading-snug text-alloy-midnight/55">
                    Positions are grouped by program or room and calculated for <strong>loaded records</strong> — not the
                    entire org waitlist across every page.
                </p>
                <p className="mt-1 max-w-[40rem] text-[10px] leading-snug text-alloy-midnight/45">
                    Stored on the work unit as <code className="rounded bg-alloy-forge/8 px-1">placement_priority_v1</code>{" "}
                    metadata (merged with existing work-unit metadata when you save).
                </p>
            </header>

            {loadErr ? <p className="text-sm text-red-700">{loadErr}</p> : null}

            <div className="space-y-2">
                <label className="block text-xs font-semibold text-alloy-midnight/70" htmlFor="wu-placement-select">
                    Work unit
                </label>
                <select
                    id="wu-placement-select"
                    className="w-full max-w-md rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                >
                    {items.map((w) => (
                        <option key={w.id} value={w.id}>
                            {w.name} ({w.key})
                        </option>
                    ))}
                </select>
            </div>

            {!selected ? (
                <p className="text-sm text-alloy-midnight/55">No work units found.</p>
            ) : (
                <fieldset
                    disabled={!canSave}
                    className="space-y-4 rounded-lg border border-alloy-forge/12 bg-white/60 p-4 shadow-sm"
                >
                    <legend className="sr-only">Placement priority</legend>

                    <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                        Enable waitlist priority for this work unit
                    </label>

                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-alloy-midnight/70">Priority rule preset</span>
                        <select
                            className="w-full max-w-md rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                            value={profileId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setProfileId(id);
                                const d = defaultPriorityRuleOrderForProfileId(id);
                                setRuleOrder(d ? [...d] : []);
                                setRuleEnabledKeys(new Set(d ?? []));
                            }}
                        >
                            {presetIds.map((id) => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                        <input
                            type="checkbox"
                            checked={waitlistedLaneOnly}
                            onChange={(e) => setWaitlistedLaneOnly(e.target.checked)}
                        />
                        Waitlisted lane only (otherwise includes ready-to-enroll cohort)
                    </label>

                    <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                        <input type="checkbox" checked={shadowMode} onChange={(e) => setShadowMode(e.target.checked)} />
                        <span>
                            <span className="font-medium">Preview mode</span>
                            <span className="text-alloy-midnight/70"> — show the priority rule, keep the usual list order, hide #1 / #2 numbers</span>
                        </span>
                    </label>
                    {!shadowMode ? (
                        <p className="ml-6 text-[11px] leading-snug text-alloy-midnight/55">
                            When off: sort the <strong>loaded</strong> list by waitlist priority and show position numbers within each program group.
                        </p>
                    ) : (
                        <p className="ml-6 text-[11px] leading-snug text-alloy-midnight/55">
                            When on: operators still see who has which rule, without changing row order or showing positions.
                        </p>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-alloy-midnight/70" htmlFor="eval-cap">
                            Rows to evaluate per queue load
                        </label>
                        <input
                            id="eval-cap"
                            type="number"
                            min={1}
                            max={PLACEMENT_EVALUATION_CAP_MAX}
                            className="w-32 rounded border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                            value={evaluationCap}
                            onChange={(e) => setEvaluationCap(Number(e.target.value))}
                        />
                    </div>

                    {defaultPriorityRuleOrderForProfileId(profileId) ? (
                        <PriorityRuleOrderEditor
                            order={ruleOrder}
                            enabledKeys={ruleEnabledKeys}
                            fallbackBucketKey={
                                getPlacementProfileFromRegistry(profileId.trim())?.fallback_bucket_key ??
                                CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key
                            }
                            disabled={!canSave}
                            onOrderChange={setRuleOrder}
                            onEnabledKeysChange={setRuleEnabledKeys}
                        />
                    ) : null}

                    <div className="space-y-2">
                        <span className="text-xs font-semibold text-alloy-midnight/70">Display</span>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showBucketChip} onChange={(e) => setShowBucketChip(e.target.checked)} />
                            Show compact waitlist strip on each row
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showSortHint} onChange={(e) => setShowSortHint(e.target.checked)} />
                            Show short note above the list
                        </label>
                    </div>

                    {!canSave ? (
                        <p className="text-xs text-alloy-midnight/55">Admin role required to save.</p>
                    ) : (
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void onSave()}
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    )}

                    {saveErr ? <p className="text-sm text-red-700">{saveErr}</p> : null}
                    {saveOk ? <p className="text-sm text-alloy-pine">{saveOk}</p> : null}
                </fieldset>
            )}
        </div>
    );
}
