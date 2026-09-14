"use client";

/**
 * Add integration — the guided flow.
 *
 * Four decisions in the order an operator actually makes them: WHAT is being
 * connected, WHAT it may do, WHERE it may do it, and then a review that restates
 * all three before anything exists.
 *
 * The wizard is descriptive throughout. It never computes authorization, never
 * keeps its own list of capabilities, and never decides which locations are
 * eligible — those answers come from the server, which remains the authority
 * whatever this component believes.
 */

import { useCallback, useEffect, useState } from "react";

type Application = {
    id: string; name: string; slug: string;
    publisher: string | null; status: string; alreadyInstalled: boolean;
};

type Capability = { scope: string; title: string; detail: string; access: "read" | "write"; recognised: boolean };

type Location = { id: string; name: string | null; type: string; siteId: string | null; parentId: string | null };

type Step = "application" | "capabilities" | "locations" | "review";

const STEP_ORDER: Step[] = ["application", "capabilities", "locations", "review"];
const STEP_TITLE: Record<Step, string> = {
    application: "Choose what to connect",
    capabilities: "Choose what it may do",
    locations: "Choose where it may do it",
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
        <div className="p-6" data-testid="add-integration-wizard">
            <button type="button" onClick={onCancel} className="text-xs underline" data-testid="wizard-cancel">
                Cancel
            </button>

            <header className="mt-3">
                <h1 className="text-lg font-medium">Add integration</h1>
                <p className="mt-1 text-sm opacity-75">
                    Step {index + 1} of {STEP_ORDER.length} — {STEP_TITLE[step]}
                </p>
            </header>

            {error && <p className="mt-3 rounded border p-2 text-sm" data-testid="wizard-error">{error}</p>}

            {step === "application" && (
                <section className="mt-4" data-testid="wizard-step-application">
                    {applications === null && <p className="text-sm opacity-70">Loading…</p>}
                    {applications?.length === 0 && (
                        <p className="text-sm opacity-75" data-testid="wizard-no-applications">
                            No approved software is available to connect yet. Applications are approved by Alloy.
                        </p>
                    )}
                    <ul className="flex flex-col gap-2">
                        {(applications ?? []).map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    disabled={a.alreadyInstalled}
                                    onClick={() => setApplicationId(a.id)}
                                    data-testid={`wizard-application-${a.id}`}
                                    className={`w-full rounded border p-3 text-left ${applicationId === a.id ? "font-medium" : ""}`}
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span>{a.name}</span>
                                        <span className="text-xs opacity-70">
                                            {a.alreadyInstalled ? "Already connected" : a.status}
                                        </span>
                                    </div>
                                    {a.publisher && <div className="mt-1 text-xs opacity-70">{a.publisher}</div>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {step === "capabilities" && (
                <section className="mt-4" data-testid="wizard-step-capabilities">
                    <p className="text-sm opacity-75">
                        Grant only what this integration needs. You can change this later.
                    </p>
                    <ul className="mt-2 flex flex-col gap-2">
                        {catalog.map((c) => (
                            <li key={c.scope}>
                                <label className="flex items-start gap-2 rounded border p-3" data-testid={`wizard-capability-${c.scope}`}>
                                    <input
                                        type="checkbox"
                                        checked={scopes.includes(c.scope)}
                                        onChange={(e) =>
                                            setScopes((prev) => e.target.checked ? [...prev, c.scope] : prev.filter((s) => s !== c.scope))
                                        }
                                    />
                                    <span>
                                        <span className="font-medium">{c.title}</span>
                                        <span className="block text-xs opacity-75">{c.detail}</span>
                                        {/* Reads and writes must never look alike. */}
                                        <span className="block text-xs opacity-60">
                                            {c.access === "write" ? "Can make changes" : "Read only"} · {c.scope}
                                        </span>
                                        {!c.recognised && (
                                            <span className="block text-xs opacity-70">
                                                Not recognised by this version of Alloy — treated as sensitive.
                                            </span>
                                        )}
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {step === "locations" && (
                <section className="mt-4" data-testid="wizard-step-locations">
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2" data-testid="wizard-boundary-org-wide">
                            <input type="radio" checked={boundaryMode === "org_wide"} onChange={() => setBoundaryMode("org_wide")} />
                            <span>All locations</span>
                        </label>
                        <label className="flex items-center gap-2" data-testid="wizard-boundary-selected">
                            <input type="radio" checked={boundaryMode === "locations"} onChange={() => setBoundaryMode("locations")} />
                            <span>Selected locations</span>
                        </label>
                    </div>

                    {boundaryMode === "locations" && (
                        <>
                            <p className="mt-3 text-xs opacity-70">
                                Choosing a site includes the rooms within it. Family and vendor addresses are never shared.
                            </p>
                            <ul className="mt-2 flex flex-col gap-1" data-testid="wizard-site-list">
                                {sites.map((s) => (
                                    <li key={s.id}>
                                        <label className="flex items-center gap-2" data-testid={`wizard-site-${s.id}`}>
                                            <input
                                                type="checkbox"
                                                checked={locationIds.includes(s.id)}
                                                onChange={(e) =>
                                                    setLocationIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))
                                                }
                                            />
                                            <span>{s.name ?? s.id}</span>
                                            <span className="text-xs opacity-60">
                                                {locations.filter((l) => l.siteId === s.id && l.type === "unit").length} rooms
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            {locationIds.length === 0 && (
                                <p className="mt-2 text-xs opacity-75" data-testid="wizard-restricted-empty-warning">
                                    Select at least one site. An integration with no locations can reach nothing —
                                    which is not the same as granting all locations.
                                </p>
                            )}
                        </>
                    )}
                </section>
            )}

            {step === "review" && (
                <section className="mt-4" data-testid="wizard-step-review">
                    <dl className="text-sm">
                        <dt className="opacity-70">Integration</dt>
                        <dd className="mb-2" data-testid="review-application">{chosenApplication?.name ?? "—"}</dd>
                        <dt className="opacity-70">Can</dt>
                        <dd className="mb-2" data-testid="review-capabilities">
                            {scopes.length === 0
                                ? "Nothing — no capabilities granted"
                                : catalog.filter((c) => scopes.includes(c.scope)).map((c) => c.title).join(", ")}
                        </dd>
                        <dt className="opacity-70">Where</dt>
                        <dd data-testid="review-access">
                            {boundaryMode === "org_wide"
                                ? "All locations"
                                : `${locationIds.length} selected site${locationIds.length === 1 ? "" : "s"}`}
                        </dd>
                    </dl>
                    <p className="mt-3 text-xs opacity-70">
                        Alloy enforces this on every request. Nothing is granted by this summary.
                    </p>
                </section>
            )}

            <footer className="mt-5 flex gap-2">
                {index > 0 && (
                    <button type="button" className="rounded border px-3 py-1 text-sm" data-testid="wizard-back"
                        onClick={() => setStep(STEP_ORDER[index - 1])}>
                        Back
                    </button>
                )}
                {step !== "review" ? (
                    <button type="button" disabled={!canAdvance} className="rounded border px-3 py-1 text-sm" data-testid="wizard-next"
                        onClick={() => setStep(STEP_ORDER[index + 1])}>
                        Continue
                    </button>
                ) : (
                    <button type="button" disabled={busy} className="rounded border px-3 py-1 text-sm" data-testid="wizard-create"
                        onClick={() => void create()}>
                        {busy ? "Connecting…" : "Create integration"}
                    </button>
                )}
            </footer>
        </div>
    );
}
