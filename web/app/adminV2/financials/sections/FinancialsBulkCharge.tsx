"use client";

/**
 * BULK CHARGING — one server-owned run, previewed and confirmed. Never a loop.
 *
 * ── WHAT THIS SURFACE IS ──
 *
 * A window onto `billing.generate_tuition`, the registered action that already turns a period's
 * accepted pricing terms into draft tuition charges. The action's own doc comment anticipated
 * this: "Thread 4 will place a surface over it later and a generator reachable only from a page
 * would have to be rebuilt then." This is that surface, and it adds no generation logic at all.
 *
 * ── WHY IT IS NOT A CLIENT LOOP ──
 *
 * The obvious implementation — read the cohort, call Add Charge once per child — would
 * duplicate charge creation, lose idempotency the moment a request failed halfway, and produce a
 * partial month nobody could tell apart from a complete one. The canonical run is ONE call: it
 * resolves every assignment server-side, converges on database-level uniqueness (the consumption
 * event on its idempotency key, the draft charge on its resolution key), and a second run over
 * the same period reports the same charges rather than creating more. Retrying is safe, which is
 * the property a loop can never have.
 *
 * ── PREVIEW, EXCEPTIONS, CONFIRMATION, RESULT ──
 *
 * Preview runs the SAME resolution as the real run and writes nothing, so it cannot describe a
 * different act than the one that follows. What it reports is the tally AND the rows that will
 * not be billed — not due, refused, already posted — because confirming a bulk money operation
 * without seeing what is being left behind is how a month goes out short. Confirmation names the
 * count and the total. Afterwards the queue re-reads committed truth.
 *
 * ── THE SCOPE IS SAID OUT LOUD, INCLUDING THE PART THE SITE FILTER DOES NOT REACH ──
 *
 * A generation run resolves its cohort from accepted pricing terms for a named PERIOD. It has no
 * site parameter, so it is organization-wide even when a site is selected in the header. Saying
 * so is not a caveat: an operator who believed the filter had narrowed a money-writing run would
 * have billed every other site by accident. The period is always named and never inferred from
 * "now", so a run can be replayed and reasoned about at a month boundary.
 */

import { useCallback, useMemo, useState } from "react";

import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { moneyExact } from "@/app/adminV2/financials/financialsFormat";

const GENERATE_TUITION_ACTION_KEY = "billing.generate_tuition";

type GenerationCounts = {
    generated: number;
    alreadyPosted: number;
    notDue: number;
    refused: number;
    errors: number;
};

type ExceptionOutcome = { assignmentId?: string; reason?: string; detail?: string; message?: string; kind?: string };

type PreviewPayload = {
    counts: GenerationCounts;
    total_amount_cents: number;
    refused_outcomes: ExceptionOutcome[];
    not_due_outcomes: ExceptionOutcome[];
    error_outcomes: ExceptionOutcome[];
    already_posted_outcomes: ExceptionOutcome[];
};

type RunResult = { counts: GenerationCounts; periodKey: string };

/** This month, in the action's own `YYYY-MM` vocabulary. A default, never an inference at run time. */
function currentPeriodKey(): string {
    return new Date().toISOString().slice(0, 7);
}

