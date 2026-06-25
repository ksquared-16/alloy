"use client";

/**
 * POS → Packets — operational home for packet creation + visibility.
 *
 * Packet Composer MVP: assemble ONE packet definition from multiple ordered form
 * templates, choose a target household (child-centered), select children + parent/guardian
 * recipients, and mint ONE unique share link per child-recipient pair (never a generic
 * link for multiple people). Lists packets with per-share rows.
 *
 * Reuses the existing forms-packet runtime + compose/roster routes. No PDF/email/review.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, ExternalLink, RefreshCw, Plus, ArrowUp, ArrowDown } from "lucide-react";
import type { PosPacketSummary, PosPacketStatus, PosPacketShareRow } from "@/lib/pos/packet/posPacketReadModel";
import type { RecordPickerOption } from "@/lib/pos/packet/recordPickerOptions";
import RecordLaunchPicker from "./RecordLaunchPicker";
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

interface FormOption {
    id: string;
    key: string;
    name: string | null;
    metadata?: Record<string, unknown>;
}

interface RosterChild {
    customer_member_id: string;
    label: string;
    dob: string | null;
}
interface RosterRecipient {
    person_id: string;
    label: string;
    email: string | null;
    relationship: string | null;
}
interface Roster {
    children: RosterChild[];
    recipients: RosterRecipient[];
}
interface ComposeShare {
    pair_key: string;
    customer_member_id: string | null;
    recipient_person_id: string | null;
    url: string | null;
    error?: string;
}

function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function absolutize(url: string): string {
    if (typeof window === "undefined") return url;
    return url.startsWith("/") ? `${window.location.origin}${url}` : url;
}

function formGroup(f: FormOption): string {
    const m = f.metadata ?? {};
    const cat = (m.category ?? m.folder ?? m.group) as unknown;
    return typeof cat === "string" && cat.trim() ? cat.trim() : "Forms";
}

export default function PosPacketsPanel() {
    const [packets, setPackets] = useState<PosPacketSummary[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Composer state
    const [showCreate, setShowCreate] = useState(false);
    const [formOptions, setFormOptions] = useState<FormOption[] | null>(null);
    const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [target, setTarget] = useState<RecordPickerOption | null>(null);
    const [roster, setRoster] = useState<Roster | null>(null);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [composing, setComposing] = useState(false);
    const [composeErr, setComposeErr] = useState<string | null>(null);
    const [composeResult, setComposeResult] = useState<{ name: string; form_count: number; warnings: string[]; shares: ComposeShare[] } | null>(null);

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

    const openCreate = useCallback(async () => {
        setShowCreate(true);
        setComposeErr(null);
        setComposeResult(null);
        if (formOptions) return;
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: FormOption[] };
            setFormOptions(body.data ?? []);
        } catch (e) {
            setComposeErr(e instanceof Error ? e.message : "Failed to load form templates");
            setFormOptions([]);
        }
    }, [formOptions]);

    // Load the household roster whenever the target changes.
    useEffect(() => {
        setRoster(null);
        setSelectedChildIds([]);
        setSelectedRecipientIds([]);
        if (!target) return;
        let cancelled = false;
        setRosterLoading(true);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/pos/packets/roster?entity_type=${target.entity_type}&entity_id=${target.entity_id}`, {
                    credentials: "same-origin",
                });
                const body = (await res.json().catch(() => ({}))) as { data?: Roster };
                if (!cancelled) setRoster(res.ok ? body.data ?? { children: [], recipients: [] } : { children: [], recipients: [] });
            } catch {
                if (!cancelled) setRoster({ children: [], recipients: [] });
            } finally {
                if (!cancelled) setRosterLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [target]);

    const toggleForm = useCallback((id: string) => {
        setSelectedFormIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    }, []);
    const moveForm = useCallback((idx: number, dir: -1 | 1) => {
        setSelectedFormIds((cur) => {
            const to = idx + dir;
            if (to < 0 || to >= cur.length) return cur;
            const next = cur.slice();
            const [m] = next.splice(idx, 1);
            next.splice(to, 0, m);
            return next;
        });
    }, []);
    const toggleId = (setter: typeof setSelectedChildIds) => (id: string) =>
        setter((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

    const compose = useCallback(async () => {
        if (selectedFormIds.length === 0) {
            setComposeErr("Select at least one form template.");
            return;
        }
        setComposing(true);
        setComposeErr(null);
        setComposeResult(null);
        try {
            const res = await fetch("/api/admin/pos/packets/compose", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(name.trim() ? { name: name.trim() } : {}),
                    ...(description.trim() ? { description: description.trim() } : {}),
                    form_definition_ids: selectedFormIds,
                    ...(target ? { anchor: { entity_type: target.entity_type, entity_id: target.entity_id } } : {}),
                    child_ids: selectedChildIds,
                    recipient_ids: selectedRecipientIds,
                }),
            });
            const b = (await res.json().catch(() => ({}))) as { data?: { name: string; form_count: number; warnings: string[]; shares: ComposeShare[] }; error?: string };
            if (!res.ok || !b.data) throw new Error(b.error || `Request failed (${res.status})`);
            setComposeResult({
                name: b.data.name,
                form_count: b.data.form_count,
                warnings: b.data.warnings ?? [],
                shares: (b.data.shares ?? []).map((s) => ({ ...s, url: s.url ? absolutize(s.url) : null })),
            });
            setSelectedFormIds([]);
            setName("");
            setDescription("");
            await load();
        } catch (e) {
            setComposeErr(e instanceof Error ? e.message : "Failed to create packet");
        } finally {
            setComposing(false);
        }
    }, [name, selectedFormIds, target, selectedChildIds, selectedRecipientIds, load]);

    const copy = useCallback((id: string, url: string) => {
        void navigator.clipboard?.writeText(url).then(
            () => setCopiedId(id),
            () => setCopiedId(null)
        );
    }, []);

    const grouped = groupForms(formOptions);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader title="Packets" subtitle="Assemble a parent packet from multiple forms, target a child + recipients, and send one link per pair." />

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                        {packets ? `${packets.length} packet${packets.length === 1 ? "" : "s"}` : "Packets"}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => (showCreate ? setShowCreate(false) : void openCreate())} className="inline-flex items-center gap-1 rounded-md bg-[#00A283] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#00917a]">
                            <Plus className="h-3 w-3" aria-hidden /> {showCreate ? "Close" : "New packet"}
                        </button>
                        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 hover:bg-stone-50">
                            <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
                        </button>
                    </div>
                </div>

                {showCreate ? (
                    <div className="mb-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                        <div className="text-[11px] font-semibold text-emerald-900">Compose a packet</div>

                        {/* 1. Forms */}
                        <div>
                            <div className="text-[10.5px] font-medium text-stone-500">1. Forms (select one or more)</div>
                            {!formOptions ? (
                                <div className="mt-1 text-[11px] text-stone-400">Loading templates…</div>
                            ) : (
                                <div className="mt-1 max-h-40 space-y-2 overflow-y-auto rounded border border-stone-200 bg-white p-2">
                                    {Object.entries(grouped).map(([group, opts]) => (
                                        <div key={group}>
                                            <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">{group}</div>
                                            {opts.map((f) => (
                                                <label key={f.id} className="flex items-center gap-2 py-0.5 text-[11.5px] text-stone-700">
                                                    <input type="checkbox" checked={selectedFormIds.includes(f.id)} onChange={() => toggleForm(f.id)} />
                                                    <span className="truncate">{f.name || f.key}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {selectedFormIds.length > 0 ? (
                                <ol className="mt-1.5 space-y-1">
                                    {selectedFormIds.map((id, idx) => {
                                        const f = formOptions?.find((x) => x.id === id);
                                        return (
                                            <li key={id} className="flex items-center justify-between gap-2 rounded border border-stone-200 bg-white px-2 py-1 text-[11px]">
                                                <span className="truncate">
                                                    <span className="text-stone-400">{idx + 1}.</span> {f?.name || f?.key || id}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1">
                                                    <button type="button" onClick={() => moveForm(idx, -1)} disabled={idx === 0} className="rounded p-0.5 text-stone-400 hover:bg-stone-100 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                                                    <button type="button" onClick={() => moveForm(idx, 1)} disabled={idx === selectedFormIds.length - 1} className="rounded p-0.5 text-stone-400 hover:bg-stone-100 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                                                    <button type="button" onClick={() => toggleForm(id)} className="rounded px-1 text-[10px] text-stone-400 hover:text-rose-600">remove</button>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            ) : null}
                        </div>

                        {/* 2. Target */}
                        <div>
                            <div className="text-[10.5px] font-medium text-stone-500">2. Target (child / household / lead)</div>
                            <div className="mt-1 overflow-hidden rounded border border-stone-200">
                                <RecordLaunchPicker value={target} onChange={setTarget} label="Search the family to send to" />
                            </div>
                        </div>

                        {/* 3. Children + recipients */}
                        {target ? (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-[10.5px] font-medium text-stone-500">3. Children</div>
                                    <div className="mt-1 max-h-32 overflow-y-auto rounded border border-stone-200 bg-white p-2 text-[11.5px]">
                                        {rosterLoading ? <div className="text-stone-400">Loading…</div> : roster && roster.children.length > 0 ? roster.children.map((c) => (
                                            <label key={c.customer_member_id} className="flex items-center gap-2 py-0.5">
                                                <input type="checkbox" checked={selectedChildIds.includes(c.customer_member_id)} onChange={() => toggleId(setSelectedChildIds)(c.customer_member_id)} />
                                                <span className="truncate">{c.label}{c.dob ? <span className="text-stone-400"> · {c.dob}</span> : null}</span>
                                            </label>
                                        )) : <div className="text-stone-400">No children found.</div>}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10.5px] font-medium text-stone-500">4. Recipients</div>
                                    <div className="mt-1 max-h-32 overflow-y-auto rounded border border-stone-200 bg-white p-2 text-[11.5px]">
                                        {rosterLoading ? <div className="text-stone-400">Loading…</div> : roster && roster.recipients.length > 0 ? roster.recipients.map((r) => (
                                            <label key={r.person_id} className="flex items-center gap-2 py-0.5">
                                                <input type="checkbox" checked={selectedRecipientIds.includes(r.person_id)} onChange={() => toggleId(setSelectedRecipientIds)(r.person_id)} />
                                                <span className="truncate">{r.label}{r.relationship ? <span className="text-stone-400"> · {r.relationship}</span> : null}</span>
                                            </label>
                                        )) : <div className="text-stone-400">No recipients found.</div>}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description / help text (optional)" className="w-full rounded border border-stone-200 bg-white px-2 py-1 text-[11.5px] text-stone-700" />
                        <div className="flex items-center gap-2">
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Packet name (optional)" className="min-w-0 flex-1 rounded border border-stone-200 bg-white px-2 py-1 text-[11.5px] text-stone-700" />
                            <span className="shrink-0 text-[10px] text-stone-500">
                                {Math.max(1, selectedChildIds.length || 1) * Math.max(1, selectedRecipientIds.length || 1)} link{(Math.max(1, selectedChildIds.length || 1) * Math.max(1, selectedRecipientIds.length || 1)) === 1 ? "" : "s"}
                            </span>
                            <button type="button" disabled={composing || selectedFormIds.length === 0} onClick={() => void compose()} className="inline-flex items-center gap-1 rounded-md bg-[#00A283] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#00917a] disabled:opacity-50">
                                <Plus className="h-3.5 w-3.5" aria-hidden /> {composing ? "Creating…" : "Create packet + links"}
                            </button>
                        </div>

                        {composeErr ? <p className="text-[11px] text-amber-700">{composeErr}</p> : null}
                        {composeResult ? (
                            <div className="rounded border border-emerald-200 bg-white p-2">
                                <div className="text-[11px] font-semibold text-emerald-900">{composeResult.name} · {composeResult.form_count} form{composeResult.form_count === 1 ? "" : "s"} · {composeResult.shares.length} link{composeResult.shares.length === 1 ? "" : "s"}</div>
                                {composeResult.warnings.map((w, i) => <p key={i} className="mt-0.5 text-[10px] text-amber-600">{w}</p>)}
                                <ul className="mt-1 space-y-1">
                                    {composeResult.shares.map((s) => (
                                        <li key={s.pair_key} className="flex items-center gap-2 text-[10.5px]">
                                            <span className="min-w-0 flex-1 truncate font-mono text-stone-600">{s.url ?? s.error ?? "—"}</span>
                                            {s.url ? (
                                                <>
                                                    <button type="button" onClick={() => copy(s.pair_key, s.url!)} className="shrink-0 rounded border border-emerald-200 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-50">{copiedId === s.pair_key ? "Copied" : "Copy"}</button>
                                                    <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-emerald-200 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-50">Open</a>
                                                </>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {err ? <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11.5px] text-amber-800">{err}</div> : null}

                {!packets ? (
                    <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-stone-100" />)}</div>
                ) : packets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-6 text-center text-[12.5px] text-stone-500">
                        No packets yet. Click <span className="font-medium">New packet</span> to compose one.
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {packets.map((p) => {
                            const status = STATUS_STYLE[p.status];
                            return (
                                <li key={p.packet_definition_id} className="rounded-lg border border-stone-200 bg-white p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-[13px] font-semibold text-alloy-midnight">{p.name}</span>
                                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${status.cls}`}>{status.label}</span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-stone-500">
                                        {p.step_count} form{p.step_count === 1 ? "" : "s"} · {p.instances.length} family packet{p.instances.length === 1 ? "" : "s"} · Created {fmtDate(p.created_at)}
                                    </div>
                                    {p.instances.length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {p.instances.map((inst, ii) => (
                                                <div key={inst.packet_instance_id ?? `i${ii}`} className="rounded border border-stone-100 p-2">
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-stone-500">
                                                        <span className="font-medium text-stone-700">Children:</span>
                                                        <span className="text-stone-700">{inst.child_labels.length ? inst.child_labels.join(", ") : "—"}</span>
                                                        <span aria-hidden>·</span>
                                                        <span>{inst.recipient_count} recipient{inst.recipient_count === 1 ? "" : "s"}</span>
                                                        <span aria-hidden>·</span>
                                                        <span>Signatures {inst.signatures.signed}/{inst.signatures.total}</span>
                                                    </div>
                                                    <ul className="mt-1 divide-y divide-stone-100">
                                                        {inst.recipients.map((s) => <ShareRow key={s.link_id} share={s} />)}
                                                    </ul>
                                                </div>
                                            ))}
                                            <p className="text-[9.5px] text-stone-400">Recipient links are nested under one family packet. Existing links show status only — full URLs appear once at creation (tokens stored hashed).</p>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-[10.5px] text-stone-400">No shares yet.</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function ShareRow({ share }: { share: PosPacketShareRow }) {
    const linkStatus = !share.is_active ? { label: "Inactive", cls: "bg-stone-100 text-stone-500" } : share.expired ? { label: "Expired", cls: "bg-rose-50 text-rose-700" } : { label: "Active", cls: "bg-emerald-50 text-emerald-700" };
    const progress = share.submitted ? { label: "Submitted", cls: "bg-emerald-100 text-emerald-800" } : share.opened ? { label: "Opened", cls: "bg-amber-50 text-amber-700" } : { label: "Not opened", cls: "bg-stone-100 text-stone-500" };
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 text-[11px]">
            <span className="font-medium text-stone-700">{share.child_label ?? (share.child_id ? "Child" : "—")}</span>
            <span className="text-stone-400">→</span>
            <span className="text-stone-700">{share.recipient_label ?? (share.recipient_id ? "Recipient" : "—")}</span>
            {share.recipient_email || share.recipient_phone ? (
                <span className="text-[9.5px] text-stone-400">{[share.recipient_email, share.recipient_phone].filter(Boolean).join(" · ")}</span>
            ) : null}
            <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${linkStatus.cls}`}>{linkStatus.label}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${progress.cls}`}>{progress.label}</span>
            <span className="shrink-0 font-mono text-[9.5px] text-stone-400">{share.token_prefix ?? "—"}…</span>
        </li>
    );
}

function groupForms(opts: FormOption[] | null): Record<string, FormOption[]> {
    const out: Record<string, FormOption[]> = {};
    for (const f of opts ?? []) {
        const g = formGroup(f);
        (out[g] ??= []).push(f);
    }
    return out;
}
