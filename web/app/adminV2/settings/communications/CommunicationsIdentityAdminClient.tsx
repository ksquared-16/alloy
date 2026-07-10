"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import CommunicationsSetupClient from "@/app/adminV2/settings/communications/CommunicationsSetupClient";

type AdminTab = "overview" | "providers" | "identities" | "locations" | "access" | "legacy";

type OverviewPayload = {
    summary: {
        provider_accounts: number;
        identities: number;
        sms_identities: number;
        email_identities: number;
        locations_total: number;
        locations_with_sms: number;
        locations_with_email: number;
        unverified_identities: number;
        degraded_providers: number;
    };
    issues: Array<{ code: string; message: string; severity?: string }>;
};

type LocationRow = { id: string; label: string };
type IdentityRow = {
    id: string;
    channel: string;
    display_name: string | null;
    canonical_address: string;
    status: string;
    verification_state: string;
    health_status: string;
    default_access_mode: string;
    grant_count: number;
    provider_type: string | null;
};
type ProviderRow = {
    id: string;
    provider_type: string;
    display_label: string | null;
    status: string;
    verification_state: string;
    health_status: string;
    identity_count: number;
};
type GrantRow = {
    id: string;
    identity_id: string;
    user_id: string;
    can_send: boolean;
    can_override_default: boolean;
    can_use_across_locations: boolean;
    status: string;
};

function statusPill(value: string, tone: "neutral" | "warn" | "ok" = "neutral") {
    const cls =
        tone === "ok"
            ? "bg-alloy-juniper/10 text-alloy-juniper"
            : tone === "warn"
              ? "bg-alloy-amber/10 text-alloy-amber"
              : "bg-alloy-stone/10 text-alloy-midnight/70";
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{value}</span>;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-alloy-midnight">{title}</h3>
            {children}
        </section>
    );
}

