"use client";

/**
 * TUITION BILLING — automatic, with manual run control (W7-F021).
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──
 *
 * Recurring tuition is billed AUTOMATICALLY: a daily heartbeat wakes `financials.periodic_billing.
 * evaluate`, which bills each accepted term's period once that period has begun, through the same
 * `generateTuitionCharges` this panel's run calls. An operator is not expected to bill tuition by
 * hand every month, and this panel says so first — its status and last run are the scheduler's own
 * record, read from `periodic-billing-status`, never inferred from a deploy.
 *
 * The manual run is RUN CONTROL: preview a period (including one that has not begun), or run billing
 * when the operator needs it now. It is the registered action `billing.generate_tuition` — ONE
 * server-owned run, previewed and confirmed, never a client loop over Add Charge — so it converges
 * with the automatic run on the same database uniqueness and can never bill a period twice.
 *
 * ── THE PREVIEW NAMES WHO IT REACHES ──
 *
 * "2 to bill" is a tally, not a decision. The preview lists each assignment it WILL bill and each it
 * already billed, by child and household, and states why every other row is not billed, in words.
 *
 * ── ORGANIZATION-WIDE, SAID OUT LOUD ──
 *
 * A run resolves its cohort from accepted pricing terms for a named period. It has no site parameter,
 * so it is organization-wide even when a site is selected in the header, and the panel says so.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import { moneyExact } from "@/app/adminV2/financials/financialsFormat";
import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

const GENERATE_TUITION_ACTION_KEY = "billing.generate_tuition";

type GenerationCounts = {
    generated: number;
    /** Drafts that already stood and still agree — converged, not billed again. */
    unchanged: number;
    alreadyPosted: number;
    notDue: number;
    refused: number;
    errors: number;
};

/** The cadences that have an interval to bill (`isPeriodBillableCadence`'s vocabulary). */
const CADENCES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "monthly", label: "Monthly" },
    { key: "weekly", label: "Weekly" },
    { key: "biweekly", label: "Bi-weekly" },
];

type Outcome = {
    assignmentId?: string;
    reason?: string;
    detail?: string;
    message?: string;
    kind?: string;
    amountCents?: number;
    currencyCode?: string;
    /* W7-F023: who the run binds (or bound) — the canonical responsibility answer for this row. */
    responsibility?:
        | { status: "resolved"; parties: Array<{ name: string | null; share: string }> }
        | { status: "none" | "refused" | "review"; detail: string };
};

/** "Tess Tuition · 100%", or why nobody is bound — said on the row, never left to Charge Details. */
function responsibilityLine(o: Outcome): { text: string; warn: boolean } | null {
    const r = o.responsibility;
    if (!r) return null;
    if (r.status === "resolved") {
        return { text: r.parties.map((p) => `${p.name ?? "Unnamed party"} · ${p.share}`).join(", "), warn: false };
    }
    if (r.status === "none") return { text: "No responsible party — the charge will read Not allocated", warn: true };
    if (r.status === "review") return { text: `Responsibility needs review — ${r.detail}`, warn: true };
    return { text: `Responsibility cannot be divided — ${r.detail}`, warn: true };
}

type PreviewPayload = {
    counts: GenerationCounts;
    total_amount_cents: number;
    refused_outcomes: Outcome[];
    not_due_outcomes: Outcome[];
    error_outcomes: Outcome[];
    already_posted_outcomes: Outcome[];
    to_bill_outcomes?: Outcome[];
    unchanged_outcomes?: Outcome[];
    assignment_names?: Record<string, { child: string | null; household: string | null }>;
};

type RunResult = {
    counts: GenerationCounts;
    periodKey: string;
    cadenceKey: string;
    /* W7-F022: every row the run decided, named — never counts alone. */
    generated: Outcome[];
    unchanged: Outcome[];
    alreadyPosted: Outcome[];
    notDue: Outcome[];
    refused: Outcome[];
    errors: Outcome[];
    names: Record<string, { child: string | null; household: string | null }>;
};

type BillingStatus = {
    automatic_billing_active: boolean;
    schedule_exists: boolean;
    next_evaluation_at: string | null;
    last_run: {
        finished_at: string;
        outcome: string | null;
        assignments_billed: number | null;
        periods_billed: number | null;
        needs_operator: number | null;
        configuration_refused: number | null;
        charges_generated?: number | null;
        charges_refused?: number | null;
    } | null;
};

/** The month after this one — the period a run is usually previewed for. A default, never inferred at run time. */
function nextPeriodKey(): string {
    const d = new Date();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return next.toISOString().slice(0, 7);
}

