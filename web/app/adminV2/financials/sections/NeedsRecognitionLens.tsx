"use client";

/**
 * NEEDS RECOGNITION — money the provider took that Alloy has not recorded.
 *
 * The state has been in the database since Thread 8: `processor_state = 'succeeded'` with
 * `canonical_payment_id` still null, indexed and never shown to anybody. Until W3 the only way to
 * find it was to know it could happen and go looking.
 *
 * ── WHY THIS IS A QUEUE AND NOT A REPORT ──
 *
 * Every row is unfinished work with one obvious next step, so every row carries the action. It is
 * not a provider-event browser: the provider's own identifiers are deliberately absent from the row,
 * because an operator does not act on a `pi_…` — they act on "the Alvarez family's $300 card
 * payment from Tuesday".
 *
 * A row disappears when the money is recognized, which is the only completion signal this surface
 * needs.
 */

import { useCallback, useEffect, useState } from "react";

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import { moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import { executeRecognizePayment } from "@/lib/financials/payments/recognitionCommands";

type Row = {
    attemptId: string;
    customerId: string | null;
    amountCents: number;
    currency: string;
    rail: "card" | "ach";
    payerPersonId: string | null;
    providerState: string;
    providerStateAt: string | null;
    expectedSettlementOn: string | null;
    methodBrand: string | null;
    methodLast4: string | null;
    lastReason: string | null;
};

/** The provider's state, in Alloy's words. `succeeded` is the only one that reaches this queue. */
function providerStateLabel(state: string): string {
    return state === "succeeded" ? "Provider collected" : state;
}

function methodLabel(row: Row): string | null {
    if (!row.methodBrand && !row.methodLast4) return null;
    const name = row.methodBrand?.trim() || (row.rail === "ach" ? "Bank account" : "Card");
    return row.methodLast4 ? `${name} •••• ${row.methodLast4}` : name;
}

export default function NeedsRecognitionLens({ scopeLabel }: { scopeLabel: string }) {
    const [rows, setRows] = useState<Row[] | null>(null);
    /*
     * TWO ERRORS, BECAUSE THEY HAVE DIFFERENT LIFETIMES.
     *
     * A read error is cleared by the next successful read. An ACTION error must survive it — the
     * reload immediately after a refusal is what makes the row's reason current, and folding both
     * into one state meant that reload wiped the refusal off the screen before anybody read it.
     * The operator was left with an unchanged row and no explanation.
     */
    const [readError, setReadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const error = actionError ?? readError;

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/financials/needs-recognition", { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; rows?: Row[]; error?: string };
            if (!res.ok || json.ok === false) {
                setReadError(json.error || "The recognition queue could not be read.");
                setRows([]);
                return;
            }
            setReadError(null);
            setRows(json.rows ?? []);
        } catch (e) {
            setReadError(e instanceof Error ? e.message : "The recognition queue could not be read.");
            setRows([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const recognize = useCallback(
        async (attemptId: string) => {
            setBusy(attemptId);
            setActionError(null);
            setNote(null);
            const out = await executeRecognizePayment(attemptId);
            if (!out.ok) {
                /* The refusal stays on the row too; this is the immediate answer. */
                setActionError(out.error);
            } else if (out.detail.recognized_now === false) {
                setNote("That payment had already been recognized.");
            }
            /* Reload either way: a refusal updates the row's reason. */
            await load();
            setBusy(null);
        },
        [load],
    );

    if (rows === null) {
        return <p className="px-3 py-4 text-xs text-alloy-midnight/50">Reading the recognition queue…</p>;
    }

    return (
        <div data-testid="needs-recognition-lens" data-recognition-count={rows.length}>
            {error ? (
                <p className="px-3 py-2 text-xs text-alloy-ember" data-testid="needs-recognition-error">
                    {error}
                </p>
            ) : null}
            {note ? (
                <p className="px-3 py-2 text-xs text-alloy-midnight/60" data-testid="needs-recognition-note">
                    {note}
                </p>
            ) : null}

            {/*
              * A FAILED READ IS NOT AN EMPTY QUEUE.
              *
              * Both states render zero rows, and only one of them means "there is nothing to do".
              * Saying "all collected money is recorded" because a request failed tells an operator
              * the books are clean at exactly the moment Alloy cannot see them — the same mistake
              * the account card's own failed-read doctrine exists to prevent.
              */}
            {rows.length === 0 && !error ? (
                <WorkspaceEmptyState
                    title="All collected money is recorded"
                    body={`Nothing is waiting to be recognized for ${scopeLabel.toLowerCase()}.`}
                />
            ) : (
                rows.map((row) => {
                    const method = methodLabel(row);
                    return (
                        <div
                            key={row.attemptId}
                            data-testid="needs-recognition-row"
                            data-recognition-attempt={row.attemptId}
                            data-recognition-rail={row.rail}
                            className="border-b border-alloy-stone/10 px-3 py-2"
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm text-alloy-midnight">
                                    {providerStateLabel(row.providerState)}
                                    {row.providerStateAt ? ` · ${shortDate(row.providerStateAt)}` : ""}
                                </span>
                                <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                    {moneyExact(row.amountCents, row.currency)}
                                </span>
                            </div>

                            <div className="mt-0.5 truncate text-xs text-alloy-midnight/60">
                                {row.rail === "ach" ? "Bank payment" : "Card payment"}
                                {method ? ` · ${method}` : ""}
                                {row.expectedSettlementOn ? ` · Expected ${shortDate(row.expectedSettlementOn)}` : ""}
                            </div>

                            {row.lastReason ? (
                                <p
                                    className="mt-1 text-xs text-amber-700"
                                    data-testid="needs-recognition-reason"
                                >
                                    {row.lastReason}
                                </p>
                            ) : null}

                            <button
                                type="button"
                                data-testid="needs-recognition-recognize"
                                disabled={busy !== null}
                                onClick={() => void recognize(row.attemptId)}
                                className="mt-2 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                            >
                                {busy === row.attemptId ? "Recognizing…" : "Recognize payment"}
                            </button>
                        </div>
                    );
                })
            )}
        </div>
    );
}
