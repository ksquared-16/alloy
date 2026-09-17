"use client";

/**
 * Organization → Integrations.
 *
 * The operator question this page exists to answer, in this order:
 *
 *     What is connected — what can it access — is it working?
 *
 * Everything shown is server-derived. The client renders state; it never computes authorization,
 * never decides health, and never holds a secret beyond the single render that reveals it.
 *
 * Presented as an Alloy configuration collection rather than as a list of bordered paragraphs: the
 * context bar carries the domain and its totals, each connection is a scannable row whose state and
 * health are badges rather than concatenated prose, and the page is laid out for an organization
 * with a dozen integrations rather than for the one in the certification fixture.
 */

import { Plug, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

import AddIntegrationWizard from "./AddIntegrationWizard";
import InstallationDetail from "./InstallationDetail";
import {
    accessSummary,
    activitySummary,
    credentialSummary,
    HealthBadge,
    StateBadge,
    type Installation,
} from "./presentation";

export default function IntegrationsClient() {
    const [installations, setInstallations] = useState<Installation[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

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

    const totals = useMemo(() => {
        const list = installations ?? [];
        return {
            connected: list.filter((i) => i.state !== "revoked").length,
            healthy: list.filter((i) => i.state === "active" && i.health.state === "healthy").length,
            attention: list.filter((i) => i.state === "active" && i.health.state === "needs_attention").length,
            suspended: list.filter((i) => i.state === "suspended").length,
            disconnected: list.filter((i) => i.state === "revoked").length,
        };
    }, [installations]);

    if (adding) {
        return (
            <AddIntegrationWizard
                onCancel={() => setAdding(false)}
                onCreated={async (id) => { setAdding(false); await load(); setSelected(id); }}
            />
        );
    }

    if (current) {
        return <InstallationDetail installation={current} onBack={() => setSelected(null)} onChanged={load} />;
    }

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-integrations">
            <ConfigurationContext
                title="Integrations"
                subtitle="Approved external software connected to this organization, and exactly what each connection may access."
                titleIcon={<Plug className="h-5 w-5" strokeWidth={2} />}
                testId="integrations-context"
                actions={
                    <button
                        type="button"
                        className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1.5"
                        data-testid="add-integration"
                        onClick={() => setAdding(true)}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add integration
                    </button>
                }
            >
                {/*
                  * NO TOTALS UNTIL THERE ARE TOTALS.
                  *
                  * Rendering the counters while the collection is still loading printed
                  * "0 Connected · 0 Healthy", which is not a loading state — it is a confident
                  * claim that this organization has no integrations, made before anyone knows.
                  * Mounted certification read exactly that on a tenant with four.
                  */}
                {installations === null ?
                    <p className="border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/45" data-testid="integrations-summary-pending">
                        Loading connections…
                    </p>
                :   <ul
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                    aria-label="Integrations summary"
                    data-testid="integrations-summary"
                >
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{totals.connected}</strong> Connected
                    </li>
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{totals.healthy}</strong> Healthy
                    </li>
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{totals.attention}</strong> Needs attention
                    </li>
                    {totals.suspended > 0 && (
                        <li>
                            <strong className="font-semibold text-alloy-midnight">{totals.suspended}</strong> Suspended
                        </li>
                    )}
                    {totals.disconnected > 0 && (
                        <li>
                            <strong className="font-semibold text-alloy-midnight">{totals.disconnected}</strong> Disconnected
                        </li>
                    )}
                </ul>
                }
            </ConfigurationContext>

            <ConfigurationShell testId="integrations-shell">
                <main className="mx-auto min-w-0 max-w-[1100px] pb-4" data-testid="integrations-workspace">
                    {installations === null ?
                        <p className="py-6 text-[12px] text-alloy-midnight/55" data-testid="integrations-loading">
                            Loading integrations…
                        </p>
                    : error ?
                        <div
                            className="rounded-xl border border-alloy-ember/25 bg-alloy-ember/[0.05] p-4"
                            data-testid="integrations-error"
                        >
                            <p className="text-[13px] font-semibold text-alloy-midnight">
                                Integrations could not be loaded
                            </p>
                            <p className="mt-1 text-[12px] leading-5 text-alloy-midnight/70">{error}</p>
                        </div>
                    : installations.length === 0 ?
                        <EmptyState onAdd={() => setAdding(true)} />
                    :   <ul className="flex flex-col gap-2" data-testid="integrations-list">
                            {installations.map((installation) => (
                                <li key={installation.id}>
                                    <IntegrationRow
                                        installation={installation}
                                        onOpen={() => setSelected(installation.id)}
                                    />
                                </li>
                            ))}
                        </ul>
                    }
                </main>
            </ConfigurationShell>
        </div>
    );
}

/**
 * One connection, scannable in a single pass.
 *
 * Identity on the left, the two state facts on the right, and the three things an operator asks
 * next — what it may reach, what it may do, whether it is being used — on one meta line underneath.
 */
function IntegrationRow({
    installation,
    onOpen,
}: {
    installation: Installation;
    onOpen: () => void;
}) {
    const capabilities =
        installation.capabilities.length === 0 ?
            "No capabilities granted"
        :   installation.capabilities.map((c) => c.title).join(" · ");

    return (
        <button
            type="button"
            onClick={onOpen}
            data-testid={`integration-row-${installation.id}`}
            className="group w-full rounded-xl border border-alloy-forge/10 bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(19,33,43,0.04)] transition hover:border-alloy-bend-pine/35 hover:shadow-[0_2px_6px_rgba(19,33,43,0.07)]"
        >
            <div className="flex items-start gap-3">
                <span
                    className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.09] text-[#007d68]"
                    aria-hidden
                >
                    <Plug className="h-4 w-4" strokeWidth={1.9} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[14px] font-semibold tracking-tight text-alloy-midnight group-hover:text-[#007d68]">
                                {installation.applicationName}
                            </span>
                            {installation.publisher && (
                                <span className="truncate text-[11px] text-alloy-midnight/45">
                                    {installation.publisher}
                                </span>
                            )}
                        </div>
                        {/*
                          * Two facts, two badges. "Active · Needs attention" as one string made the
                          * state and the health look like a single verdict, and an operator could not
                          * tell which half was the problem.
                          */}
                        <span className="flex shrink-0 items-center gap-1.5" data-testid={`integration-state-${installation.id}`}>
                            <StateBadge state={installation.state} />
                            <HealthBadge health={installation.health.state} />
                        </span>
                    </div>

                    <dl className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-alloy-midnight/62">
                        <div className="flex items-center gap-1">
                            <dt className="sr-only">Access</dt>
                            <dd>{accessSummary(installation)}</dd>
                        </div>
                        <span aria-hidden className="text-alloy-midnight/20">|</span>
                        <div className="flex min-w-0 items-center gap-1">
                            <dt className="sr-only">Capabilities</dt>
                            <dd className="truncate">{capabilities}</dd>
                        </div>
                        <span aria-hidden className="text-alloy-midnight/20">|</span>
                        <div className="flex items-center gap-1">
                            <dt className="sr-only">Credential</dt>
                            <dd>{credentialSummary(installation.credential)}</dd>
                        </div>
                        <span aria-hidden className="text-alloy-midnight/20">|</span>
                        <div className="flex items-center gap-1">
                            <dt className="sr-only">Recent activity</dt>
                            <dd>{activitySummary(installation)}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </button>
    );
}

/**
 * Nothing connected yet.
 *
 * Explains what an integration IS rather than showing a catalogue of software Alloy cannot actually
 * connect to. No placeholder provider appears here.
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
    return (
        <div
            className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/30 px-5 py-8 text-center"
            data-testid="integrations-empty-state"
        >
            <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-alloy-bend-pine/[0.09] text-[#007d68]" aria-hidden>
                <Plug className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <p className="mt-2.5 text-[14px] font-semibold tracking-tight text-alloy-midnight">
                No integrations connected
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-[1.65] text-alloy-midnight/65">
                Integrations connect approved external software to Alloy using explicitly granted access.
                Each one is granted its own capabilities and its own locations, and can be suspended or
                disconnected at any time.
            </p>
            <button
                type="button"
                onClick={onAdd}
                data-testid="integrations-empty-add"
                className="config-primary-btn config-primary-btn--sm mt-3.5 inline-flex items-center gap-1.5"
            >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add integration
            </button>
        </div>
    );
}
