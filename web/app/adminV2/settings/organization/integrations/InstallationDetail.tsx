"use client";

/**
 * One Installation — the Configuration Object.
 *
 * ── THE SECRET RULE ──
 *
 * A revealed secret lives in React state for exactly as long as the operator is
 * looking at it. It is never written to localStorage, sessionStorage, a cookie or
 * any client cache, and dismissing it drops it from state — after which it cannot
 * be read back from anywhere, because the server kept only a hash. That is the
 * whole contract, and it is why "Done" is destructive rather than decorative.
 */

import { useCallback, useEffect, useState } from "react";

type Capability = { scope: string; title: string; detail: string; access: "read" | "write"; recognised: boolean };

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
    credential: {
        id: string;
        lastFour: string | null;
        createdAt: string | null;
        lastUsedAt: string | null;
        rotationOverlapUntil: string | null;
        status: "active" | "rotating" | "revoked";
    } | null;
    health: { state: string; reasons: string[] };
    lastActivityAt: string | null;
    recentRequests: number;
    recentFailures: number;
};

type ActivityEntry = {
    occurredAt: string;
    operation: string | null;
    method: string | null;
    route: string | null;
    statusCode: number | null;
    latencyMs: number | null;
    requestId: string | null;
};

type Revealed = { secret: string; clientId?: string; overlapUntil?: string; kind: "issued" | "rotated" };

const HEALTH_COPY: Record<string, string> = {
    healthy: "Healthy",
    needs_attention: "Needs attention",
    inactive: "Inactive",
    no_recent_activity: "No recent activity",
};

