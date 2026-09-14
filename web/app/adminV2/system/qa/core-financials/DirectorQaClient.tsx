"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Scenario } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

/**
 * ONE SCENARIO AT A TIME, AND NEVER AN INFERRED PASS.
 *
 * The harness presents, deep-links and records. It does not press the product's buttons and it does
 * not decide whether the product was right — a scenario changes state only when the Director chooses
 * a result. "Next" is navigation, not acceptance, which is why it never writes anything.
 */

type Readiness = { scenarioKey: string; ready: boolean; unmet: string[] };
type ResultRow = {
    scenario_key: string;
    result: string;
    observation: string | null;
    classification: string | null;
    completed_at: string | null;
};
type Subject = {
    resolved: boolean;
    unresolvedReason: string | null;
    householdLabel: string;
    periodKey: string;
    periodLabel: string;
    grossCents: number;
    netObligationCents: number;
    outstandingCents: number;
    collectibleCents: number;
    paymentsReceivedCents: number;
    responsibilityAllocatedCents: number;
    responsibilityUnassignedCents: number;
    namedParties: string[];
    expectedFunding: Array<{ label: string; cents: number }>;
    postedCount: number;
    draftCount: number;
    reductionCount: number;
    paymentCount: number;
    billableChildren: Array<{ customerMemberId: string; displayName: string }>;
};
type Payload = {
    catalogVersion: string;
    environment: string;
    deployedRevision: string;
    subject: Subject;
    subjectReference: { customerId: string; householdLabel: string; site: string; fixturePath: string };
    scenarios: Scenario[];
    readiness: Readiness[];
    results: ResultRow[];
    baselineChanged: boolean;
    priorRevisions: string[];
};

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const CLASSIFICATIONS = [
    "PRODUCT_DEFECT", "CONFUSING_UX", "GUIDE_MISMATCH",
    "FIXTURE_DRIFT", "ENVIRONMENT_RUNTIME", "UNKNOWN_NEEDS_TRIAGE",
] as const;

