"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Scenario } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

/**
 * ONE SCENARIO AT A TIME, BESIDE THE PRODUCT.
 *
 * The operator keeps this in one tab and Alloy in the other, so the job is scanning rather than
 * reading: what to DO, what must CHANGE, what must NOT, and when to stop. Everything else stays
 * quiet. Nothing here presses the product's buttons and nothing infers a result — a scenario moves
 * only when the Director chooses one.
 */

type Readiness = {
    scenarioKey: string;
    ready: boolean;
    dataReady: boolean;
    navigationReady: boolean;
    unmet: string[];
    unreachable: string[];
};
/** Reachability of the subject on the surface a scenario navigates to — reported, never inferred. */
type Navigation = {
    reachable: boolean;
    unreachableReason: string | null;
    surface: string;
    accountsInCohort: number;
    truncated: boolean;
};
type ResultRow = { scenario_key: string; result: string; observation: string | null };
type Subject = {
    resolved: boolean; unresolvedReason: string | null; householdLabel: string;
    periodKey: string; periodLabel: string; outstandingCents: number; collectibleCents: number;
    namedParties: string[]; expectedFunding: Array<{ label: string; cents: number }>;
    postedCount: number; draftCount: number; reductionCount: number; paymentCount: number;
    billableChildren: Array<{ customerMemberId: string; displayName: string }>;
};
type Payload = {
    catalogVersion: string; environment: string; deployedRevision: string;
    subject: Subject; navigation: Navigation; scenarios: Scenario[]; readiness: Readiness[]; results: ResultRow[];
    baselineChanged: boolean; priorRevisions: string[];
};

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const CLASSIFICATIONS = [
    "PRODUCT_DEFECT", "CONFUSING_UX", "GUIDE_MISMATCH",
    "FIXTURE_DRIFT", "ENVIRONMENT_RUNTIME", "UNKNOWN_NEEDS_TRIAGE",
] as const;