/** A moment in the operator's words: "Oct 16, 2026 at 8:14 PM". */
function moment(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const day = formatDisplayDate(d.toISOString().slice(0, 10)) ?? "";
    return `${day} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Why a row is not billed, in words. The code stays in the tooltip for support. */
function notBilledReason(o: Outcome, cadenceLabel: string): string {
    switch (o.reason) {
        case "cadence_not_billed_by_this_run":
            return `billed on a different frequency — not part of a ${cadenceLabel.toLowerCase()} run`;
        case "assignment_not_enrolled":
            return "priced, but not enrolled yet";
        case "before_effective_start":
        case "term_not_effective":
            return "tuition not in effect for this period";
        default:
            return (o.reason ?? o.detail ?? o.message ?? "not billed").replace(/_/g, " ");
    }
}

/**
 * ONE CALL SHAPE FOR BOTH MODES, which is what makes preview and Confirm the same operation.
 */
async function callAction(mode: "preview" | "execute", periodKey: string, cadenceKey: string) {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            action_key: GENERATE_TUITION_ACTION_KEY,
            entity_type: "opportunity_customer_member",
            /* NO SUBJECT, SENT AS NO SUBJECT. The run's subject is the period, organization-wide. */
            entity_id: "",
            mode,
            confirmation: { confirmed: mode === "execute" },
            payload: { period_key: periodKey, cadence: cadenceKey },
        }),
    });
    const json = (await res.json()) as {
        ok?: boolean;
        data?: { execution_result?: Record<string, unknown> };
        error?: { message?: string } | string;
    };
    if (!res.ok || json.ok === false) {
        const error = typeof json.error === "string" ? json.error : json.error?.message;
        throw new Error(error ?? "The generation run was refused.");
    }
    return json.data?.execution_result ?? {};
}

export default function FinancialsTuitionBilling({
    onCommitted,
    siteSelected,
}: {
    /** Re-read committed truth. The list is never updated optimistically. */
    onCommitted: () => Promise<void> | void;
    /** True when a site is chosen in the header — which this run does NOT obey. */
    siteSelected: boolean;
}) {
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [periodKey, setPeriodKey] = useState(nextPeriodKey);
    const [cadenceKey, setCadenceKey] = useState("monthly");
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [preview, setPreview] = useState<PreviewPayload | null>(null);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    /* The rows the preview the operator confirmed said it WOULD bill — compared with what the run did. */
    const [confirmedToBill, setConfirmedToBill] = useState<string[]>([]);

    useEffect(() => {
        let live = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include", cache: "no-store" });
                const json = (await res.json()) as BillingStatus & { error?: string };
                if (!live) return;
                if (!res.ok) throw new Error(json.error ?? "Automatic billing status could not be read.");
                setStatus(json);
            } catch (e) {
                if (live) setStatusError(e instanceof Error ? e.message : "Automatic billing status could not be read.");
            }
        })();
        return () => {
            live = false;
        };
    }, []);

    const periodValid = /^\d{4}-\d{2}$/.test(periodKey);
    const cadenceLabel = CADENCES.find((c) => c.key === cadenceKey)?.label ?? cadenceKey;

    const runPreview = useCallback(async () => {
        setBusy("preview");
        setError(null);
        setResult(null);
        try {
            const detail = await callAction("preview", periodKey, cadenceKey);
            const after = (detail.preview as { after?: PreviewPayload } | undefined)?.after ?? null;
            if (!after) throw new Error("The preview returned no detail to confirm against.");
            setPreview(after);
        } catch (e) {
            setPreview(null);
            setError(e instanceof Error ? e.message : "The preview failed.");
        } finally {
            setBusy(null);
        }
    }, [periodKey, cadenceKey]);

    const runExecute = useCallback(async () => {
        setBusy("execute");
        setError(null);
        setConfirmedToBill((preview?.to_bill_outcomes ?? []).map((o) => o.assignmentId ?? "").filter(Boolean));
        try {
            const detail = await callAction("execute", periodKey, cadenceKey);
            const list = (key: string) => (Array.isArray(detail[key]) ? (detail[key] as Outcome[]) : []);
            setResult({
                generated: list("generated_outcomes"),
                unchanged: list("unchanged_outcomes"),
                alreadyPosted: list("already_posted_outcomes"),
                notDue: list("not_due_outcomes"),
                refused: list("refused_outcomes"),
                errors: list("error_outcomes"),
                names: (detail.assignment_names as RunResult["names"] | undefined) ?? {},
                counts: {
                    generated: Number(detail.generated ?? 0),
                    unchanged: Number(detail.unchanged ?? 0),
                    alreadyPosted: Number(detail.alreadyPosted ?? 0),
                    notDue: Number(detail.notDue ?? 0),
                    refused: Number(detail.refused ?? 0),
                    errors: Number(detail.errors ?? 0),
                },
                periodKey: String(detail.period_key ?? periodKey),
                cadenceKey: String(detail.cadence_key ?? cadenceKey),
            });
            /* Preview is cleared: it described a cohort that has now moved. */
            setPreview(null);
            await onCommitted();
        } catch (e) {
            setError(e instanceof Error ? e.message : "The generation run failed.");
        } finally {
            setBusy(null);
        }
    }, [periodKey, cadenceKey, onCommitted, preview]);

    /*
     * ── WHAT CHANGED SINCE THE PREVIEW (W7-F022) ─────────────────────────────────────────────────
     *
     * The run recomputes from canonical state and is authoritative; the preview is not trusted and
     * nothing is forced through. But a row the preview promised and the run did not generate is said
     * out loud, so "Generate 2" followed by "2 refused" can never pass without explanation.
     */
    const changedSincePreview = useMemo(() => {
        if (!result) return [];
        const generated = new Set([...result.generated, ...result.unchanged, ...result.alreadyPosted].map((o) => o.assignmentId));
        return confirmedToBill.filter((id) => !generated.has(id));
    }, [result, confirmedToBill]);

    const nameOf = useCallback(
        (o: Outcome) => {
            const n = o.assignmentId ? preview?.assignment_names?.[o.assignmentId] : undefined;
            if (!n || (!n.child && !n.household)) return "An enrolment whose names could not be read";
            return [n.child, n.household].filter(Boolean).join(" · ");
        },
        [preview],
    );

    const resultName = useCallback(
        (o: Outcome) => {
            const n = o.assignmentId ? result?.names?.[o.assignmentId] : undefined;
            if (!n || (!n.child && !n.household)) return "An enrolment whose names could not be read";
            return [n.child, n.household].filter(Boolean).join(" · ");
        },
        [result],
    );

    const notBilled = useMemo(() => {
        if (!preview) return [];
        return [
            ...preview.refused_outcomes.map((o) => ({ o, kind: "Refused", text: o.detail ?? o.reason ?? "refused" })),
            ...preview.error_outcomes.map((o) => ({ o, kind: "Error", text: o.message ?? "error" })),
            ...preview.already_posted_outcomes.map((o) => ({ o, kind: "Already posted", text: "this period is settled" })),
            ...preview.not_due_outcomes.map((o) => ({ o, kind: "Not billed", text: notBilledReason(o, cadenceLabel) })),
        ];
    }, [preview, cadenceLabel]);

    const last = status?.last_run ?? null;

    return (
        <div className="space-y-3" data-financials-tuition-billing="true">
            {/* ── AUTOMATIC BILLING, FIRST: this is how tuition is normally billed ── */}
            <section className="rounded-md border border-alloy-stone/15 px-3 py-2.5" data-financials-tuition-automatic={status ? String(status.automatic_billing_active) : "unknown"}>
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Automatic tuition billing</p>
                {statusError ? (
                    <p className="mt-1 text-xs text-alloy-ember">{statusError}</p>
                ) : !status ? (
                    <p className="mt-1 text-xs text-alloy-midnight/50">Reading the schedule…</p>
                ) : (
                    <>
                        <p className="mt-1 text-sm text-alloy-midnight" data-financials-tuition-automatic-state="true">
                            {status.automatic_billing_active
                                ? "On — tuition bills automatically when each period begins."
                                : "Off — tuition is billed only when it is run here."}
                        </p>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>
                                <dt className="text-alloy-midnight/50">Next automatic check</dt>
                                <dd className="text-alloy-midnight/85" data-financials-tuition-next-check="true">
                                    {status.automatic_billing_active ? moment(status.next_evaluation_at) ?? "Not scheduled" : "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-alloy-midnight/50">Last automatic run</dt>
                                <dd className="text-alloy-midnight/85" data-financials-tuition-last-run="true">
                                    {/*
                                      * W7-F022: what the run WROTE. "N billed" used to be the number
                                      * of assignments it processed — including runs that drafted
                                      * nothing because generation refused every period.
                                      */}
                                    {last
                                        ? `${moment(last.finished_at) ?? "—"} · ${
                                              last.charges_generated != null
                                                  ? `${last.charges_generated} charge${last.charges_generated === 1 ? "" : "s"} generated${
                                                        last.charges_refused ? ` · ${last.charges_refused} refused` : ""
                                                    }`
                                                  : `${last.assignments_billed ?? "—"} processed (charges not recorded)`
                                          }${last.needs_operator ? ` · ${last.needs_operator} need attention` : ""}`
                                        : "No automatic run recorded yet"}
                                </dd>
                            </div>
                        </dl>
                    </>
                )}
                <p className="mt-1.5 text-[11px] text-alloy-midnight/55">
                    Tuition is generated automatically. Use the run below to preview a period, or to run billing manually when needed.
                </p>
            </section>

            {/* ── RUN CONTROL: preview, then run manually ── */}
            <section className="rounded-md border border-alloy-stone/15 px-3 py-2.5" data-financials-bulk-panel="true">
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Preview or run manually</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-alloy-midnight/60">Billing frequency</span>
                        <AlloySelect
                            aria-label="Billing frequency"
                            value={cadenceKey}
                            allowEmpty={false}
                            options={CADENCES.map((c) => ({ value: c.key, label: c.label }))}
                            onChange={(next) => {
                                setCadenceKey(next);
                                setPreview(null);
                                setResult(null);
                            }}
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-alloy-midnight/60">Service period</span>
                        <input
                            type="month"
                            value={periodKey}
                            onChange={(e) => {
                                setPeriodKey(e.target.value);
                                setPreview(null);
                                setResult(null);
                            }}
                            data-financials-bulk-period="true"
                            className="rounded-md border border-alloy-stone/30 bg-white px-2 py-1 text-xs text-alloy-midnight"
                        />
                    </label>
                </div>
                <p className="mt-1.5 text-[11px] text-alloy-midnight/55" data-financials-bulk-scope="org_wide">
                    {cadenceLabel} terms, organization-wide for {periodValid ? billingPeriodLabel(periodKey) : "this period"}.
                    {siteSelected ? " The site selected in the header does not narrow this run." : ""}
                </p>

                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void runPreview()}
                        disabled={!periodValid || busy !== null}
                        data-financials-bulk-preview="true"
                        className="alloy-os-chargedetail__action alloy-os-chargedetail__action--secondary"
                    >
                        {busy === "preview" ? "Previewing…" : "Preview run"}
                    </button>
                    {preview && preview.counts.generated > 0 ? (
                        <button
                            type="button"
                            onClick={() => void runExecute()}
                            disabled={busy !== null}
                            data-financials-bulk-execute="true"
                            className="alloy-os-chargedetail__action alloy-os-chargedetail__action--primary"
                        >
                            {busy === "execute"
                                ? "Generating…"
                                : `Generate ${preview.counts.generated} · ${moneyExact(preview.total_amount_cents, "USD")}`}
                        </button>
                    ) : null}
                </div>

                {error ? (
                    <p className="mt-2 text-xs text-alloy-ember" data-financials-bulk-error="true">
                        {error}
                    </p>
                ) : null}

                {preview ? (
                    <div className="mt-2 rounded-md border border-alloy-stone/15 px-2.5 py-2" data-financials-bulk-preview-result="true">
                        <p className="text-xs text-alloy-midnight">
                            <span className="font-semibold tabular-nums" data-financials-bulk-preview-count="true">
                                {preview.counts.generated}
                            </span>{" "}
                            to bill · {preview.counts.unchanged} already generated · {preview.counts.notDue} not billed ·{" "}
                            {preview.counts.alreadyPosted} already posted · {preview.counts.refused} refused · {preview.counts.errors} errored
                        </p>
                        {(preview.to_bill_outcomes ?? []).length > 0 ? (
                            <>
                                <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Will bill</p>
                                <ul className="flex flex-col gap-0.5" data-financials-tuition-to-bill="true">
                                    {(preview.to_bill_outcomes ?? []).map((o, i) => (
                                        <li key={`${o.assignmentId}-${i}`} className="text-xs text-alloy-midnight/85" data-financials-tuition-to-bill-row={o.assignmentId}>
                                            <span className="flex justify-between gap-3">
                                                <span className="truncate">{nameOf(o)}</span>
                                                <span className="shrink-0 tabular-nums">{moneyExact(o.amountCents ?? 0, o.currencyCode ?? "USD")}</span>
                                            </span>
                                            {responsibilityLine(o) ? (
                                                <span
                                                    className={`block truncate text-[11px] ${responsibilityLine(o)!.warn ? "text-alloy-ember" : "text-alloy-midnight/55"}`}
                                                    data-financials-tuition-responsibility={o.responsibility?.status}
                                                >
                                                    Responsibility · {responsibilityLine(o)!.text}
                                                </span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        {(preview.unchanged_outcomes ?? []).length > 0 ? (
                            <>
                                <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Already generated — not billed again</p>
                                <ul className="flex flex-col gap-0.5" data-financials-tuition-unchanged="true">
                                    {(preview.unchanged_outcomes ?? []).map((o, i) => (
                                        <li key={`${o.assignmentId}-${i}`} className="truncate text-xs text-alloy-midnight/60" data-financials-tuition-unchanged-row={o.assignmentId}>
                                            {nameOf(o)}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        {notBilled.length > 0 ? (
                            <>
                                <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Not billed by this run</p>
                                <ul className="flex flex-col gap-0.5" data-financials-bulk-exceptions="true">
                                    {notBilled.slice(0, 20).map(({ o, kind, text }, index) => (
                                        <li key={index} className="truncate text-[11px] text-alloy-midnight/55" title={o.reason ?? undefined}>
                                            {nameOf(o)} · {kind} — {text}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        {preview.counts.generated === 0 ? (
                            <p className="mt-1.5 text-[11px] text-alloy-midnight/55">
                                Nothing would be billed for this period, so there is nothing to confirm.
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {result ? (
                    <div className="mt-2 rounded-md border border-alloy-stone/15 px-2.5 py-2" data-financials-tuition-run-result="true">
                        <p className="text-xs text-alloy-midnight" data-financials-bulk-run-result="true">
                            {/* `unchanged` is named, because a rerun that creates nothing must not read as billing. */}
                            {billingPeriodLabel(result.periodKey)} · {result.cadenceKey} · {result.counts.generated} newly generated,{" "}
                            {result.counts.unchanged} already existed, {result.counts.alreadyPosted} already posted,{" "}
                            {result.counts.refused} refused, {result.counts.errors} errored.
                        </p>
                        {changedSincePreview.length ? (
                            <p className="mt-1 text-[11px] text-alloy-ember" data-financials-tuition-changed-since-preview={changedSincePreview.length}>
                                {changedSincePreview.length} row{changedSincePreview.length === 1 ? "" : "s"} the preview listed under Will bill
                                {changedSincePreview.length === 1 ? " was" : " were"} not generated. The run is checked against current
                                state when it executes — the reason for each is below.
                            </p>
                        ) : null}
                        {/*
                          * W7-F022: EVERY ROW, NAMED, WITH ITS REASON. The run once answered "2 refused"
                          * and nothing else; an operator could not say who was not billed, or why.
                          */}
                        {([
                            { key: "generated", title: "Generated", rows: result.generated, amount: true, reason: false },
                            { key: "unchanged", title: "Already generated", rows: result.unchanged, amount: true, reason: false },
                            { key: "already_posted", title: "Already posted", rows: result.alreadyPosted, amount: true, reason: false },
                            { key: "not_billed", title: "Not billed", rows: result.notDue, amount: false, reason: true },
                            { key: "refused", title: "Refused", rows: result.refused, amount: false, reason: true },
                            { key: "errored", title: "Errored", rows: result.errors, amount: false, reason: true },
                        ] as const).map((section) =>
                            section.rows.length ? (
                                <div key={section.key} data-financials-tuition-result-section={section.key}>
                                    <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{section.title}</p>
                                    <ul className="flex flex-col gap-0.5">
                                        {section.rows.map((o, i) => (
                                            <li
                                                key={`${o.assignmentId}-${i}`}
                                                className={`flex justify-between gap-3 text-xs ${section.key === "refused" || section.key === "errored" ? "text-alloy-ember" : "text-alloy-midnight/80"}`}
                                                data-financials-tuition-result-row={o.assignmentId}
                                                title={o.reason ?? undefined}
                                            >
                                                <span className="min-w-0 truncate">
                                                    {resultName(o)}
                                                    {(section.key === "generated" || section.key === "unchanged") && responsibilityLine(o)
                                                        ? ` — Responsibility · ${responsibilityLine(o)!.text}`
                                                        : ""}
                                                    {section.reason
                                                        ? ` — ${section.key === "not_billed" ? notBilledReason(o, CADENCES.find((c) => c.key === result.cadenceKey)?.label ?? result.cadenceKey) : (o.detail ?? o.message ?? o.reason ?? "no reason recorded")}`
                                                        : ""}
                                                </span>
                                                {section.amount && o.amountCents != null ? (
                                                    <span className="shrink-0 tabular-nums">{moneyExact(o.amountCents, o.currencyCode ?? "USD")}</span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null,
                        )}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
