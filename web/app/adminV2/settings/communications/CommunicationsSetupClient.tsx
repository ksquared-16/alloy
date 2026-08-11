"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    fetchCommunicationsBindingsCached,
    invalidateCommunicationsBindingsCache,
} from "@/lib/communications/communicationsBindingsCache";
import { readinessLabel, type ReadinessState } from "@/lib/communications/bindingReadiness";

type DirectionReadiness = { state: ReadinessState; detail: string };

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
    inbound_address?: string | null;
    receiving_domain?: string | null;
    from_email?: string | null;
    sending_domain?: string | null;
    from_email_hint?: string | null;
    credential_key?: string | null;
    credential_configured?: boolean;
    readiness?: { send: DirectionReadiness; receive: DirectionReadiness };
};

type CredentialOption = {
    key: string;
    channel: string;
    provider: string;
    label: string;
    description: string;
    available: boolean;
};

type RowDraft = {
    display_label: string;
    status: string;
    is_primary: boolean;
    inbound_address: string;
    inbound_to_e164: string;
    from_email: string;
    credential_key: string;
};

const STATUS_OPTIONS = ["active", "disabled", "pending_verification"] as const;

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

/** Colour carries the same meaning everywhere: only `ready` is green, and
 *  `verification_required` is deliberately not green — it is not working yet. */
function stateClasses(state: ReadinessState): string {
    switch (state) {
        case "ready":
            return "bg-green-800/10 text-green-900/90";
        case "verification_required":
            return "bg-amber-500/12 text-amber-900/90";
        case "disabled":
            return "bg-alloy-midnight/8 text-alloy-midnight/60";
        default:
            return "bg-alloy-ember/10 text-alloy-ember";
    }
}

function ReadinessBadge({ direction, readiness }: { direction: string; readiness?: DirectionReadiness }) {
    const state = readiness?.state ?? "setup_required";
    return (
        <span
            className={`inline-flex shrink-0 items-baseline gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${stateClasses(state)}`}
            title={readiness?.detail ?? ""}
        >
            <span className="uppercase tracking-wide opacity-70">{direction}</span>
            <span>{readinessLabel(state)}</span>
        </span>
    );
}

function draftFor(b: BindingRow): RowDraft {
    return {
        display_label: b.display_label ?? "",
        status: (b.status ?? "active").toLowerCase(),
        is_primary: Boolean(b.is_primary),
        inbound_address: b.inbound_address ?? "",
        inbound_to_e164: b.inbound_to_e164 ?? "",
        from_email: b.from_email ?? "",
        credential_key: b.credential_key ?? "",
    };
}

