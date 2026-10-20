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
import { useCallback, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";
import FinancialsExpectedFundingPanel from "@/app/adminV2/financials/FinancialsExpectedFundingPanel";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { invoiceRuleShort } from "@/lib/financials/chargeDates/describeChargeDateChain";
import { FinancialsChargeState, financialsChargeState } from "@/components/operationalCards/FinancialsLedger";

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
    amountCents?: number;
    chargeTemplateId?: string | null;
    /** W7-F017: stored invoice-timing provenance; source "template" is a charge-type override. */
    invoiceRule?: { source: string; strategy: string; offsetDays: number } | null;
    postedAt: string | null;
    /*
     * PROVENANCE, from the canonical projection. `originDescription` is the resolver's own
     * sentence and is NEVER composed here — the rule that bounds it (what the stored evidence can
     * and cannot support) lives with the evidence, in `chargeOrigin`, not in a card.
     */
    createdAt?: string | null;
    createdByName?: string | null;
    postedByName?: string | null;
    originDescription?: string | null;
    /**
     * The unmet identity requirement for the creating operator, in one sentence (W7-F002).
     *
     * Null when there is nothing to say — a named operator, or a charge with no human actor. When
     * it is present, the audit line still shows whatever name it has and this says, beside it, that
     * the attribution does not rest on a recorded identity and where that is fixed.
     */
    createdByIdentityGap?: string | null;
    createdByIdentityStatus?: string | null;
    /** Why this charge is still a draft, when it is one (W7-F001). */
    awaiting?: { key: string; label: string; explanation: string; operatorActionable: boolean; postsOn?: string | null } | null;
    correctionOfChargeId?: string | null;
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
    /*
     * Present only when this charge IS somebody's correction. The projection's own block — every
     * field is a stored fact, and the direction is STATED rather than read off a sign here.
     */
    adjustment?: {
        applicationId: string;
        direction: "reduce" | "increase";
        magnitudeCents: number;
        reason: string | null;
        note: string | null;
        sourceChargeId: string | null;
        sourceDescription: string | null;
        sourceServiceDate: string | null;
        sourcePeriodLabel: string | null;
        sourcePeriodStatus: string | null;
        reversesApplicationId: string | null;
        reversedByApplicationId: string | null;
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

/**
 * A timestamp an operator can compare at a glance — the date they already read, plus the time of
 * day. Two charges raised six days apart stop looking like one charge entered twice, which is the
 * whole reason this is here rather than a date alone.
 */
function exactMoment(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = formatDisplayDate(iso.slice(0, 10)) ?? iso.slice(0, 10);
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date} at ${time}`;
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

/**
 * ── RELATED FACTS AT THE SAME VISUAL LEVEL ───────────────────────────────────────────────────
 *
 * W7-F002: the detail was thirty label/value lines down a single column, so reading one charge
 * meant travelling the whole screen, and facts that belong together — the two periods, the three
 * dates, the GL account — were separated by nothing but their order.
 *
 * `Pair` lays its rows two to a line above phone width and collapses back to one column when there
 * is no room. Nothing is removed and nothing is abbreviated: the same `Row` renders inside it, so
 * every fact keeps its label, its value and its testId, and the block occupies half the height.
 *
 * Groups that are genuinely a LIST — applied payments, responsibility shares, expected funding —
 * stay a list. Turning a variable-length list into columns makes it harder to scan, not easier.
 */
function Pair(props: { children: React.ReactNode }) {
    return <span className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{props.children}</span>;
}

/**
 * One of the four date identities: label above value, mirroring Add Charge's read-only cells.
 *
 * W7 Scenario 8 final presentation: the row holds the four dates and nothing else. Where a date's
 * provenance is worth knowing (a charge type overriding the organisation's invoice timing) it is an
 * info mark beside the value — a tooltip and an accessible name, never a line of configuration
 * mechanics under the date.
 */
function DateCell(props: { label: string; value: string; testId: string; hint?: string | null; hintAttr?: string }) {
    return (
        <span className="flex min-w-0 flex-col" data-financials-charge-line={props.testId} data-financials-charge-datecell="true">
            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{props.label}</span>
            <span className="flex items-center gap-1 text-xs tabular-nums text-alloy-midnight/80">
                <span className="truncate" title={props.value}>{props.value}</span>
                {props.hint ? (
                    <span
                        role="img"
                        aria-label={props.hint}
                        title={props.hint}
                        className="inline-flex shrink-0 cursor-help text-alloy-midnight/40 hover:text-alloy-midnight/70"
                        {...(props.hintAttr ? { [props.hintAttr]: "true" } : {})}
                    >
                        <Info aria-hidden="true" className="h-3 w-3" />
                    </span>
                ) : null}
            </span>
        </span>
    );
}

/** A label above its value — the header pair (Applies to · Responsibility), Add Charge's grammar. */
function Fact(props: { label: string; value: string; testId: string; strong?: boolean }) {
    return (
        <span className="flex min-w-0 flex-col" data-financials-charge-line={props.testId}>
            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{props.label}</span>
            <span className={`truncate text-sm ${props.strong ? "font-semibold text-alloy-midnight" : "text-alloy-midnight/85"}`} title={props.value}>
                {props.value}
            </span>
        </span>
    );
}

function Group(props: { children: React.ReactNode }) {
    return (
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{props.children}</p>
    );
}

/* W7-F029: the seed's shape lives with the lib, so a host can build one without naming this component. */
import type { ChargeDetailSeed } from "@/lib/financials/workspace/chargeDetailSeed";
export type { ChargeDetailSeed };


/**
 * W7-F029: the seed as a record the one render path can draw. Every field the row did not read is
 * an explicit absence (no position, no applications, no arrangement), so the sections that need
 * them stay closed until the authoritative read arrives — nothing is guessed to fill them.
 */
function detailFromSeed(chargeId: string, seed: ChargeDetailSeed): ChargeDetail {
    const status = seed.status === "scheduled" ? "draft" : seed.status === "reversed" ? "posted" : seed.status;
    const awaitingKey = seed.awaiting?.key ?? null;
    return {
        chargeId,
        label: seed.label,
        description: null,
        currencyCode: "USD",
        status,
        serviceDate: seed.serviceDate ?? null,
        invoiceDate: seed.invoiceDate ?? null,
        dueDate: seed.dueDate ?? null,
        postedAt: seed.postedAt ?? null,
        billingPeriodLabel: seed.billingPeriodLabel ?? null,
        awaiting: seed.awaiting
            ? {
                  key: seed.awaiting.key,
                  label: seed.awaiting.label,
                  explanation: seed.awaiting.explanation,
                  operatorActionable: awaitingKey === "review_required" || awaitingKey === "post_failed",
                  postsOn: seed.awaiting.postsOn ?? null,
              }
            : null,
        customerId: null,
        customerMemberId: null,
        householdName: seed.householdName ?? null,
        childName: seed.childName ?? null,
        billableSourceType: seed.childName ? "enrollment_agreement" : "customer",
        enrollmentAgreementId: null,
        position: null,
        responsibility: { allocatedCents: 0, unassignedCents: 0, parties: [] },
        expectedFunding: [],
        applications: [],
        accountArrangement: null,
    };
}

/** What the host needs to offer the draft lifecycle (W7-F016), read from the same projection. */
export type ChargeDetailFacts = {
    chargeId: string;
    status: string;
    label: string;
    chargeTemplateId: string | null;
    amountCents: number;
    serviceDate: string | null;
    customerMemberId: string | null;
    /** W7-F027: why it is unposted, so the host can offer Post only where a person is needed. */
    awaiting: { key: string; label: string; explanation: string } | null;
};

export default function FinancialsChargeDetail({
    chargeId,
    refreshKey = 0,
    onLoaded,
    bare = false,
    seed = null,
}: {
    chargeId: string;
    /** W7-F029: first paint from the row that was clicked; replaced by the authoritative read. */
    seed?: ChargeDetailSeed | null;
    /**
     * W7 Scenario 8 final presentation: hosted inside a command card (Charge details), the card IS
     * the surface, so this record draws no second box inside it. The Charges section keeps its frame.
     */
    bare?: boolean;
    /** Bumped by the host after an action; re-reads WITHOUT unmounting, so nothing swaps. */
    refreshKey?: number;
    onLoaded?: (facts: ChargeDetailFacts) => void;
}) {
    const [loaded, setDetail] = useState<ChargeDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const shownChargeRef = useRef<string | null>(null);

    useEffect(() => {
        /* Only the authoritative read reports facts — a seed never decides what the host offers. */
        const detail = loaded;
        if (!detail || !onLoaded) return;
        onLoaded({
            chargeId: detail.chargeId,
            status: detail.status,
            label: detail.label || detail.description || "Charge",
            chargeTemplateId: detail.chargeTemplateId ?? null,
            amountCents: Number(detail.amountCents ?? 0),
            serviceDate: detail.serviceDate,
            customerMemberId: detail.customerMemberId,
            awaiting: detail.awaiting
                ? { key: detail.awaiting.key, label: detail.awaiting.label, explanation: detail.awaiting.explanation }
                : null,
        });
    }, [loaded, onLoaded]);

    useEffect(() => {
        let live = true;
        /*
         * W7-F014: ONE STABLE SHELL. The first read shows a skeleton inside this same card; a
         * re-read (after Post, Cancel, Reverse) keeps the record on screen while it refreshes —
         * nothing is unmounted, so the card never swaps for a "Loading…" card and back.
         */
        if (shownChargeRef.current !== chargeId) {
            /* A DIFFERENT charge never shows the previous one's facts while it loads. */
            shownChargeRef.current = chargeId;
            setDetail(null);
            setLoading(true);
        }
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read on identity or an explicit refresh only
    }, [chargeId, refreshKey]);

    const reload = useCallback(async () => {
        /* Committed truth, re-read. The panel never hands back a figure for this to display. */
        const res = await fetch(`/api/admin/financials/charge/${encodeURIComponent(chargeId)}`, { cache: "no-store" });
        const body = (await res.json()) as { ok?: boolean; detail?: ChargeDetail };
        if (res.ok && body.ok && body.detail) setDetail(body.detail);
    }, [chargeId]);

    /*
     * W7-F029: ONE RENDER PATH. While the authoritative read is in flight, the record is drawn from
     * the seed through the SAME markup below — same header, same pair, same dates row, same state
     * line — and the sections a row cannot know (amount breakdown, responsibility detail, payments,
     * history, collection) wait. When the read lands it replaces the seed wholesale.
     */
    const provisional = !loaded && loading && Boolean(seed);
    const detail: ChargeDetail | null = loaded ?? (provisional && seed ? detailFromSeed(chargeId, seed) : null);

    if (loading && !detail) {
        return (
            <section
                className={bare ? "mb-1" : "mb-3 rounded-md border border-alloy-stone/15 bg-white/60 p-3"}
                data-financials-charge-detail-loading="true"
                aria-busy="true"
                aria-label="Loading charge"
            >
                <span className="block h-4 w-40 animate-pulse rounded bg-alloy-stone/25" />
                <span className="mt-1.5 block h-3 w-28 animate-pulse rounded bg-alloy-stone/20" />
                <span className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="block h-8 animate-pulse rounded bg-alloy-stone/15" />
                    ))}
                </span>
                <span className="mt-4 block h-16 animate-pulse rounded bg-alloy-stone/10" />
            </section>
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

    /*
     * ── W7-F014: ONE COMPACT POSTING LINE ─────────────────────────────────────────────────────
     *
     * The state, named — "Posted Oct 14, 2026", "Draft · Posts Nov 1, 2026", "Waiting for review",
     * "Posting failed · Needs attention" — from the canonical awaiting-posting vocabulary. Only a
     * failure, or an unclassified draft, also carries its sentence, because only those need action.
     */
    /*
     * W7-F027: THE OPERATOR'S LIFECYCLE — Scheduled, Review required, Posting failed, Legacy draft,
     * Posted, Cancelled — never "Draft · Posts …" or "Awaiting posting". A Scheduled charge says
     * when it activates and asks nothing; the three exceptional states carry their sentence.
     */
    const posting: { text: string; tone: "plain" | "attention"; explain: string | null } =
        detail.status !== "draft" && detail.status !== "void"
            ? { text: detail.postedAt ? `Posted ${day(detail.postedAt)}` : "Posted", tone: "plain", explain: null }
            : detail.status === "void"
              ? { text: "Cancelled — never activated", tone: "plain", explain: null }
              : detail.awaiting?.key === "review_required"
                ? { text: "Review required", tone: "attention", explain: detail.awaiting.explanation }
                : detail.awaiting?.key === "post_failed"
                  ? { text: "Posting failed", tone: "attention", explain: detail.awaiting.explanation }
                  : detail.awaiting?.key === "unclassified"
                    ? { text: "Legacy draft", tone: "plain", explain: detail.awaiting.explanation }
                    : {
                          text: detail.awaiting?.postsOn
                              ? `Scheduled · activates ${day(detail.awaiting.postsOn)}`
                              : "Scheduled · activates when its period begins",
                          tone: "plain",
                          explain: null,
                      };
    const headerState = financialsChargeState({ status: detail.status, awaitingKey: detail.awaiting?.key ?? null });

    /*
     * WHO OWES IT, in one line: "Mara Monthly · 100%". The arrangement's shares say it as the
     * operator set it up; a charge billed before any arrangement still names its allocated parties.
     */
    const shareTerm = (sh: { percentBasisPoints: number | null; amountCents: number | null }) =>
        sh.percentBasisPoints != null
            ? `${sh.percentBasisPoints / 100}%`
            : sh.amountCents != null
              ? money(sh.amountCents, currency)
              : "remainder";
    const shares = detail.accountArrangement?.shares ?? [];
    const responsibilitySummary =
        provisional
            ? (seed?.responsibleParty ?? "Reading…")
            : shares.length > 0
            ? shares.map((sh) => `${sh.name} · ${shareTerm(sh)}`).join(", ")
            : detail.responsibility.parties.length > 0
              ? detail.responsibility.parties.map((p) => `${p.name} · ${money(p.assignedCents, currency)}`).join(", ")
              : "No responsibility on record";
    /* This charge's own allocation, by party name — shown beside the share it was allocated under. */
    const allocatedByName = new Map(detail.responsibility.parties.map((p) => [p.name, p.assignedCents] as const));
    const unmatchedParties =
        shares.length > 0 ? detail.responsibility.parties.filter((p) => !shares.some((sh) => sh.name === p.name)) : detail.responsibility.parties;

    return (
        <section
            className={bare ? "mb-1" : "mb-3 rounded-md border border-alloy-stone/15 bg-white/60 p-3"}
            data-financials-charge-detail={detail.chargeId}
            data-financials-charge-detail-provisional={provisional ? "true" : undefined}
            aria-busy={provisional ? "true" : undefined}
        >
            {/* HEADER — what it is, and whose. */}
            <p className="truncate text-sm font-semibold text-alloy-midnight" data-financials-charge-label="true">
                {detail.label || detail.description || "Charge"}
            </p>
            <p className="truncate text-xs text-alloy-midnight/65">
                <span data-financials-charge-status={detail.status} data-financials-charge-state="true">
                    <FinancialsChargeState state={headerState.key} label={headerState.label} />
                </span>
                {detail.householdName ? ` · ${detail.householdName}` : ""}
            </p>

            {/*
              * ── APPLIES TO · RESPONSIBILITY — ONE COMPACT PAIR (W7 Scenario 8 final) ──────────
              * Who or what the charge is for, and who owes it: two facts from two models, side by
              * side, each label said once. No group heading restates the first label.
              */}
            <span className="mt-2 grid grid-cols-2 gap-x-6" data-financials-charge-applies="true">
                <Fact label="Applies to" value={attribution.text} testId="applies-to" strong />
                <span data-financials-charge-attribution={attribution.state} className="hidden" />
                <Fact label="Responsibility" value={responsibilitySummary} testId="responsibility-summary" strong />
            </span>
            {detail.adjustment ? (
                <>
                    <Group>Correction</Group>
                    <Row
                        label="What changed"
                        value={
                            detail.adjustment.direction === "reduce"
                                ? `Reduced what the family owes by ${money(detail.adjustment.magnitudeCents, detail.currencyCode)}`
                                : `Increased what the family owes by ${money(detail.adjustment.magnitudeCents, detail.currencyCode)}`
                        }
                        strong
                        testId="correction-direction"
                    />
                    {/*
                      * THE SOURCE FACT, OR THE TRUTH THAT THERE ISN'T ONE. An account-level
                      * adjustment legitimately corrects no single historical charge, and saying
                      * so is better than an empty row that reads as a lookup that failed.
                      */}
                    <Row
                        label="Corrects"
                        value={
                            detail.adjustment.sourceChargeId
                                ? [
                                      detail.adjustment.sourceDescription || "a charge",
                                      detail.adjustment.sourceServiceDate
                                          ? formatDisplayDate(detail.adjustment.sourceServiceDate)
                                          : null,
                                  ]
                                      .filter(Boolean)
                                      .join(" · ")
                                : "The account as a whole — not one charge"
                        }
                        muted={!detail.adjustment.sourceChargeId}
                        testId="correction-source"
                    />
                    {/*
                      * ── THE SOURCE'S PERIOD, AND WHETHER IT IS FINISHED ─────────────────────
                      *
                      * The sentence an operator needs for a closed source is that the historical
                      * period DID NOT CHANGE. Showing the label alone leaves them to wonder
                      * whether correcting a November charge moved November, which is the one
                      * question commercial finality exists to answer.
                      *
                      * A legacy source has a label and no status, because it has no period row —
                      * §12's case. It is presented as history rather than as a missing field.
                      */}
                    {detail.adjustment.sourceChargeId ? (
                        <Row
                            label="Corrected period"
                            value={
                                detail.adjustment.sourcePeriodStatus === "closed"
                                    ? `${detail.adjustment.sourcePeriodLabel ?? "The original period"} · finalized, unchanged`
                                    : detail.adjustment.sourcePeriodLabel
                                      ?? "Before the account's commercial periods"
                            }
                            muted={!detail.adjustment.sourcePeriodLabel}
                            testId="correction-source-period"
                        />
                    ) : null}
                    <Row
                        label="Why"
                        value={detail.adjustment.reason ?? "No reason recorded"}
                        muted={!detail.adjustment.reason}
                        testId="correction-reason"
                    />
                    {detail.adjustment.note ? (
                        <Row label="Note" value={detail.adjustment.note} testId="correction-note" />
                    ) : null}
                    {/*
                      * REVERSAL LINEAGE, IN WORDS. `reverses_id` and `reversed_by_id` are the
                      * canonical record; an operator needs the consequence, not the pointer.
                      */}
                    {detail.adjustment.reversesApplicationId ? (
                        <Row
                            label="This is a reversal"
                            value="It undoes an earlier correction on this account."
                            testId="correction-is-reversal"
                        />
                    ) : null}
                    {detail.adjustment.reversedByApplicationId ? (
                        <Row
                            label="Reversed"
                            value="A later correction has undone this one."
                            testId="correction-reversed"
                        />
                    ) : null}
                </>
            ) : null}

            {provisional ? (
                seed?.amountLabel ? (
                    <>
                        <Group>Amount</Group>
                        <Row label="Charge" value={seed.amountLabel} strong testId="net" />
                    </>
                ) : null
            ) : e ? (
                <>
                    <Group>Amount</Group>
                    {/*
                      * Gross, reductions and net only when a reduction makes them differ. With none,
                      * "Gross $18.00 / Net obligation $18.00" says one figure twice (W7 Scenario 8 final).
                      */}
                    {e.reductionsCents !== 0 ? (
                        <>
                            <Row label="Gross charge" value={money(e.grossCents, currency)} testId="gross" />
                            <Row label="Reductions" value={money(-Math.abs(e.reductionsCents), currency)} testId="reductions" />
                            <Row label="Net obligation" value={money(e.netCents, currency)} strong testId="net" />
                        </>
                    ) : (
                        <Row label="Charge" value={money(e.netCents, currency)} strong testId="net" />
                    )}
                </>
            ) : (
                /* A draft owes nothing yet, and saying $0 outstanding would read as settled. */
                <>
                    <Group>Amount</Group>
                    <Row label="Owed" value="Not yet — it owes nothing until it activates" muted testId="no-position" />
                </>
            )}


            {/*
              * ── THE FOUR DATES, ONE ROW (W7-F014) ────────────────────────────────────────────
              * The same four identities, in the same order, as Add Charge — read-only here.
              * Nothing else sits in this row, so no label can drift under the wrong date.
              */}
            <Group>Dates</Group>
            <span className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4" data-financials-charge-dates="row">
                <DateCell label="Service date" value={day(detail.serviceDate) ?? "—"} testId="service-date" />
                <DateCell label="Billing period" value={detail.billingPeriodLabel ?? "Unplaced"} testId="billing-period" />
                {/*
                  * W7-F017 provenance, kept but no longer prose: a charge type that overrides the
                  * organisation's invoice timing carries an info mark whose tooltip says so.
                  */}
                <DateCell
                    label="Invoice date"
                    value={formatDisplayDate(detail.invoiceDate) || "—"}
                    testId="invoice-date"
                    hint={
                        detail.invoiceRule?.source === "template"
                            ? `Charge-type override · ${invoiceRuleShort(detail.invoiceRule.strategy, detail.invoiceRule.offsetDays)}`
                            : null
                    }
                    hintAttr="data-financials-charge-invoice-override"
                />
                <DateCell
                    label="Due date"
                    value={detail.dueDate ? formatDisplayDate(detail.dueDate) : "No configured terms"}
                    testId="due-date"
                />
            </span>

            {/* POSTING — one line; a sentence only when someone has to act. */}
            <p
                className={`mt-2 text-xs ${posting.tone === "attention" ? "text-alloy-ember" : "text-alloy-midnight/75"}`}
                data-financials-charge-posting="true"
                data-financials-charge-awaiting={detail.awaiting?.key}
            >
                <span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">State</span>
                {posting.text}
            </p>
            {posting.explain ? (
                <p className="text-[11px] leading-snug text-alloy-ember/90" data-financials-charge-posting-explain="true">
                    {posting.explain}
                </p>
            ) : null}

            {/*
              * ACCOUNTING — only where it applies: a posted charge has an accounting period and a
              * GL account; a draft has neither yet, and says nothing rather than a placeholder row.
              */}
            {detail.accountingPeriod || (detail.postedAt && detail.glAccount) ? (
                <>
                    <Group>Accounting</Group>
                    <Pair>
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
                        {detail.accountingDeferredFrom ? (
                            <Row
                                label="Deferred from"
                                value={`${formatDisplayDate(detail.accountingDeferredFrom)} · that period was closed`}
                                testId="accounting-deferred-from"
                            />
                        ) : null}
                    </Pair>
                </>
            ) : null}

            {/*
             * ── RESPONSIBILITY & FUNDING — ONE COMPACT SECTION (W7 Scenario 8 final) ─────────────
             *
             * Two distinct concepts, kept distinct in the model and read together:
             *
             *   RESPONSIBILITY    who owes the obligation — the arrangement's share ("100%
             *                     responsible") with this charge's own allocation beside it.
             *   EXPECTED FUNDING  outside money expected to cover part of a share. It attaches to
             *                     a SHARE (`billing.configure_expected_funding`), so it is stated
             *                     under the share it funds, and never as money received.
             *
             * These were three stacked blocks (arrangement, funding, allocation) restating the same
             * party. The arrangement and the allocation still differ when a charge was billed before
             * the arrangement existed, so an allocated party with no share is listed on its own.
             *
             * `billing.configure_responsibility` records an ARRANGEMENT for a household or child
             * from a date — not a decision about this one charge — which is why the control is
             * offered for the account here rather than implying the charge.
             */}
            {detail.customerId || detail.customerMemberId || shares.length > 0 || detail.responsibility.parties.length > 0
                || detail.responsibility.unassignedCents !== 0 || detail.expectedFunding.length > 0 ? (
                <>
                    <Group>Responsibility &amp; funding</Group>
                    <div data-financials-charge-responsibility-funding="true">
                        {shares.map((share) => {
                            const allocated = allocatedByName.get(share.name);
                            return (
                                <div key={share.id} data-financials-arrangement-share={share.id}>
                                    <Row
                                        label={share.name}
                                        value={`${shareTerm(share)} responsible${allocated != null ? ` · ${money(allocated, currency)}` : ""}`}
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
                                        compact
                                    />
                                </div>
                            );
                        })}
                        {unmatchedParties.map((party) => (
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
                        {detail.expectedFunding.map((f) => (
                            /* An expectation is not a payment, and never reduces what is owed. */
                            <Row
                                key={f.label}
                                label={`Expected from ${f.label} · not yet received`}
                                value={f.expectedCents != null ? money(f.expectedCents, currency) : "Amount not yet known"}
                                muted
                                testId="expected-funding"
                            />
                        ))}
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
                                compact
                            />
                        ) : null}
                    </div>
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
              * ── WHERE THIS CAME FROM ────────────────────────────────────────────────────────
              *
              * The question an operator asks of a charge they did not expect, and the one the
              * Alvarez thread turned on. `originDescription` is the resolver's sentence, bounded by
              * what is actually stored: a resolved human actor is named, an actorless charge says
              * only what its template evidence supports, and nothing infers a scheduler from the
              * absence of a person.
              *
              * The timestamp is exact, because "created at the same time" and "created six days
              * apart" is precisely the distinction that makes two similar charges legible.
              */}
            {detail.originDescription || detail.createdAt ? (
                <>
                    {/* W7-F014: origin is the history — who, when created, when posted. Payments are listed above. */}
                    <Group>History</Group>
                    {detail.originDescription ? (
                        /*
                         * A resolved person is named under "Created by"; anything else states the
                         * origin sentence as it stands. `originDescription` already says
                         * "Created by <name>" in the first case, so repeating the prefix in the
                         * label would print the words twice.
                         */
                        <Row
                            label={detail.createdByName ? "Created by" : "Raised"}
                            value={detail.createdByName ?? detail.originDescription}
                            testId="origin"
                        />
                    ) : null}
                    {detail.createdAt ? (
                        <Row label="Created" value={exactMoment(detail.createdAt)} muted testId="created-at" />
                    ) : null}
                    {detail.postedAt ? (
                        <Row
                            label={detail.postedByName ? `Posted by ${detail.postedByName}` : "Posted"}
                            value={exactMoment(detail.postedAt)}
                            muted
                            testId="posted-at"
                        />
                    ) : null}
                    {detail.correctionOfChargeId ? (
                        <Row label="Corrects" value="another charge on this account" muted testId="corrects" />
                    ) : null}
                    {/*
                      * ── THE ATTRIBUTION IS INCOMPLETE, AND SAYS SO (W7-F002) ─────────────────
                      *
                      * Not an error, and deliberately not styled as one: nothing failed and the
                      * charge is correct. What is missing is the recorded link between the account
                      * that acted and the human it belongs to, and the sentence names where that is
                      * closed. It renders even when a name IS shown from the weaker source, because
                      * the requirement is about the data and not about whether the screen managed
                      * to find something to print.
                      */}
                    {detail.createdByIdentityGap ? (
                        <p
                            className="px-3 pb-2 text-[11px] leading-snug text-alloy-midnight/55"
                            data-financials-charge-actor-identity-gap={detail.createdByIdentityStatus ?? "unmet"}
                        >
                            {detail.createdByIdentityGap}
                        </p>
                    ) : null}
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
            {provisional ? (
                /* What the row cannot know is said to be arriving — never invented. */
                <span
                    className="mt-3 block h-10 animate-pulse rounded bg-alloy-stone/10"
                    data-financials-charge-detail-hydrating="true"
                    aria-label="Reading responsibility, payments and history"
                />
            ) : null}
        </section>
    );
}
