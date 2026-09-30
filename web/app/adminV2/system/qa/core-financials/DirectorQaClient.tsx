"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SUITE_KEY } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";
import {
    EMPTY_DRAFT,
    clearDrafts,
    readDraft,
    readPosition,
    resolveResumeIndex,
    writeDraft,
    writePosition,
    type DraftRead,
    type QaScope,
} from "@/lib/qa/runtime/directorQaSession";

import type { Scenario } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

/**
 * ONE SCENARIO AT A TIME, AND NEVER AN INFERRED PASS.
 *
 * The harness presents, deep-links and records. It does not press the product's buttons and it does
 * not decide whether the product was right — a scenario changes state only when the Director chooses
 * a result. "Next" is navigation, not acceptance, which is why it never writes anything.
 */

type Readiness = {
    scenarioKey: string;
    ready: boolean;
    /** The account's facts satisfy the preconditions. */
    dataReady: boolean;
    /** The operator can actually reach the subject on the surface the scenario navigates to. */
    navigationReady: boolean;
    unmet: string[];
    unreachable: string[];
};
type Navigation = {
    reachable: boolean;
    unreachableReason: string | null;
    surface: string;
    accountsInCohort: number;
    truncated: boolean;
};
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
    suiteKey?: string;
    catalogVersion: string;
    environment: string;
    deployedRevision: string;
    subject: Subject;
    subjectReference: { customerId: string; householdLabel: string; site: string; fixturePath: string };
    /** The catalog's scenarios, each carrying the evidence classes the route resolved for it. */
    scenarios: (Scenario & { evidence?: readonly string[] })[];
    /** Restated on the surface because it is the rule most easily forgotten while walking. */
    noAutomaticPass?: string;
    /** Where engineering stopped deliberately, keyed to the scenario that meets each one. */
    evidenceBoundaries?: { key: string; scenarioKey: string; statement: string }[];
    /** Which account may be spent and which may only be read. Stated before the walk starts. */
    fixtureDoctrine?: { fixture: string; rule: string; why: string }[];
    navigation: Navigation;
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
    const [carriedFrom, setCarriedFrom] = useState<DraftRead["carriedFrom"]>(null);
    const restoredRef = useRef(false);
    const loadedDraftForRef = useRef<string | null>(null);

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

    /*
     * WHAT THE DIRECTOR IS ACTUALLY ASKED TO DRIVE.
     *
     * `AUTOMATED_CERTIFIED_HUMAN_PENDING` belongs in this list and used to be filtered out of it.
     * That filter was the "no automatic pass" rule inverted: a scenario with a deterministic suite
     * behind it was silently removed from the walkthrough instead of being offered with its
     * evidence stated. Nine Autopay scenarios were certified and unreachable here because of it.
     *
     * `EXPLICITLY_DEFERRED` is included too, so the Director can see what the environment cannot
     * reach and record `deferred` against it deliberately, rather than finding a gap in the numbering.
     */
    const walkthrough = useMemo(
        () => (data?.scenarios ?? [])
            .filter((s) => s.disposition === "HUMAN_WALKTHROUGH"
                || s.disposition === "AUTOMATED_CERTIFIED_HUMAN_PENDING"
                || s.disposition === "EXPLICITLY_DEFERRED")
            .sort((a, b) => a.order - b.order),
        [data],
    );
    const resultOf = useCallback(
        (key: string) => data?.results.find((r) => r.scenario_key === key)?.result ?? "not_run",
        [data],
    );
    const tally = useMemo(() => {
        const t = { pass: 0, fail: 0, blocked: 0, deferred: 0, not_run: 0 };
        for (const s of walkthrough) {
            const r = resultOf(s.key) as keyof typeof t;
            t[r in t ? r : "not_run"] += 1;
        }
        return t;
    }, [walkthrough, resultOf]);

    /** The evidence vocabulary in the words a Director reads, not the enum's. */
    const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
        HUMAN_WALKTHROUGH: "you drive this",
        AUTOMATED_CERTIFIED: "suite-certified · supporting",
        MOUNTED_CERTIFIED: "mounted on deployed · supporting",
        REAL_STRIPE_TEST_ACT: "real Stripe TEST act",
        CONTROLLED_FIXTURE: "spends a controlled fixture",
        READ_ONLY_EVIDENCE: "read only — changes nothing",
        DEFERRED_PROVIDER_DEPENDENT: "deferred · provider-dependent",
    };

    const current = walkthrough[view.index];
    const currentBoundary = (data?.evidenceBoundaries ?? []).find((b) => b.scenarioKey === current?.key);
    const currentReadiness = data?.readiness.find((r) => r.scenarioKey === current?.key);

    /*
     * THE SAME PLACE-AND-DRAFT CONTRACT THE LOCAL READER KEEPS, from the same module.
     *
     * The hosted harness carries the identical defect: position and half-written testimony lived in
     * React state, so any reload — a deploy, a session refresh, a stray navigation — returned the
     * Director to the landing surface with an empty notes field. One implementation, two surfaces;
     * a second copy of this rule is how the two would eventually disagree about what was saved.
     */
    const scope: QaScope | null = useMemo(
        () => (data
            ? {
                  suiteKey: data.suiteKey ?? SUITE_KEY,
                  environment: data.environment,
                  catalogVersion: data.catalogVersion,
                  deployedRevision: data.deployedRevision,
              }
            : null),
        [data],
    );

    const resume = useCallback(() => {
        if (!scope || walkthrough.length === 0) return { index: 0, started: false, source: "start" as const };
        return resolveResumeIndex({
            scenarioKeys: walkthrough.map((s) => s.key),
            resultOf,
            stored: readPosition(scope),
        });
    }, [scope, walkthrough, resultOf]);

    useEffect(() => {
        if (restoredRef.current || !scope || walkthrough.length === 0) return;
        restoredRef.current = true;
        const at = resume();
        if (at.started) setView({ mode: "scenario", index: at.index });
        else setView((v) => (v.mode === "landing" ? { mode: "landing", index: at.index } : v));
        /* A restore is not a move; writing back what it just read is how the clobber got in. */
        if (at.source !== "stored" && scope && walkthrough[at.index]) {
            writePosition(scope, walkthrough[at.index].key, at.started);
        }
    }, [scope, walkthrough, resume]);

    /*
     * POSITION IS WRITTEN BY THE MOVE, NEVER MIRRORED FROM A RENDER.
     *
     * This surface carried the identical defect the local reader did: an effect wrote whatever
     * `current` happened to be, and on every mount it fired in the same commit as the restore,
     * before React had applied the restored index — putting scenario 01 over the Director's real
     * position for a window on every single load. An effect cannot tell "the Director moved" from
     * "React rendered a default", which is exactly the distinction the rule turns on.
     */
    const goTo = useCallback(
        (nextIndex: number, mode: "landing" | "scenario" | "list" | "failures" | "demo") => {
            const bounded = Math.max(0, Math.min(Math.max(walkthrough.length - 1, 0), nextIndex));
            const target = walkthrough[bounded];
            setView({ mode, index: bounded });
            if (scope && target) writePosition(scope, target.key, mode === "scenario");
        },
        [scope, walkthrough],
    );

    useEffect(() => {
        if (!scope || !current) return;
        if (loadedDraftForRef.current === current.key) return;
        loadedDraftForRef.current = current.key;
        const found = readDraft(scope, current.key);
        setObservation(found.draft.observation);
        setExpected(found.draft.expected);
        setClassification(found.draft.classification);
        setCarriedFrom(found.carriedFrom);
    }, [scope, current]);

    useEffect(() => {
        if (!scope || !current || loadedDraftForRef.current !== current.key) return;
        const t = setTimeout(() => {
            writeDraft(scope, current.key, { observation, expected, classification });
        }, 300);
        return () => clearTimeout(t);
    }, [scope, current, observation, expected, classification]);

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
            /* Submitted, so the draft is spent — see the local reader for the same rule. */
            if (scope) clearDrafts(scope, current.key);
            loadedDraftForRef.current = null;
            setError(null);
            setObservation(EMPTY_DRAFT.observation);
            setExpected(EMPTY_DRAFT.expected);
            setClassification(EMPTY_DRAFT.classification);
            setEvidence("");
            setCarriedFrom(null);
            await load();
        } finally { setSaving(false); }
    }, [current, observation, expected, classification, evidence, load]);

    if (error && !data) return <Shell><p className="text-sm text-alloy-ember" data-qa-error="true">{error}</p></Shell>;
    if (!data) return <Shell><p className="text-sm text-alloy-midnight/60">Reading the environment…</p></Shell>;

    const s = data.subject;
    const nav = data.navigation;

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
                    <Row k="Data readiness" v={s.resolved ? "Account reads cleanly" : `NOT READY — ${s.unresolvedReason}`} />
                    {/*
                     * NAVIGATION IS REPORTED BESIDE THE DATA, never folded into it. A harness that
                     * says "ready" on the strength of an API read has certified a walkthrough whose
                     * first step may be impossible.
                     */}
                    <Row
                        k="Navigation readiness"
                        v={
                            nav
                                ? nav.reachable
                                    ? `Reachable via ${nav.surface} (${nav.accountsInCohort} accounts listed)`
                                    : `NOT REACHABLE — ${nav.unreachableReason ?? "the account is not listed"}`
                                : "—"
                        }
                    />
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
                        Passed {tally.pass} · Failed {tally.fail} · Blocked {tally.blocked} · Deferred {tally.deferred} · Not run {tally.not_run}
                        {" · "}Deferred {(data.scenarios.length - walkthrough.length)}
                    </p>
                </Panel>

                <div className="flex flex-wrap gap-2">
                    <Primary onClick={() => goTo(resume().index, "scenario")}
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

            {/*
              * WHAT THIS SCENARIO WILL COST YOU, before you start it.
              *
              * "Real Stripe act on a controlled fixture" is the sentence that decides whether now is
              * the right moment. It belongs above the steps, not discovered halfway down them.
              *
              * The certified classes sit here too, as SUPPORTING evidence. They are what to expect,
              * never an answer — the line beneath says so, in the catalog's own words.
              */}
            <Panel title="What this proof is made of" testId="scenario-evidence">
                <ul className="flex flex-wrap gap-1.5" data-qa-evidence>
                    {(current.evidence ?? ["HUMAN_WALKTHROUGH"]).map((e) => (
                        <li
                            key={e}
                            data-qa-evidence-class={e}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                e === "HUMAN_WALKTHROUGH"
                                    ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                    : e === "DEFERRED_PROVIDER_DEPENDENT"
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-alloy-cloud/70 text-alloy-midnight/70"
                            }`}
                        >
                            {EVIDENCE_LABELS[e] ?? e.replaceAll("_", " ").toLowerCase()}
                        </li>
                    ))}
                </ul>
                {data?.noAutomaticPass ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/55">{data.noAutomaticPass}</p>
                ) : null}
            </Panel>

            {currentBoundary ? (
                <Callout tone="warn" testId="scenario-evidence-boundary">
                    <strong>KNOWN EVIDENCE BOUNDARY.</strong>
                    <p className="mt-1">{currentBoundary.statement}</p>
                    <p className="mt-1">
                        This was decided before the walkthrough, not discovered during it. DEFERRED is the truthful
                        answer here — it is not a failure.
                    </p>
                </Callout>
            ) : null}

            {blockedByPreconditions ? (
                <Callout tone="warn" testId="scenario-not-ready">
                    <strong>SCENARIO NOT READY.</strong>
                    <ul className="mt-1 list-disc pl-5">
                        {[...currentReadiness!.unmet, ...(currentReadiness!.unreachable ?? [])].map((u) => <li key={u}>{u}</li>)}
                    </ul>
                    <p className="mt-1">
                        Run the scenario this one depends on first. Testing against the wrong starting state produces a
                        confused tester and a worthless record, not a finding.
                    </p>
                </Callout>
            ) : null}

            {/*
              * WHICH ACCOUNT YOU MAY SPEND, before you touch one.
              *
              * This used to live only in a markdown packet — somewhere the person walking the
              * product was not looking. One of these fixtures IS a certification, and the cost of
              * learning that late is destroying evidence that cannot be re-created.
              */}
            {(data?.fixtureDoctrine ?? []).length ? (
                <Panel title="Which account you may spend" testId="fixture-doctrine">
                    <ul className="space-y-2" data-qa-fixture-doctrine>
                        {(data?.fixtureDoctrine ?? []).map((f) => (
                            <li key={f.fixture} data-qa-fixture={f.fixture}>
                                <p className="text-sm font-medium text-alloy-midnight">{f.fixture}</p>
                                <p className="text-sm text-alloy-midnight/80">{f.rule}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-alloy-midnight/55">{f.why}</p>
                            </li>
                        ))}
                    </ul>
                </Panel>
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
                {carriedFrom ? (
                    /* Offered, never adopted — the same rule the local reader keeps. */
                    <p className="mb-2 rounded-md border-l-[3px] border-alloy-stone/40 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/70"
                        data-qa-draft-carried="true">
                        These notes were saved against build{" "}
                        <strong className="font-medium">{carriedFrom.deployedRevision.slice(0, 12)}</strong>
                        {" "}(definitions {carriedFrom.catalogVersion}), not this one. Keep them if they still apply,
                        or clear the fields.
                    </p>
                ) : null}
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
                    {/*
                      * DEFERRED, beside BLOCKED and meaning something different. Blocked is
                      * "something stopped me"; deferred is "this environment cannot reach it
                      * safely, and that was decided before I started". Two of these scenarios are
                      * deferred by design — see the evidence boundaries.
                      */}
                    <Secondary onClick={() => void record("deferred")} disabled={saving} testId="record-deferred">DEFERRED</Secondary>
                    <Secondary onClick={() => void record("not_run")} disabled={saving} testId="record-not-run">NOT RUN</Secondary>
                </div>
                <p className="mt-2 text-[11px] text-alloy-midnight/50">
                    Nothing here is inferred. A scenario changes only when you choose a result, and moving on does not
                    accept anything.
                </p>
            </Panel>

            <div className="flex flex-wrap justify-between gap-2">
                <Secondary onClick={() => goTo(view.index - 1, "scenario")}
                    disabled={view.index === 0} testId="prev-scenario">← Previous</Secondary>
                <Secondary onClick={() => setView({ mode: "landing", index: 0 })} testId="save-exit">Save &amp; exit</Secondary>
                <Secondary onClick={() => goTo(view.index + 1, "scenario")}
                    disabled={view.index >= walkthrough.length - 1} testId="next-scenario">Next scenario →</Secondary>
            </div>
        </Shell>
    );
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
/**
 * BEND PINE, NOT MIDNIGHT.
 *
 * Measured on the deployed surface: PASS rendered `rgb(24, 39, 58)`. Every other primary the
 * Director meets while walking Financials — Take payment, Apply a held deposit, Set up Autopay,
 * Authorize and save — is Bend Pine, so the one button that records their acceptance was the odd
 * one out, and the QA surface is supposed to feel like the product it is judging.
 *
 * The `data-testid` also lives here now. It was passed as `data-qa-action`, which meant every
 * selector written against `[data-testid="record-pass"]` matched nothing and a test asserting the
 * controls exist could only ever have passed by reading their text.
 */
function Primary({ children, onClick, disabled, testId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId} data-testid={testId}
            className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">{children}</button>
    );
}
function Secondary({ children, onClick, disabled, testId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} data-qa-action={testId}
            data-testid={testId}
            className="rounded-md border border-alloy-stone/25 bg-white px-3 py-1.5 text-sm text-alloy-midnight disabled:opacity-40">{children}</button>
    );
}
