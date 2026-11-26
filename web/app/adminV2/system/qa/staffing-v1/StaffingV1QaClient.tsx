"use client";

/**
 * The Staffing V1 acceptance harness.
 *
 * It presents, deep-links and records. It does not press the product's buttons: every
 * staffing fact in this walkthrough is made by the operator through the Calendar's own
 * commands, which is what makes the resulting acceptance mean anything.
 *
 * Progress survives leaving the page because it lives in the results table, keyed by build —
 * the operator is expected to spend most of this walkthrough in the product, not here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Scenario } from "@/lib/qa/staffingV1Qa/scenarioCatalog";

type Readiness = { key: string; status: "RUNNABLE" | "FIXTURE_NEEDED" | "BLOCKED"; unmet: string[] };
type Result = {
    scenario_key: string;
    result: "pass" | "fail" | "blocked" | "not_run";
    observation: string | null;
    classification: string | null;
    tester_email: string | null;
};
type Fixture = {
    ok: boolean;
    error: string | null;
    status: "READY" | "PARTIAL" | "BLOCKED";
    siteLabel: string;
    roomLabel: string;
    dateLabel: string;
    date: string;
    siteLocationId: string;
    roomSegments: { start: string; end: string; expectedChildren: number; requiredStaff: number | null; plannedStaff: number; state: string }[];
    checks: Record<string, boolean>;
};
type Payload = {
    environment: string;
    deployedRevision: string;
    catalogVersion: string;
    fixture: Fixture;
    scenarios: Scenario[];
    readiness: Readiness[];
    results: Result[];
    resultsError: string | null;
};

const CLASSIFICATIONS = [
    "PRODUCT_DEFECT", "CONFUSING_UX", "GUIDE_MISMATCH",
    "FIXTURE_DRIFT", "ENVIRONMENT_RUNTIME", "UNKNOWN_NEEDS_TRIAGE",
];

export default function StaffingV1QaClient() {
    const [data, setData] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [index, setIndex] = useState<number | null>(null);
    const [observation, setObservation] = useState("");
    const [classification, setClassification] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/qa/staffing-v1");
            const json = await res.json();
            if (!res.ok) { setError(json?.error ?? "The harness could not read the environment."); return; }
            setData(json); setError(null);
        } catch {
            setError("The harness could not read the environment.");
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const byKey = useMemo(() => {
        const m = new Map<string, Result>();
        for (const r of data?.results ?? []) m.set(r.scenario_key, r);
        return m;
    }, [data]);

    const readinessByKey = useMemo(() => {
        const m = new Map<string, Readiness>();
        for (const r of data?.readiness ?? []) m.set(r.key, r);
        return m;
    }, [data]);

    const record = useCallback(async (scenarioKey: string, result: string) => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/qa/staffing-v1", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ scenario_key: scenarioKey, result, observation, classification }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json?.error ?? "That result was not recorded."); return; }
            setError(null); setObservation(""); setClassification("");
            await load();
        } finally { setSaving(false); }
    }, [observation, classification, load]);

    if (error && !data) return <Shell><p className="text-sm text-alloy-ember" data-qa-error="true">{error}</p></Shell>;
    if (!data) return <Shell><p className="text-sm text-alloy-midnight/60">Reading the environment…</p></Shell>;

    const { fixture, scenarios } = data;
    const counts = {
        pass: scenarios.filter((s) => byKey.get(s.key)?.result === "pass").length,
        fail: scenarios.filter((s) => byKey.get(s.key)?.result === "fail").length,
        blocked: scenarios.filter((s) => byKey.get(s.key)?.result === "blocked").length,
    };
    const remaining = scenarios.length - counts.pass - counts.fail - counts.blocked;
    const current = index != null ? scenarios[index] : null;

    if (current) {
        const r = readinessByKey.get(current.key);
        const prior = byKey.get(current.key);
        return (
            <Shell>
                <button type="button" onClick={() => setIndex(null)} className="text-xs text-alloy-midnight/60 underline" data-qa-back="true">← Staffing V1 QA</button>
                <header className="mt-3 space-y-1" data-qa-scenario={current.key}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                        Step {current.order} of {scenarios.length}
                        {r && r.status !== "RUNNABLE" ? ` · ${r.status.replace("_", " ")}` : ""}
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{current.title}</h2>
                    <p className="text-sm text-alloy-midnight/70">{current.purpose}</p>
                </header>

                {r && r.status !== "RUNNABLE" ? (
                    <div className="mt-3 rounded-lg border border-alloy-gold/40 bg-alloy-gold/10 px-3 py-2 text-[12px] text-alloy-midnight" data-qa-fixture-needed="true">
                        <strong>{r.status === "FIXTURE_NEEDED" ? "Fixture needed" : "Blocked"}.</strong>{" "}
                        {current.dispositionReason ?? `Not ready: ${r.unmet.join("; ")}.`} Record this as <em>Blocked</em> rather than passing it.
                    </div>
                ) : null}

                <Section title="Why it matters"><p className="text-[13px] text-alloy-midnight/75">{current.whyItMatters}</p></Section>
                <Section title="Where to go"><Ol items={current.navigate} /></Section>
                <Section title="What to do"><Ol items={current.doThis} /></Section>
                {current.expectChanges.length > 0 ? <Section title="What should change"><Ul items={current.expectChanges} /></Section> : null}
                {current.expectUnchanged.length > 0 ? <Section title="What must NOT change"><Ul items={current.expectUnchanged} /></Section> : null}
                <Section title="The rule this protects"><p className="text-[13px] italic text-alloy-midnight/70">{current.invariant}</p></Section>
                {current.failSymptoms.length > 0 ? <Section title="What a failure looks like"><Ul items={current.failSymptoms} /></Section> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                    <a href="/workspace" target="_blank" rel="noreferrer" data-qa-open-product="true"
                        className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-sm text-alloy-midnight/75 hover:bg-alloy-stone/10">
                        Open the product in a new tab
                    </a>
                    <span className="self-center text-[11px] text-alloy-midnight/50">
                        {fixture.siteLabel} · {fixture.dateLabel} · {fixture.roomLabel}
                    </span>
                </div>

                <div className="mt-4 space-y-2">
                    <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3}
                        data-qa-observation="true" placeholder="What did you actually see? Required for a failure or a block."
                        className="w-full rounded-md border border-alloy-stone/25 px-3 py-2 text-[13px]" />
                    <select value={classification} onChange={(e) => setClassification(e.target.value)} data-qa-classification="true"
                        className="rounded-md border border-alloy-stone/25 px-2 py-1 text-[12px]">
                        <option value="">Classification (for a failure or block)</option>
                        {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>)}
                    </select>
                </div>

                {error ? <p className="mt-2 text-[12px] text-alloy-ember" data-qa-error="true">{error}</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                    <Primary onClick={() => void record(current.key, "pass")} disabled={saving} testId="record-pass">PASS</Primary>
                    <Secondary onClick={() => void record(current.key, "fail")} disabled={saving} testId="record-fail">FAIL</Secondary>
                    <Secondary onClick={() => void record(current.key, "blocked")} disabled={saving} testId="record-blocked">BLOCKED</Secondary>
                    {index != null && index + 1 < scenarios.length ? (
                        <Secondary onClick={() => { setIndex(index + 1); setObservation(""); setClassification(""); }} testId="next">Next step →</Secondary>
                    ) : null}
                </div>
                {prior ? (
                    <p className="mt-2 text-[12px] text-alloy-midnight/60" data-qa-prior-result={prior.result}>
                        Recorded on this build: <strong>{prior.result}</strong>
                        {prior.tester_email ? ` by ${prior.tester_email}` : ""}
                        {prior.observation ? ` — “${prior.observation}”` : ""}
                    </p>
                ) : null}
            </Shell>
        );
    }

    return (
        <Shell>
            <header className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">
                    Staffing / Scheduling / Coverage V1 — Human Acceptance QA
                </h1>
                <p className="text-xs text-alloy-midnight/60" data-qa-build="true">
                    {data.environment} · build {data.deployedRevision.slice(0, 9)} · questions {data.catalogVersion}
                </p>
            </header>

            <div className="mt-4 rounded-xl border border-alloy-stone/20 bg-white/70 p-4" data-qa-fixture-status={fixture.status}>
                <p className="text-sm font-semibold text-alloy-midnight">
                    Fixture: {fixture.status === "READY" ? "Ready" : fixture.status === "PARTIAL" ? "Partly ready" : "Blocked"}
                </p>
                <p className="mt-1 text-[12px] text-alloy-midnight/65">
                    {fixture.siteLabel} · {fixture.dateLabel} · {fixture.roomLabel}
                </p>
                {fixture.error ? <p className="mt-1 text-[12px] text-alloy-ember">{fixture.error}</p> : null}
                {fixture.roomSegments.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-[12px] text-alloy-midnight/70" data-qa-fixture-shape="true">
                        {fixture.roomSegments.map((s) => (
                            <li key={`${s.start}-${s.end}`}>
                                {s.start}–{s.end}: {s.expectedChildren} expected · needs{" "}
                                {s.requiredStaff == null ? "unknown" : s.requiredStaff} · {s.plannedStaff} planned ·{" "}
                                <strong>{s.state === "short" ? "SHORT" : s.state === "sufficient" ? "STAFFED" : s.state.toUpperCase()}</strong>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-[12px] text-alloy-midnight/60">
                        Nothing is scheduled in that room on that day. Steps that need demand will show as blocked.
                    </p>
                )}
            </div>

            <p className="mt-4 text-sm text-alloy-midnight" data-qa-progress="true">
                {counts.pass} passed · {counts.fail} failed · {counts.blocked} blocked · {remaining} remaining
            </p>
            <p className="mt-1 text-xs text-alloy-midnight/60">
                Progress is kept against this build, so you can leave for the product and come back.
            </p>

            <div className="mt-3">
                <Primary onClick={() => setIndex(0)} testId="start">
                    {counts.pass + counts.fail + counts.blocked > 0 ? "Continue QA" : "Start QA"}
                </Primary>
            </div>

            <ul className="mt-4 space-y-1" data-qa-scenario-list="true">
                {scenarios.map((s, i) => {
                    const r = byKey.get(s.key);
                    const ready = readinessByKey.get(s.key);
                    return (
                        <li key={s.key} data-qa-scenario-row={s.key}
                            className="flex items-baseline justify-between gap-3 rounded-md border border-alloy-stone/15 bg-white/60 px-3 py-2">
                            <button type="button" className="text-left text-sm text-alloy-midnight hover:underline" onClick={() => setIndex(i)}>
                                {s.order}. {s.title}
                            </button>
                            <span className="shrink-0 text-[11px] uppercase tracking-wide text-alloy-midnight/50">
                                {r?.result ?? (ready && ready.status !== "RUNNABLE" ? ready.status.replace("_", " ").toLowerCase() : "not run")}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-5 rounded-xl border border-alloy-stone/20 bg-white/60 p-4 text-[12px] text-alloy-midnight/70">
                <p className="font-semibold text-alloy-midnight">After you finish</p>
                <p className="mt-1">
                    The QA fixture is left in place on purpose — this walkthrough needs it. Cleanup instructions are in
                    the walkthrough document, and nothing is cleaned up until you say you are done.
                </p>
            </div>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="w-full max-w-3xl space-y-2 p-5" data-qa-suite="staffing_v1_human_qa">{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">{title}</p>
            <div className="mt-1">{children}</div>
        </section>
    );
}
function Ol({ items }: { items: string[] }) {
    return <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-alloy-midnight/80">{items.map((t) => <li key={t}>{t}</li>)}</ol>;
}
function Ul({ items }: { items: string[] }) {
    return <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-alloy-midnight/80">{items.map((t) => <li key={t}>{t}</li>)}</ul>;
}
function Primary({ onClick, disabled, testId, children }: { onClick: () => void; disabled?: boolean; testId: string; children: React.ReactNode }) {
    return <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId}
        className="rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">{children}</button>;
}
function Secondary({ onClick, disabled, testId, children }: { onClick: () => void; disabled?: boolean; testId: string; children: React.ReactNode }) {
    return <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId}
        className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-sm text-alloy-midnight/75 disabled:opacity-40">{children}</button>;
}