export default function InstallationDetail({
    installation,
    onBack,
    onChanged,
}: {
    installation: Installation;
    onBack: () => void;
    onChanged: () => Promise<void> | void;
}) {
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [filter, setFilter] = useState<"all" | "success" | "failure">("all");
    const [revealed, setRevealed] = useState<Revealed | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadActivity = useCallback(async () => {
        const res = await fetch(
            `/api/admin/integrations/installations/${installation.id}/activity?filter=${filter}`,
            { cache: "no-store" },
        );
        if (!res.ok) { setActivity([]); return; }
        const body = (await res.json()) as { entries: ActivityEntry[] };
        setActivity(body.entries);
    }, [installation.id, filter]);

    useEffect(() => { void loadActivity(); }, [loadActivity]);

    /*
     * The reveal is dropped whenever this component goes away. A secret that
     * survives navigation is a secret that outlived the operator's attention.
     */
    useEffect(() => () => setRevealed(null), []);

    const act = useCallback(async (fn: () => Promise<Response>, ok: string) => {
        setBusy(true); setMessage(null);
        try {
            const res = await fn();
            const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) { setMessage(String(body.error ?? "That did not work.")); return null; }
            setMessage(ok);
            await onChanged();
            return body;
        } finally { setBusy(false); }
    }, [onChanged]);

    const issue = () => act(
        () => fetch(`/api/admin/integrations/installations/${installation.id}/credentials`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
        }),
        "Credential issued.",
    ).then((b) => {
        if (b?.clientSecret) setRevealed({ secret: String(b.clientSecret), clientId: String(b.clientId ?? ""), kind: "issued" });
    });

    const rotate = () => {
        if (!installation.credential) return;
        void act(
            () => fetch(`/api/admin/integrations/installations/${installation.id}/credentials/${installation.credential!.id}`, { method: "POST" }),
            "Credential rotated.",
        ).then((b) => {
            if (b?.clientSecret) {
                setRevealed({
                    secret: String(b.clientSecret),
                    overlapUntil: String(b.previousSecretValidUntil ?? ""),
                    kind: "rotated",
                });
            }
        });
    };

    const revoke = () => {
        if (!installation.credential) return;
        if (!window.confirm("Revoke this credential? Token exchange stops immediately and any integration using it will stop working.")) return;
        void act(
            () => fetch(`/api/admin/integrations/installations/${installation.id}/credentials/${installation.credential!.id}`, { method: "DELETE" }),
            "Credential revoked.",
        );
    };

    const setState = (state: "active" | "suspended" | "revoked") => {
        if (state === "revoked" && !window.confirm("Disconnect this integration? Its access stops immediately.")) return;
        void act(
            () => fetch(`/api/admin/integrations/installations/${installation.id}`, {
                method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }),
            }),
            state === "active" ? "Integration reactivated." : state === "suspended" ? "Integration suspended." : "Integration disconnected.",
        );
    };

    return (
        <div className="p-6" data-testid={`installation-detail-${installation.id}`}>
            <button type="button" onClick={onBack} className="text-xs underline" data-testid="installation-back">
                Back to Integrations
            </button>

            <header className="mt-3">
                <h1 className="text-lg font-medium">{installation.applicationName}</h1>
                <p className="mt-1 text-sm opacity-75">
                    {installation.state === "active" ? "Active" : installation.state === "suspended" ? "Suspended" : "Disconnected"}
                    {" · "}
                    <span data-testid="installation-health">{HEALTH_COPY[installation.health.state] ?? installation.health.state}</span>
                    {installation.publisher ? ` · ${installation.publisher}` : ""}
                </p>
                {installation.health.reasons.length > 0 && (
                    <ul className="mt-1 text-xs opacity-65" data-testid="installation-health-reasons">
                        {installation.health.reasons.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}
                    </ul>
                )}
            </header>

            {message && <p className="mt-3 rounded border p-2 text-sm" data-testid="installation-message">{message}</p>}

            {revealed && <SecretReveal revealed={revealed} onDismiss={() => setRevealed(null)} />}

            <section className="mt-5" data-testid="installation-access">
                <h2 className="text-sm font-medium">Access</h2>
                <p className="mt-1 text-sm">
                    {installation.boundaryMode === "org_wide"
                        ? "All locations"
                        : installation.locationCount === 0
                            ? "No locations — this integration can reach nothing"
                            : `${installation.locationCount} selected location${installation.locationCount === 1 ? "" : "s"}`}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                    {installation.capabilities.length === 0 && <li className="text-sm opacity-70">No capabilities granted.</li>}
                    {installation.capabilities.map((c) => (
                        <li key={c.scope} className="text-sm" data-testid={`capability-${c.scope}`}>
                            <span className="font-medium">{c.title}</span>
                            <span className="opacity-75"> — {c.detail}</span>
                            {!c.recognised && <span className="opacity-70"> (not recognised by this version of Alloy)</span>}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-5" data-testid="installation-credentials">
                <h2 className="text-sm font-medium">Credentials</h2>
                {installation.credential ? (
                    <p className="mt-1 text-sm">
                        {installation.credential.status === "revoked" ? "Revoked" : installation.credential.status === "rotating" ? "Rotating" : "Active"}
                        {installation.credential.lastFour ? ` · ends ${installation.credential.lastFour}` : ""}
                        {installation.credential.lastUsedAt ? ` · last used ${installation.credential.lastUsedAt.slice(0, 10)}` : " · never used"}
                        {installation.credential.rotationOverlapUntil
                            ? ` · previous secret accepted until ${installation.credential.rotationOverlapUntil.slice(0, 16).replace("T", " ")}`
                            : ""}
                    </p>
                ) : <p className="mt-1 text-sm opacity-75">No credential issued.</p>}

                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void issue()} data-testid="credential-issue" className="rounded border px-2 py-1 text-xs">
                        Issue credential
                    </button>
                    <button type="button" disabled={busy || !installation.credential} onClick={rotate} data-testid="credential-rotate" className="rounded border px-2 py-1 text-xs">
                        Rotate
                    </button>
                    <button type="button" disabled={busy || !installation.credential} onClick={revoke} data-testid="credential-revoke" className="rounded border px-2 py-1 text-xs">
                        Revoke
                    </button>
                </div>
            </section>

            <section className="mt-5" data-testid="installation-state-controls">
                <h2 className="text-sm font-medium">State</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                    {installation.state !== "active" && installation.state !== "revoked" && (
                        <button type="button" disabled={busy} onClick={() => setState("active")} data-testid="installation-reactivate" className="rounded border px-2 py-1 text-xs">
                            Reactivate
                        </button>
                    )}
                    {installation.state === "active" && (
                        <button type="button" disabled={busy} onClick={() => setState("suspended")} data-testid="installation-suspend" className="rounded border px-2 py-1 text-xs">
                            Suspend
                        </button>
                    )}
                    {installation.state !== "revoked" && (
                        <button type="button" disabled={busy} onClick={() => setState("revoked")} data-testid="installation-disconnect" className="rounded border px-2 py-1 text-xs">
                            Disconnect
                        </button>
                    )}
                </div>
            </section>

            <section className="mt-5" data-testid="installation-activity">
                <h2 className="text-sm font-medium">Activity</h2>
                <div className="mt-1 flex gap-2 text-xs">
                    {(["all", "success", "failure"] as const).map((f) => (
                        <button key={f} type="button" onClick={() => setFilter(f)} data-testid={`activity-filter-${f}`}
                            className={`rounded border px-2 py-0.5 ${filter === f ? "font-medium" : "opacity-70"}`}>
                            {f}
                        </button>
                    ))}
                </div>
                {activity.length === 0 ? (
                    <p className="mt-2 text-sm opacity-70">No requests recorded.</p>
                ) : (
                    <table className="mt-2 w-full text-xs">
                        <thead>
                            <tr className="text-left opacity-70">
                                <th className="py-1">When</th><th>Operation</th><th>Result</th><th>Latency</th><th>Request ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activity.map((a) => (
                                <tr key={`${a.requestId}-${a.occurredAt}`} data-testid="activity-row">
                                    <td className="py-1">{a.occurredAt.slice(0, 19).replace("T", " ")}</td>
                                    <td>{a.operation ?? `${a.method ?? ""} ${a.route ?? ""}`.trim()}</td>
                                    <td>{a.statusCode ?? "—"}</td>
                                    <td>{a.latencyMs == null ? "—" : `${a.latencyMs} ms`}</td>
                                    <td className="opacity-70">{a.requestId ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <details className="mt-5" data-testid="installation-developer-details">
                <summary className="cursor-pointer text-sm font-medium">Developer details</summary>
                <dl className="mt-2 text-xs">
                    <dt className="opacity-70">Application ID</dt><dd className="mb-1">{installation.applicationId}</dd>
                    <dt className="opacity-70">Installation ID</dt><dd className="mb-1">{installation.id}</dd>
                    <dt className="opacity-70">Public scopes</dt>
                    <dd className="mb-1">{installation.grantedScopes.join(", ") || "none"}</dd>
                </dl>
                <a className="text-xs underline" href="/organization/integrations/documentation" data-testid="developer-documentation-link">
                    Developer documentation
                </a>
            </details>
        </div>
    );
}

/**
 * The one and only time a secret is visible.
 *
 * Deliberately not persisted anywhere: no storage API is touched, and dismissing
 * removes it from state. There is no server endpoint that could show it again.
 */
function SecretReveal({ revealed, onDismiss }: { revealed: Revealed; onDismiss: () => void }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-4 rounded border p-3" data-testid="credential-secret-reveal">
            <p className="text-sm font-medium">
                {revealed.kind === "rotated" ? "New secret" : "Client secret"} — shown once
            </p>
            <p className="mt-1 text-xs opacity-75">
                Copy it now. Alloy stores only a hash, so this value cannot be shown again. If it is
                lost, rotate the credential to issue a new one.
            </p>
            {revealed.clientId && (
                <p className="mt-2 text-xs"><span className="opacity-70">Client ID: </span>{revealed.clientId}</p>
            )}
            <code className="mt-2 block break-all rounded bg-black/5 p-2 text-xs" data-testid="credential-secret-value">
                {revealed.secret}
            </code>
            {revealed.overlapUntil && (
                <p className="mt-2 text-xs" data-testid="credential-rotation-overlap">
                    The previous secret keeps working until {revealed.overlapUntil.slice(0, 16).replace("T", " ")}.
                    Deploy this one before then.
                </p>
            )}
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    data-testid="credential-secret-copy"
                    onClick={() => {
                        void navigator.clipboard?.writeText(revealed.secret).then(() => setCopied(true)).catch(() => setCopied(false));
                    }}
                >
                    {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" data-testid="credential-secret-dismiss" onClick={onDismiss}>
                    Done
                </button>
            </div>
        </div>
    );
}