export default function CommunicationsIdentityAdminClient() {
    const [tab, setTab] = useState<AdminTab>("overview");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [overview, setOverview] = useState<OverviewPayload | null>(null);
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [identities, setIdentities] = useState<IdentityRow[]>([]);
    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [grants, setGrants] = useState<GrantRow[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<string>("");
    const [locationSetup, setLocationSetup] = useState<Record<string, unknown> | null>(null);
    const [testSend, setTestSend] = useState({ channel: "sms", to: "", body: "Alloy test message", identity_id: "" });
    const [testResult, setTestResult] = useState<string | null>(null);
    const [grantDraft, setGrantDraft] = useState({
        identity_id: "",
        user_id: "",
        can_send: true,
        can_override_default: false,
        can_use_across_locations: false,
    });

    const tabs = useMemo(
        () => [
            { key: "overview" as const, label: "Overview" },
            { key: "providers" as const, label: "Provider Accounts" },
            { key: "identities" as const, label: "Identities" },
            { key: "locations" as const, label: "Location Setup" },
            { key: "access" as const, label: "User Access" },
            { key: "legacy" as const, label: "Legacy Bindings" },
        ],
        []
    );

    const loadBase = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const [overviewRes, setupRes, grantsRes] = await Promise.all([
                fetch("/api/admin/communications/identity-platform/overview"),
                fetch("/api/admin/communications/identity-platform/location-setup"),
                fetch("/api/admin/communications/identity-platform/grants"),
            ]);
            const overviewJson = (await overviewRes.json()) as OverviewPayload & { error?: string };
            const setupJson = (await setupRes.json()) as {
                locations?: LocationRow[];
                identities?: IdentityRow[];
                provider_accounts?: ProviderRow[];
                error?: string;
            };
            const grantsJson = (await grantsRes.json()) as { grants?: GrantRow[]; error?: string };
            if (!overviewRes.ok) throw new Error(overviewJson.error ?? "Overview failed");
            if (!setupRes.ok) throw new Error(setupJson.error ?? "Setup failed");
            if (!grantsRes.ok) throw new Error(grantsJson.error ?? "Grants failed");
            setOverview(overviewJson);
            setLocations(setupJson.locations ?? []);
            setIdentities(setupJson.identities ?? []);
            setProviders(setupJson.provider_accounts ?? []);
            setGrants(grantsJson.grants ?? []);
            if (!selectedLocationId && setupJson.locations?.[0]?.id) {
                setSelectedLocationId(setupJson.locations[0].id);
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [selectedLocationId]);

    const loadLocationSetup = useCallback(async (locationId: string) => {
        if (!locationId) return;
        const res = await fetch(`/api/admin/communications/identity-platform/location-setup?location_id=${locationId}`);
        const json = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Location setup failed");
        setLocationSetup(json);
    }, []);

    useEffect(() => {
        void loadBase();
    }, [loadBase]);

    useEffect(() => {
        if (tab === "locations" && selectedLocationId) {
            void loadLocationSetup(selectedLocationId).catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
        }
    }, [tab, selectedLocationId, loadLocationSetup]);

    const bindIdentity = async (channel: "sms" | "email", identityId: string, isDefault: boolean) => {
        if (!selectedLocationId) return;
        setErr(null);
        const res = await fetch("/api/admin/communications/identity-platform/location-bindings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                location_id: selectedLocationId,
                identity_id: identityId,
                channel,
                is_default: isDefault,
            }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
            setErr(json.error ?? "Bind failed");
            return;
        }
        await loadLocationSetup(selectedLocationId);
        await loadBase();
    };

    const removeBinding = async (bindingId: string) => {
        if (!selectedLocationId) return;
        const res = await fetch(`/api/admin/communications/identity-platform/location-bindings?binding_id=${bindingId}`, {
            method: "DELETE",
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
            setErr(json.error ?? "Remove failed");
            return;
        }
        await loadLocationSetup(selectedLocationId);
        await loadBase();
    };

    const saveGrant = async () => {
        setErr(null);
        const res = await fetch("/api/admin/communications/identity-platform/grants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(grantDraft),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
            setErr(json.error ?? "Grant failed");
            return;
        }
        await loadBase();
    };

    const runTestSend = async () => {
        setTestResult(null);
        setErr(null);
        const res = await fetch("/api/admin/communications/identity-platform/test-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...testSend,
                location_id: selectedLocationId || undefined,
            }),
        });
        const json = (await res.json()) as { error?: string; ok?: boolean; communication_message_id?: string };
        if (!res.ok) {
            setTestResult(json.error ?? "Test send failed");
            return;
        }
        setTestResult(`Test sent — message ${json.communication_message_id ?? "queued"}`);
    };

    const smsSetup = (locationSetup?.sms ?? null) as {
        bindings?: Array<{ binding_id: string; identity_id: string; is_default: boolean; address?: string; display_name?: string }>;
        available_identities?: Array<{ id: string; address: string; display_name?: string }>;
    } | null;
    const emailSetup = (locationSetup?.email ?? null) as typeof smsSetup;

    return (
        <div className="flex min-h-0 flex-col gap-4" data-testid="communications-identity-admin">
            <SettingsEntityTabBar tabs={tabs} activeKey={tab} onSelect={setTab} aria-label="Communications identity administration" />
            {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div> : null}
            {loading && tab !== "legacy" ? <div className="text-xs text-alloy-midnight/45">Loading…</div> : null}

            {tab === "overview" && overview ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <SectionCard title="Coverage">
                        <ul className="space-y-1 text-xs text-alloy-midnight/75">
                            <li>{overview.summary.locations_with_sms} of {overview.summary.locations_total} locations have SMS configured</li>
                            <li>{overview.summary.locations_with_email} of {overview.summary.locations_total} locations have email configured</li>
                            <li>{overview.summary.sms_identities} SMS · {overview.summary.email_identities} email identities</li>
                            <li>{overview.summary.unverified_identities} unverified · {overview.summary.degraded_providers} degraded providers</li>
                        </ul>
                    </SectionCard>
                    <SectionCard title="Issues">
                        {overview.issues.length === 0 ? (
                            <p className="text-xs text-alloy-midnight/55">No configuration issues detected.</p>
                        ) : (
                            <ul className="space-y-2">
                                {overview.issues.map((issue) => (
                                    <li key={issue.code} className="rounded-lg border border-alloy-stone/15 px-2 py-1.5 text-xs">
                                        <div className="font-medium text-alloy-midnight">{issue.message}</div>
                                        <div className="text-alloy-midnight/45">{issue.code}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>
                    <SectionCard title="Default-grant policy">
                        <p className="text-xs leading-relaxed text-alloy-midnight/70">
                            Backfilled identities use <strong>open until restricted</strong> — users with{" "}
                            <code className="text-[10px]">communications.send</code> may send until explicit grants restrict access.
                            New identities default to <strong>explicit grants required</strong>.
                        </p>
                    </SectionCard>
                </div>
            ) : null}

            {tab === "providers" ? (
                <SectionCard title="Provider accounts">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-alloy-stone/15 text-alloy-midnight/50">
                                    <th className="py-2 pr-3">Provider</th>
                                    <th className="py-2 pr-3">Label</th>
                                    <th className="py-2 pr-3">Status</th>
                                    <th className="py-2 pr-3">Health</th>
                                    <th className="py-2">Identities</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providers.map((p) => (
                                    <tr key={p.id} className="border-b border-alloy-stone/10">
                                        <td className="py-2 pr-3 font-medium">{p.provider_type}</td>
                                        <td className="py-2 pr-3">{p.display_label ?? "—"}</td>
                                        <td className="py-2 pr-3">{statusPill(p.status, p.status === "active" ? "ok" : "warn")}</td>
                                        <td className="py-2 pr-3">{statusPill(p.health_status, p.health_status === "healthy" ? "ok" : "warn")}</td>
                                        <td className="py-2">{p.identity_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            ) : null}

            {tab === "identities" ? (
                <SectionCard title="Communication identities">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-alloy-stone/15 text-alloy-midnight/50">
                                    <th className="py-2 pr-3">Channel</th>
                                    <th className="py-2 pr-3">Address</th>
                                    <th className="py-2 pr-3">Status</th>
                                    <th className="py-2 pr-3">Access mode</th>
                                    <th className="py-2">Grants</th>
                                </tr>
                            </thead>
                            <tbody>
                                {identities.map((i) => (
                                    <tr key={i.id} className="border-b border-alloy-stone/10">
                                        <td className="py-2 pr-3 uppercase">{i.channel}</td>
                                        <td className="py-2 pr-3">
                                            <div className="font-medium">{i.display_name ?? i.canonical_address}</div>
                                            <div className="text-alloy-midnight/45">{i.canonical_address}</div>
                                        </td>
                                        <td className="py-2 pr-3">
                                            {statusPill(i.verification_state, i.verification_state === "verified" ? "ok" : "warn")}
                                        </td>
                                        <td className="py-2 pr-3">{i.default_access_mode.replace(/_/g, " ")}</td>
                                        <td className="py-2">{i.grant_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            ) : null}

            {tab === "locations" ? (
                <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                    <SectionCard title="Locations">
                        <ul className="space-y-1">
                            {locations.map((loc) => (
                                <li key={loc.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedLocationId(loc.id)}
                                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${selectedLocationId === loc.id ? "bg-alloy-juniper/10 font-medium text-alloy-juniper" : "hover:bg-alloy-stone/5"}`}
                                    >
                                        {loc.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                    <div className="grid gap-4">
                        {(["sms", "email"] as const).map((channel) => {
                            const setup = channel === "sms" ? smsSetup : emailSetup;
                            return (
                                <SectionCard key={channel} title={`${channel.toUpperCase()} setup`}>
                                    <div className="mb-3 space-y-2">
                                        {(setup?.bindings ?? []).map((b) => (
                                            <div key={b.binding_id} className="flex items-center justify-between rounded-lg border border-alloy-stone/15 px-2 py-1.5 text-xs">
                                                <div>
                                                    <div className="font-medium">{b.display_name ?? b.address}</div>
                                                    <div className="text-alloy-midnight/45">{b.address}{b.is_default ? " · default" : ""}</div>
                                                </div>
                                                <button type="button" className="text-red-600 hover:underline" onClick={() => void removeBinding(b.binding_id)}>
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(setup?.available_identities ?? []).map((a) => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                className="rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] hover:border-alloy-juniper/40"
                                                onClick={() => void bindIdentity(channel, a.id, (setup?.bindings ?? []).length === 0)}
                                            >
                                                Bind {a.display_name ?? a.address}
                                            </button>
                                        ))}
                                    </div>
                                </SectionCard>
                            );
                        })}
                        <SectionCard title="Test send">
                            <div className="grid gap-2 md:grid-cols-2">
                                <select
                                    className="rounded-md border border-alloy-stone/20 px-2 py-1 text-xs"
                                    value={testSend.channel}
                                    onChange={(e) => setTestSend((s) => ({ ...s, channel: e.target.value }))}
                                >
                                    <option value="sms">SMS</option>
                                    <option value="email">Email</option>
                                </select>
                                <input
                                    className="rounded-md border border-alloy-stone/20 px-2 py-1 text-xs"
                                    placeholder="Destination"
                                    value={testSend.to}
                                    onChange={(e) => setTestSend((s) => ({ ...s, to: e.target.value }))}
                                />
                                <textarea
                                    className="md:col-span-2 rounded-md border border-alloy-stone/20 px-2 py-1 text-xs"
                                    rows={2}
                                    value={testSend.body}
                                    onChange={(e) => setTestSend((s) => ({ ...s, body: e.target.value }))}
                                />
                                <button type="button" className="rounded-md bg-alloy-juniper px-3 py-1.5 text-xs font-medium text-white" onClick={() => void runTestSend()}>
                                    Send test
                                </button>
                            </div>
                            {testResult ? <p className="mt-2 text-xs text-alloy-midnight/70">{testResult}</p> : null}
                            <p className="mt-2 text-[10px] text-alloy-midnight/45">Test sends are marked in audit metadata and use the canonical resolver.</p>
                        </SectionCard>
                    </div>
                </div>
            ) : null}

            {tab === "access" ? (
                <div className="grid gap-4">
                    <SectionCard title="Grant identity access">
                        <p className="mb-3 text-xs text-alloy-midnight/60">
                            When no explicit grants exist on an identity with open-until-restricted mode, any user with communications.send may use it.
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                            <select
                                className="rounded-md border border-alloy-stone/20 px-2 py-1 text-xs"
                                value={grantDraft.identity_id}
                                onChange={(e) => setGrantDraft((g) => ({ ...g, identity_id: e.target.value }))}
                            >
                                <option value="">Select identity</option>
                                {identities.map((i) => (
                                    <option key={i.id} value={i.id}>{i.display_name ?? i.canonical_address}</option>
                                ))}
                            </select>
                            <input
                                className="rounded-md border border-alloy-stone/20 px-2 py-1 text-xs"
                                placeholder="User UUID"
                                value={grantDraft.user_id}
                                onChange={(e) => setGrantDraft((g) => ({ ...g, user_id: e.target.value }))}
                            />
                            <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={grantDraft.can_send} onChange={(e) => setGrantDraft((g) => ({ ...g, can_send: e.target.checked }))} />
                                Can send
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={grantDraft.can_override_default} onChange={(e) => setGrantDraft((g) => ({ ...g, can_override_default: e.target.checked }))} />
                                Can override default
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={grantDraft.can_use_across_locations} onChange={(e) => setGrantDraft((g) => ({ ...g, can_use_across_locations: e.target.checked }))} />
                                Cross-location
                            </label>
                            <button type="button" className="rounded-md bg-alloy-juniper px-3 py-1.5 text-xs font-medium text-white" onClick={() => void saveGrant()}>
                                Save grant
                            </button>
                        </div>
                    </SectionCard>
                    <SectionCard title="Active grants">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-alloy-stone/15 text-alloy-midnight/50">
                                        <th className="py-2 pr-3">User</th>
                                        <th className="py-2 pr-3">Identity</th>
                                        <th className="py-2 pr-3">Send</th>
                                        <th className="py-2">Override</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grants.map((g) => {
                                        const ident = identities.find((i) => i.id === g.identity_id);
                                        return (
                                            <tr key={g.id} className="border-b border-alloy-stone/10">
                                                <td className="py-2 pr-3 font-mono text-[10px]">{g.user_id}</td>
                                                <td className="py-2 pr-3">{ident?.display_name ?? ident?.canonical_address ?? g.identity_id}</td>
                                                <td className="py-2 pr-3">{g.can_send ? "Yes" : "No"}</td>
                                                <td className="py-2">{g.can_override_default ? "Yes" : "No"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>
            ) : null}

            {tab === "legacy" ? <CommunicationsSetupClient /> : null}
        </div>
    );
}
