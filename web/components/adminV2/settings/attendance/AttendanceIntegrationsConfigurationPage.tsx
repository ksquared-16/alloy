"use client";

/**
 * External attendance producers — the operator product over the generic
 * integration foundation.
 *
 * ── WHAT IS NOT HERE ──
 *
 * No "online", no "last seen", no sync recency. `last_seen_at` is a column
 * nothing writes, and an integrations screen is exactly where a green dot is most
 * believed and least verifiable.
 *
 * ── WHAT IS HERE, BECAUSE IT IS REAL ──
 *
 * Problems are counted from the integration inbox, whose disposition is written
 * on every inbound event. "Could not tell which child or room" is a fact about
 * rows that exist, not an inference from silence.
 *
 * ── NO PROVIDER FICTION ──
 *
 * A provider appears because a producer row exists, never because Alloy supports
 * it. Where a provider is known to need work that has not happened, the screen
 * says so rather than letting generic administration imply an integration.
 */

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    problemDispositionLabel,
    providerIntegrationNotice,
    type ProducerAdminRow,
} from "@/lib/childcareOperational/attendance/integration/producerAdministration";

type SiteOption = { id: string; label: string };

export default function AttendanceIntegrationsConfigurationPage() {
    const [producers, setProducers] = useState<ProducerAdminRow[]>([]);
    const [sites, setSites] = useState<SiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [grantSiteFor, setGrantSiteFor] = useState<Record<string, string>>({});

    const reload = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/attendance/producers");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load");
            setProducers((json.producers ?? []) as ProducerAdminRow[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load producers.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations?location_type=site");
                const json = await res.json().catch(() => ({}));
                const rows = (json.locations ?? json.data ?? []) as { id: string; label?: string | null }[];
                setSites(
                    rows
                        .map((r) => ({ id: r.id, label: String(r.label ?? "").trim() }))
                        .filter((r) => r.id && r.label),
                );
            } catch {
                setSites([]);
            }
        })();
    }, []);

    const mutate = async (fn: () => Promise<Response>) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fn();
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Action failed");
            setConfirmRevokeId(null);
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-col">
            <ConfigurationContext
                eyebrow="Attendance"
                title="Connected systems"
                subtitle="Other systems that may record attendance, and which sites they may record it for."
                titleIcon={<Plug className="h-4 w-4" aria-hidden />}
                testId="attendance-integrations-context"
            />

            <div className="flex flex-col gap-4 p-4">
                {error ?
                    <p className="text-sm text-alloy-ember" data-testid="attendance-integrations-error">
                        {error}
                    </p>
                :   null}

                {loading ?
                    <p className="text-sm text-alloy-midnight/55">Loading…</p>
                : producers.length === 0 ?
                    <ConfigurationEmptyState
                        title="No connected systems"
                        description="Nothing outside Alloy is currently allowed to record attendance."
                    />
                :   producers.map((p) => {
                        const notice = providerIntegrationNotice(p.providerKey);
                        return (
                            <ConfigWorkspaceCard
                                key={p.id}
                                testId="producer-row"
                                title={p.label}
                            >
                                <div data-testid="producer-status" data-producer-status={p.status}>
                                    <p className="text-[12px] text-alloy-midnight/55">
                                        {p.status === "active" ? "Allowed to record attendance" : "Revoked — cannot record attendance"}
                                        {p.credentialLastFour ? <> · key ends {p.credentialLastFour}</> : null}
                                    </p>

                                    {notice ?
                                        <p
                                            className="mt-2 rounded-lg bg-alloy-stone/10 px-3 py-2 text-[12px] text-alloy-midnight"
                                            data-testid="producer-provider-notice"
                                        >
                                            {notice}
                                        </p>
                                    :   null}

                                    <p className="mt-3 text-sm font-medium text-alloy-midnight">Sites</p>
                                    {p.siteGrants.length === 0 ?
                                        <p className="text-[12px] text-alloy-midnight/55" data-testid="producer-no-sites">
                                            No sites — this system cannot record attendance anywhere until a site is added.
                                        </p>
                                    :   <ul className="mt-1 flex flex-wrap gap-2">
                                            {p.siteGrants.map((g) => (
                                                <li
                                                    key={g.siteLocationId}
                                                    className="flex items-center gap-2 rounded-lg bg-alloy-stone/10 px-2 py-1 text-[12px]"
                                                    data-testid="producer-site-grant"
                                                >
                                                    {g.siteName ?? "Unknown site"}
                                                    <button
                                                        className="text-alloy-midnight/55 underline"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void mutate(() =>
                                                                fetch(
                                                                    `/api/admin/attendance/producers/${encodeURIComponent(p.id)}/sites?site_location_id=${encodeURIComponent(g.siteLocationId)}`,
                                                                    { method: "DELETE" },
                                                                ),
                                                            )
                                                        }
                                                        data-testid="producer-site-remove"
                                                    >
                                                        Remove
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    }

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <select
                                            className="rounded-lg border border-alloy-stone/30 px-2 py-1 text-[12px]"
                                            value={grantSiteFor[p.id] ?? ""}
                                            onChange={(e) =>
                                                setGrantSiteFor((m) => ({ ...m, [p.id]: e.target.value }))
                                            }
                                            data-testid="producer-site-select"
                                        >
                                            <option value="">Add a site…</option>
                                            {sites.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.label}
                                                </option>
                                            ))}
                                        </select>
                                        <ConfigurationSecondaryButton
                                            disabled={busy || !grantSiteFor[p.id]}
                                            onClick={() =>
                                                void mutate(() =>
                                                    fetch(
                                                        `/api/admin/attendance/producers/${encodeURIComponent(p.id)}/sites`,
                                                        {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({
                                                                site_location_id: grantSiteFor[p.id],
                                                            }),
                                                        },
                                                    ),
                                                )
                                            }
                                            data-testid="producer-site-add"
                                        >
                                            Add site
                                        </ConfigurationSecondaryButton>
                                    </div>

                                    <p className="mt-3 text-sm font-medium text-alloy-midnight">Matching</p>
                                    <p className="text-[12px] text-alloy-midnight/55" data-testid="producer-mapping-counts">
                                        {p.activeMappingCount} in use
                                        {p.disabledMappingCount > 0 ? <> · {p.disabledMappingCount} turned off</> : null}
                                    </p>

                                    {p.problems.length > 0 ?
                                        <ul className="mt-2 flex flex-col gap-1" data-testid="producer-problems">
                                            {p.problems.map((problem) => (
                                                <li
                                                    key={problem.disposition}
                                                    className="text-[12px] text-alloy-ember"
                                                    data-testid="producer-problem"
                                                >
                                                    {problem.count} · {problemDispositionLabel(problem.disposition)}
                                                </li>
                                            ))}
                                        </ul>
                                    :   null}

                                    {p.status === "active" ?
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            {confirmRevokeId === p.id ?
                                                <>
                                                    <ConfigurationPrimaryButton
                                                        onClick={() =>
                                                            void mutate(() =>
                                                                fetch(
                                                                    `/api/admin/attendance/producers/${encodeURIComponent(p.id)}`,
                                                                    { method: "DELETE" },
                                                                ),
                                                            )
                                                        }
                                                        data-testid="producer-revoke-confirm"
                                                    >
                                                        Confirm revoke
                                                    </ConfigurationPrimaryButton>
                                                    <ConfigurationSecondaryButton onClick={() => setConfirmRevokeId(null)}>
                                                        Cancel
                                                    </ConfigurationSecondaryButton>
                                                </>
                                            :   <ConfigurationSecondaryButton
                                                    onClick={() => setConfirmRevokeId(p.id)}
                                                    data-testid="producer-revoke"
                                                >
                                                    Revoke
                                                </ConfigurationSecondaryButton>
                                            }
                                        </div>
                                    :   null}
                                </div>
                            </ConfigWorkspaceCard>
                        );
                    })}
            </div>
        </div>
    );
}
