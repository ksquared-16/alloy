"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import SectionCard from "@/components/admin/SectionCard";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";

type PacketDef = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    is_active: boolean;
    updated_at: string | null;
};

export default function PacketDefinitionsHubClient() {
    const [rows, setRows] = useState<PacketDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load packets");
            setRows((json as { data?: PacketDef[] }).data ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const createPacket = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            const id = (json as { data?: { id: string } }).data?.id;
            setName("");
            setDescription("");
            await load();
            if (id) {
                window.location.href = `${ADMIN_FORMS_UI_BASE}/packet-definitions/${id}`;
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 text-[#31394d]">
            <div>
                <h1 className="text-xl font-semibold text-[#0f172a]">Packet definitions</h1>
                <p className="mt-2 text-sm leading-relaxed text-[#59678b]">
                    Build linear multi-form packets, then mint a{" "}
                    <strong className="font-medium text-[#31394d]">packet public link</strong> from a definition&apos;s detail page.
                </p>
                <p className="mt-2 text-sm">
                    <Link href={`${ADMIN_FORMS_UI_BASE}/packets`} className="font-medium text-[#00458C] hover:underline">
                        Packet sessions (review)
                    </Link>
                    {" · "}
                    <Link href={ADMIN_FORMS_UI_BASE} className="font-medium text-[#00458C] hover:underline">
                        Forms list
                    </Link>
                </p>
            </div>

            <SectionCard title="Create packet">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="text-xs font-semibold uppercase text-[#59678b]">Packet name</span>
                        <input
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. New family onboarding"
                        />
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="text-xs font-semibold uppercase text-[#59678b]">Description (optional)</span>
                        <input
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </label>
                </div>
                <div className="mt-3">
                    <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={creating} onClick={() => void createPacket()}>
                        {creating ? "Creating…" : "Create packet"}
                    </PrimaryButton>
                    <p className="mt-2 text-xs text-[#59678b]">A stable internal key is generated from the packet name.</p>
                </div>
                {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            </SectionCard>

            <SectionCard title="Your packets">
                {loading ? <p className="text-sm text-[#59678b]">Loading…</p> : null}
                {!loading && rows.length === 0 ? (
                    <p className="text-sm text-[#59678b]">No packet definitions yet.</p>
                ) : null}
                {!loading && rows.length > 0 ? (
                    <ul className="divide-y divide-[#e6e8ec] rounded-lg border border-[#e6e8ec] bg-white">
                        {rows.map((r) => (
                            <li key={r.id}>
                                <Link
                                    href={`${ADMIN_FORMS_UI_BASE}/packet-definitions/${r.id}`}
                                    className="flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-[#fafbfd]"
                                >
                                    <span className="font-medium text-[#0f172a]">{r.name}</span>
                                    <span className="text-xs text-[#59678b]">{r.is_active ? "active" : "inactive"}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </SectionCard>
        </div>
    );
}