async function callAction(mode: "preview" | "execute", periodKey: string) {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            action_key: GENERATE_TUITION_ACTION_KEY,
            entity_type: "opportunity_customer_member",
            entity_id: "",
            mode,
            confirmation: { confirmed: mode === "execute" },
            payload: { period_key: periodKey },
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

export default function FinancialsBulkCharge({
    onCommitted,
    siteSelected,
}: {
    /** Re-read committed truth. The queue is never updated optimistically. */
    onCommitted: () => Promise<void> | void;
    /** True when a site is chosen in the header — which this run does NOT obey. */
    siteSelected: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [periodKey, setPeriodKey] = useState(currentPeriodKey);
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [preview, setPreview] = useState<PreviewPayload | null>(null);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const periodValid = /^\d{4}-\d{2}$/.test(periodKey);

    const runPreview = useCallback(async () => {
        setBusy("preview");
        setError(null);
        setResult(null);
        try {
            const detail = await callAction("preview", periodKey);
            const after = (detail.preview as { after?: PreviewPayload } | undefined)?.after ?? null;
            if (!after) throw new Error("The preview returned no detail to confirm against.");
            setPreview(after);
        } catch (e) {
            setPreview(null);
            setError(e instanceof Error ? e.message : "The preview failed.");
        } finally {
            setBusy(null);
        }
    }, [periodKey]);

    const runExecute = useCallback(async () => {
        setBusy("execute");
        setError(null);
        try {
            const detail = await callAction("execute", periodKey);
            setResult({
                counts: {
                    generated: Number(detail.generated ?? 0),
                    alreadyPosted: Number(detail.alreadyPosted ?? 0),
                    notDue: Number(detail.notDue ?? 0),
                    refused: Number(detail.refused ?? 0),
                    errors: Number(detail.errors ?? 0),
                },
                periodKey: String(detail.period_key ?? periodKey),
            });
            /* Preview is cleared: it described a cohort that has now moved. */
            setPreview(null);
            await onCommitted();
        } catch (e) {
            setError(e instanceof Error ? e.message : "The generation run failed.");
        } finally {
            setBusy(null);
        }
    }, [periodKey, onCommitted]);

    const exceptions = useMemo(() => {
        if (!preview) return [];
        return [
            ...preview.refused_outcomes.map((o) => ({ kind: "Refused", text: o.reason ?? o.detail ?? "refused" })),
            ...preview.error_outcomes.map((o) => ({ kind: "Error", text: o.message ?? "error" })),
            ...preview.already_posted_outcomes.map(() => ({ kind: "Already posted", text: "this period is settled" })),
            ...preview.not_due_outcomes.map((o) => ({ kind: "Not due", text: o.reason ?? "not due" })),
        ].slice(0, 12);
    }, [preview]);

    if (!open) {
        return (
            <div className="shrink-0 border-b border-alloy-stone/10 px-3 py-2">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    data-financials-bulk-open="true"
                    className="w-full whitespace-nowrap rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/[0.08]"
                >
                    Generate a period&apos;s tuition
                </button>
            </div>
        );
    }

    return (
        <div className="shrink-0 border-b border-alloy-stone/10 px-3 py-2.5" data-financials-bulk-panel="true">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">Generate tuition</p>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="whitespace-nowrap text-xs text-alloy-midnight/55 hover:text-alloy-midnight"
                    data-financials-bulk-close="true"
                >
                    Close
                </button>
            </div>

            <label className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-xs text-alloy-midnight/60">Service period</span>
                <input
                    type="month"
                    value={periodKey}
                    onChange={(e) => {
                        setPeriodKey(e.target.value);
                        setPreview(null);
                        setResult(null);
                    }}
                    data-financials-bulk-period="true"
                    className="min-w-0 flex-1 rounded-md border border-alloy-stone/25 px-2 py-1 text-xs text-alloy-midnight"
                />
            </label>

            {/* The scope, stated before anything is run — not discovered from the result. */}
            <p className="mt-1.5 text-[11px] text-alloy-midnight/55" data-financials-bulk-scope="org_wide">
                Organization-wide for this period.
                {siteSelected ? " The site filter above does not narrow a generation run." : ""}
            </p>

            <div className="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={!periodValid || busy !== null}
                    data-financials-bulk-preview="true"
                    className="whitespace-nowrap rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/[0.08] disabled:opacity-50"
                >
                    {busy === "preview" ? "Previewing…" : "Preview run"}
                </button>
                {preview ? (
                    <button
                        type="button"
                        onClick={() => void runExecute()}
                        disabled={busy !== null || preview.counts.generated === 0}
                        data-financials-bulk-execute="true"
                        className={WS_ACTION_PRIMARY}
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
                        to bill · {preview.counts.notDue} not due · {preview.counts.alreadyPosted} already posted ·{" "}
                        {preview.counts.refused} refused · {preview.counts.errors} errored
                    </p>
                    {exceptions.length > 0 ? (
                        <ul className="mt-1.5 flex flex-col gap-0.5" data-financials-bulk-exceptions="true">
                            {exceptions.map((exception, index) => (
                                <li key={index} className="truncate text-[11px] text-alloy-midnight/55">
                                    {exception.kind} · {exception.text}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {preview.counts.generated === 0 ? (
                        <p className="mt-1.5 text-[11px] text-alloy-midnight/55">
                            Nothing would be billed for this period, so there is nothing to confirm.
                        </p>
                    ) : null}
                </div>
            ) : null}

            {result ? (
                <p className="mt-2 text-xs text-alloy-midnight" data-financials-bulk-run-result="true">
                    {/* The run's own tally, not the preview's — they can legitimately differ. */}
                    {result.periodKey} · {result.counts.generated} generated, {result.counts.alreadyPosted} already
                    posted, {result.counts.refused} refused, {result.counts.errors} errored.
                </p>
            ) : null}
        </div>
    );
}
