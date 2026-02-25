"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

type LabelRow = { entity_type: string; singular: string | null; plural: string | null };

type ApiResponse = {
    org_industry_id: string | null;
    industry: { key: string; label: string } | null;
    defaults: LabelRow[];
    overrides: LabelRow[];
    effective: LabelRow[];
};

type IndustryOption = { id: string; key: string; label: string };

export default function EntityLabelsClient() {
    const { canMutate } = useAdminAuth();
    const { refreshEntityLabels } = useEntityLabels();
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [edits, setEdits] = useState<Record<string, { singular: string; plural: string }>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [resetLoadingKey, setResetLoadingKey] = useState<string | null>(null);
    const [industries, setIndustries] = useState<IndustryOption[]>([]);
    const [industryChanging, setIndustryChanging] = useState(false);

    const fetchIndustries = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/industries");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setIndustries((json as { industries?: IndustryOption[] }).industries ?? []);
        } catch {
            setIndustries([]);
        }
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/entity-labels");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load entity labels");
            setData(json as ApiResponse);
            setEdits({});
            setSaveError(null);
        } catch (e) {
            setError((e as Error).message);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchIndustries();
    }, [fetchIndustries]);

    const genericIndustry = industries.find((i) => i.key === "generic");
    const dropdownValue = data?.org_industry_id ?? genericIndustry?.id ?? "";

    const handleIndustryChange = async (industryId: string) => {
        if (!canMutate) return;
        const value = industryId === "" ? null : industryId;
        setIndustryChanging(true);
        setSaveError(null);
        try {
            const res = await fetch("/api/admin/org/industry", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ industry_id: value }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            await fetchData();
            await refreshEntityLabels();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setIndustryChanging(false);
        }
    };

    const getOverrideFor = (entityType: string): { singular: string; plural: string } => {
        if (edits[entityType] !== undefined) return edits[entityType];
        const ov = data?.overrides.find((o) => o.entity_type === entityType);
        return {
            singular: ov?.singular ?? "",
            plural: ov?.plural ?? "",
        };
    };

    const setOverrideFor = (entityType: string, field: "singular" | "plural", value: string) => {
        if (!canMutate) return;
        setEdits((prev) => ({
            ...prev,
            [entityType]: {
                ...getOverrideFor(entityType),
                [field]: value,
            },
        }));
    };

    const handleSave = async (entityType: string) => {
        if (!canMutate) return;
        const { singular, plural } = getOverrideFor(entityType);
        setSavingKey(entityType);
        setSaveError(null);
        try {
            const res = await fetch("/api/admin/entity-labels", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entity_type: entityType, singular, plural }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            await fetchData();
            await refreshEntityLabels();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSavingKey(null);
        }
    };

    const handleReset = async (entityType: string) => {
        if (!canMutate) return;
        setResetLoadingKey(entityType);
        setSaveError(null);
        try {
            const res = await fetch(`/api/admin/entity-labels?entity_type=${encodeURIComponent(entityType)}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Reset failed");
            setEdits((prev) => {
                const next = { ...prev };
                delete next[entityType];
                return next;
            });
            await fetchData();
            await refreshEntityLabels();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setResetLoadingKey(null);
        }
    };

    if (loading) {
        return (
            <>
                <AdminPageHeader title="Entity Labels" subtitle="Rename entity types (e.g. Opportunities, Jobs) for your vertical or branding." />
                <p className="text-sm text-[#59678b]">Loading…</p>
            </>
        );
    }

    if (error || !data) {
        return (
            <>
                <AdminPageHeader title="Entity Labels" subtitle="Rename entity types (e.g. Opportunities, Jobs) for your vertical or branding." />
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error ?? "Failed to load"}</div>
            </>
        );
    }

    const effectiveByType = new Map(data.effective.map((e) => [e.entity_type, e]));

    return (
        <>
            <AdminPageHeader title="Entity Labels" subtitle="Rename entity types (e.g. Opportunities, Jobs) for your vertical or branding." />
            {!canMutate && (
                <p className="mb-4 text-sm text-[#59678b]">You can view entity labels. Only admins can edit.</p>
            )}
            <div className="mb-6 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="entity-labels-industry" className="text-sm font-medium text-[#31394d]">
                        Industry
                    </label>
                    <select
                        id="entity-labels-industry"
                        value={dropdownValue}
                        onChange={(e) => handleIndustryChange(e.target.value)}
                        disabled={!canMutate || industryChanging}
                        className="rounded-md border border-[#e6e8ec] bg-white px-3 py-2 text-sm text-[#31394d] disabled:bg-[#e6e8ec]/50 disabled:opacity-70 min-w-[200px]"
                    >
                        {industries.length === 0 ? (
                            <option value="">Loading…</option>
                        ) : (
                            <>
                                {!dropdownValue && <option value="">— Select industry —</option>}
                                {industries.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.label} ({i.key})
                                    </option>
                                ))}
                            </>
                        )}
                    </select>
                    {industryChanging && <span className="text-sm text-[#59678b]">Updating…</span>}
                </div>
                <Link
                    href="/admin/system/verticals-industries"
                    className="text-sm text-alloy-blue hover:underline"
                >
                    Manage industries & verticals →
                </Link>
            </div>
            {saveError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{saveError}</div>
            )}
            <SectionCard title="Labels by entity type">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                <th className="pb-2 pr-4 font-semibold">Entity Type</th>
                                <th className="pb-2 pr-4 font-semibold">Default Singular</th>
                                <th className="pb-2 pr-4 font-semibold">Default Plural</th>
                                <th className="pb-2 pr-4 font-semibold">Override Singular</th>
                                <th className="pb-2 pr-4 font-semibold">Override Plural</th>
                                <th className="pb-2 pr-4 font-semibold">Effective Singular</th>
                                <th className="pb-2 pr-4 font-semibold">Effective Plural</th>
                                {canMutate && <th className="pb-2 font-semibold">Action</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {data.defaults.length === 0 ? (
                                <tr>
                                    <td colSpan={canMutate ? 8 : 7} className="py-4 text-[#59678b]">
                                        No industry defaults configured. Set an industry for your org in Verticals / Industries.
                                    </td>
                                </tr>
                            ) : (
                                data.defaults.map((d) => {
                                    const eff = effectiveByType.get(d.entity_type) ?? d;
                                    const { singular: ovSingular, plural: ovPlural } = getOverrideFor(d.entity_type);
                                    const hasOverride = data.overrides.some((o) => o.entity_type === d.entity_type);
                                    return (
                                        <tr key={d.entity_type} className="border-b border-[#e6e8ec] align-top">
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{d.entity_type}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{d.singular ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{d.plural ?? "—"}</td>
                                            <td className="py-2 pr-4">
                                                <input
                                                    type="text"
                                                    value={ovSingular}
                                                    onChange={(e) => setOverrideFor(d.entity_type, "singular", e.target.value)}
                                                    disabled={!canMutate}
                                                    placeholder="Override singular"
                                                    className="w-full min-w-[100px] rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#e6e8ec]/50 disabled:opacity-70"
                                                />
                                            </td>
                                            <td className="py-2 pr-4">
                                                <input
                                                    type="text"
                                                    value={ovPlural}
                                                    onChange={(e) => setOverrideFor(d.entity_type, "plural", e.target.value)}
                                                    disabled={!canMutate}
                                                    placeholder="Override plural"
                                                    className="w-full min-w-[100px] rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#e6e8ec]/50 disabled:opacity-70"
                                                />
                                            </td>
                                            <td className="py-2 pr-4 text-[#31394d]">{eff.singular ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#31394d]">{eff.plural ?? "—"}</td>
                                            {canMutate && (
                                                <td className="py-2 flex flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSave(d.entity_type)}
                                                        disabled={savingKey === d.entity_type}
                                                        className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium text-[#31394d] hover:bg-alloy-stone/20 disabled:opacity-50"
                                                    >
                                                        {savingKey === d.entity_type ? "Saving…" : "Save"}
                                                    </button>
                                                    {hasOverride && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReset(d.entity_type)}
                                                            disabled={resetLoadingKey === d.entity_type}
                                                            className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                                        >
                                                            {resetLoadingKey === d.entity_type ? "Resetting…" : "Reset to default"}
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </>
    );
}
