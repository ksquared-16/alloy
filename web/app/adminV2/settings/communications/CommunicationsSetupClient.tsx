"use client";

import { useCallback, useEffect, useState } from "react";
import {
    fetchCommunicationsBindingsCached,
    invalidateCommunicationsBindingsCache,
} from "@/lib/communications/communicationsBindingsCache";

type BindingRow = {
    id: string;
    channel: string;
    scope?: string | null;
    location_id?: string | null;
    display_label?: string | null;
    provider?: string | null;
    status?: string | null;
    is_primary?: boolean | null;
    ready_for_composer?: boolean;
    inbound_to_e164?: string | null;
    from_email_hint?: string | null;
};

function channelLabel(ch: string): string {
    const c = ch.trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    return ch || "—";
}

function providerLabel(b: BindingRow): string {
    const p = (b.provider ?? "").trim().toLowerCase();
    const ch = (b.channel ?? "").trim().toLowerCase();
    if (ch === "email" && p === "resend") return "Resend";
    if (ch === "sms" && p) return p === "twilio" ? "Twilio" : b.provider ?? "SMS provider";
    return b.provider ?? "—";
}

export default function CommunicationsSetupClient() {
    const [bindings, setBindings] = useState<BindingRow[]>([]);
    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, { display_label: string; status: string; is_primary: boolean }>>({});

    const load = useCallback(async (options?: { force?: boolean }) => {
        setLoading(true);
        setErr(null);
        try {
            const { ok, status, json } = await fetchCommunicationsBindingsCached({ force: options?.force });
            if (!ok) throw new Error(json.error ?? `HTTP ${status}`);
            const list = (Array.isArray(json.bindings) ? json.bindings : []) as BindingRow[];
            const ch = json.channels_available;
            setBindings(list);
            setChannelsAvailable(Array.isArray(ch) ? ch : []);
            const d: Record<string, { display_label: string; status: string; is_primary: boolean }> = {};
            for (const b of list) {
                d[b.id] = {
                    display_label: b.display_label ?? "",
                    status: (b.status ?? "active").toLowerCase(),
                    is_primary: Boolean(b.is_primary),
                };
            }
            setDrafts(d);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load");
            setBindings([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const saveRow = async (id: string) => {
        const d = drafts[id];
        if (!d) return;
        setSavingId(id);
        setErr(null);
        try {
            const r = await fetch(`/api/admin/communications/bindings/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_label: d.display_label.trim() || null,
                    status: d.status,
                    is_primary: d.is_primary,
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `Save failed (${r.status})`);
            invalidateCommunicationsBindingsCache();
            await load({ force: true });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSavingId(null);
        }
    };

    const emailOutboundOk = channelsAvailable.includes("email");
    const smsOutboundOk = channelsAvailable.includes("sms");

    return (
        <div className="space-y-4">
            <div
                className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-[12px] leading-snug text-amber-950/90 shadow-sm"
                role="status"
            >
                <p className="font-semibold text-amber-950">Communications settings — mid-build but useful</p>
                <p className="mt-1 text-[11px] text-amber-950/88">
                    Credential setup is currently <strong>admin-managed</strong> (deployment / vault / DB binding rows). Full self-service
                    credential entry in this UI is coming. Here you can see read-only provider readiness, edit binding{" "}
                    <strong>label</strong>, <strong>status</strong>, and <strong>primary</strong> only — never secret values. The record
                    drawer composer only enables <strong>Resend</strong> (email) and <strong>Twilio SMS</strong> rows that meet the rules in
                    outbound readiness — other providers may show a secret ref but still not unlock compose.
                </p>
            </div>

            <section className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Outbound readiness</h2>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/58">
                    Derived from active bindings with credentials configured (<code className="text-[10px]">secret_ref</code> not empty /{" "}
                    <code className="text-[10px]">unconfigured</code>). No secrets are shown on this page.
                </p>
                <ul className="mt-2 flex flex-wrap gap-3 text-[12px]">
                    <li>
                        <span className="font-semibold text-alloy-forge">Email</span>{" "}
                        <span className={emailOutboundOk ? "text-green-800/85" : "text-alloy-ember"}>
                            {emailOutboundOk ? "Ready for composer" : "Not ready"}
                        </span>
                    </li>
                    <li>
                        <span className="font-semibold text-alloy-forge">SMS</span>{" "}
                        <span className={smsOutboundOk ? "text-green-800/85" : "text-alloy-ember"}>
                            {smsOutboundOk ? "Ready for composer" : "Not ready"}
                        </span>
                    </li>
                </ul>
            </section>

            <section className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Provider bindings</h2>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                    Each row shows <strong>read-only</strong> provider/channel context and whether a credential ref is configured (no secrets).
                    Use the <strong>Binding status</strong> dropdown and Save to enable/disable a row; changing <code className="text-[10px]">secret_ref</code>{" "}
                    still happens outside this UI today (runbooks / migrations / ops).
                </p>

                {loading ? (
                    <p className="mt-3 text-[12px] text-alloy-midnight/50" aria-busy="true">
                        Loading…
                    </p>
                ) : err && bindings.length === 0 ? (
                    <p className="mt-2 text-[12px] text-alloy-ember">{err}</p>
                ) : bindings.length === 0 ? (
                    <p className="mt-2 text-[12px] text-alloy-midnight/58">No binding rows for this org yet.</p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {err ? <p className="text-[11px] text-alloy-ember">{err}</p> : null}
                        {bindings.map((b) => {
                            const d = drafts[b.id];
                            const secretOk = Boolean(b.ready_for_composer);
                            return (
                                <div
                                    key={b.id}
                                    className="rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.04] px-2.5 py-2 text-[11px]"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-semibold text-alloy-forge">
                                            {channelLabel(b.channel)} · {providerLabel(b)}
                                        </span>
                                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${secretOk ? "bg-green-800/10 text-green-900/90" : "bg-alloy-ember/10 text-alloy-ember"}`}>
                                            Composer outbound: {secretOk ? "ready" : "not ready"}
                                        </span>
                                    </div>
                                    <dl className="mt-1.5 grid gap-0.5 text-[10px] text-alloy-midnight/55 sm:grid-cols-2">
                                        <div>
                                            <dt className="inline font-medium text-alloy-midnight/45">Status (stored)</dt>{" "}
                                            <dd className="inline">{b.status ?? "—"}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium text-alloy-midnight/45">Primary</dt>{" "}
                                            <dd className="inline">{b.is_primary ? "Yes" : "No"}</dd>
                                        </div>
                                        {b.inbound_to_e164 ? (
                                            <div className="sm:col-span-2">
                                                <dt className="inline font-medium text-alloy-midnight/45">Inbound</dt>{" "}
                                                <dd className="inline font-mono text-[10px]">{b.inbound_to_e164}</dd>
                                            </div>
                                        ) : null}
                                        {b.from_email_hint ? (
                                            <div className="sm:col-span-2">
                                                <dt className="inline font-medium text-alloy-midnight/45">From (config hint)</dt>{" "}
                                                <dd className="inline">{b.from_email_hint}</dd>
                                            </div>
                                        ) : null}
                                        <div>
                                            <dt className="inline font-medium text-alloy-midnight/45">Scope</dt>{" "}
                                            <dd className="inline">{b.scope ?? "—"}</dd>
                                        </div>
                                    </dl>
                                    {d ? (
                                        <div className="mt-2 space-y-2 border-t border-alloy-stone/12 pt-2">
                                            <label className="block">
                                                <span className="text-[10px] font-medium text-alloy-midnight/50">Display label</span>
                                                <input
                                                    type="text"
                                                    value={d.display_label}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({
                                                            ...prev,
                                                            [b.id]: { ...d, display_label: e.target.value },
                                                        }))
                                                    }
                                                    className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-[10px] font-medium text-alloy-midnight/50">Binding status</span>
                                                <select
                                                    value={d.status}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({
                                                            ...prev,
                                                            [b.id]: { ...d, status: e.target.value },
                                                        }))
                                                    }
                                                    className="mt-0.5 w-full max-w-xs rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                                >
                                                    <option value="active">active</option>
                                                    <option value="disabled">disabled</option>
                                                    <option value="pending_verification">pending_verification</option>
                                                </select>
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={d.is_primary}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({
                                                            ...prev,
                                                            [b.id]: { ...d, is_primary: e.target.checked },
                                                        }))
                                                    }
                                                />
                                                <span className="text-[10px] text-alloy-midnight/60">Primary for this channel</span>
                                            </label>
                                            <button
                                                type="button"
                                                disabled={savingId === b.id}
                                                onClick={() => void saveRow(b.id)}
                                                className="rounded-md border border-alloy-midnight/20 bg-alloy-midnight px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:opacity-50"
                                            >
                                                {savingId === b.id ? "Saving…" : "Save row"}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
