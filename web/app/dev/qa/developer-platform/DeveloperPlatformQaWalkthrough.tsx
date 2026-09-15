"use client";

/**
 * The interactive half of the Developer Platform QA walkthrough.
 *
 * PERSISTENCE, AND WHY IT LIVES IN THE BROWSER. There is no QA-note persistence
 * authority anywhere in this repository — no table, no route, no prior
 * walkthrough that stored a result. Rather than invent a schema and an internal
 * API for a dev-only tool, progress is written to localStorage on every change
 * and the run is exported as JSON or Markdown, which is what makes the data
 * durable. That tradeoff is stated on the page itself rather than hidden: the
 * operator is told where their answers live and how to get them out.
 *
 * NO SECRET EVER TOUCHES THIS PAGE. Notes are free text and stored in the
 * browser, so the page says so beside the field. Live verification issues and
 * revokes its own credential server-side and returns only sentences; the secret
 * the OPERATOR sees in DP-QA-12 is never read here. Re-displaying it would
 * defeat the control DP-QA-13 exists to verify.
 *
 * MACHINE EVIDENCE NEVER SETS A RESULT. Deterministic checks answer "did the
 * boundary hold"; they cannot answer "would an external developer understand
 * this", which is the only question this instrument exists to ask. So evidence
 * renders beside the human question and the four result buttons stay untouched
 * by it — the operator reads the evidence and still decides.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    ALL_STEPS,
    SECTIONS,
    SEVERITIES,
    STEP_SURFACES,
    type QaStep,
    type Severity,
    type StepResult,
} from "./steps";

type FixtureRow = { key: string; slug: string; name: string; proves: string; installationId: string };
type FixtureState =
    | { ok: true; installations: FixtureRow[] }
    | { ok: false; code: string; detail: string; repairCommand: string };
type MachineCheck = { id: string; steps: string[]; label: string; verdict: "PASS" | "FAIL" | "BLOCKED"; evidence: string };
type Verification = { ok: boolean; ranAt: string; checks: MachineCheck[]; blockedReason?: string };

const STORAGE_KEY = "alloy.qa.developer-platform.v1";

type Entry = { result?: StepResult; severity?: Severity; notes?: string; evidence?: string; at?: string };
type Acceptance = "" | "PARTNER_READY" | "WITH_FOLLOWUPS" | "REPAIR_REQUIRED";
type RunState = {
    entries: Record<string, Entry>;
    operator: string;
    started: boolean;
    openSection: string;
    acceptance: Acceptance;
    acceptanceNotes: string;
    updatedAt?: string;
};

const EMPTY: RunState = { entries: {}, operator: "", started: false, openSection: "A", acceptance: "", acceptanceNotes: "" };

const ACCEPTANCE: { value: Exclude<Acceptance, "">; label: string; blurb: string; tone: string }[] = [
    {
        value: "PARTNER_READY",
        label: "ACCEPTED — PARTNER READY",
        tone: "#0f7b4f",
        blurb: "I am comfortable sending the Developer Platform specification and the Classroom Coach readiness package to an external technical partner. The documented API behaves as described, the materials are professional, and the limitations are represented honestly.",
    },
    {
        value: "WITH_FOLLOWUPS",
        label: "ACCEPTED WITH FOLLOW-UPS",
        tone: "#b54708",
        blurb: "The technical contract is correct and usable, but identified presentation or documentation issues should be corrected before the materials go out. List every required follow-up below.",
    },
    {
        value: "REPAIR_REQUIRED",
        label: "REJECTED — REPAIR REQUIRED",
        tone: "#b42318",
        blurb: "One or more product, contract, security-boundary, documentation or presentation defects materially undermine the experience. List every blocking defect below.",
    },
];

/** The fifteen conditions that override any aggregate score. */
const HARD_FAILURE_RULES = [
    "A documented public endpoint does not exist.",
    "An implemented public endpoint materially contradicts its documentation.",
    "OpenAPI materially contradicts runtime.",
    "Tenant isolation fails.",
    "Location or resource boundary fails.",
    "Restricted-empty grants broader access.",
    "Revoked credentials remain usable.",
    "Suspended Installations remain usable contrary to contract.",
    "A one-time credential secret can be recovered after leaving or reloading.",
    "A real Credential, token, customer datum, or private identifier appears in external documentation.",
    "Attendance is represented as a currently available public mutation.",
    "An unverified Classroom Coach capability is represented as fact.",
    "The Classroom Coach packet exposes internal security findings.",
    "The live quickstart cannot be completed through the actual HTTP boundary.",
    "Human QA results or notes disappear or reset during normal use.",
];

const RESULTS: { value: StepResult; label: string; tone: string }[] = [
    { value: "PASS", label: "Pass", tone: "#0f7b4f" },
    { value: "FAIL", label: "Fail", tone: "#b42318" },
    { value: "BLOCKED", label: "Blocked", tone: "#b54708" },
    { value: "NEEDS_REVIEW", label: "Needs review", tone: "#5925dc" },
];

