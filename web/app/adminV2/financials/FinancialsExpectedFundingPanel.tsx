"use client";
/**
 * EXPECTED FUNDING — said about one responsible party's share, because that is what it is about.
 *
 * ── WHY THIS IS SHARE-GRAIN AND NOT AN ACCOUNT TOGGLE ──
 *
 * `configureExpectedFunding` refuses funding that hangs off nothing: it attaches to a responsibility
 * SHARE or one resolved allocation, and never to a charge or an account. That is the Director's
 * decision made concrete — an employer or an agency does not become contractually responsible by
 * funding something, so what they fund is somebody else's responsibility, named.
 *
 * An account-level "expected funding" control would have had to invent an answer to "whose share?",
 * and the only answers available are wrong: the first party, the largest party, or all of them.
 *
 * ── THE THREE FIGURES, AND WHY THE THIRD ONE MATTERS ──
 *
 *     Responsible          $900
 *     Expected funding     $750
 *     Still responsibility $150
 *
 * The third line is the whole point of the distinction. Expected funding is an EXPECTATION: no money
 * has been received, no claim has been submitted, no agency has paid, and the responsible party has
 * not stopped being responsible. If the agency never pays, the $900 is still theirs. This panel says
 * that in the copy and never subtracts an expectation from anything that is owed.
 *
 * ── NOTHING IS CALCULATED HERE ──
 *
 * The operator names a source and an amount; the registered action decides whether that is a valid
 * expectation and its own `buildPreview` says what will change. The arithmetic that turns funding
 * into an attributed line is Commercial Execution's, through `toFundingPlan`, and is not repeated
 * on this surface.
 */
import { useCallback, useEffect, useState } from "react";

import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";

export const CONFIGURE_EXPECTED_FUNDING_ACTION_KEY = "billing.configure_expected_funding";

export type ExpectedFundingRow = {
    id: string;
    sourceType: string;
    label: string;
    reference: string | null;
    basis: string;
    expectedAmountCents: number | null;
    percentBasisPoints: number | null;
};

type SourceType = { key: string; label: string; requiresCanonicalSource: boolean };
type Agency = { id: string; name: string; jurisdiction: string | null };
type PreviewPayload = { summary?: string; changes?: string[] } | null;

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

async function loadSources(): Promise<{ types: SourceType[]; agencies: Agency[]; error: string | null }> {
    try {
        const res = await fetch("/api/admin/financials/funding-sources", {
            credentials: "include",
            cache: "no-store",
        });
        const body = (await res.json()) as { ok?: boolean; types?: SourceType[]; agencies?: Agency[]; error?: unknown };
        if (!res.ok || body.ok === false) {
            return {
                types: [],
                agencies: [],
                error: typeof body.error === "string" ? body.error : "Funding sources could not be loaded.",
            };
        }
        return { types: body.types ?? [], agencies: body.agencies ?? [], error: null };
    } catch {
        /* An unreadable registry is not an empty one — see the route's own note. */
        return { types: [], agencies: [], error: "Funding sources could not be loaded." };
    }
}

async function callAction(
    mode: "preview" | "execute",
    args: {
        shareId: string;
        arrangementId: string | null;
        customerMemberId: string | null;
        sourceType: string;
        label: string;
        reference: string | null;
        expectedAmountCents: number;
    },
): Promise<{ ok: boolean; preview?: PreviewPayload; error?: string }> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            action_key: CONFIGURE_EXPECTED_FUNDING_ACTION_KEY,
            entity_type: "child",
            entity_id: args.customerMemberId ?? "",
            mode,
            confirmation: { confirmed: mode === "execute" },
            payload: {
                /* THE ANCHOR. A share, so the expectation is about one party's responsibility. */
                share_id: args.shareId,
                arrangement_id: args.arrangementId,
                funding_source_type: args.sourceType,
                funding_source_label: args.label,
                funding_source_reference: args.reference,
                /*
                 * FIXED CENTS ONLY, because that is a figure the capability represents exactly and
                 * an operator can state exactly. The action also accepts a percentage in basis
                 * points; offering "75%" here would mean choosing on the operator's behalf whether
                 * it is 75% of the share, the charge, or the net, and only one of those is right.
                 */
                basis: "fixed_amount",
                expected_amount_cents: args.expectedAmountCents,
            },
        }),
    });
    const json = (await res.json()) as {
        ok?: boolean;
        data?: { preview?: PreviewPayload; execution_result?: { preview?: PreviewPayload } };
        error?: { message?: string } | string;
    };
    if (!res.ok || json.ok === false) {
        const error = typeof json.error === "string" ? json.error : json.error?.message;
        return { ok: false, error: error ?? "The expectation was refused." };
    }
    /* The preview is the action's, and a registry-owned command puts it on `execution_result`. */
    return { ok: true, preview: json.data?.execution_result?.preview ?? json.data?.preview ?? null };
}

