"use client";

/**
 * Add integration — the guided flow.
 *
 * Four decisions in the order an operator actually makes them: WHAT is being connected, WHAT it may
 * do, WHERE it may do it, and then a review that restates all three before anything exists.
 *
 * The wizard is descriptive throughout. It never computes authorization, never keeps its own list of
 * capabilities, and never decides which locations are eligible — those answers come from the server,
 * which remains the authority whatever this component believes. The capability and location choices
 * are the SAME components the edit screens use, so what an operator learns granting access is what
 * they see when they come back to change it.
 */

import { ArrowLeft, ArrowRight, Building2, Check, Plug, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

import { CapabilityChoice } from "./AccessEditor";
import { Badge, type Capability } from "./presentation";

type Application = {
    id: string; name: string; slug: string;
    publisher: string | null; status: string; alreadyInstalled: boolean;
};

type Location = { id: string; name: string | null; type: string; siteId: string | null; parentId: string | null };

type Step = "application" | "capabilities" | "locations" | "review";

const STEP_ORDER: Step[] = ["application", "capabilities", "locations", "review"];
const STEP_TITLE: Record<Step, string> = {
    application: "Choose what to connect",
    capabilities: "Choose what it may do",
    locations: "Choose where it may do it",
    review: "Review",
};
const STEP_SHORT: Record<Step, string> = {
    application: "Software",
    capabilities: "Capabilities",
    locations: "Locations",
    review: "Review",
};

export default function AddIntegrationWizard({
    onCancel,
    onCreated,
}: {
    onCancel: () => void;
    onCreated: (installationId: string) => void;
}) {
    const [step, setStep] = useState<Step>("application");
    const [applications, setApplications] = useState<Application[] | null>(null);
    const [catalog, setCatalog] = useState<Capability[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);

    const [applicationId, setApplicationId] = useState<string>("");
    const [scopes, setScopes] = useState<string[]>([]);
    const [boundaryMode, setBoundaryMode] = useState<"org_wide" | "locations">("org_wide");
    const [locationIds, setLocationIds] = useState<string[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            const [a, c, l] = await Promise.all([
                fetch("/api/admin/integrations/applications", { cache: "no-store" }),
                fetch("/api/admin/integrations/capabilities", { cache: "no-store" }),
                fetch("/api/admin/integrations/locations", { cache: "no-store" }),
            ]);
            setApplications(a.ok ? ((await a.json()) as { applications: Application[] }).applications : []);
            // The capability list is the server's, derived from the canonical
            // catalog. The wizard keeps no second copy.
            setCatalog(c.ok ? ((await c.json()) as { capabilities: Capability[] }).capabilities : []);
            setLocations(l.ok ? ((await l.json()) as { locations: Location[] }).locations : []);
        })();
    }, []);

    const chosenApplication = applications?.find((a) => a.id === applicationId) ?? null;
    const sites = locations.filter((l) => l.type === "site");

    const canAdvance =
        step === "application" ? Boolean(applicationId)
            : step === "locations" ? (boundaryMode === "org_wide" || locationIds.length > 0)
                : true;

    const create = useCallback(async () => {
        setBusy(true); setError(null);
        try {
            const res = await fetch("/api/admin/integrations/installations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ applicationId, grantedScopes: scopes, boundaryMode, locationIds }),
            });
            const body = (await res.json().catch(() => ({}))) as { installationId?: string; error?: string };
            if (!res.ok || !body.installationId) {
                // The duplicate and unknown-scope refusals are sentences from the
                // server; they are shown as written rather than reinterpreted.
                setError(body.error ?? "That integration could not be created.");
                return;
            }
            onCreated(body.installationId);
        } finally { setBusy(false); }
    }, [applicationId, scopes, boundaryMode, locationIds, onCreated]);

    const index = STEP_ORDER.indexOf(step);

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="add-integration-wizard">
            <ConfigurationContext
                eyebrow="Integrations"
                title="Add integration"
                subtitle={`Step ${index + 1} of ${STEP_ORDER.length} — ${STEP_TITLE[step]}`}
                titleIcon={<Plug className="h-5 w-5" strokeWidth={2} />}
                testId="wizard-context"
                actions={
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="wizard-cancel"
                        className="config-secondary-btn config-secondary-btn--sm inline-flex items-center gap-1.5"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Cancel
                    </button>
                }
            >
                <ol
                    className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-alloy-stone/25 pt-2"
                    aria-label="Progress"
                    data-testid="wizard-progress"
                >
                    {STEP_ORDER.map((s, i) => {
                        const done = i < index;
                        const active = i === index;
                        return (
                            <li key={s} className="flex items-center gap-1.5">
                                <span
                                    data-testid={`wizard-progress-${s}`}
                                    aria-current={active ? "step" : undefined}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                                        active ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.10] text-[#007d68]"
                                        : done ? "border-alloy-bend-pine/25 bg-white text-[#007d68]"
                                        : "border-alloy-forge/12 bg-white text-alloy-midnight/40"
                                    }`}
                                >
                                    {done ?
                                        <Check className="h-3 w-3" aria-hidden />
                                    :   <span className="tabular-nums">{i + 1}</span>}
                                    {STEP_SHORT[s]}
                                </span>
                                {i < STEP_ORDER.length - 1 && (
                                    <span aria-hidden className="h-px w-4 bg-alloy-stone" />
                                )}
                            </li>
                        );
                    })}
                </ol>
            </ConfigurationContext>

            <ConfigurationShell testId="wizard-shell">
                <main className="mx-auto min-w-0 max-w-[880px] space-y-2.5 pb-4" data-testid="wizard-workspace">
                    {error && (
                        <p
                            className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.05] px-3 py-2 text-[12.5px] font-medium text-alloy-midnight"
                            data-testid="wizard-error"
                        >
                            {error}
                        </p>
                    )}

                    {step === "application" && (
                        <ConfigWorkspaceCard
                            compact
                            title="Choose what to connect"
                            description="Applications are approved by Alloy before they can be connected to an organization."
                            testId="wizard-step-application"
                        >
                            {applications === null && (
                                <p className="text-[12px] text-alloy-midnight/55">Loading…</p>
                            )}
                            {applications?.length === 0 && (
                                <p
                                    className="rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/30 px-3 py-4 text-center text-[12.5px] text-alloy-midnight/65"
                                    data-testid="wizard-no-applications"
                                >
                                    No approved software is available to connect yet. Applications are approved by Alloy.
                                </p>
                            )}
                            <ul className="grid gap-1.5 sm:grid-cols-2">
                                {(applications ?? []).map((a) => {
                                    const chosen = applicationId === a.id;
                                    return (
                                        <li key={a.id}>
                                            <button
                                                type="button"
                                                disabled={a.alreadyInstalled}
                                                onClick={() => setApplicationId(a.id)}
                                                data-testid={`wizard-application-${a.id}`}
                                                aria-pressed={chosen}
                                                className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                                                    chosen ?
                                                        "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.07]"
                                                    :   "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
                                                }`}
                                            >
                                                <span
                                                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.09] text-[#007d68]"
                                                    aria-hidden
                                                >
                                                    <Plug className="h-3.5 w-3.5" strokeWidth={1.9} />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <span className="truncate text-[12.5px] font-semibold text-alloy-midnight">{a.name}</span>
                                                        {a.alreadyInstalled ?
                                                            <Badge tone="muted">Already connected</Badge>
                                                        : chosen ?
                                                            <Badge tone="positive">Selected</Badge>
                                                        :   null}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-[11px] text-alloy-midnight/55">
                                                        {a.publisher ?? "Publisher not stated"}
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </ConfigWorkspaceCard>
                    )}

                    {step === "capabilities" && (
                        <ConfigWorkspaceCard
                            compact
                            title="Choose what it may do"
                            description="Grant only what this integration needs. You can change this later."
                            testId="wizard-step-capabilities"
                        >
                            <ul className="grid gap-1.5">
                                {catalog.map((c) => (
                                    <li key={c.scope}>
                                        <CapabilityChoice
                                            testId={`wizard-capability-${c.scope}`}
                                            checked={scopes.includes(c.scope)}
                                            onToggle={(on) =>
                                                setScopes((prev) => on ? [...new Set([...prev, c.scope])] : prev.filter((s) => s !== c.scope))
                                            }
                                            title={c.title}
                                            detail={c.detail}
                                            access={c.access}
                                            scope={c.scope}
                                            recognised={c.recognised}
                                        />
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-[11.5px] leading-[1.55] text-alloy-midnight/55">
                                Capabilities describe access Alloy defines. A granted capability does not by
                                itself mean Alloy publishes an endpoint for it yet — the developer
                                documentation lists exactly which operations are callable today.
                            </p>
                        </ConfigWorkspaceCard>
                    )}

                    {step === "locations" && (
                        <ConfigWorkspaceCard
                            compact
                            title="Choose where it may do it"
                            description="A capability applies only inside the boundary you set here."
                            testId="wizard-step-locations"
                        >
                            <div className="grid gap-1.5 sm:grid-cols-2">
                                <label
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ${
                                        boundaryMode === "org_wide" ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.06]" : "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
                                    }`}
                                    data-testid="wizard-boundary-org-wide"
                                >
                                    <input type="radio" className="mt-0.5" checked={boundaryMode === "org_wide"} onChange={() => setBoundaryMode("org_wide")} />
                                    <span className="min-w-0">
                                        <span className="block text-[12.5px] font-semibold text-alloy-midnight">All locations</span>
                                        <span className="mt-0.5 block text-[11px] leading-[1.5] text-alloy-midnight/58">
                                            Every site this organization has now, and any site added later.
                                        </span>
                                    </span>
                                </label>
                                <label
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ${
                                        boundaryMode === "locations" ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.06]" : "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
                                    }`}
                                    data-testid="wizard-boundary-selected"
                                >
                                    <input type="radio" className="mt-0.5" checked={boundaryMode === "locations"} onChange={() => setBoundaryMode("locations")} />
                                    <span className="min-w-0">
                                        <span className="block text-[12.5px] font-semibold text-alloy-midnight">Selected locations</span>
                                        <span className="mt-0.5 block text-[11px] leading-[1.5] text-alloy-midnight/58">
                                            Only the sites you tick, including the rooms within them.
                                        </span>
                                    </span>
                                </label>
                            </div>

                            {boundaryMode === "locations" && (
                                <>
                                    <ul className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="wizard-site-list">
                                        {sites.map((s) => {
                                            const rooms = locations.filter((l) => l.siteId === s.id && l.type === "unit").length;
                                            const on = locationIds.includes(s.id);
                                            return (
                                                <li key={s.id}>
                                                    <label
                                                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                                                            on ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.06]" : "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
                                                        }`}
                                                        data-testid={`wizard-site-${s.id}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="mt-0.5"
                                                            checked={on}
                                                            onChange={(e) =>
                                                                setLocationIds((prev) => e.target.checked ? [...new Set([...prev, s.id])] : prev.filter((x) => x !== s.id))
                                                            }
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="flex items-center gap-1.5">
                                                                <Building2 className="h-3 w-3 shrink-0 text-alloy-midnight/35" aria-hidden />
                                                                <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{s.name ?? s.id}</span>
                                                            </span>
                                                            <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">
                                                                {rooms === 0 ? "No rooms" : `${rooms} room${rooms === 1 ? "" : "s"} included`}
                                                            </span>
                                                        </span>
                                                    </label>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {locationIds.length === 0 ?
                                        <p
                                            className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.05] px-2.5 py-1.5 text-[11.5px] leading-[1.55] text-alloy-midnight/80"
                                            data-testid="wizard-restricted-empty-warning"
                                        >
                                            Select at least one site. An integration with no locations can reach
                                            nothing — which is <strong className="font-semibold">not</strong> the
                                            same as granting all locations.
                                        </p>
                                    :   <p className="mt-2 text-[11.5px] text-alloy-midnight/60">
                                            {locationIds.length} site{locationIds.length === 1 ? "" : "s"} selected.
                                            Choosing a site includes the rooms within it. Family and vendor
                                            addresses are never shared.
                                        </p>
                                    }
                                </>
                            )}
                        </ConfigWorkspaceCard>
                    )}

                    {step === "review" && (
                        <ConfigWorkspaceCard
                            compact
                            title="Review"
                            description="This is the access the integration will hold the moment it is created."
                            testId="wizard-step-review"
                        >
                            <dl className="grid gap-1.5">
                                <ReviewRow label="Integration" testId="review-application">
                                    <span className="text-[13px] font-semibold text-alloy-midnight">
                                        {chosenApplication?.name ?? "—"}
                                    </span>
                                    {chosenApplication?.publisher && (
                                        <span className="ml-1.5 text-[11.5px] text-alloy-midnight/50">
                                            {chosenApplication.publisher}
                                        </span>
                                    )}
                                </ReviewRow>
                                <ReviewRow label="Can" testId="review-capabilities">
                                    {scopes.length === 0 ?
                                        <span className="text-[12.5px] text-alloy-midnight/70">
                                            Nothing — no capabilities granted
                                        </span>
                                    :   <span className="flex flex-wrap gap-1">
                                            {catalog.filter((c) => scopes.includes(c.scope)).map((c) => (
                                                <Badge key={c.scope} tone={c.access === "write" ? "neutral" : "positive"}>
                                                    {c.title}
                                                </Badge>
                                            ))}
                                        </span>
                                    }
                                </ReviewRow>
                                <ReviewRow label="Where" testId="review-access">
                                    <span className="text-[12.5px] text-alloy-midnight/85">
                                        {boundaryMode === "org_wide" ?
                                            "All locations"
                                        :   `${locationIds.length} selected site${locationIds.length === 1 ? "" : "s"}`}
                                    </span>
                                </ReviewRow>
                            </dl>

                            {/*
                              * A statement of confidence, not an implementation aside. What it tells the
                              * operator is that this summary describes a boundary Alloy will hold — not a
                              * preference the integration is trusted to respect.
                              */}
                            <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.05] px-2.5 py-2 text-[11.5px] leading-[1.55] text-alloy-midnight/80">
                                <Check className="mt-px h-3.5 w-3.5 shrink-0 text-[#007d68]" aria-hidden />
                                <span>
                                    Alloy enforces this on every request. The integration cannot exceed it,
                                    and nothing is granted until you create it below.
                                </span>
                            </p>
                        </ConfigWorkspaceCard>
                    )}

                    <footer className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            {index > 0 && (
                                <button type="button" className="config-secondary-btn config-secondary-btn--sm inline-flex items-center gap-1.5" data-testid="wizard-back"
                                    onClick={() => setStep(STEP_ORDER[index - 1])}>
                                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                                    Back
                                </button>
                            )}
                        </span>
                        {step !== "review" ?
                            <button type="button" disabled={!canAdvance} className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1.5" data-testid="wizard-next"
                                onClick={() => setStep(STEP_ORDER[index + 1])}>
                                Continue
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        :   <button type="button" disabled={busy} className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1.5" data-testid="wizard-create"
                                onClick={() => void create()}>
                                {busy ? "Connecting…" : "Create integration"}
                            </button>
                        }
                    </footer>
                </main>
            </ConfigurationShell>
        </div>
    );
}

function ReviewRow({
    label,
    children,
    testId,
}: {
    label: string;
    children: React.ReactNode;
    testId: string;
}) {
    return (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.35] px-2.5 py-2">
            <dt className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">{label}</dt>
            <dd data-testid={testId}>{children}</dd>
        </div>
    );
}