function load(): RunState {
    if (typeof window === "undefined") return EMPTY;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw) as Partial<RunState>;
        return {
            entries: parsed.entries ?? {},
            operator: parsed.operator ?? "",
            started: parsed.started ?? false,
            openSection: parsed.openSection ?? "A",
            acceptance: parsed.acceptance ?? "",
            acceptanceNotes: parsed.acceptanceNotes ?? "",
            updatedAt: parsed.updatedAt,
        };
    } catch {
        // A corrupt value must not lock the operator out of the walkthrough.
        return EMPTY;
    }
}

export default function DeveloperPlatformQaWalkthrough() {
    const [state, setState] = useState<RunState>(EMPTY);
    const [restored, setRestored] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [fixture, setFixture] = useState<FixtureState | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [verification, setVerification] = useState<Verification | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [envOpen, setEnvOpen] = useState(false);
    const baseUrl = useRef<string>("");

    // Restore before first paint of the interactive controls, so a reload never
    // shows an empty form that would tempt the operator to start over.
    useEffect(() => {
        setState(load());
        setRestored(true);
        baseUrl.current = window.location.origin;
    }, []);

    /**
     * The environment prepares itself.
     *
     * Asking an operator to run a fixture script before they may begin is
     * administration, not QA. The page ensures the fixture on load and only
     * involves a human when preparation actually fails — and then with one exact
     * command rather than an explanation.
     */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setPreparing(true);
            try {
                const res = await fetch("/api/dev/qa/developer-platform", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "ensure_fixture" }),
                });
                const body = (await res.json()) as { fixture: FixtureState };
                if (!cancelled) setFixture(body.fixture);
            } catch (err) {
                if (!cancelled) {
                    setFixture({
                        ok: false,
                        code: "qa_backend_unreachable",
                        detail: String((err as Error)?.message ?? err),
                        repairCommand: "npm run qa:developer-platform -- ensure",
                    });
                }
            } finally {
                if (!cancelled) setPreparing(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const runVerification = useCallback(async () => {
        setVerifying(true);
        try {
            const res = await fetch("/api/dev/qa/developer-platform", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "verify" }),
            });
            setVerification((await res.json()) as Verification);
        } catch (err) {
            setVerification({
                ok: false, ranAt: new Date().toISOString(), checks: [],
                blockedReason: String((err as Error)?.message ?? err),
            });
        } finally {
            setVerifying(false);
        }
    }, []);

    /** Machine evidence, indexed by the step it informs. It never sets a result. */
    const evidenceByStep = useMemo(() => {
        const map: Record<string, MachineCheck[]> = {};
        for (const c of verification?.checks ?? []) {
            for (const id of c.steps) (map[id] ??= []).push(c);
        }
        return map;
    }, [verification]);

    useEffect(() => {
        if (!restored) return;
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
            );
        } catch {
            /* private browsing, quota, cleared site data — the walkthrough still works */
        }
    }, [state, restored]);

    const update = useCallback((id: string, patch: Partial<Entry>) => {
        setState((prev) => ({
            ...prev,
            entries: {
                ...prev.entries,
                [id]: { ...prev.entries[id], ...patch, at: new Date().toISOString() },
            },
        }));
    }, []);

    const tally = useMemo(() => {
        const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, NEEDS_REVIEW: 0, unanswered: 0 };
        for (const step of ALL_STEPS) {
            const r = state.entries[step.id]?.result;
            if (!r) counts.unanswered += 1;
            else counts[r] += 1;
        }
        return counts;
    }, [state.entries]);

    const severityTally = useMemo(() => {
        const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
        for (const step of ALL_STEPS) {
            const e = state.entries[step.id];
            if (e?.result === "FAIL" && e.severity) counts[e.severity] += 1;
        }
        return counts;
    }, [state.entries]);

    /**
     * Structured defect records, in the shape the handoff asks for.
     *
     * Built from FAIL and NEEDS REVIEW only. Nothing here repairs anything: the
     * walkthrough exists to collect the human truth first, and triage happens
     * afterwards as a bounded pass.
     */
    const defects = useMemo(
        () =>
            ALL_STEPS.flatMap((step) => {
                const e = state.entries[step.id];
                if (e?.result !== "FAIL" && e?.result !== "BLOCKED" && e?.result !== "NEEDS_REVIEW") return [];
                return [{
                    step: step.id,
                    area: step.area,
                    observed: e.notes?.trim() || "(operator recorded no observation)",
                    expected: step.expected.join(" "),
                    notes: e.notes?.trim() ?? "",
                    severity: e.severity ?? (e.result === "FAIL" ? "unassigned" : "P3"),
                    evidence: e.evidence?.trim() ?? "",
                    owner: ownerFor(step),
                    result: e.result,
                }];
            }),
        [state.entries],
    );

    const answered = ALL_STEPS.length - tally.unanswered;
    const hardGates = ALL_STEPS.filter((s) => s.hardGate);
    const hardGateFailures = hardGates.filter((s) => state.entries[s.id]?.result === "FAIL");
    const hardGatePasses = hardGates.filter((s) => state.entries[s.id]?.result === "PASS");

    const markdown = useCallback(() => {
        const lines: string[] = [
            "# Developer Platform — human QA walkthrough",
            "",
            `Operator: ${state.operator || "(unnamed)"}`,
            `Exported: ${new Date().toISOString()}`,
            "",
            "```text",
            "DEVELOPER PLATFORM HUMAN QA",
            "",
            `Total steps: ${ALL_STEPS.length}`,
            `Passed:        ${tally.PASS}`,
            `Failed:        ${tally.FAIL}`,
            `Blocked:       ${tally.BLOCKED}`,
            `Needs Review:  ${tally.NEEDS_REVIEW}`,
            `Unanswered:    ${tally.unanswered}`,
            "",
            `Hard gates passed: ${hardGatePasses.length} of ${hardGates.length}`,
            `Hard gates failed: ${hardGateFailures.length}`,
            "",
            `P0 defects:    ${severityTally.P0}`,
            `P1 defects:    ${severityTally.P1}`,
            `P2 defects:    ${severityTally.P2}`,
            `P3 defects:    ${severityTally.P3}`,
            "",
            `Operator acceptance: ${acceptanceLabel(state.acceptance)}`,
            "```",
            "",
        ];
        if (hardGateFailures.length) {
            lines.push(`**Hard gates failed: ${hardGateFailures.map((s) => s.id).join(", ")}**`, "");
        }
        if (state.acceptanceNotes.trim()) {
            lines.push("## Acceptance notes", "", state.acceptanceNotes.trim(), "");
        }
        if (defects.length) {
            lines.push("## Defects", "");
            for (const sev of ["P0", "P1", "P2", "P3", "unassigned"]) {
                const group = defects.filter((d) => d.severity === sev);
                if (!group.length) continue;
                lines.push(`### ${sev}`, "");
                for (const d of group) {
                    lines.push(
                        `- **${d.step}** · ${d.area} · ${d.result}`,
                        `    - Observed behavior: ${d.observed}`,
                        `    - Expected behavior: ${d.expected}`,
                        `    - Operator notes: ${d.notes || "(none)"}`,
                        `    - Evidence reference: ${d.evidence || "(none)"}`,
                        `    - Recommended owner: ${d.owner}`,
                    );
                }
                lines.push("");
            }
        }
        for (const section of SECTIONS) {
            lines.push(`## Section ${section.id} — ${section.title}`, "");
            // Every step, including the ones that passed: the report should
            // preserve what was actually reviewed, not only what went wrong.
            for (const step of section.steps) {
                const e = state.entries[step.id];
                lines.push(
                    `- **${step.id}** (${step.area}) — ${e?.result ?? "unanswered"}` +
                        (e?.severity ? ` · ${e.severity}` : "") +
                        (step.hardGate ? " · hard gate" : "") +
                        (e?.notes ? `\n    - ${e.notes.replace(/\n/g, "\n    - ")}` : ""),
                );
            }
            lines.push("");
        }
        return lines.join("\n");
    }, [state, tally, severityTally, hardGates, hardGatePasses, hardGateFailures, defects]);

    const copy = useCallback(async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            setCopied(null);
        }
    }, []);

    const download = useCallback((text: string, filename: string, type: string) => {
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    return (
        <div style={S.page}>
            <header style={S.header}>
                <div>
                    <h1 style={S.h1}>Developer Platform — human QA walkthrough</h1>
                    <p style={S.sub}>
                        Could this be shown to an outside developer and to Classroom Coach engineering,
                        and would what they see, read and execute be both professional and technically correct?
                    </p>
                </div>
                <div style={S.tally}>
                    {RESULTS.map((r) => (
                        <span key={r.value} style={{ ...S.chip, borderColor: r.tone, color: r.tone }}>
                            {r.label} {tally[r.value]}
                        </span>
                    ))}
                    <span style={{ ...S.chip, borderColor: "#98a2b3", color: "#475467" }}>
                        Unanswered {tally.unanswered}
                    </span>
                </div>
            </header>

            <div style={S.progressTrack} aria-label={`${answered} of ${ALL_STEPS.length} steps answered`}>
                <div style={{ ...S.progressFill, width: `${(answered / ALL_STEPS.length) * 100}%` }} />
            </div>
            <p style={S.progressText}>
                {answered} of {ALL_STEPS.length} steps answered
                {state.updatedAt ? ` · saved ${new Date(state.updatedAt).toLocaleTimeString()}` : ""}
            </p>

            {hardGateFailures.length > 0 && (
                <div style={S.gateBanner}>
                    <strong>Hard gate failed:</strong> {hardGateFailures.map((s) => s.id).join(", ")}. A hard
                    gate failure blocks external readiness regardless of how many other steps pass.
                </div>
            )}

            {!state.started ? (
                <section style={S.start}>
                    <p style={S.startLead}>
                        82 acceptance checks across thirteen sections. Your progress is saved in this
                        browser as you go, so you can stop and come back.
                    </p>
                    {/*
                      * The account, named before anything else.
                      *
                      * This QA runs against the synthetic certification database, so an operator's
                      * real Alloy credentials do not exist here at all — and the failure looks like
                      * a broken login rather than the wrong environment. Saying which account to
                      * use costs two lines and saves that investigation.
                      */}
                    <div style={S.identityNote}>
                        <p style={S.identityLine}>
                            <strong>QA operator:</strong> <code>qa-slot8-product@example.com</code>
                        </p>
                        <p style={S.identityDetail}>
                            This QA runs against the synthetic <strong>alloy-cert</strong> environment.
                            Your normal Alloy account will not work here — it does not exist in this
                            database. The certification-only password is on this machine at{" "}
                            <code>~/.config/alloy-dev/slot8-qa-cert-password</code>.
                        </p>
                    </div>
                    {fixture?.ok === false ? (
                        <div style={S.blocked}>
                            <strong>QA environment BLOCKED — {fixture.code}</strong>
                            <p style={S.blockedDetail}>{fixture.detail}</p>
                            <p style={S.blockedDetail}>Repair command:</p>
                            <pre style={S.pre}>{fixture.repairCommand}</pre>
                            <p style={S.blockedDetail}>
                                This is a Vacilando environment problem, not a QA step. Re-open this page
                                once it succeeds.
                            </p>
                        </div>
                    ) : (
                        <p style={S.startReady}>
                            {preparing
                                ? "Preparing the certification fixture…"
                                : fixture?.ok
                                    ? `Certification fixture ready — ${fixture.installations.length} installations prepared for you.`
                                    : "Checking the certification environment…"}
                        </p>
                    )}
                    <label style={S.label}>
                        Your name, for the exported record
                        <input
                            style={S.input}
                            value={state.operator}
                            placeholder="Operator"
                            onChange={(e) => setState((p) => ({ ...p, operator: e.target.value }))}
                        />
                    </label>
                    <button
                        type="button"
                        style={{ ...S.startBtn, opacity: fixture?.ok ? 1 : 0.55 }}
                        disabled={!fixture?.ok}
                        onClick={() => setState((p) => ({ ...p, started: true }))}
                    >
                        Start QA
                    </button>
                </section>
            ) : (
                <section style={S.verifyPanel}>
                    <div style={S.verifyHead}>
                        <div>
                            <h2 style={S.h2}>Live verification</h2>
                            <p style={S.note}>
                                Runs the deterministic technical checks through this server&apos;s own HTTP
                                boundary and reports what it found. It never marks a step for you — the
                                evidence appears beside the human question, and the decision stays yours.
                            </p>
                        </div>
                        <button type="button" style={S.btnPrimary} onClick={runVerification} disabled={verifying}>
                            {verifying ? "Running…" : verification ? "Run again" : "Run live verification"}
                        </button>
                    </div>
                    {verification?.blockedReason && (
                        <div style={S.blocked}>
                            <strong>Verification BLOCKED</strong>
                            <p style={S.blockedDetail}>{verification.blockedReason}</p>
                        </div>
                    )}
                    {verification?.checks?.length ? (
                        <div style={S.evidenceGrid}>
                            {verification.checks.map((c, i) => (
                                <div key={`${c.id}-${i}`} style={S.evidenceRow}>
                                    <span style={{ ...S.verdict, ...verdictTone(c.verdict) }}>{c.verdict}</span>
                                    <div>
                                        <strong style={S.evidenceLabel}>{c.label}</strong>
                                        <p style={S.evidenceText}>{c.evidence}</p>
                                    </div>
                                </div>
                            ))}
                            <p style={S.note}>Ran {new Date(verification.ranAt).toLocaleTimeString()}.</p>
                        </div>
                    ) : null}
                </section>
            )}

            {state.started && (
            <details style={S.envPanel} open={envOpen} onToggle={(e) => setEnvOpen((e.target as HTMLDetailsElement).open)}>
                <summary style={S.envSummary}>QA environment &amp; troubleshooting</summary>
                <div style={S.envBody}>
                    <p style={S.note}>
                        Nothing here is part of the walkthrough. It is what to look at when something
                        misbehaves.
                    </p>
                    <h3 style={S.h3}>Certification fixture</h3>
                    {fixture?.ok ? (
                        <ul style={S.ul}>
                            {fixture.installations.map((f) => (
                                <li key={f.key}>
                                    <strong>{f.name}</strong> — {f.proves}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={S.note}>{fixture?.detail ?? "Not prepared."}</p>
                    )}
                    <p style={S.note}>Rebuild or inspect it from a terminal:</p>
                    <pre style={S.pre}>{`npm run qa:developer-platform -- ensure
npm run qa:developer-platform -- status
npm run qa:developer-platform -- reset`}</pre>
                    <h3 style={S.h3}>How live verification works</h3>
                    <p style={S.note}>
                        It issues a credential per fixture installation through the canonical authority,
                        drives the real `/api/v1` endpoints over HTTP, and revokes every credential before
                        returning. No secret is sent to this page, stored, or rendered. The credential you
                        issue yourself in DP-QA-12 is never read.
                    </p>
                    <h3 style={S.h3}>Your answers</h3>
                    <p style={S.note}>
                        Saved in this browser only — there is no QA persistence service in Alloy today.
                        Export the run when you finish.
                    </p>
                    <div style={S.row}>
                        <button style={S.btn} onClick={() => copy(markdown(), "md")} type="button">
                            {copied === "md" ? "Copied" : "Copy report (Markdown)"}
                        </button>
                        <button
                            style={S.btn}
                            type="button"
                            onClick={() => download(JSON.stringify(state, null, 2), "developer-platform-qa.json", "application/json")}
                        >
                            Download JSON
                        </button>
                        <button
                            style={{ ...S.btn, borderColor: "#b42318", color: "#b42318" }}
                            type="button"
                            onClick={() => {
                                if (window.confirm("Clear every result and note for this walkthrough?")) setState(EMPTY);
                            }}
                        >
                            Reset run
                        </button>
                    </div>
                </div>
            </details>
            )}

            {state.started && SECTIONS.map((section) => {
                const open = state.openSection === section.id;
                const sectionAnswered = section.steps.filter((s) => state.entries[s.id]?.result).length;
                return (
                    <section key={section.id} style={S.section}>
                        <button
                            type="button"
                            style={S.sectionHead}
                            onClick={() =>
                                setState((p) => ({ ...p, openSection: open ? "" : section.id }))
                            }
                            aria-expanded={open}
                        >
                            <span>
                                <strong>Section {section.id}</strong> — {section.title}
                            </span>
                            <span style={S.sectionCount}>
                                {sectionAnswered}/{section.steps.length}
                                <span style={S.caret}>{open ? "▾" : "▸"}</span>
                            </span>
                        </button>
                        {open && (
                            <>
                                <p style={S.intent}>{section.intent}</p>
                                {section.steps.map((step) => (
                                    <StepCard
                                        key={step.id}
                                        step={step}
                                        entry={state.entries[step.id] ?? {}}
                                        evidence={evidenceByStep[step.id] ?? []}
                                        onChange={(patch) => update(step.id, patch)}
                                    />
                                ))}
                            </>
                        )}
                    </section>
                );
            })}

            {state.started && (
            <section style={S.setup} id="summary">
                <h2 style={S.h2}>Final QA summary</h2>
                <pre style={S.summaryPre}>{`DEVELOPER PLATFORM HUMAN QA

Total steps: ${ALL_STEPS.length}
Passed:        ${tally.PASS}
Failed:        ${tally.FAIL}
Blocked:       ${tally.BLOCKED}
Needs Review:  ${tally.NEEDS_REVIEW}
Unanswered:    ${tally.unanswered}

Hard gates passed: ${hardGatePasses.length} of ${hardGates.length}
Hard gates failed: ${hardGateFailures.length}

P0 defects:    ${severityTally.P0}
P1 defects:    ${severityTally.P1}
P2 defects:    ${severityTally.P2}
P3 defects:    ${severityTally.P3}

Operator acceptance:
${acceptanceLabel(state.acceptance)}`}</pre>

                <h3 style={S.h3}>Hard failure rules</h3>
                <p style={S.note}>
                    Any one of these makes the walkthrough REJECTED — REPAIR REQUIRED, regardless of how
                    many steps passed.
                </p>
                <ol style={S.ol}>
                    {HARD_FAILURE_RULES.map((r) => (
                        <li key={r}>{r}</li>
                    ))}
                </ol>

                <h3 style={S.h3}>Defects ({defects.length})</h3>
                {defects.length === 0 ? (
                    <p style={S.note}>No FAIL or NEEDS REVIEW recorded yet.</p>
                ) : (
                    <div style={S.defectList}>
                        {defects.map((d) => (
                            <div key={d.step} style={S.defect}>
                                <div style={S.defectHead}>
                                    <strong>{d.step}</strong>
                                    <span>{d.area}</span>
                                    <span style={{ ...S.sevPill, borderColor: d.result === "FAIL" ? "#b42318" : "#5925dc" }}>
                                        {d.result} · {d.severity}
                                    </span>
                                </div>
                                <p style={S.defectLine}><em>Observed:</em> {d.observed}</p>
                                <p style={S.defectLine}><em>Evidence:</em> {d.evidence || "(none)"}</p>
                                <p style={S.defectLine}><em>Recommended owner:</em> {d.owner}</p>
                            </div>
                        ))}
                    </div>
                )}

                <h3 style={S.h3}>Operator acceptance — DP-QA-82</h3>
                <p style={S.note}>
                    PUBLIC_READY is not the standard here. This decides whether the certified Developer
                    Platform and the partner materials are genuinely PARTNER_READY.
                </p>
                {ACCEPTANCE.map((a) => {
                    const active = state.acceptance === a.value;
                    return (
                        <button
                            key={a.value}
                            type="button"
                            style={{
                                ...S.acceptBtn,
                                borderColor: active ? a.tone : "#d0d5dd",
                                background: active ? `${a.tone}0d` : "#fff",
                            }}
                            onClick={() =>
                                setState((p) => ({ ...p, acceptance: active ? "" : a.value }))
                            }
                        >
                            <strong style={{ color: a.tone }}>{a.label}</strong>
                            <span style={S.acceptBlurb}>{a.blurb}</span>
                        </button>
                    );
                })}
                <label style={S.label}>
                    Follow-ups or blocking defects, in your own words
                    <textarea
                        style={{ ...S.input, minHeight: 96, resize: "vertical" }}
                        value={state.acceptanceNotes}
                        onChange={(e) => setState((p) => ({ ...p, acceptanceNotes: e.target.value }))}
                        placeholder="List every required follow-up, or every blocking defect."
                    />
                </label>
                <div style={S.row}>
                    <button style={S.btn} type="button" onClick={() => copy(markdown(), "md2")}>
                        {copied === "md2" ? "Copied" : "Copy full report (Markdown)"}
                    </button>
                    <button
                        style={S.btn}
                        type="button"
                        onClick={() => download(markdown(), "developer-platform-qa.md", "text/markdown")}
                    >
                        Download full report
                    </button>
                </div>
            </section>
            )}

            <footer style={S.footer}>
                <p style={S.note}>
                    82 steps across sections A–M. DP-QA-76 arrived truncated mid-sentence and its closing
                    clause was completed from its own heading; it is marked <em>authored</em> so a reviewer
                    can see the seam. Everything else is as instructed.
                </p>
            </footer>
        </div>
    );
}

function StepCard({
    step,
    entry,
    evidence,
    onChange,
}: {
    step: QaStep;
    entry: Entry;
    evidence: MachineCheck[];
    onChange: (patch: Partial<Entry>) => void;
}) {
    const surfaces = STEP_SURFACES[step.id] ?? [];
    return (
        <article style={{ ...S.card, borderLeftColor: entry.result ? colorFor(entry.result) : "#e4e7ec" }}>
            <div style={S.cardHead}>
                <h3 style={S.stepId}>
                    {step.id}
                    {step.hardGate && <span style={S.hardGate}>hard gate</span>}
                    {step.authored && <span style={S.authored}>authored</span>}
                </h3>
                <span style={S.area}>{step.area}</span>
            </div>
            <p style={S.objective}>{step.objective}</p>

            {surfaces.length > 0 && (
                <div style={S.surfaceRow}>
                    {surfaces.map((sf) => (
                        <a key={sf.href} href={sf.href} target="_blank" rel="noreferrer" style={S.surfaceLink}>
                            {sf.label} ↗
                        </a>
                    ))}
                </div>
            )}

            {evidence.length > 0 && (
                <div style={S.machineBlock}>
                    <span style={S.machineLabel}>Machine evidence</span>
                    {evidence.map((c, i) => (
                        <div key={`${c.id}-${i}`} style={S.machineRow}>
                            <span style={{ ...S.verdict, ...verdictTone(c.verdict) }}>{c.verdict}</span>
                            <p style={S.machineText}>{c.evidence}</p>
                        </div>
                    ))}
                    <p style={S.machineFoot}>
                        This is a deterministic fact, not your answer. Record your judgment below.
                    </p>
                </div>
            )}

            <Field label="Starting state">{step.startingState}</Field>
            <Field label="Action">{step.action}</Field>
            <div style={{ ...S.field, ...S.seeBlock }}>
                <span style={S.seeLabel}>What you should see</span>
                <ul style={S.ul}>
                    {step.expected.map((e) => (
                        <li key={e}>{e}</li>
                    ))}
                </ul>
            </div>
            <Field label="Why it matters">{step.why}</Field>
            <div style={S.judgeBlock}>
                <span style={S.judgeLabel}>Your judgment</span>
                <p style={S.judgeText}>{step.humanQuestion ?? step.objective}</p>
            </div>

            <div style={S.controls}>
                <div style={S.resultRow}>
                    {RESULTS.map((r) => {
                        const active = entry.result === r.value;
                        return (
                            <button
                                key={r.value}
                                type="button"
                                onClick={() => onChange({ result: active ? undefined : r.value })}
                                style={{
                                    ...S.resultBtn,
                                    borderColor: active ? r.tone : "#d0d5dd",
                                    background: active ? r.tone : "#fff",
                                    color: active ? "#fff" : "#344054",
                                }}
                            >
                                {r.label}
                            </button>
                        );
                    })}
                </div>
                {(entry.result === "FAIL" || entry.result === "BLOCKED" || entry.result === "NEEDS_REVIEW") && (
                    <label style={S.label}>
                        Severity
                        <select
                            style={S.input}
                            value={entry.severity ?? ""}
                            onChange={(e) => onChange({ severity: (e.target.value || undefined) as Severity })}
                        >
                            <option value="">Choose a severity</option>
                            {SEVERITIES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label style={S.label}>
                    Notes — what you actually saw
                    <textarea
                        style={{ ...S.input, minHeight: 72, resize: "vertical" }}
                        value={entry.notes ?? ""}
                        placeholder="No secrets, please — notes are stored in this browser."
                        onChange={(e) => onChange({ notes: e.target.value })}
                    />
                </label>
                {(entry.result === "FAIL" || entry.result === "BLOCKED" || entry.result === "NEEDS_REVIEW") && (
                    <label style={S.label}>
                        Evidence reference (screenshot filename, request id, timestamp)
                        <input
                            style={S.input}
                            value={entry.evidence ?? ""}
                            placeholder="e.g. dp-qa-13-after-reload.png, or request id from the response"
                            onChange={(e) => onChange({ evidence: e.target.value })}
                        />
                    </label>
                )}
            </div>
        </article>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={S.field}>
            <span style={S.fieldLabel}>{label}</span>
            <p style={S.fieldValue}>{children}</p>
        </div>
    );
}

function Cmd({
    text,
    id,
    copied,
    onCopy,
}: {
    text: string;
    id: string;
    copied: string | null;
    onCopy: (t: string, k: string) => void;
}) {
    return (
        <div style={S.cmdWrap}>
            <pre style={S.pre}>{text}</pre>
            <button type="button" style={S.copyBtn} onClick={() => onCopy(text, id)}>
                {copied === id ? "Copied" : "Copy"}
            </button>
        </div>
    );
}

function acceptanceLabel(a: Acceptance) {
    if (!a) return "Not decided";
    return ACCEPTANCE.find((x) => x.value === a)?.label ?? "Not decided";
}

/**
 * Who should look at a defect first, from the section it was found in.
 *
 * A guess the operator can override in their notes, not a routing decision — but
 * an unrouted defect list is one somebody has to triage from scratch.
 */
function ownerFor(step: QaStep) {
    const n = Number(step.id.slice(6));
    if (n <= 20) return "Integrations product (operator surface)";
    if (n <= 25) return "Developer documentation";
    if (n <= 42) return "Developer Platform API / contract";
    if (n <= 60) return "Developer documentation (external presentation)";
    if (n <= 70) return "Partner materials (Classroom Coach packet)";
    return "Documentation & APIs lane (acceptance)";
}

function verdictTone(v: "PASS" | "FAIL" | "BLOCKED"): React.CSSProperties {
    if (v === "PASS") return { borderColor: "#0f7b4f", color: "#0f7b4f" };
    if (v === "FAIL") return { borderColor: "#b42318", color: "#b42318" };
    return { borderColor: "#b54708", color: "#b54708" };
}

function colorFor(result: StepResult) {
    return RESULTS.find((r) => r.value === result)?.tone ?? "#e4e7ec";
}

const S: Record<string, React.CSSProperties> = {
    page: { maxWidth: 940, margin: "0 auto", padding: "32px 20px 96px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#101828" },
    header: { display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-start" },
    h1: { fontSize: 26, margin: "0 0 6px", letterSpacing: "-0.02em" },
    h2: { fontSize: 16, margin: "0 0 10px" },
    sub: { margin: 0, color: "#475467", maxWidth: 560, lineHeight: 1.5 },
    tally: { display: "flex", flexWrap: "wrap", gap: 6 },
    chip: { border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
    progressTrack: { height: 6, background: "#f2f4f7", borderRadius: 999, marginTop: 20, overflow: "hidden" },
    progressFill: { height: "100%", background: "#175cd3", transition: "width 160ms ease" },
    progressText: { fontSize: 12, color: "#475467", margin: "6px 0 0" },
    gateBanner: { marginTop: 16, padding: "10px 14px", border: "1px solid #fda29b", background: "#fef3f2", borderRadius: 8, fontSize: 13, color: "#912018" },
    setup: { marginTop: 24, padding: 18, border: "1px solid #e4e7ec", borderRadius: 12, background: "#fcfcfd" },
    ol: { margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.7, fontSize: 14 },
    ul: { margin: "4px 0 0", paddingLeft: 20, lineHeight: 1.6, fontSize: 14 },
    note: { fontSize: 13, color: "#475467", lineHeight: 1.6, margin: "10px 0" },
    row: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
    btn: { border: "1px solid #d0d5dd", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", color: "#344054" },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: "#344054", marginTop: 10 },
    input: { display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 8, fontSize: 13, fontFamily: "inherit" },
    section: { marginTop: 18, border: "1px solid #e4e7ec", borderRadius: 12, overflow: "hidden" },
    sectionHead: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", background: "#f9fafb", border: 0, cursor: "pointer", fontSize: 15, textAlign: "left", color: "#101828" },
    sectionCount: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475467" },
    caret: { fontSize: 12 },
    intent: { margin: "14px 18px 0", fontSize: 13, color: "#475467", fontStyle: "italic" },
    card: { margin: "14px 18px", padding: 16, border: "1px solid #e4e7ec", borderLeft: "4px solid #e4e7ec", borderRadius: 10 },
    cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    stepId: { fontSize: 15, margin: 0, display: "flex", alignItems: "center", gap: 8 },
    hardGate: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#912018", background: "#fef3f2", border: "1px solid #fda29b", borderRadius: 999, padding: "2px 7px" },
    authored: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#5925dc", background: "#f4f3ff", border: "1px solid #d9d6fe", borderRadius: 999, padding: "2px 7px" },
    area: { fontSize: 12, color: "#475467" },
    objective: { margin: "8px 0 12px", fontSize: 14, fontWeight: 500 },
    field: { marginTop: 10 },
    fieldLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#667085" },
    fieldValue: { margin: "3px 0 0", fontSize: 14, lineHeight: 1.6 },
    humanQ: { marginTop: 12, padding: "9px 12px", background: "#f9fafb", borderLeft: "3px solid #98a2b3", fontSize: 13, lineHeight: 1.6, color: "#344054" },
    controls: { marginTop: 14, paddingTop: 14, borderTop: "1px dashed #e4e7ec" },
    resultRow: { display: "flex", flexWrap: "wrap", gap: 6 },
    resultBtn: { border: "1px solid", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 },
    cmdWrap: { position: "relative", marginTop: 10 },
    pre: { margin: 0, padding: "12px 14px", background: "#101828", color: "#e4e7ec", borderRadius: 8, fontSize: 12.5, lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre" },
    copyBtn: { position: "absolute", top: 8, right: 8, border: "1px solid #475467", background: "#1d2939", color: "#e4e7ec", borderRadius: 6, padding: "3px 9px", fontSize: 11, cursor: "pointer" },
    h3: { fontSize: 14, margin: "18px 0 6px" },
    start: { marginTop: 28, padding: 24, border: "1px solid #e4e7ec", borderRadius: 12, background: "#fcfcfd" },
    startLead: { margin: "0 0 14px", fontSize: 14, color: "#475467", lineHeight: 1.6 },
    identityNote: { margin: "0 0 14px", padding: "12px 14px", border: "1px solid #b2cced", background: "#eff8ff", borderRadius: 8 },
    identityLine: { margin: 0, fontSize: 13.5, color: "#101828" },
    identityDetail: { margin: "6px 0 0", fontSize: 13, color: "#344054", lineHeight: 1.6 },
    startReady: { margin: "0 0 14px", fontSize: 13, color: "#0f7b4f", fontWeight: 600 },
    startBtn: { marginTop: 14, border: 0, background: "#175cd3", color: "#fff", borderRadius: 8, padding: "10px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
    blocked: { padding: "12px 14px", border: "1px solid #fda29b", background: "#fef3f2", borderRadius: 8, fontSize: 13, color: "#912018", margin: "0 0 14px" },
    blockedDetail: { margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 },
    verifyPanel: { marginTop: 22, padding: 18, border: "1px solid #e4e7ec", borderRadius: 12, background: "#fcfcfd" },
    verifyHead: { display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" },
    btnPrimary: { border: 0, background: "#175cd3", color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
    evidenceGrid: { marginTop: 14, display: "grid", gap: 8 },
    evidenceRow: { display: "flex", gap: 10, alignItems: "flex-start" },
    evidenceLabel: { fontSize: 13 },
    evidenceText: { margin: "2px 0 0", fontSize: 13, color: "#475467", lineHeight: 1.55 },
    verdict: { border: "1px solid", borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, flexShrink: 0 },
    envPanel: { marginTop: 18, border: "1px solid #e4e7ec", borderRadius: 12, background: "#fff" },
    envSummary: { padding: "12px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475467" },
    envBody: { padding: "0 18px 18px" },
    surfaceRow: { display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 12px" },
    surfaceLink: { display: "inline-block", border: "1px solid #b2cced", background: "#eff8ff", color: "#175cd3", borderRadius: 8, padding: "5px 11px", fontSize: 12.5, textDecoration: "none", fontWeight: 600 },
    machineBlock: { margin: "0 0 12px", padding: "10px 12px", border: "1px solid #d0d5dd", borderRadius: 8, background: "#f9fafb" },
    machineLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#475467" },
    machineRow: { display: "flex", gap: 9, alignItems: "flex-start", marginTop: 7 },
    machineText: { margin: 0, fontSize: 13, lineHeight: 1.55, color: "#344054" },
    machineFoot: { margin: "9px 0 0", fontSize: 11.5, color: "#667085", fontStyle: "italic" },
    seeBlock: { padding: "10px 12px", border: "1px solid #e4e7ec", borderRadius: 8, background: "#fff" },
    seeLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#667085" },
    judgeBlock: { marginTop: 12, padding: "10px 12px", borderLeft: "3px solid #175cd3", background: "#eff8ff", borderRadius: "0 8px 8px 0" },
    judgeLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#175cd3" },
    judgeText: { margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#101828" },
    summaryPre: { margin: 0, padding: "14px 16px", background: "#f9fafb", border: "1px solid #e4e7ec", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre" },
    defectList: { display: "grid", gap: 8 },
    defect: { border: "1px solid #e4e7ec", borderRadius: 8, padding: "10px 12px", background: "#fff" },
    defectHead: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 },
    defectLine: { margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "#344054" },
    sevPill: { border: "1px solid", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700 },
    acceptBtn: { display: "block", width: "100%", textAlign: "left", border: "1px solid", borderRadius: 10, padding: "12px 14px", marginTop: 8, cursor: "pointer", fontSize: 13 },
    acceptBlurb: { display: "block", marginTop: 5, color: "#475467", lineHeight: 1.55 },
    footer: { marginTop: 28, paddingTop: 16, borderTop: "1px solid #e4e7ec" },
};
