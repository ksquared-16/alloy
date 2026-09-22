"use client";
/**
 * THE SELECTED OBLIGATION, EXPLAINED — and nothing about it decided here.
 *
 * The Charges pane already hosted the household's account card, which answers "how is this family
 * doing?" It never answered "what is this charge?" — so an operator looking at a queue row saw an
 * amount and a household and had no way to learn what the money was for, who owed it, whether an
 * agency was expected to pay part, or what had already been applied to it.
 *
 * Every figure below arrives from `/api/admin/financials/charge/:id`, which is `resolveChargeDetail`
 * — a composition over the services that own each number. This component formats cents into money
 * and decides which sections are worth showing. It performs no arithmetic: there is no subtraction
 * here, and a total is never assembled from parts on screen.
 *
 * ── THE THREE ATTRIBUTION STATES ARE THREE DIFFERENT MEANINGS ──
 *
 *   a named child            — the charge is about that child
 *   Household                — the charge is the family's, and correctly has no child
 *   attribution unavailable  — the agreement it was billed from no longer exists
 *
 * The third is common in real data rather than exotic: posted money is immutable and its provenance
 * is not, so a charge can outlive the agreement that explains it. It is disclosed, never repaired by
 * guessing a plausible family — and it is never shown as "Household", which would be a claim about
 * the charge rather than an admission about the record.
 */
import { useCallback, useEffect, useState } from "react";

import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";
import FinancialsExpectedFundingPanel from "@/app/adminV2/financials/FinancialsExpectedFundingPanel";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

type Application = {
    paymentId: string;
    allocatedAmountCents: number;
    method: string | null;
    paymentStatus: string | null;
    receivedAt: string | null;
    referenceNumber: string | null;
    status: string | null;
};

type ChargeDetail = {
    chargeId: string;
    /* Derived from the charge's dates. See `resolveChargeDetail`. */
    billingPeriodKey?: string | null;
    billingPeriodLabel?: string | null;
    /* Decided by the attribution trigger at INSERT, read here — never recomputed. */
    accountingPeriod?: { key: string; label: string | null; status: string; startsOn: string; endsOn: string } | null;
    accountingDeferredFrom?: string | null;
    glAccount?: { code: string; name: string | null } | null;
    label: string | null;
    description: string | null;
    currencyCode: string;
    status: string;
    serviceDate: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    postedAt: string | null;
    customerId: string | null;
    customerMemberId: string | null;
    householdName: string | null;
    childName: string | null;
    billableSourceType: string;
    enrollmentAgreementId: string | null;
    position: {
        outstandingCents: number;
        submittedClaimSuppressionCents: number;
        currentlyCollectibleCents: number;
        explanation: { grossCents: number; reductionsCents: number; netCents: number; appliedCents: number };
    } | null;
    responsibility: {
        allocatedCents: number;
        unassignedCents: number;
        parties: { personId: string | null; name: string; assignedCents: number }[];
    };
    expectedFunding: { label: string; sourceType: string; expectedCents: number | null }[];
    applications: Application[];
    /* Who bears the ACCOUNT, from a date — a different fact from who bears this charge. */
    accountArrangement: {
        id: string;
        effectiveStart: string | null;
        shares: {
            id: string;
            responsiblePartyId: string | null;
            name: string;
            method: string | null;
            amountCents: number | null;
            percentBasisPoints: number | null;
            expectedFunding: {
                id: string;
                sourceType: string;
                label: string;
                reference: string | null;
                basis: string;
                expectedAmountCents: number | null;
                percentBasisPoints: number | null;
            }[];
        }[];
    } | null;
};

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/*
 * The platform's date authority, not a fourth private copy of it. `formatDisplayDate` already
 * accepts both `YYYY-MM-DD` and a full ISO timestamp and always carries the year, which is the one
 * thing a financial date may not omit.
 */
function day(value: string | null): string | null {
    return formatDisplayDate(value) || null;
}

function Row(props: { label: string; value: string; strong?: boolean; muted?: boolean; testId?: string }) {
    return (
        <span
            className={`flex items-baseline justify-between gap-3 py-0.5 text-xs ${
                props.strong ? "font-semibold text-alloy-midnight" : props.muted ? "text-alloy-midnight/55" : "text-alloy-midnight/80"
            }`}
            data-financials-charge-line={props.testId}
        >
            <span className="min-w-0 truncate">{props.label}</span>
            <span className="shrink-0 tabular-nums">{props.value}</span>
        </span>
    );
}

function Group(props: { children: React.ReactNode }) {
    return (
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{props.children}</p>
    );
}

