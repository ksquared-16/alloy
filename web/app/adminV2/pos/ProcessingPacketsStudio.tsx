"use client";

import { Layers, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ProcessingPacketBuilder from "./ProcessingPacketBuilder";

type PacketDef = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    is_active: boolean;
    updated_at: string | null;
};

function formatEdited(iso: string | null): string {
    if (!iso) return "Recently";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Recently";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CardSkeleton() {
    return (
        <div className="overflow-hidden rounded-[14px] border border-alloy-stone/15 bg-white shadow-sm" aria-hidden>
            <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-alloy-stone/15" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-alloy-stone/10" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-alloy-stone/10" />
            </div>
        </div>
    );
}

/**
 * Studio "Packets" tab. When no packet is selected, lists packet definitions
 * (GET /api/admin/forms/packet-definitions) in a Studio-consistent surface with search
 * and a "New packet" action (POST /api/admin/forms/packet-definitions). Selecting a
 * packet opens the Studio-hosted ProcessingPacketBuilder.
 */
export default function ProcessingPacketsStudio() {
    const [selectedPacketDefId, setSelectedPacketDefId] = useState<string | null>(null);
    const [rows, setRows] = useState<PacketDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions", { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load packets");
            setRows((json as { data?: PacketDef[] }).data ?? []);
            setLoaded(true);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!loaded) void load();
    }, [loaded, load]);

    const createPacket = useCallback(async () => {
        if (creating) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Untitled packet", description: null }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            const id = (json as { data?: { id: string } }).data?.id;
            if (id) {
                setLoaded(false);
                setSelectedPacketDefId(id);
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCreating(false);
        }
    }, [creating]);

    const handleBack = useCallback(() => {
        setSelectedPacketDefId(null);
        setLoaded(false);
    }, []);

    if (selectedPacketDefId) {
        return <ProcessingPacketBuilder packetDefId={selectedPacketDefId} onBack={handleBack} />;
    }

    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => (r.name || r.key || "").toLowerCase().includes(q)) : rows;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="processing-packets-studio">
            <div className="shrink-0 border-b border-alloy-stone/12 bg-white px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search packets…"
                        className="max-w-md min-w-[200px] flex-1 rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-[13px] shadow-sm focus:border-alloy-bend-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/15"
                        data-testid="packets-studio-search"
                    />
                    <button
                        type="button"
                        onClick={() => void createPacket()}
                        disabled={creating}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-60"
                        data-testid="packets-studio-new-packet"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden /> New packet
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {error ? (
                    <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-6 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">Couldn&apos;t load packets</p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/50">{error}</p>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="mt-4 rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/70"
                        >
                            Retry
                        </button>
                    </div>
                ) : loading && !loaded ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-busy="true" aria-label="Loading packets">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <CardSkeleton key={i} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-alloy-stone/25 bg-white p-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/70">
                            {rows.length === 0 ? "No packets yet" : "No packets match your search"}
                        </p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/45">
                            A packet is an ordered, multi-step intake workflow composed of forms.
                        </p>
                        <button
                            type="button"
                            onClick={() => void createPacket()}
                            disabled={creating}
                            className="mt-4 rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                        >
                            + New packet
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                        {filtered.map((packet) => (
                            <PacketCard key={packet.id} packet={packet} onSelect={() => setSelectedPacketDefId(packet.id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function PacketCard({ packet, onSelect }: { packet: PacketDef; onSelect: () => void }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="group relative overflow-hidden rounded-xl border border-alloy-stone/15 bg-white p-4 text-left shadow-[0_2px_12px_rgba(15,23,42,0.05)] transition-all duration-150 hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
            data-testid={`packet-card-${packet.id}`}
        >
            <span
                className={`absolute inset-y-0 left-0 w-1 ${packet.is_active ? "bg-alloy-bend-pine" : "bg-alloy-stone/25"}`}
                aria-hidden
            />
            <div className="flex items-start gap-3 pl-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.06] text-alloy-bend-pine">
                    <Layers className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-[14px] font-semibold leading-snug text-alloy-midnight">{packet.name || packet.key}</h4>
                    {packet.description ? (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/45">{packet.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                packet.is_active ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "bg-alloy-stone/12 text-alloy-midnight/50"
                            }`}
                        >
                            {packet.is_active ? "Active" : "Inactive"}
                        </span>
                    </div>
                    <div className="mt-3 text-[10px] text-alloy-midnight/40">Updated {formatEdited(packet.updated_at)}</div>
                </div>
            </div>
        </button>
    );
}