export default function FinancialsExpectedFundingPanel({
    shareId,
    arrangementId,
    customerMemberId,
    partyName,
    responsibleCents,
    currency,
    funding,
    onCommitted,
}: {
    shareId: string;
    arrangementId: string | null;
    customerMemberId: string | null;
    partyName: string;
    /** What this party is responsible for, as the arrangement states it. Never edited here. */
    responsibleCents: number | null;
    currency: string;
    funding: ExpectedFundingRow[];
    onCommitted: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [types, setTypes] = useState<SourceType[]>([]);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [sourceType, setSourceType] = useState("government_subsidy");
    const [agencyId, setAgencyId] = useState("");
    const [label, setLabel] = useState("");
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [preview, setPreview] = useState<PreviewPayload>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const expectedCents = funding.reduce((acc, f) => acc + (f.expectedAmountCents ?? 0), 0);
    const selectedType = types.find((t) => t.key === sourceType);
    const needsAgency = selectedType?.requiresCanonicalSource ?? sourceType === "government_subsidy";

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            const loaded = await loadSources();
            if (cancelled) return;
            setTypes(loaded.types);
            setAgencies(loaded.agencies);
            if (loaded.error) setError(loaded.error);
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const start = useCallback(() => {
        setPreview(null);
        setError(null);
        setDone(null);
        setAmount("");
        setOpen(true);
    }, []);

    const run = useCallback(
        async (mode: "preview" | "execute") => {
            const cents = Math.round(Number(amount) * 100);
            if (!Number.isInteger(cents) || cents < 0 || amount.trim() === "") {
                setError("Name the amount this source is expected to cover.");
                return;
            }
            /*
             * THE SOURCE MUST BE IDENTIFIED, and for a government agency that means PICKED. Two
             * spellings of one agency is how an expectation stops matching the authorization it is
             * about, and the mismatch only surfaces later as a claim that comes back empty.
             */
            const agency = agencies.find((a) => a.id === agencyId) ?? null;
            if (needsAgency && !agency) {
                setError("Choose the funding agency this is expected from.");
                return;
            }
            const resolvedLabel = needsAgency ? (agency?.name ?? "") : label.trim();
            if (!resolvedLabel) {
                setError("Name the funding source.");
                return;
            }

            setBusy(mode);
            setError(null);
            try {
                const out = await callAction(mode, {
                    shareId,
                    arrangementId,
                    customerMemberId,
                    sourceType,
                    label: resolvedLabel,
                    reference: needsAgency ? (agency?.id ?? null) : null,
                    expectedAmountCents: cents,
                });
                if (!out.ok) {
                    setError(out.error ?? "Refused.");
                    setPreview(null);
                    return;
                }
                if (mode === "preview") {
                    setPreview(out.preview ?? null);
                } else {
                    /* Closed, because the confirmation and the re-read record both live there. */
                    setPreview(null);
                    setOpen(false);
                    setDone("Expected funding recorded.");
                    await onCommitted();
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Recording the expectation failed.");
            } finally {
                setBusy(null);
            }
        },
        [agencies, agencyId, amount, arrangementId, customerMemberId, label, needsAgency, onCommitted, shareId, sourceType],
    );

    if (!open) {
        return (
            <div className="mt-1 pl-3" data-financials-share-funding={shareId}>
                {funding.length === 0 ? (
                    <p className="text-[11px] text-alloy-midnight/45" data-financials-funding-none="true">
                        Expected funding — none.
                    </p>
                ) : (
                    funding.map((f) => (
                        <p
                            key={f.id}
                            className="text-[11px] text-alloy-midnight/60"
                            data-financials-funding-row={f.id}
                        >
                            {/* WHAT IS EXPECTED, AND FROM WHOM — never rendered as money received. */}
                            Expected from {f.label}
                            {f.expectedAmountCents != null ? ` · ${money(f.expectedAmountCents, currency)}` : ""}
                            {f.percentBasisPoints != null ? ` · ${f.percentBasisPoints / 100}%` : ""}
                        </p>
                    ))
                )}
                {responsibleCents != null && expectedCents > 0 ? (
                    <p className="text-[11px] text-alloy-midnight/45" data-financials-funding-residual="true">
                        {/*
                         * THE LINE THE WHOLE DISTINCTION EXISTS FOR. Funding expected is not
                         * responsibility removed, and until money actually arrives this is still
                         * theirs.
                         */}
                        {expectedCents > responsibleCents
                            ? "Expected funding exceeds this share."
                            : `${money(responsibleCents - expectedCents, currency)} still their responsibility.`}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="mt-0.5 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                    onClick={start}
                    data-financials-manage-funding={shareId}
                >
                    Manage expected funding →
                </button>
                {done ? (
                    <p className="mt-0.5 text-[11px] text-alloy-bend-pine" data-financials-funding-done="true">
                        {done}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <section
            className="mt-1 rounded-md border border-alloy-stone/15 bg-white/60 p-2"
            data-financials-manage-funding-panel={shareId}
        >
            <p className="text-[11px] font-semibold text-alloy-midnight">Expected funding — {partyName}</p>
            <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                {/* The law, said where the operator is about to act on it. */}
                Where this share is expected to be funded from. It is not a payment, it claims nothing from an
                agency, and it does not reduce what is owed.
            </p>

            {responsibleCents != null ? (
                <p className="mt-1 text-[11px] text-alloy-midnight/70" data-financials-funding-responsible="true">
                    Responsible · {money(responsibleCents, currency)}
                </p>
            ) : null}

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Kind of funding
                <select
                    value={sourceType}
                    onChange={(e) => {
                        setSourceType(e.target.value);
                        setPreview(null);
                    }}
                    data-financials-funding-type="true"
                    className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs"
                >
                    {(types.length > 0 ? types : [{ key: sourceType, label: sourceType, requiresCanonicalSource: true }]).map(
                        (t) => (
                            <option key={t.key} value={t.key}>
                                {t.label}
                            </option>
                        ),
                    )}
                </select>
            </label>

            {needsAgency ? (
                <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                    Funding agency
                    {agencies.length === 0 ? (
                        /*
                         * NO REGISTRY, NO INVENTION. A government expectation must name an agency
                         * the org actually holds, because the authorization, the claim and the
                         * remittance are all keyed to it.
                         */
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55" data-financials-funding-no-agency="true">
                            This organisation has no funding agencies configured yet. Add one in Financials setup
                            before expecting government money.
                        </p>
                    ) : (
                        <select
                            value={agencyId}
                            onChange={(e) => {
                                setAgencyId(e.target.value);
                                setPreview(null);
                            }}
                            data-financials-funding-agency="true"
                            className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs"
                        >
                            <option value="">Choose an agency…</option>
                            {agencies.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                    {a.jurisdiction ? ` · ${a.jurisdiction}` : ""}
                                </option>
                            ))}
                        </select>
                    )}
                </label>
            ) : (
                <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                    {/*
                     * TYPED, AND SAID TO BE TYPED. This platform holds no registry of employers or
                     * scholarships, and a Financials-local one would become a second system of
                     * record for parties the platform may later identify properly.
                     */}
                    Funding source
                    <input
                        type="text"
                        value={label}
                        placeholder="Name of the employer, scholarship or program"
                        onChange={(e) => {
                            setLabel(e.target.value);
                            setPreview(null);
                        }}
                        data-financials-funding-label="true"
                        className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs"
                    />
                </label>
            )}

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Expected to cover
                <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                        setPreview(null);
                    }}
                    data-financials-funding-amount="true"
                    className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs tabular-nums"
                />
            </label>

            {preview ? (
                <div
                    className="mt-2 rounded border border-alloy-stone/15 bg-alloy-stone/5 p-2"
                    data-financials-funding-preview="true"
                >
                    <p className="text-[11px] font-medium text-alloy-midnight">{preview.summary}</p>
                    {(preview.changes ?? []).map((c) => (
                        <p key={c} className="text-[11px] text-alloy-midnight/65">
                            {c}
                        </p>
                    ))}
                </div>
            ) : null}

            {error ? (
                <p className="mt-2 text-[11px] text-alloy-ember" data-financials-funding-error="true">
                    {error}
                </p>
            ) : null}

            <div className="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/20 px-2 py-1 text-xs text-alloy-midnight/70"
                    onClick={() => void run("preview")}
                    disabled={busy !== null}
                    data-financials-funding-preview-btn="true"
                >
                    {busy === "preview" ? "Checking…" : "Preview"}
                </button>
                <button
                    type="button"
                    className={WS_ACTION_PRIMARY}
                    onClick={() => void run("execute")}
                    disabled={busy !== null || !preview}
                    data-financials-funding-confirm="true"
                >
                    {busy === "execute" ? "Saving…" : "Confirm"}
                </button>
                <button
                    type="button"
                    className="text-xs text-alloy-midnight/50 hover:underline"
                    onClick={() => setOpen(false)}
                    disabled={busy !== null}
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
