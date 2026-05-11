"use client";

import { useCallback, useEffect, useState } from "react";

type PacketDefRow = { id: string; name: string; key: string; is_active?: boolean | null };

type PacketItemRow = {
    sequence_index: number;
    form_definitions: null | { name?: string | null } | { name?: string | null }[];
};

function formNameFromItem(row: PacketItemRow): string {
    const fd = row.form_definitions;
    const f = Array.isArray(fd) ? fd[0] : fd;
    const n = f && typeof f.name === "string" ? f.name.trim() : "";
    return n || "Form";
}

export default function OpportunityLaunchPacketSection({
    opportunityId,
    opportunityLabel,
    canMutate,
    onClose,
}: {
    opportunityId: string;
    opportunityLabel: string;
    canMutate: boolean;
    onClose: () => void;
}) {
    const [defs, setDefs] = useState<PacketDefRow[]>([]);
    const [defsLoading, setDefsLoading] = useState(true);
    const [defsErr, setDefsErr] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string>("");
    const [detailItems, setDetailItems] = useState<PacketItemRow[]>([]);
    const [detailName, setDetailName] = useState<string>("");
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailErr, setDetailErr] = useState<string | null>(null);

    const [internalNote, setInternalNote] = useState("");
    const [expiresLocal, setExpiresLocal] = useState("");

    const [busy, setBusy] = useState(false);
    const [launchErr, setLaunchErr] = useState<string | null>(null);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);
    const [copyOk, setCopyOk] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setDefsLoading(true);
            setDefsErr(null);
            try {
                const res = await fetch("/api/admin/forms/packet-definitions");
                const json = (await res.json().catch(() => ({}))) as { data?: PacketDefRow[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not load packets");
                const rows = Array.isArray(json.data) ? json.data : [];
                if (!cancelled) setDefs(rows);
            } catch (e) {
                if (!cancelled) setDefsErr(e instanceof Error ? e.message : "Load failed");
            } finally {
                if (!cancelled) setDefsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const loadDetail = useCallback(async (packetDefId: string) => {
        if (!packetDefId) {
            setDetailItems([]);
            setDetailName("");
            return;
        }
        setDetailLoading(true);
        setDetailErr(null);
        try {
            const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}`);
            const json = (await res.json().catch(() => ({}))) as {
                data?: { definition?: { name?: string }; items?: PacketItemRow[] };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not load packet detail");
            const def = json.data?.definition;
            const items = json.data?.items ?? [];
            setDetailName(typeof def?.name === "string" && def.name.trim() ? def.name.trim() : "Packet");
            setDetailItems(items);
        } catch (e) {
            setDetailErr(e instanceof Error ? e.message : "Detail failed");
            setDetailItems([]);
            setDetailName("");
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDetail(selectedId);
    }, [selectedId, loadDetail]);

    const launch = async () => {
        if (!selectedId || !canMutate) return;
        setBusy(true);
        setLaunchErr(null);
        setCreatedUrl(null);
        setCopyOk(false);
        try {
            const labelBase = opportunityLabel.trim() || "Opportunity";
            const packetPart = detailName.trim() || "Packet";
            let expires_at: string | undefined;
            if (expiresLocal.trim()) {
                const ms = Date.parse(expiresLocal);
                if (!Number.isFinite(ms)) throw new Error("Expiration must be a valid date/time");
                expires_at = new Date(ms).toISOString();
            }
            const metadata: Record<string, unknown> = {};
            if (internalNote.trim()) metadata.internal_operator_note = internalNote.trim();

            const res = await fetch("/api/admin/forms/packet-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packet_definition_id: selectedId,
                    label: `${labelBase} · ${packetPart}`,
                    launch_from_entity: { entity_type: "opportunity", entity_id: opportunityId },
                    ...(Object.keys(metadata).length ? { metadata } : {}),
                    ...(expires_at ? { expires_at } : {}),
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                data?: { embed_url?: string | null; embed_path?: string };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not create link");
            const u =
                typeof json.data?.embed_url === "string" && json.data.embed_url.startsWith("http")
                    ? json.data.embed_url
                    : typeof json.data?.embed_path === "string" && typeof window !== "undefined"
                      ? `${window.location.origin}${json.data.embed_path}`
                      : null;
            if (!u) throw new Error("Missing embed URL");
            setCreatedUrl(u);
        } catch (e) {
            setLaunchErr(e instanceof Error ? e.message : "Launch failed");
        } finally {
            setBusy(false);
        }
    };

    const copyLink = async () => {
        if (!createdUrl) return;
        try {
            await navigator.clipboard.writeText(createdUrl);
            setCopyOk(true);
        } catch {
            setCopyOk(false);
        }
    };

    return (
        <section className="mb-4 rounded-xl border border-admin-border bg-white/90 px-3 py-3 shadow-sm ring-1 ring-alloy-stone/10">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight/95">Send enrollment packet</h3>
                    <p className="mt-1 text-xs leading-snug text-alloy-midnight/65">
                        Creates a single-recipient packet link tied to this opportunity. CRM context is applied on the
                        server — not from this browser payload.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-md border border-alloy-stone/50 px-2.5 py-1 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/20"
                >
                    Close
                </button>
            </div>

            {defsLoading ? <p className="mt-3 text-xs text-alloy-midnight/55">Loading packet definitions…</p> : null}
            {defsErr ? <p className="mt-3 text-xs text-red-700">{defsErr}</p> : null}

            {!defsLoading && !defsErr && defs.length === 0 ? (
                <p className="mt-3 text-xs text-alloy-midnight/65">No packet definitions in this organization yet.</p>
            ) : null}

            {defs.length > 0 ? (
                <div className="mt-3 space-y-3">
                    <label className="block text-xs font-medium text-alloy-midnight/75">
                        Packet
                        <select
                            className="mt-1 block w-full max-w-md rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                            value={selectedId}
                            disabled={!canMutate}
                            onChange={(e) => setSelectedId(e.target.value)}
                        >
                            <option value="">Choose a packet…</option>
                            {defs.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name?.trim() || d.key}
                                    {d.is_active === false ? " (inactive)" : ""}
                                </option>
                            ))}
                        </select>
                    </label>

                    {selectedId ?
                        <>
                            {detailLoading ? <p className="text-xs text-alloy-midnight/55">Loading steps…</p> : null}
                            {detailErr ? <p className="text-xs text-red-700">{detailErr}</p> : null}
                            {!detailLoading && !detailErr && detailItems.length > 0 ? (
                                <div className="rounded-md border border-alloy-stone/35 bg-alloy-stone/5 px-2.5 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                        Forms in this packet
                                    </p>
                                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-alloy-midnight/85">
                                        {detailItems.map((it) => (
                                            <li key={`${it.sequence_index}-${formNameFromItem(it)}`}>
                                                {formNameFromItem(it)}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ) : null}

                            <label className="block text-xs font-medium text-alloy-midnight/75">
                                Internal note (optional)
                                <textarea
                                    className="mt-1 block w-full max-w-md rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                    rows={2}
                                    value={internalNote}
                                    disabled={!canMutate}
                                    onChange={(e) => setInternalNote(e.target.value)}
                                    placeholder="Visible to staff on the public link metadata"
                                />
                            </label>

                            <label className="block text-xs font-medium text-alloy-midnight/75">
                                Link expiration (optional)
                                <input
                                    type="datetime-local"
                                    className="mt-1 block w-full max-w-md rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                    value={expiresLocal}
                                    disabled={!canMutate}
                                    onChange={(e) => setExpiresLocal(e.target.value)}
                                />
                            </label>

                            <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                    type="button"
                                    disabled={!canMutate || busy || !selectedId}
                                    onClick={() => void launch()}
                                    className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {busy ? "Creating link…" : "Create link"}
                                </button>
                                {createdUrl ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void copyLink()}
                                            className="rounded-md border border-alloy-stone/55 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                                        >
                                            {copyOk ? "Copied" : "Copy link"}
                                        </button>
                                        <a
                                            href={createdUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center rounded-md border border-alloy-stone/55 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                                        >
                                            Open link
                                        </a>
                                    </>
                                ) : null}
                            </div>
                            {launchErr ? <p className="text-xs text-red-700">{launchErr}</p> : null}
                            {createdUrl ? (
                                <p className="break-all font-mono text-[11px] text-alloy-midnight/70">{createdUrl}</p>
                            ) : null}
                        </>
                    : null}
                </div>
            ) : null}
        </section>
    );
}