export default function FinancialsChargeDetail({ chargeId }: { chargeId: string }) {
    const [detail, setDetail] = useState<ChargeDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        setLoading(true);
        setError(null);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/financials/charge/${encodeURIComponent(chargeId)}`, {
                    cache: "no-store",
                });
                const body = (await res.json()) as { ok?: boolean; detail?: ChargeDetail; error?: string };
                if (!live) return;
                if (!res.ok || !body.ok || !body.detail) {
                    setError(body.error ?? "This charge could not be read.");
                    setDetail(null);
                } else {
                    setDetail(body.detail);
                }
            } catch {
                if (live) setError("This charge could not be read.");
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => {
            live = false;
        };
    }, [chargeId]);

    const reload = useCallback(async () => {
        /* Committed truth, re-read. The panel never hands back a figure for this to display. */
        const res = await fetch(`/api/admin/financials/charge/${encodeURIComponent(chargeId)}`, { cache: "no-store" });
        const body = (await res.json()) as { ok?: boolean; detail?: ChargeDetail };
        if (res.ok && body.ok && body.detail) setDetail(body.detail);
    }, [chargeId]);

    if (loading) {
        return (
            <p className="text-xs text-alloy-midnight/50" data-financials-charge-detail-loading="true">
                Loading charge…
            </p>
        );
    }
    if (error || !detail) {
        return (
            <p className="text-xs text-alloy-ember" data-financials-charge-detail-error="true">
                {error ?? "This charge could not be read."}
            </p>
        );
    }

    const currency = detail.currencyCode;
    const e = detail.position?.explanation ?? null;

    /*
     * WHO OR WHAT THIS IS ABOUT. An agreement charge whose agreement is gone is not the household's
     * charge — it is a charge whose subject can no longer be established, and saying "Household"
     * would quietly assert something the record cannot support.
     */
    const attribution =
        detail.childName ? { text: detail.childName, state: "child" }
        : detail.billableSourceType === "customer" ? { text: "Household", state: "household" }
        : detail.customerId ? { text: "Household", state: "household" }
        : { text: "Original attribution unavailable", state: "unresolved" };

    /*
     * A reversed allocation no longer settles anything, and the position already stops counting it.
     * The split is made once, here, so every reading below agrees about which money applied.
     */
    const applied = detail.applications.filter((a) => (a.status ?? "active") !== "reversed");
    const reversedApplications = detail.applications.filter((a) => (a.status ?? "active") === "reversed");

    /* Ordered oldest-first: an account of the obligation reads forwards. */
    const history: { key: string; label: string; when: string | null }[] = [
        ...(detail.serviceDate ? [{ key: "service", label: "Charge is for", when: day(detail.serviceDate) }] : []),
        ...(detail.postedAt ? [{ key: "posted", label: "Posted", when: day(detail.postedAt) }] : []),
        ...detail.applications.map((a, i) => ({
            key: `applied-${a.paymentId}-${i}`,
            label:
                (a.status ?? "active") === "reversed"
                    ? `${money(a.allocatedAmountCents, detail.currencyCode)} applied, then reversed`
                    : `${money(a.allocatedAmountCents, detail.currencyCode)} applied${a.method ? ` · ${a.method}` : ""}`,
            when: day(a.receivedAt),
        })),
    ];

    const dates = [
        detail.serviceDate ? `Service ${day(detail.serviceDate)}` : null,
        detail.postedAt ? `Posted ${day(detail.postedAt)}` : null,
    ].filter(Boolean);

    return (
        <section
            className="mb-3 rounded-md border border-alloy-stone/15 bg-white/60 p-3"
            data-financials-charge-detail={detail.chargeId}
        >
            <p className="truncate text-sm font-semibold text-alloy-midnight" data-financials-charge-label="true">
                {detail.label || detail.description || "Charge"}
            </p>
            <p
                className="truncate text-xs text-alloy-midnight/65"
                data-financials-charge-attribution={attribution.state}
            >
                {attribution.text}
                {detail.householdName && attribution.state === "child" ? ` · ${detail.householdName}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-alloy-midnight/55">
                <span data-financials-charge-status={detail.status}>
                    {detail.status.charAt(0).toUpperCase() + detail.status.slice(1)}
                </span>
                {/* THE CHARGE'S OWN TIME, never the operating month. */}
                {dates.length ? ` · ${dates.join(" · ")}` : ""}
            </p>

            {/*
             * ── WHEN WAS THIS BILLED, AND WHERE DID IT POST ────────────────────────────────────
             *
             * Three facts the ledger deliberately does not carry as permanent columns, because a
             * ledger is scanned and these are asked about one row at a time. Billing period and
             * accounting period are DIFFERENT PERIODS with different owners — one derived from the
             * charge's own dates, one decided by the database when the journal entry was written —
             * and they are stated side by side so an operator can see that they are two answers.
             *
             * A charge that has not posted has no accounting period, and that is said rather than
             * left blank. An unmapped GL is a configuration fact and is toned as attention.
             */}
            <Group>Posting</Group>
            <Row
                label="Billing period"
                value={detail.billingPeriodLabel ?? "Unplaced"}
                testId="billing-period"
            />
            {/*
              * INVOICE AND DUE, BESIDE THE PERIODS AND NEVER FOLDED INTO THEM. The invoice date is
              * when the obligation was issued; the due date is when payment is expected and is
              * blank for an organisation that has configured no terms — which is a real answer,
              * not a missing one, so it is stated rather than hidden.
              */}
            <Row
                label="Invoice date"
                value={formatDisplayDate(detail.invoiceDate) || "—"}
                muted={!detail.invoiceDate}
                testId="invoice-date"
            />
            <Row
                label="Due date"
                value={detail.dueDate ? formatDisplayDate(detail.dueDate) : "No configured terms"}
                muted={!detail.dueDate}
                testId="due-date"
            />
            <Row
                label="Accounting period"
                value={
                    detail.accountingPeriod
                        ? `${detail.accountingPeriod.label ?? detail.accountingPeriod.key} · ${
                              detail.accountingPeriod.status === "closed" ? "Closed" : "Open"
                          }`
                        : "Not posted to a period yet"
                }
                muted={!detail.accountingPeriod}
                testId="accounting-period"
            />
            {/*
              * A DEFERRAL IS NOT AN ORDINARY POSTING, AND MUST NOT READ LIKE ONE.
              *
              * Closing a period does not refuse the money effective in it — the entry is
              * attributed to the next open period instead. Shown alone, an October attribution on
              * a September charge is indistinguishable from a charge that was always October's.
              * The trigger records where it came from; this says so, so the operator can tell a
              * deferral from an ordinary posting without reading the journal.
              */}
            {detail.accountingDeferredFrom ? (
                <Row
                    label="Deferred from"
                    value={`${formatDisplayDate(detail.accountingDeferredFrom)} · that period was closed`}
                    testId="accounting-deferred-from"
                />
            ) : null}
            <Row
                label="GL account"
                value={
                    detail.glAccount
                        ? `${detail.glAccount.code}${detail.glAccount.name ? ` · ${detail.glAccount.name}` : ""}`
                        : "Unmapped"
                }
                muted={!detail.glAccount}
                testId="gl-account"
            />

            {e ? (
                <>
                    <Group>Amount</Group>
                    <Row label="Gross charge" value={money(e.grossCents, currency)} testId="gross" />
                    {e.reductionsCents !== 0 ? (
                        <Row label="Reductions" value={money(-Math.abs(e.reductionsCents), currency)} testId="reductions" />
                    ) : null}
                    <Row label="Net obligation" value={money(e.netCents, currency)} strong testId="net" />
                </>
            ) : (
                /* A draft owes nothing yet, and saying $0 outstanding would read as settled. */
                <p className="mt-2 text-xs text-alloy-midnight/55" data-financials-charge-no-position="true">
                    This charge does not owe anything yet.
                </p>
            )}

            {/*
             * THE INTENT SITS WITH THE STATE IT CHANGES, at the grain the capability actually has.
             *
             * `billing.configure_responsibility` records an ARRANGEMENT for a household or child
             * from a date — it is not a decision about this one charge. The parties shown here are
             * the account's arrangement as it applies to this obligation, which is why the control
             * is offered beside them and why it says "account" rather than implying the charge.
             */}
            {detail.customerId || detail.customerMemberId ? (
                <FinancialsResponsibilityPanel
                    customerId={detail.customerId}
                    customerMemberId={detail.customerMemberId}
                    chargeId={detail.chargeId}
                    chargeStatus={detail.status}
                    subjectLabel={detail.childName}
                    arrangement={detail.accountArrangement}
                    parties={detail.responsibility.parties}
                    onCommitted={reload}
                />
            ) : null}

            {/*
             * ── THE ARRANGEMENT'S OWN SHARES, AND WHAT IS EXPECTED TO FUND THEM ─────────────────
             *
             * `billing.configure_expected_funding` attaches to a SHARE. So the shares have to be
             * visible and named: an operator cannot say "this agency covers $650 of this" while
             * looking at a list that does not say whose responsibility "this" is.
             *
             * Shown beside the charge's own allocation rather than instead of it. The arrangement
             * says who bears the account from a date; the allocation says who bears THIS obligation
             * once it was resolved. A posted charge billed before the arrangement has the second
             * and not the first, and conflating them would claim a division that never happened.
             */}
            {detail.accountArrangement && detail.accountArrangement.shares.length > 0 ? (
                <>
                    <Group>Responsibility arrangement</Group>
                    {detail.accountArrangement.shares.map((share) => (
                        <div key={share.id} data-financials-arrangement-share={share.id}>
                            <Row
                                label={share.name}
                                value={
                                    share.amountCents != null
                                        ? money(share.amountCents, currency)
                                        : share.percentBasisPoints != null
                                          ? `${share.percentBasisPoints / 100}%`
                                          : "Remainder"
                                }
                                testId="arrangement-share"
                            />
                            <FinancialsExpectedFundingPanel
                                shareId={share.id}
                                arrangementId={detail.accountArrangement!.id}
                                customerMemberId={detail.customerMemberId}
                                partyName={share.name}
                                responsibleCents={share.amountCents}
                                currency={currency}
                                funding={share.expectedFunding}
                                onCommitted={reload}
                            />
                        </div>
                    ))}
                </>
            ) : null}

            {detail.responsibility.parties.length > 0 || detail.responsibility.unassignedCents !== 0 ? (
                <>
                    <Group>Responsibility</Group>
                    {detail.responsibility.parties.map((party) => (
                        <Row
                            key={party.personId ?? party.name}
                            label={party.name}
                            value={money(party.assignedCents, currency)}
                            testId="responsibility-party"
                        />
                    ))}
                    {detail.responsibility.unassignedCents !== 0 ? (
                        <Row
                            label="Unassigned"
                            value={money(detail.responsibility.unassignedCents, currency)}
                            testId="responsibility-unassigned"
                        />
                    ) : null}
                </>
            ) : null}

            {detail.expectedFunding.length > 0 ? (
                <>
                    <Group>Expected funding</Group>
                    {detail.expectedFunding.map((f) => (
                        <Row
                            key={f.label}
                            label={f.label}
                            value={f.expectedCents != null ? money(f.expectedCents, currency) : "Amount not yet known"}
                            testId="expected-funding"
                        />
                    ))}
                    {/* An expectation is not a payment, and never reduces what is owed. */}
                    <p className="text-[11px] text-alloy-midnight/50" data-financials-charge-funding-note="true">
                        Not yet received
                    </p>
                </>
            ) : null}

            {/*
             * APPLIED MEANS APPLIED. An allocation can be reversed while the payment that made it
             * stands, and the collectible position stops counting it — so listing every allocation
             * under one heading showed a family paying for something the balance still said they
             * owed. Reversed money is kept visible, because it happened, and labelled, because it
             * no longer settles anything.
             */}
            {applied.length > 0 ? (
                <>
                    <Group>Applied payments</Group>
                    {applied.map((a) => (
                        <Row
                            key={`${a.paymentId}-${a.allocatedAmountCents}`}
                            label={[a.method ?? "Payment", day(a.receivedAt)].filter(Boolean).join(" · ")}
                            value={money(a.allocatedAmountCents, currency)}
                            muted
                            testId="application"
                        />
                    ))}
                </>
            ) : null}
            {reversedApplications.length > 0 ? (
                <>
                    <Group>Reversed payments</Group>
                    {reversedApplications.map((a) => (
                        <Row
                            key={`rev-${a.paymentId}-${a.allocatedAmountCents}`}
                            label={[a.method ?? "Payment", day(a.receivedAt), "reversed"].filter(Boolean).join(" · ")}
                            value={money(a.allocatedAmountCents, currency)}
                            muted
                            testId="application-reversed"
                        />
                    ))}
                </>
            ) : null}

            {/*
             * WHAT HAPPENED TO IT, from facts this composition already carries.
             *
             * Deliberately not a new event store. The charge knows when it was for and when it was
             * posted, and each application knows when its money arrived — that is a real, ordered
             * account of the obligation without inventing a second ledger or deriving events by
             * diffing present state against itself.
             *
             * THE LIMIT, STATED RATHER THAN PAPERED OVER: reductions, responsibility changes and
             * reversals are not listed here. They are recorded in the financial journal, whose feed
             * is org-wide and keyed by source rather than by charge, so scoping it to one
             * obligation is its own read and its own certification. The Activity section remains
             * the canonical place to see them until then.
             */}
            {history.length > 0 ? (
                <>
                    <Group>History</Group>
                    {history.map((h) => (
                        <Row key={h.key} label={h.label} value={h.when ?? ""} muted testId="history" />
                    ))}
                </>
            ) : null}

            {detail.position ? (
                <>
                    <Group>Collection</Group>
                    <Row
                        label="Outstanding"
                        value={money(detail.position.outstandingCents, currency)}
                        strong
                        testId="outstanding"
                    />
                    {/* Only when a submitted claim is actually holding money back. */}
                    {detail.position.submittedClaimSuppressionCents > 0 ? (
                        <>
                            <Row
                                label="Agency suppression"
                                value={money(detail.position.submittedClaimSuppressionCents, currency)}
                                testId="suppression"
                            />
                            <Row
                                label="Collectible now"
                                value={money(detail.position.currentlyCollectibleCents, currency)}
                                testId="collectible-now"
                            />
                        </>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
