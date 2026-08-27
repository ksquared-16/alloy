"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/**
 * THE FINANCIALS CARD — what is owed, what happened, and what can be done about it.
 *
 * Three densities, ONE read model. Compact, summary and expanded differ in how much of the same
 * composed truth they show, never in what they compute — this component performs no financial
 * arithmetic at all. Every cents value, every period placement and every GL code arrives decided by
 * `buildFinancialsCardVM`, because a card that recomputed a balance would be a second answer to a
 * question the ledger already answers.
 *
 * ── WHAT IT REFUSES TO SHOW ──
 *
 * The read model reports facts the platform does not own — payments, autopay, payer splits — as
 * named unavailabilities rather than as zeroes. This card renders that absence as absence. A
 * "$0.00 paid" line would state something the platform cannot know, and a disabled payer filter
 * would advertise a model Financials does not have.
 *
 * ── SUBJECT, NOT HOUSEHOLD ──
 *
 * Attribution is `billable_source_type = 'enrollment_agreement'` → agreement → child, so the subject
 * filter offers All plus each child. There is no Household option: `billable_source_type` admits only
 * `job` and `enrollment_agreement`, so a household-level charge cannot be represented, and faking one
 * by attaching it to a single child would put a family expense on one sibling's ledger.
 */
export default function FinancialsCard({ model, context, receded = false, coordination }: Props) {
    const scope = context.participantScope ?? null;
    const scopedMemberId = scope?.customerMemberId ?? null;
    const customerId = householdIdFrom(context);

    const [vm, setVm] = useState<FinancialsCardVM | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [subjectFilter, setSubjectFilter] = useState<string>("all");
    const [running, setRunning] = useState(false);
    const [commandError, setCommandError] = useState<string | null>(null);
    const [pending, setPending] = useState<{
        templateId: string;
        label: string;
        summary: string;
        changes: string[];
    } | null>(null);

    /*
     * The card asks for the WHOLE account and filters in the client.
     *
     * Scoping the request to one child would make the subject filter a network round trip per
     * selection and — worse — would make "All" unanswerable without a second shape of request. The
     * account is small (one household's charges), the filter is presentation, and the totals below
     * are still the server's.
     */
    const load = useCallback(async () => {
        if (!customerId && !scopedMemberId) {
            setVm(null);
            return;
        }
        setLoading(true);
        try {
            const query = customerId
                ? `customer_id=${encodeURIComponent(customerId)}`
                : `customer_member_id=${encodeURIComponent(scopedMemberId as string)}`;
            const res = await fetch(`/api/admin/financials/card?${query}`, { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; vm?: FinancialsCardVM };
            setVm(json?.ok && json.vm ? json.vm : null);
        } catch {
            setVm(null);
        } finally {
            setLoading(false);
        }
    }, [customerId, scopedMemberId]);

    useEffect(() => {
        // Clear FIRST: the previous household's balance must not linger while the next resolves.
        setVm(null);
        void load();
    }, [load]);

    /*
     * A SCOPED CHILD PRESELECTS THE SUBJECT FILTER.
     *
     * When the panel is about one child, opening on "All" would answer about their siblings too. The
     * operator can still widen it — the account is genuinely the household's — but the default
     * matches what they are looking at.
     */
    useEffect(() => {
        setSubjectFilter(scopedMemberId ?? "all");
    }, [scopedMemberId]);

    const visibleRows = useMemo(() => {
        if (!vm) return [];
        return subjectFilter === "all"
            ? vm.rows
            : vm.rows.filter((r) => r.subjectMemberId === subjectFilter);
    }, [vm, subjectFilter]);

    /** The child a charge would apply to — the filter's subject, else the panel's. */
    const chargeTarget =
        subjectFilter !== "all" ? subjectFilter : scopedMemberId ?? vm?.subjects[0]?.customerMemberId ?? null;

    /**
     * PREVIEW FIRST, and the preview is the DOMAIN's.
     *
     * `mode: "preview"` runs `previewTemplateCharge` — the same resolver the write uses — so the
     * amount, the dates and the scheduled-vs-draft verdict shown to the operator are the ones that
     * will be persisted. Nothing is computed on this side, which is why the preview cannot drift from
     * the commit that follows it.
     */
    const preview = useCallback(
        async (templateId: string, label: string) => {
            if (!chargeTarget || running) return;
            setRunning(true);
            setCommandError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "charge.add",
                        entity_type: "child",
                        entity_id: chargeTarget,
                        mode: "preview",
                        payload: {
                            customer_member_id: chargeTarget,
                            template_id: templateId,
                            child_label: vm?.subjects.find((s) => s.customerMemberId === chargeTarget)
                                ?.displayName,
                        },
                    }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    error?: string | { message?: string };
                    data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
                };
                const p = json?.data?.execution_result?.preview;
                if (!json?.ok || !p) {
                    const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                    setCommandError(err || "This charge cannot be previewed.");
                    return;
                }
                setPending({
                    templateId,
                    label,
                    summary: p.summary ?? "",
                    changes: Array.isArray(p.changes) ? p.changes : [],
                });
            } catch {
                setCommandError("The preview could not be requested.");
            } finally {
                setRunning(false);
            }
        },
        [chargeTarget, running, vm],
    );

    const commit = useCallback(async () => {
        if (!pending || !chargeTarget || running) return;
        setRunning(true);
        setCommandError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "charge.add",
                    entity_type: "child",
                    entity_id: chargeTarget,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload: { customer_member_id: chargeTarget, template_id: pending.templateId },
                }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
            if (!json?.ok) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                // A refusal is the domain speaking — surfaced, never swallowed into a silent no-op.
                setCommandError(err || "The charge was refused.");
                return;
            }
            setPending(null);
        } catch {
            setCommandError("The charge could not be sent.");
        } finally {
            setRunning(false);
            // The card REFRESHES from the read model; it never inserts the row it just created.
            await load();
        }
    }, [chargeTarget, load, pending, running]);

    const currency = vm?.rows[0]?.currencyCode ?? "USD";
    /*
     * THE TOTALS FOLLOW THE FILTER.
     *
     * The subject filter narrows the ledger, so the reconciliation above it must narrow too — a
     * "$100.00" account total sitting over a filtered ledger showing $75 is precisely the "every
     * total reconciles to authoritative rows" rule broken, and it is what the first browser pass
     * found. The narrowed figures are the SERVER's, computed per subject in the same composition, so
     * switching subjects costs nothing and cannot compute the rule a second way.
     */
    const reconciliation =
        vm == null
            ? null
            : subjectFilter === "all"
              ? vm.reconciliation
              : vm.reconciliationBySubject[subjectFilter] ?? vm.reconciliation;
    const pastDue =
        vm == null
            ? null
            : subjectFilter === "all"
              ? vm.pastDue
              : vm.pastDueBySubject[subjectFilter] ?? null;
    /*
     * DENSITY IS A REAL DISTINCTION, not a label.
     *
     * `compact` is supporting financial context inside another operating process — the balance, what
     * is next, and the way in. It deliberately does NOT attempt the reconciliation: a half-stated
     * breakdown is more misleading than none. `standard` is the V5 summary and states the period in
     * full. Expanded is either of them plus the ledger.
     */
    const isCompact = model.density === "compact" && !expanded;
    /*
     * THE LEDGER IS THE EXPANDED REPRESENTATION, and only that.
     *
     * Summary and expanded rendered identically at first, which made `Details →` a no-op and left the
     * summary carrying a ledger it has no room for. The summary states the period; the expanded view
     * keeps a SHALLOW top — balance and past due in one line — and gives the rest of the surface to
     * the ledger, because re-rendering a larger copy of the summary above it would spend the width
     * the ledger exists to use.
     */
    const showBands = !expanded;
    const showLedger = expanded;

    return (
        <div className="alloy-os-financials" data-financials-card="true" data-financials-subject={subjectFilter}>
            <UniversalCard
                title={model.title}
                insight={insightFor(vm, reconciliation, loading, currency)}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                density="compact"
                gridSpan={expanded ? "row" : model.span}
                receded={receded}
                data-universal-card-key="financials"
                footerAction={null}
            >
                {!vm ? (
                    <p className="alloy-os-financials__empty" data-financials-empty="loading">
                        {loading ? "Loading the account…" : "No financial record."}
                    </p>
                ) : (
                    <>
                        {/* ── CURRENT PERIOD · PAST DUE / PAYMENT ─────────────────────────────── */}
                        {showBands ? (
                        <div
                            className="alloy-os-financials__bands"
                            data-financials-density={isCompact ? "compact" : expanded ? "expanded" : "summary"}
                        >
                            <section className="alloy-os-financials__band" data-financials-band="current-period">
                                <p className="alloy-os-financials__band-label">
                                    Current period · {vm.period.label}
                                </p>
                                {isCompact ? (
                                    /* Supporting context: what is owed, and whether anything is
                                       overdue. The breakdown belongs to the summary density. */
                                    <>
                                        <Line
                                            label="Balance"
                                            cents={reconciliation!.balanceCents}
                                            currency={currency}
                                            strong
                                            testId="balance"
                                        />
                                        {reconciliation!.scheduledCents !== 0 ? (
                                            <Line
                                                label="Scheduled"
                                                cents={reconciliation!.scheduledCents}
                                                currency={currency}
                                                muted
                                                testId="scheduled"
                                            />
                                        ) : null}
                                        {pastDue ? (
                                            <p className="alloy-os-financials__note">
                                                {money(pastDue.amountCents, currency)} past due ·{" "}
                                                {pastDue.agingDays} days
                                            </p>
                                        ) : null}
                                    </>
                                ) : (
                                <>
                                {/* Individual dollar rows stay regular and tabular; only the total
                                    earns stronger type. */}
                                <Line label="Charges" cents={reconciliation!.grossCents} currency={currency} />
                                {reconciliation!.discountsCents !== 0 ? (
                                    <Line
                                        label="Discounts & credits"
                                        cents={reconciliation!.discountsCents}
                                        currency={currency}
                                    />
                                ) : null}
                                {reconciliation!.fundingCents !== 0 ? (
                                    <Line label="Funding" cents={reconciliation!.fundingCents} currency={currency} />
                                ) : null}
                                {reconciliation!.adjustmentsCents !== 0 ? (
                                    <Line
                                        label="Adjustments"
                                        cents={reconciliation!.adjustmentsCents}
                                        currency={currency}
                                    />
                                ) : null}
                                <Line
                                    label="Responsibility"
                                    cents={reconciliation!.responsibilityCents}
                                    currency={currency}
                                    strong
                                    testId="responsibility"
                                />
                                {reconciliation!.scheduledCents !== 0 ? (
                                    /* STATED BESIDE the balance, never inside it: a scheduled charge
                                       is not yet owed, and folding it in would overstate the debt. */
                                    <Line
                                        label="Scheduled"
                                        cents={reconciliation!.scheduledCents}
                                        currency={currency}
                                        muted
                                        testId="scheduled"
                                    />
                                ) : null}
                                </>
                                )}
                            </section>

                            {isCompact ? null : (
                            <div className="alloy-os-financials__side">
                                <section className="alloy-os-financials__band" data-financials-band="past-due">
                                    <p className="alloy-os-financials__band-label">Past due</p>
                                    {pastDue ? (
                                        <>
                                            <Line
                                                label={`${pastDue.agingDays} days`}
                                                cents={pastDue.amountCents}
                                                currency={currency}
                                                strong
                                                testId="past-due"
                                            />
                                            <p className="alloy-os-financials__note">
                                                Oldest unpaid {pastDue.oldestDueDate}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="alloy-os-financials__note">Nothing past due.</p>
                                    )}
                                </section>

                                <section className="alloy-os-financials__band" data-financials-band="payment">
                                    <p className="alloy-os-financials__band-label">Payment</p>
                                    {/*
                                        ONLY CANONICAL PAYMENT STATE THAT ACTUALLY EXISTS.
                                        This region used to print the platform's own limitations at
                                        the operator — "payments are not recorded for enrollment
                                        accounts yet", "autopay is not configured in this platform",
                                        "responsibility splits are owned by Processing". Those are
                                        development findings; they belong in the ledger, not on a
                                        card someone uses to run a childcare centre. Where no
                                        canonical payment state exists, the region stays neutral and
                                        says nothing rather than explaining our architecture.
                                    */}
                                    {vm.paymentSetup ? (
                                        <p className="alloy-os-financials__note" data-financials-payment="state">
                                            {vm.paymentSetup}
                                        </p>
                                    ) : (
                                        <p className="alloy-os-financials__note" data-financials-payment="none">
                                            No payment method on file
                                        </p>
                                    )}
                                </section>
                            </div>
                            )}
                        </div>
                        ) : (
                            /* The shallow top of the expanded view: what is owed, and whether
                               anything is overdue. Everything else is a row in the ledger below. */
                            <p className="alloy-os-financials__shallow" data-financials-shallow="true">
                                <span className="alloy-os-financials__shallow-value">
                                    {money(reconciliation!.balanceCents, currency)}
                                </span>
                                <span className="alloy-os-financials__shallow-label">
                                    owed · {vm.period.label}
                                </span>
                                {pastDue ? (
                                    <span className="alloy-os-financials__shallow-label">
                                        · {money(pastDue.amountCents, currency)} past due
                                    </span>
                                ) : null}
                                {reconciliation!.scheduledCents !== 0 ? (
                                    <span className="alloy-os-financials__shallow-label">
                                        · {money(reconciliation!.scheduledCents, currency)} scheduled
                                    </span>
                                ) : null}
                            </p>
                        )}

                        {/* THE COMMAND BELONGS TO THE CARD, not to one band.
                            It lived inside Current Period, so expanding the card — the density where
                            an operator is actually working the ledger — removed the only way to add
                            a charge. */}
                        <div className="alloy-os-financials__actions" data-financials-actions="true">
                        {vm.unavailableReason ? (
                            /* Stated beneath the anatomy, never in place of it. */
                            <span className="alloy-os-financials__note" data-financials-unavailable="true">
                                {vm.unavailableReason}
                            </span>
                        ) : null}
                        {vm.chargeTemplates.length > 0 ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-command="charge.add"
                                        disabled={running}
                                    >
                                        Add charge →
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" sideOffset={4} data-financials-charge-menu="true">
                                    {vm.chargeTemplates.map((tpl) => (
                                        <DropdownMenuItem
                                            key={tpl.id}
                                            data-financials-charge-template={tpl.id}
                                            onSelect={() => void preview(tpl.id, tpl.label)}
                                        >
                                            {/* The tenant's own label. Never `template_key`. */}
                                            {tpl.label}
                                            {tpl.amountCents != null ? (
                                                <span className="alloy-os-financials__menu-amount">
                                                    {money(tpl.amountCents, tpl.currencyCode)}
                                                </span>
                                            ) : null}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                        {pending ? (
                            <div className="alloy-os-financials__preview" data-financials-preview="true">
                                <p className="alloy-os-financials__preview-summary">{pending.label}</p>
                                {pending.changes.map((ch) => (
                                    <p key={ch} className="alloy-os-financials__note">
                                        {ch}
                                    </p>
                                ))}
                                {/*
                                    THE HONEST BALANCE IMPACT.
                                    The design showed "$255 → $295". Add Charge creates a DRAFT, and a
                                    draft is not owed — so the current balance does not move until the
                                    charge is posted. Printing an arrow between two balances would
                                    assert a change the backend does not make.
                                */}
                                <p className="alloy-os-financials__note" data-financials-preview-impact="true">
                                    Creates a draft · the balance changes when it is posted
                                </p>
                                <span className="alloy-os-financials__preview-actions">
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-preview-commit="true"
                                        disabled={running}
                                        onClick={() => void commit()}
                                    >
                                        Add charge
                                    </button>
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-preview-cancel="true"
                                        disabled={running}
                                        onClick={() => setPending(null)}
                                    >
                                        Cancel
                                    </button>
                                </span>
                            </div>
                        ) : null}
                        {commandError ? (
                            <span className="alloy-os-financials__error" data-financials-command-error="true">
                                {commandError}
                            </span>
                        ) : null}
                        </div>

                        {/* ── SUBJECT FILTER + LEDGER ─────────────────────────────────────────── */}
                        {showLedger ? (
                            <>
                                {vm.subjects.length > 1 ? (
                                    <div className="alloy-os-financials__filters" data-financials-filters="true">
                                        <FilterChip
                                            active={subjectFilter === "all"}
                                            onClick={() => setSubjectFilter("all")}
                                            value="all"
                                        >
                                            All
                                        </FilterChip>
                                        {vm.subjects.map((s) => (
                                            <FilterChip
                                                key={s.customerMemberId}
                                                active={subjectFilter === s.customerMemberId}
                                                onClick={() => setSubjectFilter(s.customerMemberId)}
                                                value={s.customerMemberId}
                                            >
                                                {s.displayName}
                                            </FilterChip>
                                        ))}
                                    </div>
                                ) : null}

                                <div className="alloy-os-financials__ledger" data-financials-ledger="true">
                                    {vm.ledgerPeriods.map((group) => {
                                        const groupRows = group.rows.filter(
                                            (r) => subjectFilter === "all" || r.subjectMemberId === subjectFilter,
                                        );
                                        if (groupRows.length === 0) return null;
                                        return (
                                            <section
                                                key={group.period.key}
                                                className="alloy-os-financials__period"
                                                data-financials-period={group.period.key}
                                            >
                                                <p className="alloy-os-financials__period-label">
                                                    {group.period.label.toUpperCase()}
                                                </p>
                                                {groupRows.map((row) => (
                                                    <div
                                                        key={row.chargeId}
                                                        className="alloy-os-financials__row"
                                                        data-financials-row={row.chargeId}
                                                    >
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--date">
                                                            {row.date ?? "—"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell">
                                                            {row.subjectName ?? "—"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell">
                                                            {row.categoryLabel}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--desc">
                                                            {row.description ?? "—"}
                                                        </span>
                                                        <span
                                                            className="alloy-os-financials__cell alloy-os-financials__cell--gl"
                                                            data-financials-gl={row.glCode ?? "unmapped"}
                                                        >
                                                            {/* Explicit, never a silent blank. */}
                                                            {row.glCode ?? "Unmapped"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--amount">
                                                            {money(row.amountCents, row.currencyCode)}
                                                        </span>
                                                        <span
                                                            className="alloy-os-financials__cell alloy-os-financials__cell--status"
                                                            data-financials-lifecycle={row.lifecycleStatus}
                                                        >
                                                            {row.lifecycleStatus}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--source">
                                                            {row.source ?? "—"}
                                                        </span>
                                                    </div>
                                                ))}
                                            </section>
                                        );
                                    })}
                                    {visibleRows.length === 0 ? (
                                        <p className="alloy-os-financials__note">No financial activity yet.</p>
                                    ) : null}
                                </div>
                            </>
                        ) : null}

                        <button
                            type="button"
                            className="alloy-os-financials__details"
                            data-financials-details="true"
                            onClick={() => {
                                setExpanded((v) => !v);
                                coordination?.reportPerspective?.("financials", expanded ? "base" : "focused");
                            }}
                        >
                            {expanded ? "← Less" : "Details →"}
                        </button>
                    </>
                )}
            </UniversalCard>
        </div>
    );
}

/**
 * The household this panel is about.
 *
 * `truth` carries the household under more than one binding depending on how the panel was reached,
 * so this reads them in order of authority rather than assuming one. Returning null is ordinary — a
 * panel with no household simply has no account.
 */
function householdIdFrom(context: OperationalContext): string | null {
    const truth = context.truth as Record<string, unknown>;
    for (const key of ["customer.id", "household.id", "child.family_customer_id", "customer_id"]) {
        const value = truth[key];
        const s = value != null ? String(value).trim() : "";
        if (s) return s;
    }
    return null;
}

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/**
 * The header answer, in the SAME scope as the body.
 *
 * It read `vm.reconciliation` — the whole account — while the body could be filtered to one child, so
 * the card announced $100.00 above a $75.00 breakdown. The scoped figure is passed in rather than
 * re-derived, so the two cannot disagree again.
 */
function insightFor(
    vm: FinancialsCardVM | null,
    reconciliation: { balanceCents: number } | null,
    loading: boolean,
    currency: string,
): string {
    if (loading && !vm) return "";
    if (!vm || vm.unavailableReason || !reconciliation) return "";
    return `${money(reconciliation.balanceCents, currency)} · ${vm.period.label}`;
}

function Line(props: {
    label: string;
    cents: number;
    currency: string;
    strong?: boolean;
    muted?: boolean;
    testId?: string;
}) {
    return (
        <span
            className={[
                "alloy-os-financials__line",
                props.strong ? "alloy-os-financials__line--strong" : "",
                props.muted ? "alloy-os-financials__line--muted" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            data-financials-line={props.testId}
        >
            <span className="alloy-os-financials__line-label">{props.label}</span>
            <span className="alloy-os-financials__line-value">{money(props.cents, props.currency)}</span>
        </span>
    );
}

function FilterChip(props: {
    active: boolean;
    value: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`alloy-os-financials__chip${props.active ? " alloy-os-financials__chip--active" : ""}`}
            data-financials-filter={props.value}
            data-active={props.active ? "true" : undefined}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    );
}
