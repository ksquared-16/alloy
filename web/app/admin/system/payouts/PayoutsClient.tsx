"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { PayoutBasis, PayoutTier, VendorPayoutPolicy } from "@/lib/admin/vendorPayoutPolicy";

const BASIS_OPTIONS: { value: PayoutBasis; label: string }[] = [
    { value: "job_completed_occurrences", label: "Job completed occurrences (all completed schedules for the job)" },
    { value: "vendor_job_completed_occurrences", label: "Vendor job completed (only schedules where assigned vendor = this vendor)" },
];

function defaultPolicy(): VendorPayoutPolicy {
    return {
        mode: "flat",
        type: "percentage",
        value: 80,
        basis: "job_completed_occurrences",
        completed_status_key: "completed",
        tiers: [{ from: 1, to: 3, value: 70 }, { from: 4, to: null, value: 80 }],
    };
}

function parsePolicy(meta: unknown): VendorPayoutPolicy {
    if (meta && typeof meta === "object" && "vendor_payout_policy" in meta) {
        const p = (meta as { vendor_payout_policy?: unknown }).vendor_payout_policy;
        if (p && typeof p === "object" && typeof (p as { mode?: string }).mode === "string") {
            const o = p as Record<string, unknown>;
            return {
                mode: (o.mode as "flat" | "tiered") || "flat",
                type: "percentage",
                value: typeof o.value === "number" ? o.value : 80,
                basis: (o.basis as PayoutBasis) || "job_completed_occurrences",
                completed_status_key: typeof o.completed_status_key === "string" ? o.completed_status_key : "completed",
                tiers: Array.isArray(o.tiers)
                    ? (o.tiers as PayoutTier[]).filter((t) => typeof t.from === "number" && (t.to === null || typeof t.to === "number") && typeof t.value === "number")
                    : [{ from: 1, to: null, value: 80 }],
            };
        }
    }
    return defaultPolicy();
}