export default function CoreFinancialsQaReader() {
    const [data, setData] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [index, setIndex] = useState(0);
    const [started, setStarted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [observation, setObservation] = useState("");
    const [expected, setExpected] = useState("");
    const [classification, setClassification] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/qa/financials-director", { cache: "no-store" });
            const json = (await res.json()) as Payload & { error?: string };
            if (!res.ok) { setError(json.error ?? `Could not read readiness (${res.status})`); return; }
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
        (k: string) => data?.results.find((r) => r.scenario_key === k)?.result ?? "not_run",
        [data],
    );
    const tally = useMemo(() => {
        const t = { pass: 0, fail: 0, blocked: 0, not_run: 0 };
        for (const s of walkthrough) { const r = resultOf(s.key) as keyof typeof t; t[r in t ? r : "not_run"] += 1; }
        return t;
    }, [walkthrough, resultOf]);

    const current = walkthrough[index];
    const readiness = data?.readiness.find((r) => r.scenarioKey === current?.key);

    const record = useCallback(async (result: string) => {
        if (!current) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/qa/financials-director", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    scenario_key: current.key, result, observation,
                    expected_result: expected, classification: classification || null,
                }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) { setError(json.error ?? "Could not record that result."); return; }
            setError(null); setObservation(""); setExpected(""); setClassification("");
            await load();
        } finally { setSaving(false); }
    }, [current, observation, expected, classification, load]);

    return (
        <main className="min-h-screen bg-white" data-qa-reader="core-financials">
            {/* The way back to the product is always on screen — this tab lives beside Alloy. */}
            <header className="sticky top-0 z-10 border-b border-alloy-midnight/10 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6 py-3">
                    <span className="text-[13px] font-semibold text-alloy-midnight">Core Financials Director QA</span>
                    <span className="rounded-full bg-alloy-ember/10 px-2 py-0.5 text-[11px] font-medium text-alloy-ember">
                        QA build · not a customer page
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                        <a href="/workspace" target="_blank" rel="noreferrer"
                            className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-[13px] font-medium text-white"
                            data-qa-open-product="true">
                            Open Alloy Workspace
                        </a>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-6 pb-24 pt-6">
                {error && !data ? <p className="text-sm text-alloy-ember" data-qa-error="true">{error}</p> : null}
                {!data ? <p className="text-sm text-alloy-midnight/55">Reading the environment…</p> : null}

                {data && !started ? (
                    <section className="space-y-5" data-qa-view="landing">
                        <div>
                            <h1 className="text-[22px] font-semibold tracking-tight text-alloy-midnight">
                                Core Financials — Director QA
                            </h1>
                            <p className="mt-1 text-[13px] text-alloy-midnight/60">
                                You drive the real product in the other tab. This records what you decide.
                            </p>
                        </div>

                        {data.baselineChanged ? (
                            <p className="rounded-lg border-l-[3px] border-alloy-ember bg-alloy-ember/5 px-3 py-2 text-[13px]"
                                data-qa-baseline-changed="true">
                                <strong className="font-semibold">Baseline changed.</strong>{" "}
                                Results exist against {data.priorRevisions.length} other build(s). They stay readable
                                but do not count for this one — an acceptance is only ever true of the build it was given.
                            </p>
                        ) : null}

                        <Facts rows={[
                            ["Environment", data.environment],
                            ["Build", data.deployedRevision.slice(0, 12)],
                            ["Scenario definitions", data.catalogVersion],
                            ["Household", data.subject.householdLabel],
                            ["Billing period", data.subject.periodLabel || "—"],
                            ["Child", data.subject.billableChildren.map((c) => c.displayName).join(", ") || "none"],
                            ["Responsible party", data.subject.namedParties.join(", ") || "none named yet"],
                            ["Outstanding", money(data.subject.outstandingCents)],
                            ["Collectible now", money(data.subject.collectibleCents)],
                            ["Ledger", `${data.subject.postedCount} posted · ${data.subject.draftCount} draft · ${data.subject.reductionCount} reductions · ${data.subject.paymentCount} payments`],
                            /*
                             * DATA AND NAVIGATION, SIDE BY SIDE. The account resolving is not the
                             * account being reachable, and reporting only the first is how a
                             * walkthrough gets certified that nobody can actually start.
                             */
                            ["Data readiness", data.subject.resolved ? "Account reads cleanly" : `NOT READY — ${data.subject.unresolvedReason ?? "unreadable"}`],
                            ["Navigation readiness", data.navigation.reachable
                                ? `Reachable via ${data.navigation.surface} · ${data.navigation.accountsInCohort} accounts listed`
                                : `NOT REACHABLE — ${data.navigation.unreachableReason ?? "the account is not listed"}`],
                        ]} />

                        <p className="text-[13px] text-alloy-midnight/70" data-qa-progress="true">
                            <strong className="font-semibold text-alloy-midnight">{tally.pass} / {walkthrough.length}</strong>{" "}
                            accepted · {tally.fail} failed · {tally.blocked} blocked · {tally.not_run} not run
                        </p>

                        <button type="button" data-qa-start="true"
                            onClick={() => {
                                const i = walkthrough.findIndex((s) => resultOf(s.key) === "not_run");
                                setIndex(i < 0 ? 0 : i); setStarted(true);
                            }}
                            className="rounded-lg bg-alloy-midnight px-4 py-2 text-[13px] font-medium text-white">
                            {tally.pass + tally.fail + tally.blocked > 0 ? "Resume walkthrough" : "Start walkthrough"}
                        </button>
                    </section>
                ) : null}

                {data && started && current ? (
                    <article className="space-y-5" data-qa-scenario={current.key}>
                        <button type="button" onClick={() => setStarted(false)}
                            className="text-[12px] text-alloy-midnight/55 underline underline-offset-2">
                            ← All scenarios
                        </button>

                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                                Scenario {String(current.order).padStart(2, "0")} · recorded {resultOf(current.key).replace("_", " ")}
                            </p>
                            <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-alloy-midnight">{current.title}</h1>
                            <p className="mt-2 text-[14px] text-alloy-midnight/75">{current.purpose}</p>
                            <p className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/60">{current.whyItMatters}</p>
                        </div>

                        {readiness && !readiness.ready ? (
                            <div className="rounded-lg border-l-[3px] border-alloy-ember bg-alloy-ember/5 px-3 py-2 text-[13px]"
                                data-qa-not-ready="true">
                                <strong className="font-semibold">Scenario not ready.</strong>
                                <ul className="mt-1 list-disc pl-5">
                                    {[...readiness.unmet, ...(readiness.unreachable ?? [])].map((u) => <li key={u}>{u}</li>)}
                                </ul>
                            </div>
                        ) : null}

                        <Section label="Starting state, read live just now">
                            <Facts rows={[
                                ["Household", data.subject.householdLabel],
                                ["Period", data.subject.periodLabel || "—"],
                                ["Outstanding", money(data.subject.outstandingCents)],
                                ["Collectible now", money(data.subject.collectibleCents)],
                                ["Posted / draft", `${data.subject.postedCount} / ${data.subject.draftCount}`],
                                ["Responsibility", data.subject.namedParties.join(", ") || "none named"],
                            ]} />
                        </Section>

                        <Section label="Navigate"><Ol items={current.navigate} /></Section>
                        <Section label="Do this"><Ol items={current.doThis} /></Section>

                        <Section label="Expect">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">What changes</p>
                            <Ul items={current.expectChanges.length ? current.expectChanges : ["Nothing."]} />
                            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">What stays unchanged</p>
                            <Ul items={current.expectUnchanged.length ? current.expectUnchanged : ["—"]} />
                            <p className="mt-3 text-[13px] italic text-alloy-midnight/65">{current.invariant}</p>
                        </Section>

                        <Section label="If it goes wrong, this is what it looks like">
                            <Ul items={current.failSymptoms} />
                        </Section>

                        <Section label="Record your result">
                            <textarea id="qa-observation" data-qa-observation="true" rows={3} value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                placeholder="What did you actually observe?"
                                className="w-full rounded-lg border border-alloy-midnight/15 p-2 text-[13px]" />
                            <textarea id="qa-expected" rows={2} value={expected}
                                onChange={(e) => setExpected(e.target.value)}
                                placeholder="What did you expect instead? (required for fail / blocked)"
                                className="mt-2 w-full rounded-lg border border-alloy-midnight/15 p-2 text-[13px]" />
                            <select id="qa-classification" data-qa-classification="true" value={classification}
                                onChange={(e) => setClassification(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-alloy-midnight/15 p-2 text-[13px]">
                                <option value="">Classification (required for fail / blocked)…</option>
                                {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {error ? <p className="mt-2 text-[13px] text-alloy-ember" data-qa-error="true">{error}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Btn primary onClick={() => void record("pass")} disabled={saving} id="record-pass">PASS</Btn>
                                <Btn onClick={() => void record("fail")} disabled={saving} id="record-fail">FAIL</Btn>
                                <Btn onClick={() => void record("blocked")} disabled={saving} id="record-blocked">BLOCKED</Btn>
                                <Btn onClick={() => void record("not_run")} disabled={saving} id="record-not-run">NOT RUN</Btn>
                            </div>
                            <p className="mt-2 text-[11px] text-alloy-midnight/45">
                                Nothing is inferred. Moving on does not accept anything.
                            </p>
                        </Section>

                        <div className="flex justify-between gap-2 border-t border-alloy-midnight/10 pt-4">
                            <Btn onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} id="prev">← Previous</Btn>
                            <Btn onClick={() => setIndex(Math.min(walkthrough.length - 1, index + 1))}
                                disabled={index >= walkthrough.length - 1} id="next">Next scenario →</Btn>
                        </div>
                    </article>
                ) : null}
            </div>
        </main>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">{label}</p>
            {children}
        </section>
    );
}
function Facts({ rows }: { rows: Array<[string, string]> }) {
    return (
        <dl className="divide-y divide-alloy-midnight/8 rounded-lg border border-alloy-midnight/10">
            {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
                    <dt className="text-[12px] text-alloy-midnight/55">{k}</dt>
                    <dd className="text-[13px] text-alloy-midnight">{v}</dd>
                </div>
            ))}
        </dl>
    );
}
const Ol = ({ items }: { items: readonly string[] }) => (
    <ol className="list-decimal space-y-1 pl-5 text-[14px] text-alloy-midnight/80">{items.map((i) => <li key={i}>{i}</li>)}</ol>
);
const Ul = ({ items }: { items: readonly string[] }) => (
    <ul className="list-disc space-y-1 pl-5 text-[14px] text-alloy-midnight/80">{items.map((i) => <li key={i}>{i}</li>)}</ul>
);
function Btn({ children, onClick, disabled, primary, id }: {
    children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; id?: string;
}) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} data-qa-action={id}
            className={primary
                ? "rounded-lg bg-alloy-midnight px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                : "rounded-lg border border-alloy-midnight/20 px-3 py-1.5 text-[13px] text-alloy-midnight disabled:opacity-40"}>
            {children}
        </button>
    );
}
