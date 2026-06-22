"use client";

/**
 * POS → Packets — operational home for packet creation + visibility.
 *
 * Packets (not Forms) are where operators assemble and send intake experiences. This panel
 * lists packets (GET /api/admin/pos/packets) and hosts the "Create packet" entry point.
 *
 * Step 1 (Surface Move): the create flow is still single-form under the hood — it reuses
 * the existing POST /api/admin/pos/packets/from-template route (pick one template + an
 * optional launch record). The full multi-form / multi-child / multi-recipient Composer is
 * Step 2. No new routes, tables, fan-out, or parent-UX changes here.
 *
 * "Create share link" mints a fresh public link (links are stored hashed, so the full URL
 * is only shown at mint time). No submission review, PDF generation, or duplicate detection.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, ExternalLink, RefreshCw, Plus } from "lucide-react";
import type { PosPacketSummary, PosPacketStatus } from "@/lib/pos/packet/posPacketReadModel";
import type { RecordPickerOption } from "@/lib/pos/packet/recordPickerOptions";
import RecordLaunchPicker from "./RecordLaunchPicker";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";

interface FormOption {
    id: string;
    key: string;
    name: string | null;
}

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
    // Step 1 — single-form "Create packet" entry (reuses the existing from-template route).
    const [showCreate, setShowCreate] = useState(false);
    const [formOptions, setFormOptions] = useState<FormOption[] | null>(null);
    const [createFormId, setCreateFormId] = useState("");
    const [createLaunch, setCreateLaunch] = useState<RecordPickerOption | null>(null);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [createdLink, setCreatedLink] = useState<string | null>(null);

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

    const openCreate = useCallback(async () => {
        setShowCreate(true);
        setCreateErr(null);
        setCreatedLink(null);
        if (formOptions) return;
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: FormOption[] };
            setFormOptions(body.data ?? []);
        } catch (e) {
            setCreateErr(e instanceof Error ? e.message : "Failed to load form templates");
            setFormOptions([]);
        }
    }, [formOptions]);

    const createPacket = useCallback(async () => {
        if (!createFormId) {
            setCreateErr("Choose a form template.");
            return;
        }
        setCreating(true);
        setCreateErr(null);
        setCreatedLink(null);
        try {
            const res = await fetch("/api/admin/pos/packets/from-template", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    form_definition_id: createFormId,
                    ...(createLaunch ? { launch_from_entity: { entity_type: createLaunch.entity_type, entity_id: createLaunch.entity_id } } : {}),
                }),
            });
            const b = (await res.json().catch(() => ({}))) as { data?: { public_link?: { url?: string } }; error?: string };
            if (!res.ok) throw new Error(b.error || `Request failed (${res.status})`);
            const url = b.data?.public_link?.url;
            if (!url) throw new Error("Packet created but no link was returned");
            setCreatedLink(url);
            setCreateFormId("");
            setCreateLaunch(null);
            await load();
        } catch (e) {
            setCreateErr(e instanceof Error ? e.message : "Failed to create packet");
        } finally {
            setCreating(false);
        }
    }, [createFormId, createLaunch, load]);

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
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => (showCreate ? setShowCreate(false) : void openCreate())}
                            className="inline-flex items-center gap-1 rounded-md bg-[#00A283] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#00917a]"
                        >
                            <Plus className="h-3 w-3" aria-hidden /> {showCreate ? "Close" : "Create packet"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex items-center gap-1 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 hover:bg-stone-50"
                        >
                            <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
                        </button>
                    </div>
                </div>

                {showCreate ? (
                    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                        <div className="mb-1.5 text-[11px] font-semibold text-emerald-900">New packet</div>
                        <label className="block text-[10.5px] font-medium text-stone-500">Form template</label>
                        <select
                            value={createFormId}
                            onChange={(e) => setCreateFormId(e.target.value)}
                            className="mt-0.5 w-full rounded border border-stone-200 bg-white px-2 py-1 text-[11.5px] text-stone-700"
                        >
                            <option value="">{formOptions ? "Choose a form template…" : "Loading templates…"}</option>
                            {(formOptions ?? []).map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name || f.key}
                                </option>
                            ))}
                        </select>
                        <div className="mt-2 overflow-hidden rounded border border-stone-200">
                            <RecordLaunchPicker value={createLaunch} onChange={setCreateLaunch} />
                        </div>
                        {createErr ? <p className="mt-2 text-[11px] text-amber-700">{createErr}</p> : null}
                        {createdLink ? (
                            <div className="mt-2 flex items-center gap-2 rounded border border-emerald-200 bg-white p-1.5">
                                <input
                                    readOnly
                                    value={createdLink}
                                    onFocus={(e) => e.currentTarget.select()}
                                    className="min-w-0 flex-1 truncate rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-[10.5px] text-stone-700"
                                />
                                <button
                                    type="button"
                                    onClick={() => copy("__new__", createdLink)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                    <Copy className="h-3 w-3" aria-hidden /> {copiedId === "__new__" ? "Copied" : "Copy"}
                                </button>
                                <a
                                    href={createdLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                    <ExternalLink className="h-3 w-3" aria-hidden /> Open
                                </a>
                            </div>
                        ) : null}
                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={creating || !createFormId}
                                onClick={() => void createPacket()}
                                className="inline-flex items-center gap-1 rounded-md bg-[#00A283] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#00917a] disabled:opacity-50"
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden /> {creating ? "Creating…" : "Create packet"}
                            </button>
                        </div>
                    </div>
                ) : null}

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
                        No parent packets yet. Click <span className="font-medium">Create packet</span> above to assemble one from a form template.
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