export default function PayoutsClient() {
    const { canMutate } = useAdminAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [policy, setPolicy] = useState<VendorPayoutPolicy>(() => defaultPolicy());

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/org-settings");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data.error as string) || "Failed to load");
            setPolicy(parsePolicy(data.metadata));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const updateTier = (index: number, field: keyof PayoutTier, value: number | null) => {
        setPolicy((prev) => {
            const tiers = [...(prev.tiers ?? [])];
            const t = { ...tiers[index], [field]: value };
            tiers[index] = t;
            return { ...prev, tiers };
        });
    };

    const addTier = () => {
        setPolicy((prev) => {
            const tiers = [...(prev.tiers ?? [])];
            const last = tiers[tiers.length - 1];
            const nextFrom = last && typeof last.to === "number" ? last.to + 1 : (last?.from ?? 0) + 1;
            tiers.push({ from: nextFrom, to: null, value: 80 });
            return { ...prev, tiers };
        });
    };

    const removeTier = (index: number) => {
        setPolicy((prev) => {
            const tiers = (prev.tiers ?? []).filter((_, i) => i !== index);
            return { ...prev, tiers: tiers.length ? tiers : [{ from: 1, to: null, value: 80 }] };
        });
    };

    const save = async () => {
        if (!canMutate) return;
        setSaving(true);
        setError(null);
        try {
            const payload: VendorPayoutPolicy = {
                mode: policy.mode,
                type: "percentage",
                value: policy.mode === "flat" ? (typeof policy.value === "number" ? policy.value : 80) : undefined,
                basis: policy.mode === "tiered" ? (policy.basis ?? "job_completed_occurrences") : undefined,
                completed_status_key: policy.completed_status_key ?? "completed",
                tiers: policy.mode === "tiered" ? (policy.tiers ?? []) : undefined,
            };
            const res = await fetch("/api/admin/org-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: { vendor_payout_policy: payload } }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data.error as string) || "Failed to save");
            setPolicy(parsePolicy(data.metadata));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <AdminPageHeader title="Vendor payout policy" />
                <p className="text-alloy-midnight/60">Loading…</p>
            </div>
        );
    }

    return (
        <div className="p-6">
            <AdminPageHeader
                title="Vendor payout policy"
                subtitle="Org default for vendor payouts. Vendors can override in their drawer."
            />
            {error && (
                <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                    {error}
                </div>
            )}
            <SectionCard title="Policy">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Mode</label>
                        <select
                            value={policy.mode}
                            onChange={(e) => setPolicy((p) => ({ ...p, mode: e.target.value as "flat" | "tiered" }))}
                            disabled={!canMutate}
                            className="w-full max-w-xs px-3 py-2 border border-alloy-stone/40 rounded text-sm disabled:opacity-60"
                        >
                            <option value="flat">Flat (single %)</option>
                            <option value="tiered">Tiered (by completed occurrence count)</option>
                        </select>
                    </div>
                    {policy.mode === "flat" && (
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Payout %</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={typeof policy.value === "number" ? policy.value : ""}
                                onChange={(e) => setPolicy((p) => ({ ...p, value: e.target.value === "" ? 80 : Number(e.target.value) }))}
                                disabled={!canMutate}
                                className="w-24 px-3 py-2 border border-alloy-stone/40 rounded text-sm disabled:opacity-60"
                            />
                        </div>
                    )}
                    {policy.mode === "tiered" && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Basis</label>
                                <select
                                    value={policy.basis ?? "job_completed_occurrences"}
                                    onChange={(e) => setPolicy((p) => ({ ...p, basis: e.target.value as PayoutBasis }))}
                                    disabled={!canMutate}
                                    className="w-full max-w-xl px-3 py-2 border border-alloy-stone/40 rounded text-sm disabled:opacity-60"
                                >
                                    {BASIS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Completed status key</label>
                                <input
                                    type="text"
                                    value={policy.completed_status_key ?? "completed"}
                                    onChange={(e) => setPolicy((p) => ({ ...p, completed_status_key: e.target.value || "completed" }))}
                                    disabled={!canMutate}
                                    placeholder="completed"
                                    className="w-40 px-3 py-2 border border-alloy-stone/40 rounded text-sm disabled:opacity-60"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-alloy-midnight/80">Tiers (from / to / value %)</label>
                                    {canMutate && (
                                        <button type="button" onClick={addTier} className="text-sm text-alloy-blue hover:underline">
                                            Add tier
                                        </button>
                                    )}
                                </div>
                                <div className="border border-alloy-stone/30 rounded overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-alloy-stone/20">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-medium">From</th>
                                                <th className="text-left px-3 py-2 font-medium">To (null = no cap)</th>
                                                <th className="text-left px-3 py-2 font-medium">Value %</th>
                                                {canMutate && <th className="w-20" />}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(policy.tiers ?? []).map((tier, i) => (
                                                <tr key={i} className="border-t border-alloy-stone/20">
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={tier.from}
                                                            onChange={(e) => updateTier(i, "from", Number(e.target.value) || 0)}
                                                            disabled={!canMutate}
                                                            className="w-20 px-2 py-1 border rounded text-sm disabled:opacity-60"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            placeholder="∞"
                                                            value={tier.to ?? ""}
                                                            onChange={(e) => updateTier(i, "to", e.target.value === "" ? null : Number(e.target.value))}
                                                            disabled={!canMutate}
                                                            className="w-20 px-2 py-1 border rounded text-sm disabled:opacity-60"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={100}
                                                            step={0.5}
                                                            value={tier.value}
                                                            onChange={(e) => updateTier(i, "value", Number(e.target.value) || 0)}
                                                            disabled={!canMutate}
                                                            className="w-20 px-2 py-1 border rounded text-sm disabled:opacity-60"
                                                        />
                                                    </td>
                                                    {canMutate && (
                                                        <td className="px-3 py-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeTier(i)}
                                                                className="text-red-600 hover:underline text-xs"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-alloy-midnight/60 mt-1">Ranges should be contiguous (e.g. 1–3, 4–∞).</p>
                            </div>
                        </>
                    )}
                    {canMutate && (
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className="px-4 py-2 bg-alloy-blue text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
