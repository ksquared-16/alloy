"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";

type Industry = {
    id: string;
    key: string;
    label: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
};

type DefaultLabel = { entity_type: string; singular: string | null; plural: string | null };

export default function IndustriesDetailClient({ id }: { id: string }) {
    const [industry, setIndustry] = useState<Industry | null>(null);
    const [defaultLabels, setDefaultLabels] = useState<DefaultLabel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createKey, setCreateKey] = useState("");
    const [createLabel, setCreateLabel] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const fetchDetail = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/industries/${id}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((json as { error?: string }).error ?? "Failed to load industry");
                setIndustry(null);
                setDefaultLabels([]);
                return;
            }
            setIndustry((json as { industry?: Industry }).industry ?? null);
            setDefaultLabels((json as { default_entity_labels?: DefaultLabel[] }).default_entity_labels ?? []);
        } catch (e) {
            setError((e as Error).message);
            setIndustry(null);
            setDefaultLabels([]);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    const openCreateModal = () => {
        setCreateKey("");
        setCreateLabel("");
        setCreateDescription("");
        setCreateError(null);
        setCreateOpen(true);
    };

    const submitCreate = async () => {
        setCreateSaving(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/admin/industries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: createKey.trim(),
                    label: createLabel.trim(),
                    description: createDescription.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCreateError((json as { error?: string }).error ?? "Create failed");
                return;
            }
            setCreateOpen(false);
            fetchDetail();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <AdminPageHeader title="Industry" subtitle="Loading…" />
                <p className="text-sm text-[#59678b]">Loading…</p>
            </>
        );
    }

    if (error || !industry) {
        return (
            <>
                <AdminPageHeader title="Industry" subtitle="" />
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error ?? "Industry not found"}
                </div>
                <Link href="/admin/system/verticals-industries" className="mt-4 inline-block text-sm text-alloy-blue hover:underline">
                    ← Back to Verticals & Industries
                </Link>
            </>
        );
    }

    return (
        <>
            <AdminPageHeader
                title={industry.label}
                subtitle={`Industry: ${industry.key}`}
                actions={
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="inline-flex items-center rounded-md border border-[#e6e8ec] bg-white px-3 py-2 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9]"
                    >
                        Create industry
                    </button>
                }
            />
            <div className="mb-6">
                <Link href="/admin/system/verticals-industries" className="text-sm text-alloy-blue hover:underline">
                    ← Back to Verticals & Industries
                </Link>
            </div>

            <SectionCard title="Industry details" className="mb-6">
                <dl className="grid gap-3 text-sm">
                    <div>
                        <dt className="font-medium text-[#59678b]">Key</dt>
                        <dd className="text-[#31394d]">{industry.key}</dd>
                    </div>
                    <div>
                        <dt className="font-medium text-[#59678b]">Label</dt>
                        <dd className="text-[#31394d]">{industry.label}</dd>
                    </div>
                    <div>
                        <dt className="font-medium text-[#59678b]">Description</dt>
                        <dd className="text-[#31394d]">{industry.description ?? "—"}</dd>
                    </div>
                </dl>
            </SectionCard>

            <SectionCard title="Default entity labels">
                {defaultLabels.length === 0 ? (
                    <p className="text-sm text-[#59678b]">No default entity labels for this industry.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Entity type</th>
                                    <th className="pb-2 pr-4 font-semibold">Singular</th>
                                    <th className="pb-2 font-semibold">Plural</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaultLabels.map((row) => (
                                    <tr key={row.entity_type} className="border-b border-[#e6e8ec]">
                                        <td className="py-2 pr-4 text-[#31394d]">{row.entity_type}</td>
                                        <td className="py-2 pr-4 text-[#31394d]">{row.singular ?? "—"}</td>
                                        <td className="py-2 text-[#31394d]">{row.plural ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {createOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !createSaving && setCreateOpen(false)} />
                    <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#e6e8ec] bg-white p-6 shadow-lg">
                        <h3 className="text-lg font-semibold text-[#31394d] mb-4">Create industry</h3>
                        {createError && <p className="mb-3 text-sm text-red-600">{createError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-[#59678b] mb-1">Key</label>
                                <input
                                    type="text"
                                    value={createKey}
                                    onChange={(e) => setCreateKey(e.target.value)}
                                    placeholder="e.g. cleaning"
                                    className="w-full rounded border border-[#e6e8ec] px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#59678b] mb-1">Label</label>
                                <input
                                    type="text"
                                    value={createLabel}
                                    onChange={(e) => setCreateLabel(e.target.value)}
                                    placeholder="e.g. Cleaning"
                                    className="w-full rounded border border-[#e6e8ec] px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#59678b] mb-1">Description</label>
                                <textarea
                                    value={createDescription}
                                    onChange={(e) => setCreateDescription(e.target.value)}
                                    placeholder="Optional description"
                                    rows={2}
                                    className="w-full rounded border border-[#e6e8ec] px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !createSaving && setCreateOpen(false)}
                                className="rounded border border-[#e6e8ec] px-4 py-2 text-sm font-medium text-[#31394d]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitCreate}
                                disabled={createSaving || !createKey.trim() || !createLabel.trim()}
                                className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {createSaving ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
