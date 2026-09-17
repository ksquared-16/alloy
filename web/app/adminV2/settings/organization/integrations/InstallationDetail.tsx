"use client";

/**
 * One Installation — the Configuration Object, and the place an operator runs this connection from.
 *
 * ── THE SECRET RULE ──
 *
 * A revealed secret lives in React state for exactly as long as the operator is
 * looking at it. It is never written to localStorage, sessionStorage, a cookie or
 * any client cache, and dismissing it drops it from state — after which it cannot
 * be read back from anywhere, because the server kept only a hash. That is the
 * whole contract, and it is why "Done" is destructive rather than decorative.
 *
 * ── WHAT THE LAYOUT IS FOR ──
 *
 * The header answers "what is this, and is it working". Then four cards, in the order the questions
 * get asked: what it may reach, what it authenticates with, what it has been doing, and how to stop
 * it. Developer identifiers are real and occasionally necessary, so they stay — folded away at the
 * bottom, where they cannot compete with the operator's own reading of the page.
 */

import {
    Activity as ActivityIcon,
    ArrowLeft,
    BookOpen,
    ChevronRight,
    KeyRound,
    PauseCircle,
    PlayCircle,
    Plug,
    PlugZap,
    ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

import { CapabilityEditor, LocationAccessEditor } from "./AccessEditor";
import { CredentialSecretDialog, type RevealedCredential } from "./CredentialSecretDialog";
import {
    accessSummary,
    Badge,
    formatTimestamp,
    HealthBadge,
    HEALTH_COPY,
    StateBadge,
    type Installation,
} from "./presentation";

type ActivityEntry = {
    occurredAt: string;
    operation: string | null;
    method: string | null;
    route: string | null;
    statusCode: number | null;
    latencyMs: number | null;
    requestId: string | null;
};

const ACTIVITY_FILTERS = [
    { key: "all", label: "All" },
    { key: "success", label: "Success" },
    { key: "failure", label: "Failure" },
] as const;

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
    const [revealed, setRevealed] = useState<RevealedCredential | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [editing, setEditing] = useState<"none" | "locations" | "capabilities">("none");

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


    /*
     * Mirrors the server's own predicate in `integrationsService`: active means NOT revoked.
     * A revoked credential is still returned so the surface can name it; it is not actionable.
     */
    const credentialIsActive =
        installation.credential != null && installation.credential.status !== "revoked";

    /*
     * Which control leads is a PRESENTATION choice and is computed here, away from the buttons.
     *
     * The buttons' own lines say one thing each — what gates them — because a source-level lock
     * reads those lines to prove Issue is never gated on having a credential. Mixing a styling
     * ternary into that line makes the gate unreadable to a reader and to the lock alike.
     */
    const issueClass = credentialIsActive ? "config-secondary-btn config-secondary-btn--sm" : "config-primary-btn config-primary-btn--sm";
    const rotateClass = credentialIsActive ? "config-primary-btn config-primary-btn--sm" : "config-secondary-btn config-secondary-btn--sm";

    /*
     * One attention condition, chosen deliberately. An operator who sees three warnings acts on
     * none of them, so the header states the single thing standing between this connection and
     * working — and the cards below carry the rest.
     */
    const attention =
        installation.state === "revoked" ? "This integration is disconnected. Its access has stopped."
        : installation.state === "suspended" ? "This integration is suspended. Token exchange is refused until it is reactivated."
        : !credentialIsActive ? "No active credential. This integration cannot authenticate until one is issued."
        : installation.boundaryMode === "locations" && installation.locationCount === 0 ?
            "No locations are selected, so this integration can reach nothing."
        : installation.capabilities.length === 0 ? "No capabilities are granted, so this integration can read nothing."
        : installation.health.state === "needs_attention" ?
            `Needs attention — ${installation.health.reasons.map((r) => r.replace(/_/g, " ")).join(", ") || HEALTH_COPY.needs_attention}`
        : null;

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid={`installation-detail-${installation.id}`}>
            <ConfigurationContext
                eyebrow="Integrations"
                title={installation.applicationName}
                subtitle={installation.publisher ?? undefined}
                titleIcon={<Plug className="h-5 w-5" strokeWidth={2} />}
                testId="installation-context"
                actions={
                    <span className="flex flex-wrap items-center gap-1.5">
                        {installation.state === "suspended" && (
                            <button type="button" disabled={busy} onClick={() => setState("active")} data-testid="installation-reactivate" className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1.5">
                                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                                Reactivate
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onBack}
                            data-testid="installation-back"
                            className="config-secondary-btn config-secondary-btn--sm inline-flex items-center gap-1.5"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                            All integrations
                        </button>
                    </span>
                }
            >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-alloy-stone/25 pt-2">
                    <StateBadge state={installation.state} />
                    <HealthBadge health={installation.health.state} testId="installation-health" />
                    <span className="text-[11px] text-alloy-midnight/52">{accessSummary(installation)}</span>
                    {attention && (
                        <span className="text-[11px] font-medium text-alloy-ember" data-testid="installation-attention">
                            {attention}
                        </span>
                    )}
                </div>
                {installation.health.reasons.length > 0 && (
                    <ul className="sr-only" data-testid="installation-health-reasons">
                        {installation.health.reasons.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}
                    </ul>
                )}
            </ConfigurationContext>

            <ConfigurationShell testId="installation-shell">
                <main className="mx-auto min-w-0 max-w-[1100px] space-y-2.5 pb-4" data-testid="installation-workspace">
                    {message && (
                        <p
                            className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] px-3 py-2 text-[12px] font-medium text-alloy-midnight"
                            data-testid="installation-message"
                        >
                            {message}
                        </p>
                    )}

                    <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                        {/* ── ACCESS ───────────────────────────────────────────────────────── */}
                        <ConfigWorkspaceCard compact testId="installation-access" className="h-full">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="h-3.5 w-3.5 text-[#007d68]" aria-hidden />
                                    <h2 className="config-typo-workspace-title">Access</h2>
                                </span>
                                <span className="flex gap-1.5">
                                    <button type="button" className="config-secondary-btn config-secondary-btn--sm" data-testid="edit-capabilities"
                                        onClick={() => setEditing(editing === "capabilities" ? "none" : "capabilities")}>
                                        {editing === "capabilities" ? "Close" : "Edit capabilities"}
                                    </button>
                                    <button type="button" className="config-secondary-btn config-secondary-btn--sm" data-testid="edit-locations"
                                        onClick={() => setEditing(editing === "locations" ? "none" : "locations")}>
                                        {editing === "locations" ? "Close" : "Edit locations"}
                                    </button>
                                </span>
                            </div>

                            {/*
                              * Capabilities and boundary are different questions, and the operator needs
                              * their COMBINED effect. This sentence is that effect, said once, in front
                              * of the two lists that produce it.
                              */}
                            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-alloy-midnight/80" data-testid="access-effective-summary">
                                {installation.capabilities.length === 0 ?
                                    "This integration has no capabilities, so it can read nothing regardless of its locations."
                                : installation.boundaryMode === "locations" && installation.locationCount === 0 ?
                                    "This integration has capabilities but no locations, so it can reach nothing."
                                :   <>
                                        Can {installation.capabilities.map((c) => c.title.toLowerCase()).join(", ")}
                                        {" across "}
                                        <strong className="font-semibold text-alloy-midnight">
                                            {accessSummary(installation).toLowerCase()}
                                        </strong>.
                                    </>
                                }
                            </p>

                            {editing === "locations" && (
                                <LocationAccessEditor
                                    installationId={installation.id}
                                    boundaryMode={installation.boundaryMode}
                                    selectedLocationIds={installation.locationIds}
                                    onCancel={() => setEditing("none")}
                                    onSaved={async () => { setEditing("none"); setMessage("Access updated."); await onChanged(); }}
                                />
                            )}
                            {editing === "capabilities" && (
                                <CapabilityEditor
                                    installationId={installation.id}
                                    grantedScopes={installation.grantedScopes}
                                    onCancel={() => setEditing("none")}
                                    onSaved={async () => { setEditing("none"); setMessage("Capabilities updated."); await onChanged(); }}
                                />
                            )}

                            <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                                Capabilities
                            </p>
                            <ul className="mt-1 flex flex-col gap-1.5">
                                {installation.capabilities.length === 0 && (
                                    <li className="text-[12px] text-alloy-midnight/55">No capabilities granted.</li>
                                )}
                                {installation.capabilities.map((c) => (
                                    <li
                                        key={c.scope}
                                        className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.35] px-2.5 py-1.5"
                                        data-testid={`capability-${c.scope}`}
                                    >
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[12.5px] font-semibold text-alloy-midnight">{c.title}</span>
                                            <Badge tone={c.access === "write" ? "neutral" : "muted"}>
                                                {c.access === "write" ? "Can make changes" : "Read only"}
                                            </Badge>
                                            {!c.recognised && <Badge tone="attention">Not recognised</Badge>}
                                        </span>
                                        <span className="mt-0.5 block text-[11.5px] leading-[1.55] text-alloy-midnight/62">{c.detail}</span>
                                    </li>
                                ))}
                            </ul>

                            <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                                Where it applies
                            </p>
                            <p className="mt-1 text-[12.5px] text-alloy-midnight/80">{accessSummary(installation)}</p>
                        </ConfigWorkspaceCard>

                        {/* ── CREDENTIALS ──────────────────────────────────────────────────── */}
                        <ConfigWorkspaceCard compact testId="installation-credentials" className="h-full">
                            <span className="flex items-center gap-1.5">
                                <KeyRound className="h-3.5 w-3.5 text-[#007d68]" aria-hidden />
                                <h2 className="config-typo-workspace-title">Credentials</h2>
                            </span>

                            {installation.credential ?
                                <div className="mt-1.5 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.35] px-2.5 py-2">
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <Badge tone={credentialIsActive ? "positive" : "muted"}>
                                            {installation.credential.status === "revoked" ? "Revoked"
                                            : installation.credential.status === "rotating" ? "Rotating"
                                            : "Active"}
                                        </Badge>
                                        {installation.credential.lastFour && (
                                            <span className="font-mono text-[11.5px] text-alloy-midnight/70">
                                                ends {installation.credential.lastFour}
                                            </span>
                                        )}
                                    </span>
                                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                                        <dt className="text-alloy-midnight/45">Issued</dt>
                                        <dd className="text-alloy-midnight/80">{formatTimestamp(installation.credential.createdAt)}</dd>
                                        <dt className="text-alloy-midnight/45">Last used</dt>
                                        <dd className="text-alloy-midnight/80">
                                            {installation.credential.lastUsedAt ? formatTimestamp(installation.credential.lastUsedAt) : "Never used"}
                                        </dd>
                                        {installation.credential.rotationOverlapUntil && (
                                            <>
                                                <dt className="text-alloy-midnight/45">Previous secret until</dt>
                                                <dd className="text-alloy-midnight/80">
                                                    {formatTimestamp(installation.credential.rotationOverlapUntil)}
                                                </dd>
                                            </>
                                        )}
                                    </dl>
                                </div>
                            :   <p className="mt-1.5 rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/30 px-2.5 py-2 text-[12.5px] text-alloy-midnight/70">
                                    No credential issued. Issue one to let this integration authenticate — the
                                    secret is shown once and cannot be retrieved afterwards.
                                </p>
                            }

                            {/*
                              * Hierarchy follows the state. With no active credential, Issue is the one
                              * thing to do and is drawn as such; with one, Issue steps back and Rotate
                              * leads. Revoke is never primary.
                              */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <button type="button" disabled={busy} onClick={() => void issue()} data-testid="credential-issue" className={issueClass}>
                                    Issue credential
                                </button>
                                {/*
                                  * Rotate and Revoke need an ACTIVE credential, not merely a credential.
                                  *
                                  * A revoked credential is still returned — deliberately, so the surface can say
                                  * "Revoked · ends zXZ4" rather than forget it ever existed. Gating on presence
                                  * therefore left both controls live after a revoke, offering the operator two
                                  * actions that cannot succeed. Mounted certification pressed Rotate in exactly
                                  * that state: the server refused with `credential_not_active` and nothing was
                                  * resurrected, so this was never a security hole — it was a dead control that
                                  * spent a round trip to say no.
                                  *
                                  * `rotating` stays actionable: that is an active credential inside its overlap
                                  * window, not a retired one.
                                  */}
                                <button type="button" disabled={busy || !credentialIsActive} onClick={rotate} data-testid="credential-rotate" className={rotateClass}>
                                    Rotate
                                </button>
                                <button type="button" disabled={busy || !credentialIsActive} onClick={revoke} data-testid="credential-revoke" className="config-secondary-btn config-secondary-btn--sm text-alloy-ember">
                                    Revoke
                                </button>
                            </div>
                        </ConfigWorkspaceCard>
                    </div>

                    {/* ── ACTIVITY ─────────────────────────────────────────────────────────── */}
                    <ConfigWorkspaceCard compact testId="installation-activity">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                                <ActivityIcon className="h-3.5 w-3.5 text-[#007d68]" aria-hidden />
                                <h2 className="config-typo-workspace-title">API activity</h2>
                            </span>
                            <span className="inline-flex rounded-lg border border-alloy-forge/12 bg-alloy-stone/50 p-0.5" role="group" aria-label="Filter activity">
                                {ACTIVITY_FILTERS.map((f) => (
                                    <button
                                        key={f.key}
                                        type="button"
                                        onClick={() => setFilter(f.key)}
                                        data-testid={`activity-filter-${f.key}`}
                                        aria-pressed={filter === f.key}
                                        className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold transition ${
                                            filter === f.key ?
                                                "bg-white text-alloy-midnight shadow-[0_1px_2px_rgba(19,33,43,0.08)]"
                                            :   "text-alloy-midnight/55 hover:text-alloy-midnight"
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </span>
                        </div>

                        {activity.length === 0 ?
                            <p className="mt-2 rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/30 px-3 py-4 text-center text-[12px] text-alloy-midnight/60">
                                {filter === "all" ?
                                    "No API requests recorded for this integration yet. Requests appear here once it starts calling Alloy."
                                : filter === "failure" ?
                                    "No failed requests. That is the result you want."
                                :   "No successful requests recorded."}
                            </p>
                        :   <div className="mt-2 overflow-x-auto">
                                <table className="w-full border-collapse text-[11.5px]">
                                    <thead>
                                        <tr className="text-left text-[9px] uppercase tracking-[0.1em] text-alloy-midnight/40">
                                            <th className="border-b border-alloy-stone/60 py-1 pr-3 font-semibold">When</th>
                                            <th className="border-b border-alloy-stone/60 py-1 pr-3 font-semibold">Operation</th>
                                            <th className="border-b border-alloy-stone/60 py-1 pr-3 font-semibold">Result</th>
                                            <th className="border-b border-alloy-stone/60 py-1 pr-3 font-semibold">Latency</th>
                                            <th className="border-b border-alloy-stone/60 py-1 font-semibold">Request ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activity.map((a) => {
                                            const failed = a.statusCode != null && a.statusCode >= 400;
                                            return (
                                                <tr key={`${a.requestId}-${a.occurredAt}`} data-testid="activity-row" className="border-b border-alloy-stone/40 last:border-0">
                                                    <td className="py-1 pr-3 text-alloy-midnight/70">{a.occurredAt.slice(0, 19).replace("T", " ")}</td>
                                                    <td className="py-1 pr-3 font-medium text-alloy-midnight">
                                                        {a.operation ?? `${a.method ?? ""} ${a.route ?? ""}`.trim()}
                                                    </td>
                                                    <td className="py-1 pr-3">
                                                        <Badge tone={failed ? "attention" : "positive"}>{a.statusCode ?? "—"}</Badge>
                                                    </td>
                                                    <td className="py-1 pr-3 text-alloy-midnight/70">{a.latencyMs == null ? "—" : `${a.latencyMs} ms`}</td>
                                                    <td className="py-1 font-mono text-[10.5px] text-alloy-midnight/45">{a.requestId ?? "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        }
                    </ConfigWorkspaceCard>

                    <div className="grid items-start gap-2.5 xl:grid-cols-2">
                        {/* ── CONNECTION ───────────────────────────────────────────────────── */}
                        <ConfigWorkspaceCard compact testId="installation-state-controls" className="h-full">
                            <span className="flex items-center gap-1.5">
                                <PlugZap className="h-3.5 w-3.5 text-[#007d68]" aria-hidden />
                                <h2 className="config-typo-workspace-title">Connection</h2>
                            </span>
                            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-alloy-midnight/75">
                                {installation.state === "active" ?
                                    "This connection is live. Suspending stops token exchange but keeps the configuration; disconnecting ends its access for good."
                                : installation.state === "suspended" ?
                                    "This connection is suspended. Its configuration and credential are intact — reactivating restores access immediately."
                                :   "This connection has been disconnected. Its access has stopped and it cannot be reactivated."}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {installation.state !== "active" && installation.state !== "revoked" && (
                                    <button type="button" disabled={busy} onClick={() => setState("active")} data-testid="installation-reactivate" className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1.5">
                                        <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                                        Reactivate
                                    </button>
                                )}
                                {installation.state === "active" && (
                                    <button type="button" disabled={busy} onClick={() => setState("suspended")} data-testid="installation-suspend" className="config-secondary-btn config-secondary-btn--sm inline-flex items-center gap-1.5">
                                        <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                                        Suspend
                                    </button>
                                )}
                                {installation.state !== "revoked" && (
                                    <button type="button" disabled={busy} onClick={() => setState("revoked")} data-testid="installation-disconnect" className="config-secondary-btn config-secondary-btn--sm border-alloy-ember/35 text-alloy-ember">
                                        Disconnect
                                    </button>
                                )}
                            </div>
                        </ConfigWorkspaceCard>

                        {/* ── DEVELOPER DETAILS ────────────────────────────────────────────── */}
                        <ConfigWorkspaceCard compact testId="installation-developer-details" className="h-full">
                            <span className="flex items-center gap-1.5">
                                <BookOpen className="h-3.5 w-3.5 text-[#007d68]" aria-hidden />
                                <h2 className="config-typo-workspace-title">For developers</h2>
                            </span>
                            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-alloy-midnight/75">
                                The person who writes the integration is rarely the person who installs it. Send
                                them here.
                            </p>
                            {/*
                              * A new tab, deliberately. Documentation is a long read and the operator is in
                              * the middle of configuring a connection; sending them away and expecting them
                              * to find their way back is how a half-finished installation happens.
                              */}
                            <a
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight transition hover:border-alloy-bend-pine/40 hover:text-[#007d68]"
                                href="/organization/integrations/documentation"
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="developer-documentation-link"
                            >
                                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                                Developer documentation
                                <ChevronRight className="h-3 w-3 opacity-50" aria-hidden />
                                <span className="sr-only">(opens in a new tab)</span>
                            </a>

                            <details className="mt-2.5 border-t border-alloy-stone/50 pt-2">
                                <summary className="cursor-pointer text-[11.5px] font-medium text-alloy-midnight/60 hover:text-alloy-midnight">
                                    Technical identifiers
                                </summary>
                                <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                                    <dt className="text-alloy-midnight/45">Application ID</dt>
                                    <dd className="truncate font-mono text-alloy-midnight/70">{installation.applicationId}</dd>
                                    <dt className="text-alloy-midnight/45">Installation ID</dt>
                                    <dd className="truncate font-mono text-alloy-midnight/70">{installation.id}</dd>
                                    <dt className="text-alloy-midnight/45">Public scopes</dt>
                                    <dd className="truncate font-mono text-alloy-midnight/70">{installation.grantedScopes.join(", ") || "none"}</dd>
                                </dl>
                            </details>
                        </ConfigWorkspaceCard>
                    </div>
                </main>
            </ConfigurationShell>

            {/*
              * The secret is a dialog, not a panel in the page.
              *
              * Rendered last and portaled from inside: on Done it unmounts, the value leaves state,
              * and Installation detail is exactly the page it was before — with the Credentials
              * card already refreshed, because issuing reloaded the installation before this
              * appeared.
              */}
            {revealed && <CredentialSecretDialog revealed={revealed} onDone={() => setRevealed(null)} />}
        </div>
    );
}