export default function CommunicationsSetupClient() {
    const [bindings, setBindings] = useState<BindingRow[]>([]);
    const [credentialOptions, setCredentialOptions] = useState<CredentialOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);

    const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [newChannel, setNewChannel] = useState<"email" | "sms">("email");
    const [newCredentialKey, setNewCredentialKey] = useState("");
    const [newLabel, setNewLabel] = useState("");
    const [newInboundAddress, setNewInboundAddress] = useState("");
    const [newInboundNumber, setNewInboundNumber] = useState("");
    const [newFromEmail, setNewFromEmail] = useState("");

    const load = useCallback(async (options?: { force?: boolean }) => {
        setLoading(true);
        setErr(null);
        try {
            const { ok, status, json } = await fetchCommunicationsBindingsCached({ force: options?.force });
            if (!ok) throw new Error(json.error ?? `HTTP ${status}`);
            const list = (Array.isArray(json.bindings) ? json.bindings : []) as BindingRow[];
            const creds = (json as { credential_options?: CredentialOption[] }).credential_options;
            setBindings(list);
            setCredentialOptions(Array.isArray(creds) ? creds : []);
            const d: Record<string, RowDraft> = {};
            for (const b of list) d[b.id] = draftFor(b);
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

    const credentialsForChannel = useCallback(
        (channel: string) => credentialOptions.filter((c) => c.channel === channel),
        [credentialOptions],
    );

    useEffect(() => {
        const first = credentialsForChannel(newChannel).find((c) => c.available) ?? credentialsForChannel(newChannel)[0];
        setNewCredentialKey(first?.key ?? "");
    }, [newChannel, credentialsForChannel]);

    const saveRow = async (b: BindingRow) => {
        const d = drafts[b.id];
        if (!d) return;
        setSavingId(b.id);
        setErr(null);
        const isEmail = (b.channel ?? "").toLowerCase() === "email";
        try {
            const payload: Record<string, unknown> = {
                display_label: d.display_label.trim() || null,
                status: d.status,
                is_primary: d.is_primary,
            };
            if (isEmail) {
                payload.inbound_address = d.inbound_address.trim() || null;
                payload.from_email = d.from_email.trim() || null;
            } else {
                payload.inbound_to_e164 = d.inbound_to_e164.trim() || null;
            }
            // Only send a credential change when the operator actually chose one —
            // a blank select must not clear a credential provisioned elsewhere.
            if (d.credential_key && d.credential_key !== (b.credential_key ?? "")) {
                payload.credential_key = d.credential_key;
            }

            const r = await fetch(`/api/admin/communications/bindings/${encodeURIComponent(b.id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
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

    const createBinding = async () => {
        setCreating(true);
        setCreateErr(null);
        try {
            const payload: Record<string, unknown> = {
                channel: newChannel,
                credential_key: newCredentialKey,
                display_label: newLabel.trim() || null,
                status: "pending_verification",
            };
            if (newChannel === "email") {
                payload.inbound_address = newInboundAddress.trim() || null;
                payload.from_email = newFromEmail.trim() || null;
            } else {
                payload.inbound_to_e164 = newInboundNumber.trim() || null;
            }

            const r = await fetch("/api/admin/communications/bindings", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `Could not connect channel (${r.status})`);
            invalidateCommunicationsBindingsCache();
            setCreateOpen(false);
            setNewLabel("");
            setNewInboundAddress("");
            setNewInboundNumber("");
            setNewFromEmail("");
            await load({ force: true });
        } catch (e) {
            setCreateErr(e instanceof Error ? e.message : "Could not connect channel");
        } finally {
            setCreating(false);
        }
    };

    /** Channel-level readiness is the best any one binding achieves. An org with a
     *  working channel and a broken spare is not broken. */
    const channelReadiness = useMemo(() => {
        const rank: Record<ReadinessState, number> = {
            ready: 5,
            verification_required: 4,
            setup_required: 3,
            provider_unavailable: 2,
            disabled: 1,
        };
        const best = (channel: string, direction: "send" | "receive"): DirectionReadiness | null => {
            const rows = bindings.filter((b) => (b.channel ?? "").toLowerCase() === channel);
            let winner: DirectionReadiness | null = null;
            for (const b of rows) {
                const r = b.readiness?.[direction];
                if (!r) continue;
                if (!winner || rank[r.state] > rank[winner.state]) winner = r;
            }
            return winner;
        };
        return {
            email: { send: best("email", "send"), receive: best("email", "receive") },
            sms: { send: best("sms", "send"), receive: best("sms", "receive") },
        };
    }, [bindings]);

    const availableCredsForNew = credentialsForChannel(newChannel);
    const chosenCred = availableCredsForNew.find((c) => c.key === newCredentialKey) ?? null;

    return (
        <div className="space-y-4">
            <div
                className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 text-[12px] leading-snug text-alloy-midnight/80 shadow-sm"
                role="status"
            >
                <p className="font-semibold text-alloy-forge">How credentials work here</p>
                <p className="mt-1 text-[11px] text-alloy-midnight/70">
                    Provider credentials are provisioned by the deployment. You connect a channel by{" "}
                    <strong>choosing</strong> one of them — this page never asks for, accepts, or displays an API key. Domain
                    verification and MX records are done with the provider; this page reports the resulting readiness rather than
                    automating it.
                </p>
            </div>

            <section className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Channel readiness</h2>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/58">
                    Sending and receiving are reported separately — a channel can send perfectly and still drop every reply.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(["email", "sms"] as const).map((ch) => {
                        const r = channelReadiness[ch];
                        return (
                            <div key={ch} className="rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.04] px-2.5 py-2">
                                <p className="text-[12px] font-semibold text-alloy-forge">{channelLabel(ch)}</p>
                                {r.send || r.receive ? (
                                    <div className="mt-1.5 space-y-1.5">
                                        <div>
                                            <ReadinessBadge direction="Send" readiness={r.send ?? undefined} />
                                            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/58">
                                                {r.send?.detail ?? "No binding for this channel."}
                                            </p>
                                        </div>
                                        <div>
                                            <ReadinessBadge direction="Receive" readiness={r.receive ?? undefined} />
                                            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/58">
                                                {r.receive?.detail ?? "No binding for this channel."}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-1 text-[11px] text-alloy-midnight/58">
                                        Not connected. Use <strong>Connect a channel</strong> below.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Connect a channel</h2>
                    <button
                        type="button"
                        onClick={() => {
                            setCreateErr(null);
                            setCreateOpen((v) => !v);
                        }}
                        className="rounded-md border border-alloy-midnight/20 px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight hover:bg-alloy-stone/10"
                    >
                        {createOpen ? "Cancel" : "Connect a channel"}
                    </button>
                </div>

                {createOpen ? (
                    <div className="mt-3 space-y-2.5 border-t border-alloy-stone/12 pt-3 text-[11px]">
                        <label className="block">
                            <span className="text-[10px] font-medium text-alloy-midnight/50">Channel</span>
                            <select
                                value={newChannel}
                                onChange={(e) => setNewChannel(e.target.value === "sms" ? "sms" : "email")}
                                className="mt-0.5 w-full max-w-xs rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                            >
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-[10px] font-medium text-alloy-midnight/50">Credential</span>
                            <select
                                value={newCredentialKey}
                                onChange={(e) => setNewCredentialKey(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                            >
                                {availableCredsForNew.length === 0 ? <option value="">No credentials for this channel</option> : null}
                                {availableCredsForNew.map((c) => (
                                    <option key={c.key} value={c.key} disabled={!c.available}>
                                        {c.label}
                                        {c.available ? "" : " — not provisioned"}
                                    </option>
                                ))}
                            </select>
                            {chosenCred ? (
                                <span className="mt-0.5 block text-[10px] leading-snug text-alloy-midnight/55">
                                    {chosenCred.description}
                                    {chosenCred.available ? null : (
                                        <strong className="text-alloy-ember">
                                            {" "}
                                            This credential must be configured in the deployment before it can be used.
                                        </strong>
                                    )}
                                </span>
                            ) : null}
                        </label>

                        <label className="block">
                            <span className="text-[10px] font-medium text-alloy-midnight/50">Label (optional)</span>
                            <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="Front desk"
                                className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                            />
                        </label>

                        {newChannel === "email" ? (
                            <>
                                <label className="block">
                                    <span className="text-[10px] font-medium text-alloy-midnight/50">Receiving address</span>
                                    <input
                                        type="email"
                                        value={newInboundAddress}
                                        onChange={(e) => setNewInboundAddress(e.target.value)}
                                        placeholder="hello@yourdomain.org"
                                        className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                    />
                                    <span className="mt-0.5 block text-[10px] text-alloy-midnight/55">
                                        Where replies are delivered. Its domain needs MX records pointed at the provider.
                                    </span>
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-medium text-alloy-midnight/50">From address (optional)</span>
                                    <input
                                        type="email"
                                        value={newFromEmail}
                                        onChange={(e) => setNewFromEmail(e.target.value)}
                                        placeholder="hello@yourdomain.org"
                                        className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                    />
                                    <span className="mt-0.5 block text-[10px] text-alloy-midnight/55">
                                        The sending identity, and the domain replies correlate on. Leave blank to use the deployment
                                        default.
                                    </span>
                                </label>
                            </>
                        ) : (
                            <label className="block">
                                <span className="text-[10px] font-medium text-alloy-midnight/50">Receiving number</span>
                                <input
                                    type="tel"
                                    value={newInboundNumber}
                                    onChange={(e) => setNewInboundNumber(e.target.value)}
                                    placeholder="+15551234567"
                                    className="mt-0.5 w-full max-w-xs rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                />
                            </label>
                        )}

                        <p className="text-[10px] leading-snug text-alloy-midnight/55">
                            The channel is connected as <strong>pending verification</strong>. Set it to active once the provider side
                            is confirmed.
                        </p>

                        {createErr ? <p className="text-[11px] text-alloy-ember">{createErr}</p> : null}

                        <button
                            type="button"
                            disabled={creating || !newCredentialKey || !(chosenCred?.available ?? false)}
                            onClick={() => void createBinding()}
                            className="rounded-md border border-alloy-midnight/20 bg-alloy-midnight px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:opacity-50"
                        >
                            {creating ? "Connecting…" : "Connect channel"}
                        </button>
                    </div>
                ) : (
                    <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                        Connect Email or SMS to a credential this deployment has provisioned. Organization-wide — per-location
                        channels are not supported yet.
                    </p>
                )}
            </section>

            <section className="rounded-xl border border-alloy-stone/16 bg-white/90 p-3 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Connected channels</h2>

                {loading ? (
                    <p className="mt-3 text-[12px] text-alloy-midnight/50" aria-busy="true">
                        Loading…
                    </p>
                ) : err && bindings.length === 0 ? (
                    <p className="mt-2 text-[12px] text-alloy-ember">{err}</p>
                ) : bindings.length === 0 ? (
                    <p className="mt-2 text-[12px] text-alloy-midnight/58">
                        No channels connected yet. Use <strong>Connect a channel</strong> above.
                    </p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {err ? <p className="text-[11px] text-alloy-ember">{err}</p> : null}
                        {bindings.map((b) => {
                            const d = drafts[b.id];
                            const isEmail = (b.channel ?? "").toLowerCase() === "email";
                            const creds = credentialsForChannel((b.channel ?? "").toLowerCase());
                            const unmanagedCredential = Boolean(b.credential_configured) && !b.credential_key;
                            return (
                                <div
                                    key={b.id}
                                    className="rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.04] px-2.5 py-2 text-[11px]"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-semibold text-alloy-forge">
                                            {channelLabel(b.channel)} · {providerLabel(b)}
                                            {b.display_label ? (
                                                <span className="ml-1 font-normal text-alloy-midnight/60">— {b.display_label}</span>
                                            ) : null}
                                        </span>
                                        <span className="flex flex-wrap gap-1">
                                            <ReadinessBadge direction="Send" readiness={b.readiness?.send} />
                                            <ReadinessBadge direction="Receive" readiness={b.readiness?.receive} />
                                        </span>
                                    </div>

                                    <div className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-alloy-midnight/62">
                                        {b.readiness?.send ? <p>Send — {b.readiness.send.detail}</p> : null}
                                        {b.readiness?.receive ? <p>Receive — {b.readiness.receive.detail}</p> : null}
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
                                        {isEmail && b.receiving_domain ? (
                                            <div>
                                                <dt className="inline font-medium text-alloy-midnight/45">Receiving domain</dt>{" "}
                                                <dd className="inline font-mono">{b.receiving_domain}</dd>
                                            </div>
                                        ) : null}
                                        {isEmail && b.sending_domain ? (
                                            <div>
                                                <dt className="inline font-medium text-alloy-midnight/45">Sending domain</dt>{" "}
                                                <dd className="inline font-mono">{b.sending_domain}</dd>
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
                                                        setDrafts((prev) => ({ ...prev, [b.id]: { ...d, display_label: e.target.value } }))
                                                    }
                                                    className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                                />
                                            </label>

                                            {isEmail ? (
                                                <>
                                                    <label className="block">
                                                        <span className="text-[10px] font-medium text-alloy-midnight/50">
                                                            Receiving address
                                                        </span>
                                                        <input
                                                            type="email"
                                                            value={d.inbound_address}
                                                            placeholder="hello@yourdomain.org"
                                                            onChange={(e) =>
                                                                setDrafts((prev) => ({
                                                                    ...prev,
                                                                    [b.id]: { ...d, inbound_address: e.target.value },
                                                                }))
                                                            }
                                                            className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[10px] font-medium text-alloy-midnight/50">From address</span>
                                                        <input
                                                            type="email"
                                                            value={d.from_email}
                                                            placeholder="deployment default"
                                                            onChange={(e) =>
                                                                setDrafts((prev) => ({ ...prev, [b.id]: { ...d, from_email: e.target.value } }))
                                                            }
                                                            className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                                        />
                                                    </label>
                                                </>
                                            ) : (
                                                <label className="block">
                                                    <span className="text-[10px] font-medium text-alloy-midnight/50">Receiving number</span>
                                                    <input
                                                        type="tel"
                                                        value={d.inbound_to_e164}
                                                        placeholder="+15551234567"
                                                        onChange={(e) =>
                                                            setDrafts((prev) => ({
                                                                ...prev,
                                                                [b.id]: { ...d, inbound_to_e164: e.target.value },
                                                            }))
                                                        }
                                                        className="mt-0.5 w-full max-w-xs rounded border border-alloy-stone/20 px-2 py-1 font-mono text-[11px]"
                                                    />
                                                </label>
                                            )}

                                            <label className="block">
                                                <span className="text-[10px] font-medium text-alloy-midnight/50">Credential</span>
                                                <select
                                                    value={d.credential_key}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({ ...prev, [b.id]: { ...d, credential_key: e.target.value } }))
                                                    }
                                                    className="mt-0.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                                >
                                                    <option value="">
                                                        {unmanagedCredential
                                                            ? "Connected outside this page — leave unchanged"
                                                            : "Not connected"}
                                                    </option>
                                                    {creds.map((c) => (
                                                        <option key={c.key} value={c.key} disabled={!c.available}>
                                                            {c.label}
                                                            {c.available ? "" : " — not provisioned"}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label className="block">
                                                <span className="text-[10px] font-medium text-alloy-midnight/50">Binding status</span>
                                                <select
                                                    value={d.status}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({ ...prev, [b.id]: { ...d, status: e.target.value } }))
                                                    }
                                                    className="mt-0.5 w-full max-w-xs rounded border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                                >
                                                    {STATUS_OPTIONS.map((s) => (
                                                        <option key={s} value={s}>
                                                            {s}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={d.is_primary}
                                                    onChange={(e) =>
                                                        setDrafts((prev) => ({ ...prev, [b.id]: { ...d, is_primary: e.target.checked } }))
                                                    }
                                                />
                                                <span className="text-[10px] text-alloy-midnight/60">Primary for this channel</span>
                                            </label>

                                            <button
                                                type="button"
                                                disabled={savingId === b.id}
                                                onClick={() => void saveRow(b)}
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