export default function DirectorQaClient() {
    const [data, setData] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<{ mode: "landing" | "scenario" | "list" | "failures" | "demo"; index: number }>(
        { mode: "landing", index: 0 },
    );
    const [saving, setSaving] = useState(false);
    const [observation, setObservation] = useState("");
    const [expected, setExpected] = useState("");
    const [classification, setClassification] = useState<string>("");
    const [evidence, setEvidence] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/qa/financials-director", { cache: "no-store" });
            const json = (await res.json()) as Payload & { error?: string };
            if (!res.ok) { setError(json.error ?? `Readiness failed (${res.status})`); return; }
            setData(json); setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not reach the readiness endpoint.");
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const walkthrough = useMemo(
        () => (data?.scenarios ?? []).filter((s) => s.disposition === "HUMAN_WALKTHROUGH").sort((a, b) => a.order - b.order),
        [data],
    );
    const resultOf = useCallback(
        (key: string) => data?.results.find((r) => r.scenario_key === key)?.result ?? "not_run",
        [data],
    );
    const tally = useMemo(() => {
        const t = { pass: 0, fail: 0, blocked: 0, not_run: 0 };
        for (const s of walkthrough) {
            const r = resultOf(s.key) as keyof typeof t;
            t[r in t ? r : "not_run"] += 1;
        }
        return t;
    }, [walkthrough, resultOf]);

    const current = walkthrough[view.index];
    const currentReadiness = data?.readiness.find((r) => r.scenarioKey === current?.key);

    const record = useCallback(async (result: string) => {
        if (!current) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/qa/financials-director", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    scenario_key: current.key, result,
                    observation, expected_result: expected,
                    classification: classification || null, evidence_reference: evidence,
                }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) { setError(json.error ?? "Could not record that result."); return; }
            setError(null); setObservation(""); setExpected(""); setClassification(""); setEvidence("");
            await load();
        } finally { setSaving(false); }
    }, [current, observation, expected, classification, evidence, load]);

    if (error && !data) return <Shell><p className="text-sm text-alloy-ember" data-qa-error="true">{error}</p></Shell>;
    if (!data) return <Shell><p className="text-sm text-alloy-midnight/60">Reading the environment…</p></Shell>;

    const s = data.subject;

    // ── LANDING ─────────────────────────────────────────────────────────────────────────────────
    if (view.mode === "landing") {
        const started = tally.pass + tally.fail + tally.blocked > 0;
        return (
            <Shell>
                <header className="space-y-1">
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Core Financials — Director QA</h1>
                    <p className="text-xs text-alloy-midnight/60">
                        Human acceptance of the non-subsidy Financials product. You drive the real product; this
                        records what you decide.
                    </p>
                </header>

                {data.baselineChanged ? (
                    <Callout tone="warn" testId="baseline-changed">
                        <strong>Baseline changed.</strong> Results exist against {data.priorRevisions.length} other
                        build(s). They are kept and stay readable, but they do not count for this one — an acceptance
                        is only ever true of the build it was given.
                    </Callout>
                ) : null}

                <Panel title="Environment" testId="environment">
                    <Row k="Environment" v={data.environment} />
                    <Row k="Deployed revision" v={data.deployedRevision} mono />
                    <Row k="Scenario definitions" v={data.catalogVersion} mono />
                    <Row k="Fixture" v={data.subjectReference.fixturePath} mono />
                    <Row k="Readiness" v={s.resolved ? "Account reads cleanly" : `NOT READY — ${s.unresolvedReason}`} />
                </Panel>

                <Panel title="Test subject" testId="subject">
                    <Row k="Household" v={s.householdLabel} />
                    <Row k="Billing period" v={s.periodLabel || "—"} />
                    <Row k="Billable children" v={s.billableChildren.map((c) => c.displayName).join(", ") || "none"} />
                    <Row k="Responsible party" v={s.namedParties.join(", ") || "none named yet"} />
                    <Row k="Outstanding" v={money(s.outstandingCents)} />
                    <Row k="Collectible now" v={money(s.collectibleCents)} />
                    <Row k="Ledger" v={`${s.postedCount} posted · ${s.draftCount} draft · ${s.reductionCount} reductions · ${s.paymentCount} payments`} />
                </Panel>

                <Panel title="Progress" testId="progress">
                    <p className="text-sm text-alloy-midnight" data-qa-progress="true">
                        {tally.pass} / {walkthrough.length} scenarios accepted
                    </p>
                    <p className="mt-1 text-xs text-alloy-midnight/60">
                        Passed {tally.pass} · Failed {tally.fail} · Blocked {tally.blocked} · Not run {tally.not_run}
                        {" · "}Deferred {(data.scenarios.length - walkthrough.length)}
                    </p>
                </Panel>

                <div className="flex flex-wrap gap-2">
                    <Primary onClick={() => setView({ mode: "scenario", index: firstUnfinished(walkthrough, resultOf) })}
                        testId="start-walkthrough">
                        {started ? "Resume walkthrough" : "Start walkthrough"}
                    </Primary>
                    <Secondary onClick={() => setView({ mode: "list", index: 0 })} testId="all-scenarios">All scenarios</Secondary>
                    <Secondary onClick={() => setView({ mode: "failures", index: 0 })} testId="failures">Failed / blocked</Secondary>
                    <Secondary onClick={() => setView({ mode: "demo", index: 0 })} testId="demo-path">Demo path</Secondary>
                </div>
            </Shell>
        );
    }

    // ── ALL SCENARIOS / FAILURES / DEMO ─────────────────────────────────────────────────────────
    if (view.mode === "list" || view.mode === "failures" || view.mode === "demo") {
        const rows = view.mode === "failures"
            ? walkthrough.filter((x) => ["fail", "blocked"].includes(resultOf(x.key)))
            : view.mode === "demo"
                ? walkthrough.filter((x) => resultOf(x.key) === "pass")
                : data.scenarios.slice().sort((a, b) => a.order - b.order);
        return (
            <Shell>
                <BackBar onBack={() => setView({ mode: "landing", index: 0 })} />
                <h2 className="text-lg font-semibold text-alloy-midnight">
                    {view.mode === "failures" ? "Failed / blocked" : view.mode === "demo" ? "Demo path" : "All scenarios"}
                </h2>
                {view.mode === "demo" ? (
                    <p className="text-xs text-alloy-midnight/60">
                        Built from what you have already accepted — the accepted fixture and the accepted product ARE
                        the demo. Walk these in order and say, at each step, what the product just proved.
                    </p>
                ) : null}
                {rows.length === 0 ? (
                    <p className="text-sm text-alloy-midnight/60" data-qa-empty="true">Nothing here yet.</p>
                ) : (
                    <ul className="space-y-1" data-qa-scenario-list="true">
                        {rows.map((x) => (
                            <li key={x.key} data-qa-scenario-row={x.key}
                                className="flex items-baseline justify-between gap-3 rounded-md border border-alloy-stone/15 bg-white/60 px-3 py-2">
                                <span className="text-sm text-alloy-midnight">
                                    {String(x.order).padStart(2, "0")} · {x.title}
                                </span>
                                <span className="shrink-0 text-[11px] uppercase tracking-wide text-alloy-midnight/50">
                                    {x.disposition === "HUMAN_WALKTHROUGH" ? resultOf(x.key).replace("_", " ") : x.disposition}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Shell>
        );
    }

    // ── ONE SCENARIO ────────────────────────────────────────────────────────────────────────────
    if (!current) return <Shell><BackBar onBack={() => setView({ mode: "landing", index: 0 })} /><p>No scenario.</p></Shell>;

    const recorded = resultOf(current.key);
    const blockedByPreconditions = currentReadiness && !currentReadiness.ready;

    return (
        <Shell>
            <BackBar onBack={() => setView({ mode: "landing", index: 0 })} />
            <header className="space-y-1" data-qa-scenario={current.key}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                    Scenario {String(current.order).padStart(2, "0")} · recorded: {recorded.replace("_", " ")}
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{current.title}</h2>
                <p className="text-sm text-alloy-midnight/70">{current.purpose}</p>
            </header>

            <Panel title="Why this matters"><p className="text-sm text-alloy-midnight/75">{current.whyItMatters}</p></Panel>

            {blockedByPreconditions ? (
                <Callout tone="warn" testId="scenario-not-ready">
                    <strong>SCENARIO NOT READY.</strong>
                    <ul className="mt-1 list-disc pl-5">
                        {currentReadiness!.unmet.map((u) => <li key={u}>{u}</li>)}
                    </ul>
                    <p className="mt-1">
                        Run the scenario this one depends on first. Testing against the wrong starting state produces a
                        confused tester and a worthless record, not a finding.
                    </p>
                </Callout>
            ) : null}

            <Panel title="Verified starting state" testId="starting-state">
                <Row k="Household" v={s.householdLabel} />
                <Row k="Period" v={s.periodLabel || "—"} />
                <Row k="Outstanding now" v={money(s.outstandingCents)} />
                <Row k="Collectible now" v={money(s.collectibleCents)} />
                <Row k="Posted / draft" v={`${s.postedCount} / ${s.draftCount}`} />
                <Row k="Responsibility" v={s.namedParties.join(", ") || "none named"} />
                <Row k="Expected funding" v={s.expectedFunding.map((f) => `${f.label} ${money(f.cents)}`).join("; ") || "none"} />
                <p className="mt-2 text-[11px] text-alloy-midnight/50">
                    Resolved live from Financials when this page loaded — never a constant written down in advance.
                </p>
            </Panel>

            <Panel title="Navigate">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-alloy-midnight/80">
                    {current.navigate.map((n) => <li key={n}>{n}</li>)}
                </ol>
                <a className="mt-2 inline-block text-xs font-medium text-alloy-bend-pine underline"
                    href="/workspace" target="_blank" rel="noreferrer" data-qa-deeplink="workspace">
                    Open the product in a new tab →
                </a>
            </Panel>

            <Panel title="Do this">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-alloy-midnight/80">
                    {current.doThis.map((d) => <li key={d}>{d}</li>)}
                </ol>
            </Panel>

            <Panel title="Expect">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">What changes</p>
                <ul className="mb-2 list-disc pl-5 text-sm text-alloy-midnight/80">
                    {current.expectChanges.length ? current.expectChanges.map((e) => <li key={e}>{e}</li>) : <li>Nothing.</li>}
                </ul>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">What stays unchanged</p>
                <ul className="mb-2 list-disc pl-5 text-sm text-alloy-midnight/80">
                    {current.expectUnchanged.length ? current.expectUnchanged.map((e) => <li key={e}>{e}</li>) : <li>—</li>}
                </ul>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">Why</p>
                <p className="text-sm text-alloy-midnight/75">{current.invariant}</p>
            </Panel>

            <Panel title="If it goes wrong, this is what it looks like">
                <ul className="list-disc pl-5 text-sm text-alloy-midnight/70">
                    {current.failSymptoms.map((f) => <li key={f}>{f}</li>)}
                </ul>
            </Panel>

            <Panel title="Record your result" testId="record-result">
                <textarea className="w-full rounded-md border border-alloy-stone/25 bg-white p-2 text-sm"
                    rows={3} placeholder="What did you actually observe?" value={observation}
                    onChange={(e) => setObservation(e.target.value)} data-qa-observation="true" id="qa-observation" />
                <textarea className="mt-2 w-full rounded-md border border-alloy-stone/25 bg-white p-2 text-sm"
                    rows={2} placeholder="What did you expect instead? (required for fail / blocked)"
                    value={expected} onChange={(e) => setExpected(e.target.value)} id="qa-expected" />
                <div className="mt-2 flex flex-wrap gap-2">
                    <select className="rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-sm"
                        value={classification} onChange={(e) => setClassification(e.target.value)}
                        data-qa-classification="true" id="qa-classification">
                        <option value="">Classification (required for fail / blocked)…</option>
                        {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="min-w-[14rem] flex-1 rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-sm"
                        placeholder="Evidence: screenshot link or note" value={evidence}
                        onChange={(e) => setEvidence(e.target.value)} id="qa-evidence" />
                </div>
                {error ? <p className="mt-2 text-sm text-alloy-ember" data-qa-error="true">{error}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                    <Primary onClick={() => void record("pass")} disabled={saving} testId="record-pass">PASS</Primary>
                    <Secondary onClick={() => void record("fail")} disabled={saving} testId="record-fail">FAIL</Secondary>
                    <Secondary onClick={() => void record("blocked")} disabled={saving} testId="record-blocked">BLOCKED</Secondary>
                    <Secondary onClick={() => void record("not_run")} disabled={saving} testId="record-not-run">NOT RUN</Secondary>
                </div>
                <p className="mt-2 text-[11px] text-alloy-midnight/50">
                    Nothing here is inferred. A scenario changes only when you choose a result, and moving on does not
                    accept anything.
                </p>
            </Panel>

            <div className="flex flex-wrap justify-between gap-2">
                <Secondary onClick={() => setView({ mode: "scenario", index: Math.max(0, view.index - 1) })}
                    disabled={view.index === 0} testId="prev-scenario">← Previous</Secondary>
                <Secondary onClick={() => setView({ mode: "landing", index: 0 })} testId="save-exit">Save &amp; exit</Secondary>
                <Secondary onClick={() => setView({ mode: "scenario", index: Math.min(walkthrough.length - 1, view.index + 1) })}
                    disabled={view.index >= walkthrough.length - 1} testId="next-scenario">Next scenario →</Secondary>
            </div>
        </Shell>
    );
}

function firstUnfinished(list: Scenario[], resultOf: (k: string) => string) {
    const i = list.findIndex((s) => resultOf(s.key) === "not_run");
    return i < 0 ? 0 : i;
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="w-full max-w-3xl space-y-4 pb-8" data-adminv2-director-qa="true">{children}</div>;
}
function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
    return (
        <section className="rounded-xl border border-alloy-stone/15 bg-white/60 px-4 py-3" data-qa-panel={testId}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">{title}</p>
            {children}
        </section>
    );
}
function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-alloy-stone/10 py-1 last:border-0">
            <span className="text-xs text-alloy-midnight/55">{k}</span>
            <span className={`text-sm text-alloy-midnight ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
        </div>
    );
}
function Callout({ tone, children, testId }: { tone: "warn"; children: React.ReactNode; testId?: string }) {
    return (
        <div className={`rounded-md border-l-4 px-3 py-2 text-sm ${tone === "warn" ? "border-alloy-ember bg-alloy-ember/5 text-alloy-midnight" : ""}`}
            data-qa-callout={testId}>{children}</div>
    );
}
function BackBar({ onBack }: { onBack: () => void }) {
    return <button type="button" onClick={onBack} className="text-xs text-alloy-midnight/60 underline" data-qa-back="true">← Director QA</button>;
}
function Primary({ children, onClick, disabled, testId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId}
            className="rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">{children}</button>
    );
}
function Secondary({ children, onClick, disabled, testId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId}
            className="rounded-md border border-alloy-stone/25 bg-white px-3 py-1.5 text-sm text-alloy-midnight disabled:opacity-40">{children}</button>
    );
}
