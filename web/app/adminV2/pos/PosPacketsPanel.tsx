"use client";

/**
 * POS → Packets — real read model (Sprint 1B, Packet Visibility).
 *
 * Lists packets created by the POS template→packet flow (GET /api/admin/pos/packets):
 * packet name, source template, created date, share-link status, and packet status.
 * "Create share link" mints a fresh public link (POST /api/admin/forms/packet-links) and
 * reveals a copyable/openable parent URL — the plaintext token is only available at mint
 * time (links are stored hashed), so previously-created links show status only.
 *
 * Visibility only: no submission review, PDF generation, duplicate detection, or new
 * packet tables.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import type { PosPacketSummary, PosPacketStatus } from "@/lib/pos/packet/posPacketReadModel";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";

const STATUS_STYLE: Record<PosPacketStatus, { label: string; cls: string }> = {
    ready: { label: "Ready", cls: "bg-stone-100 text-stone-600" },
    shared: { label: "Shared", cls: "bg-sky-50 text-sky-700" },
    in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
    submitted: { label: "Submitted", cls: "bg-emerald-50 text-emerald-700" },
    approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700" },
    needs_changes: { label: "Needs changes", cls: "bg-orange-50 text-orange-700" },
    cancelled: { label: "Cancelled", cls: "bg-stone-100 text-stone-500" },
    archived: { label: "Archived", cls: "bg-stone-100 text-stone-400" },
};

function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface MintedLink {
    url: string;
}

export default function PosPacketsPanel() {
    const [packets, setPackets] = useState<PosPacketSummary[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [minting, setMinting] = useState<string | null>(null);
    const [minted, setMinted] = useState<Record<string, MintedLink>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setErr(null);
        try {
            const res = await fetch("/api/admin/pos/packets", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: PosPacketSummary[] };
            setPackets(body.data ?? []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load packets");
            setPackets(null);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const createShareLink = useCallback(
        async (packetDefinitionId: string) => {
            setMinting(packetDefinitionId);
            setErr(null);
            try {
                const res = await fetch("/api/admin/forms/packet-links", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ packet_definition_id: packetDefinitionId }),
                });
                const body = (await res.json().catch(() => ({}))) as {
                    data?: { embed_url?: string | null; embed_path?: string };
                    error?: string;
                };
                if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
                const url = body.data?.embed_url || body.data?.embed_path;
                if (!url) throw new Error("Link created but no URL was returned");
                setMinted((m) => ({ ...m, [packetDefinitionId]: { url } }));
                await load();
            } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed to create share link");
            } finally {
                setMinting(null);
            }
        },
        [load]
    );

    const copy = useCallback((id: string, url: string) => {
        void navigator.clipboard?.writeText(url).then(
            () => setCopiedId(id),
            () => setCopiedId(null)
        );
    }, []);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader
                title="Packets"
                subtitle="Parent packets created from your Alloy form templates. Share a link, then track status here."
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                        {packets ? `${packets.length} packet${packets.length === 1 ? "" : "s"}` : "Packets"}
                    </span>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-1 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 hover:bg-stone-50"
                    >
                        <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
                    </button>
                </div>

                {err ? (
                    <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11.5px] text-amber-800">{err}</div>
                ) : null}

                {!packets ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-16 animate-pulse rounded-lg bg-stone-100" />
                        ))}
                    </div>
                ) : packets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-6 text-center text-[12.5px] text-stone-500">
                        No parent packets yet. Open a generated form template in <span className="font-medium">Forms</span> and choose
                        <span className="font-medium"> “Create parent packet.”</span>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {packets.map((p) => {
                            const status = STATUS_STYLE[p.status];
                            const link = p.share_links.latest;
                            const mintedUrl = minted[p.packet_definition_id]?.url;
                            return (
                                <li key={p.packet_definition_id} className="rounded-lg border border-stone-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-[13px] font-semibold text-alloy-midnight">{p.name}</span>
                                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${status.cls}`}>{status.label}</span>
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                                                <span>
                                                    Source: <span className="text-stone-700">{p.source_form?.name ?? "—"}</span>
                                                </span>
                                                <span aria-hidden>·</span>
                                                <span>{p.step_count} step{p.step_count === 1 ? "" : "s"}</span>
                                                <span aria-hidden>·</span>
                                                <span>Created {fmtDate(p.created_at)}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={minting === p.packet_definition_id}
                                            onClick={() => void createShareLink(p.packet_definition_id)}
                                            title="Mint a fresh shareable parent link"
                                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                                        >
                                            <Link2 className="h-3.5 w-3.5" aria-hidden />
                                            {minting === p.packet_definition_id ? "Creating…" : "Create share link"}
                                        </button>
                                    </div>

                                    {/* Existing-link status (no full URL — links are stored hashed). */}
                                    <div className="mt-1.5 text-[10.5px] text-stone-400">
                                        {link ? (
                                            <span>
                                                {p.share_links.active_count > 0 ? "Active link" : "Link"} ·{" "}
                                                <span className="font-mono">{link.token_prefix ?? "—"}…</span>
                                                {link.expires_at ? ` · expires ${fmtDate(link.expires_at)}` : ""}
                                                {link.last_used_at ? ` · last opened ${fmtDate(link.last_used_at)}` : ""}
                                            </span>
                                        ) : (
                                            <span>No share link yet.</span>
                                        )}
                                    </div>

                                    {/* Freshly minted URL — copyable/openable this session only. */}
                                    {mintedUrl ? (
                                        <div className="mt-2 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50/60 p-1.5">
                                            <input
                                                readOnly
                                                value={mintedUrl}
                                                onFocus={(e) => e.currentTarget.select()}
                                                className="min-w-0 flex-1 truncate rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-[10.5px] text-stone-700"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => copy(p.packet_definition_id, mintedUrl)}
                                                className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-50"
                                            >
                                                <Copy className="h-3 w-3" aria-hidden /> {copiedId === p.packet_definition_id ? "Copied" : "Copy"}
                                            </button>
                                            <a
                                                href={mintedUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-50"
                                            >
                                                <ExternalLink className="h-3 w-3" aria-hidden /> Open
                                            </a>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
