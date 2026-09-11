"use client";

/**
 * Organization → Integrations.
 *
 * The operator question this page exists to answer, in this order:
 *
 *     What is connected — what can it access — is it working?
 *
 * Everything shown is server-derived. The client renders state; it never computes
 * authorization, never decides health, and never holds a secret beyond the single
 * render that reveals it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import InstallationDetail from "./InstallationDetail";

type Capability = { scope: string; title: string; detail: string; access: "read" | "write"; recognised: boolean };

type Credential = {
    id: string;
    lastFour: string | null;
    createdAt: string | null;
    lastUsedAt: string | null;
    rotationOverlapUntil: string | null;
    status: "active" | "rotating" | "revoked";
};

type Installation = {
    id: string;
    applicationName: string;
    applicationId: string;
    publisher: string | null;
    state: "active" | "suspended" | "revoked";
    boundaryMode: "org_wide" | "locations";
    locationCount: number;
    grantedScopes: string[];
    capabilities: Capability[];
    credential: Credential | null;
    health: { state: string; reasons: string[] };
    lastActivityAt: string | null;
    recentRequests: number;
    recentFailures: number;
};

const HEALTH_COPY: Record<string, string> = {
    healthy: "Healthy",
    needs_attention: "Needs attention",
    inactive: "Inactive",
    no_recent_activity: "No recent activity",
};

const STATE_COPY: Record<Installation["state"], string> = {
    active: "Active",
    suspended: "Suspended",
    revoked: "Disconnected",
};

function accessSummary(i: Installation): string {
    if (i.boundaryMode === "org_wide") return "All locations";
    if (i.locationCount === 0) return "No locations — this integration can reach nothing";
    return `${i.locationCount} selected location${i.locationCount === 1 ? "" : "s"}`;
}

export default function IntegrationsClient() {
    const [installations, setInstallations] = useState<Installation[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        const res = await fetch("/api/admin/integrations/installations", { cache: "no-store" });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            // A read-only or unauthorized operator is told plainly, not shown an
            // empty page that implies nothing is connected.
            setError(body.error ?? "Integrations could not be loaded.");
            setInstallations([]);
            return;
        }
        const body = (await res.json()) as { installations: Installation[] };
        setInstallations(body.installations);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const current = useMemo(
        () => installations?.find((i) => i.id === selected) ?? null,
        [installations, selected],
    );

    if (installations === null) {
        return <div className="p-6 text-sm opacity-70" data-testid="integrations-loading">Loading integrations…</div>;
    }

    if (error) {
        return (
            <div className="p-6" data-testid="integrations-error">
                <h1 className="text-lg font-medium">Integrations</h1>
                <p className="mt-2 text-sm opacity-80">{error}</p>
            </div>
        );
    }

    if (current) {
        return <InstallationDetail installation={current} onBack={() => setSelected(null)} onChanged={load} />;
    }

    return (
        <div className="p-6" data-testid="organization-integrations">
            <header className="mb-4">
                <h1 className="text-lg font-medium">Integrations</h1>
                <p className="mt-1 text-sm opacity-75">
                    Approved external software, and exactly what it may access.
                </p>
            </header>

            {installations.length === 0 ? <EmptyState /> : (
                <ul className="flex flex-col gap-2" data-testid="integrations-list">
                    {installations.map((i) => (
                        <li key={i.id}>
                            <button
                                type="button"
                                onClick={() => setSelected(i.id)}
                                data-testid={`integration-row-${i.id}`}
                                className="w-full rounded border p-3 text-left"
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-medium">{i.applicationName}</span>
                                    <span className="text-xs opacity-70" data-testid={`integration-state-${i.id}`}>
                                        {STATE_COPY[i.state]} · {HEALTH_COPY[i.health.state] ?? i.health.state}
                                    </span>
                                </div>
                                <div className="mt-1 text-xs opacity-75">
                                    {accessSummary(i)} · {i.capabilities.length === 0
                                        ? "No capabilities granted"
                                        : i.capabilities.map((c) => c.title).join(", ")}
                                </div>
                                <div className="mt-1 text-xs opacity-60">
                                    {i.credential
                                        ? `Credential ${i.credential.status}`
                                        : "No credential issued"}
                                    {" · "}
                                    {i.lastActivityAt
                                        ? `${i.recentRequests} request${i.recentRequests === 1 ? "" : "s"} in the last 7 days`
                                        : "No requests in the last 7 days"}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * Nothing connected yet.
 *
 * Explains what an integration IS rather than showing a catalogue of software
 * Alloy cannot actually connect to. No placeholder provider appears here.
 */
function EmptyState() {
    return (
        <div className="rounded border p-6" data-testid="integrations-empty-state">
            <p className="text-sm">
                Integrations connect approved external software to Alloy using explicitly granted access.
            </p>
            <p className="mt-2 text-xs opacity-70">
                Each integration is granted its own capabilities and its own locations, and can be
                suspended or disconnected at any time.
            </p>
        </div>
    );
}
