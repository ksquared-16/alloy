"use client";

/**
 * CHARGES — CROSS-ACCOUNT CHARGE OPERATIONS (W7-F021).
 *
 * ── THE JOB THIS PAGE OWNS, AND THE ONE IT DOES NOT ──
 *
 * Accounts is the household workspace: find a family, read its balance and ledger, add a charge to
 * it, take a payment, open one of its charges. Charges does what one account cannot:
 *
 *   FIND         charges across the organization — search a household, child or charge type; filter
 *                by charge type and billing period; read them by what they need (Needs attention ·
 *                Scheduled · Posted · Cancelled).
 *   APPLY        one charge to many accounts (New bulk charge), one canonical charge per account.
 *   EXCEPTIONS   drafts a person must act on, with the Post they are waiting for.
 *   RUN CONTROL  tuition billing — automatic, with the scheduler's own status, and a previewed
 *                manual run for when an operator needs it.
 *
 * ── ONE CHARGE DETAIL ──
 *
 * Selecting a charge opens the account's own Charge Details — the certified modal, with Edit / Cancel
 * draft and Correct — through `FinancialsAccountDetail`. There is no second detail design here and no
 * side pane: the record is the record wherever it was found.
 *
 * ── WHERE EVERY NUMBER COMES FROM ──
 *
 * Rows are `/api/admin/financials/charge-index` — the work-queue resolver asked for every status, so
 * household, child, site visibility and the awaiting-posting reason are decided by one read. A row's
 * amount is the stored `amount_cents`. This page computes no money.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import FinancialsBulkAddCharge from "@/app/adminV2/financials/sections/FinancialsBulkAddCharge";
import FinancialsTuitionBilling from "@/app/adminV2/financials/sections/FinancialsTuitionBilling";
import { moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import { hasOpenTransientPopup } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import {
    CHARGE_INDEX_VIEW_LABELS,
    CHARGE_INDEX_VIEWS,
    type ChargeIndexOption,
    type ChargeIndexView,
} from "@/lib/financials/workspace/chargeIndex";
import type { FinancialWorkRow } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import { FinancialsChargeState, financialsChargeState } from "@/components/operationalCards/FinancialsLedger";
import type { ChargeDetailSeed } from "@/lib/financials/workspace/chargeDetailSeed";

/** The index row, with who owes it (W7-F028) — the account ledger's own responsibility reader. */
type IndexRow = FinancialWorkRow & {
    responsibility?: { name: string | null; unassigned: boolean; assignedCents: number; unassignedCents: number } | null;
};

type IndexPayload = {
    rows: IndexRow[];
    counts: Record<ChargeIndexView, number>;
    typeOptions: ChargeIndexOption[];
    periodOptions: ChargeIndexOption[];
    truncated?: boolean;
};

type OpenCharge = { chargeId: string; label: string; customerId: string; customerMemberId: string | null; childName: string | null; seed: ChargeDetailSeed };

/** The date part of a stored timestamp, for a label — never printed raw. */
function dayOf(stamp: string | null | undefined): string | null {
    return stamp ? stamp.substring(0, 10) : null;
}

/**
 * What a row's state reads as, in the operator's words — the SAME rule the account ledger uses
 * (`financialsChargeState`), with the one fact a cross-account list adds: when.
 */
function stateOf(row: FinancialWorkRow): { key: ReturnType<typeof financialsChargeState>["key"]; label: string } {
    const status = row.status ?? "draft";
    const st = financialsChargeState({ status, awaitingKey: status === "draft" ? row.awaiting.key : null });
    if (st.key === "cancelled") return { ...st, label: `Cancelled${row.voidedAt ? ` ${shortDate(dayOf(row.voidedAt))}` : ""}` };
    if (st.key === "posted") {
        const paid = status === "paid" ? " · paid" : status === "partially_paid" ? " · partly paid" : "";
        return { ...st, label: `Posted${row.postedAt ? ` ${shortDate(dayOf(row.postedAt))}` : ""}${paid}` };
    }
    if (st.key === "scheduled" && row.awaiting.postsOn) return { ...st, label: `Scheduled · activates ${shortDate(row.awaiting.postsOn)}` };
    return st;
}

/** Who owes it, in the ledger's three obligation states — never a blank. */
function responsibilityOf(row: IndexRow): { text: string; state: string } {
    const r = row.responsibility;
    if (!r) return { text: "Not allocated", state: "not-allocated" };
    if (r.name && r.unassignedCents > 0) return { text: `${r.name} · part unassigned`, state: "partial" };
    if (r.name) return { text: r.name, state: "named" };
    return r.unassigned ? { text: "Unassigned", state: "unassigned" } : { text: "Not allocated", state: "not-allocated" };
}

/* W7-F027: what each view is, said once under the tabs — the reason a row is where it is. */
const VIEW_HINT: Record<ChargeIndexView, string> = {
    scheduled: "Future-period charges. Each activates by itself when its billing period begins — nothing to do.",
    attention: "Only charges a person must decide: a configured posting review, or an activation that failed. Open one to act.",
    posted: "Active charges, newest first.",
    cancelled: "Scheduled charges withdrawn before they activated. Kept on the record.",
    legacy: "Created before automatic posting, so they never activate on their own. Open one to post or cancel it.",
};

/**
 * A COMMAND LAYER on this page — the same shell, backdrop and dismissal the account commands use
 * (`alloy-accounts-command-host`), so Tuition billing and New bulk charge open like Add Charge does.
 */
function CommandDialog({
    overlay,
    title,
    iconName,
    onClose,
    children,
}: {
    overlay: string;
    title: string;
    iconName: string;
    onClose: () => void;
    children: ReactNode;
}) {
    useEffect(() => {
        /*
         * An open menu closes itself first, and that Escape is the MENU's. The menu has already shut
         * by the time this bubble listener runs (measured on deployed: one Escape on the charge-type
         * dropdown closed the dropdown AND the dialog), so whether a menu was open is recorded when
         * the key goes down, in capture, and honoured here.
         */
        let menuWasOpen = false;
        const onCapture = (e: KeyboardEvent) => {
            if (e.key === "Escape") menuWasOpen = hasOpenTransientPopup(document);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (menuWasOpen) {
                menuWasOpen = false;
                return;
            }
            e.preventDefault();
            onClose();
        };
        window.addEventListener("keydown", onCapture, true);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onCapture, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);
    return (
        <div className="alloy-accounts-command-host" data-financials-command-scope="true">
            <div className="alloy-accounts-command-backdrop" data-financials-command-backdrop="true" aria-hidden="true" onClick={onClose} />
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay={overlay} role="dialog" aria-modal="true" aria-label={title}>
                <UniversalCard
                    title={title}
                    insight=""
                    iconName={iconName}
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key={overlay}
                    footerAction={null}
                >
                    {children}
                    <div className="alloy-os-depthcard__actions alloy-os-chargedetail__actions">
                        <button
                            type="button"
                            className="alloy-os-depthcard__close alloy-os-chargedetail__action alloy-os-chargedetail__action--neutral"
                            onClick={onClose}
                            data-financials-command-close={overlay}
                        >
                            Close
                        </button>
                    </div>
                </UniversalCard>
            </div>
        </div>
    );
}

export default function FinancialsCharges({
    siteLocationId,
    scopeLabel,
    siteSelected,
    onChargesChanged,
}: {
    /** The site chosen in the header, or "" for every site the operator can see. */
    siteLocationId: string;
    scopeLabel: string;
    /** True when a site is chosen — the tuition run does not obey it, and says so. */
    siteSelected: boolean;
    /** Other reads that count charges (the header KPIs) re-read after anything here changes money. */
    onChargesChanged?: () => Promise<void> | void;
}) {
    const [view, setView] = useState<ChargeIndexView>("scheduled");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [typeKey, setTypeKey] = useState("");
    const [periodKey, setPeriodKey] = useState("");
    const [data, setData] = useState<IndexPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);
    const [open, setOpen] = useState<OpenCharge | null>(null);
    const [dialog, setDialog] = useState<"tuition" | "bulk" | null>(null);

    /*
     * ── ESCAPE CLOSES THE LAYER, NEVER THE FINANCIALS APP (W7-F021, measured on deployed) ──────
     *
     * Financials opens inside a drawer that closes on any Escape reaching `window`. In Accounts a
     * charge's Details sits over the account's own floor, so the account host still sees an open
     * layer when the key reaches it and stops it there. Here there is no floor: the card dismisses
     * Charge Details from its window listener, React re-renders before the host's document listener
     * runs, the host sees nothing open, and the key went on to close the whole app.
     *
     * The same is true of a dropdown on this page: Escape that closes an open menu is that menu's
     * key, and it closed the app too (measured: the charge-type filter).
     *
     * So this page remembers whether one of ITS layers was open when the key went down (window,
     * capture — nothing is stopped there, so menus and the card still receive it) and, if so, stops
     * that same key at the document on its way back up — before the drawer's window listener.
     */
    const layerOpenRef = useRef(false);
    useEffect(() => {
        layerOpenRef.current = Boolean(open || dialog);
    });
    useEffect(() => {
        let armed = false;
        const onCapture = (e: KeyboardEvent) => {
            if (e.key === "Escape") armed = layerOpenRef.current || hasOpenTransientPopup(document);
        };
        const onBubble = (e: KeyboardEvent) => {
            if (e.key === "Escape" && armed) e.stopPropagation();
            armed = false;
        };
        window.addEventListener("keydown", onCapture, true);
        document.addEventListener("keydown", onBubble);
        return () => {
            window.removeEventListener("keydown", onCapture, true);
            document.removeEventListener("keydown", onBubble);
        };
    }, []);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(id);
    }, [query]);

    useEffect(() => {
        let live = true;
        setLoading(true);
        const params = new URLSearchParams({ view });
        if (debounced) params.set("q", debounced);
        if (typeKey) params.set("type", typeKey);
        if (periodKey) params.set("period", periodKey);
        if (siteLocationId) params.set("site_location_id", siteLocationId);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/financials/charge-index?${params.toString()}`, { credentials: "include", cache: "no-store" });
                const json = (await res.json()) as { ok?: boolean; error?: string } & IndexPayload;
                if (!live) return;
                if (!res.ok || json.ok === false) {
                    setError(json.error ?? "Charges could not be loaded.");
                    setData(null);
                } else {
                    setError(null);
                    setData(json);
                }
            } catch (e) {
                if (live) setError(e instanceof Error ? e.message : "Charges could not be loaded.");
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => {
            live = false;
        };
    }, [view, debounced, typeKey, periodKey, siteLocationId, nonce]);

    const refresh = useCallback(async () => {
        setNonce((n) => n + 1);
        await onChargesChanged?.();
    }, [onChargesChanged]);

    const rows = data?.rows ?? [];
    const counts = data?.counts ?? { attention: 0, scheduled: 0, posted: 0, cancelled: 0, legacy: 0 };
    const filtered = Boolean(debounced || typeKey || periodKey);
    const openRow = (row: IndexRow) => {
        if (!row.customerId) return;
        const label = row.typeLabel ?? row.categoryLabel;
        setOpen({
            chargeId: row.chargeId,
            label,
            customerId: row.customerId,
            customerMemberId: row.customerMemberId,
            childName: row.childName,
            /* W7-F029: the row already read these — Charge Details paints them on the click. */
            seed: {
                label,
                status: row.status ?? "draft",
                awaiting: (row.status ?? "draft") === "draft" ? row.awaiting : null,
                householdName: row.householdName,
                childName: row.childName,
                amountLabel: moneyExact(row.amountCents, row.currencyCode),
                serviceDate: row.serviceDate,
                billingPeriodLabel: row.billingPeriodKey ? billingPeriodLabel(row.billingPeriodKey) || null : null,
                invoiceDate: row.billableOn ?? null,
                dueDate: row.dueDate ?? null,
                postedAt: row.postedAt ? dayOf(row.postedAt) : null,
                responsibleParty: row.responsibility === undefined ? null : responsibilityOf(row).text,
            },
        });
    };

    const typeOptions = useMemo(() => data?.typeOptions ?? [], [data]);
    const periodOptions = useMemo(() => data?.periodOptions ?? [], [data]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="financials-charges-section">
            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* ── WHAT THIS PAGE IS FOR ── */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-alloy-stone/10 px-4 py-3" data-financials-charges-purpose="true">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-alloy-midnight">Charges across every account</p>
                        <p className="mt-0.5 text-xs text-alloy-midnight/60">
                            Find charges, clear what needs attention, and apply one charge to many accounts. To work one household, use Accounts.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            className="alloy-os-chargedetail__action alloy-os-chargedetail__action--secondary"
                            onClick={() => setDialog("tuition")}
                            data-financials-open-tuition-billing="true"
                        >
                            Tuition billing
                        </button>
                        <button
                            type="button"
                            className="alloy-os-chargedetail__action alloy-os-chargedetail__action--primary"
                            onClick={() => setDialog("bulk")}
                            data-financials-open-bulk-charge="true"
                        >
                            New bulk charge
                        </button>
                    </div>
                </div>

                {/* ── SEARCH + FILTERS ── */}
                <div className="flex flex-wrap items-center gap-2 border-b border-alloy-stone/10 px-4 py-2" data-financials-charges-filters="true">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search household, child or charge type"
                        aria-label="Search household, child or charge type"
                        data-financials-charges-search="true"
                        className="w-72 rounded-md border border-alloy-stone/30 bg-white px-2.5 py-1 text-xs text-alloy-midnight"
                    />
                    <span className="w-48">
                        <AlloySelect
                            aria-label="Charge type"
                            testId="charges-type-filter"
                            value={typeKey}
                            placeholder="Every charge type"
                            options={typeOptions}
                            onChange={(next) => setTypeKey(next)}
                        />
                    </span>
                    <span className="w-44">
                        <AlloySelect
                            aria-label="Billing period"
                            testId="charges-period-filter"
                            value={periodKey}
                            placeholder="Every period"
                            options={periodOptions}
                            onChange={(next) => setPeriodKey(next)}
                        />
                    </span>
                    {filtered ? (
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => {
                                setQuery("");
                                setTypeKey("");
                                setPeriodKey("");
                            }}
                        >
                            Clear filters
                        </button>
                    ) : null}
                    <span className="ml-auto text-[11px] text-alloy-midnight/45">{scopeLabel}</span>
                </div>

                {/* ── THE VIEWS: what each charge needs ── */}
                <div className="flex shrink-0 gap-1 border-b border-alloy-stone/10 px-4 py-2" role="tablist">
                    {CHARGE_INDEX_VIEWS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={view === key}
                            data-financials-charges-view={key}
                            data-active={view === key ? "true" : undefined}
                            onClick={() => {
                                setView(key);
                            }}
                            className={`rounded-full px-2.5 py-1 text-xs transition ${
                                view === key ? "bg-alloy-bend-pine/10 font-medium text-alloy-midnight" : "text-alloy-midnight/60 hover:bg-alloy-stone/5"
                            }`}
                        >
                            {CHARGE_INDEX_VIEW_LABELS[key]}
                            <span className="ml-1 tabular-nums text-alloy-midnight/45">{counts[key]}</span>
                        </button>
                    ))}
                </div>

                <p className="border-b border-alloy-stone/10 px-4 py-1.5 text-[11px] text-alloy-midnight/55" data-financials-charges-view-hint={view}>
                    {VIEW_HINT[view]}
                </p>

                {/* ── THE LIST ── */}
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-charge-index="true" aria-busy={loading ? "true" : undefined}>
                    {/*
                      * W7-F028: THE ACCOUNT LEDGER'S ROW LANGUAGE — its classes, type scale, amount
                      * weight and state mark — in a compact cross-account variant: the charge's own
                      * grain first (child, household beneath), then type, amount, period, state and
                      * who owes it. One representation of a charge to learn, not two.
                      */}
                    <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head alloy-os-chargeindex__row sticky top-0 bg-white">
                        <span>Charge for</span>
                        <span>Charge type</span>
                        <span>Amount</span>
                        <span>Billing period</span>
                        <span>State</span>
                        <span>Responsible party</span>
                    </div>
                    {error ? (
                        <p className="px-4 py-4 text-xs text-alloy-ember" data-financials-charges-error="true">
                            {error}
                        </p>
                    ) : !data && loading ? (
                        <p className="px-4 py-4 text-xs text-alloy-midnight/50">Loading charges…</p>
                    ) : rows.length === 0 ? (
                        <WorkspaceEmptyState
                            title={filtered ? "No charge matches" : `No ${CHARGE_INDEX_VIEW_LABELS[view].toLowerCase()} charges`}
                            body={filtered ? "Change the search or the filters." : `Nothing ${CHARGE_INDEX_VIEW_LABELS[view].toLowerCase()} for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        rows.map((row) => {
                            const st = stateOf(row);
                            const owes = responsibilityOf(row);
                            return (
                            <div
                                key={row.chargeId}
                                role="button"
                                tabIndex={0}
                                onClick={() => openRow(row)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        openRow(row);
                                    }
                                }}
                                data-financials-charge-index-row={row.chargeId}
                                data-financials-charge-index-type={row.typeKey}
                                data-financials-charge-index-state={st.key}
                                className="alloy-os-billingdetail__row alloy-os-chargeindex__row cursor-pointer"
                            >
                                {/*
                                  * W7-F025: THE CHARGE'S OWN GRAIN LEADS. A child's charge names the child,
                                  * with the household as its account; a household charge names the household.
                                  */}
                                <span className="alloy-os-chargeindex__for" data-financials-charge-index-grain={row.childName ? "child" : "household"}>
                                    <span className="alloy-os-billingdetail__subject">
                                        {row.childName ?? row.householdName ?? "Household"}
                                    </span>
                                    <span className="alloy-os-chargeindex__account">
                                        {row.childName ? (row.householdName ?? "Household") : "Household charge"}
                                    </span>
                                </span>
                                <span className="alloy-os-billingdetail__type">{row.typeLabel ?? row.categoryLabel}</span>
                                <span className="alloy-os-billingdetail__amount">{moneyExact(row.amountCents, row.currencyCode)}</span>
                                <span className="alloy-os-billingdetail__status">
                                    {row.billingPeriodKey ? billingPeriodLabel(row.billingPeriodKey) : "Unplaced"}
                                </span>
                                <span
                                    className="alloy-os-billingdetail__status"
                                    data-financials-awaiting-reason={(row.status ?? "draft") === "draft" ? row.awaiting.key : undefined}
                                >
                                    <FinancialsChargeState
                                        state={st.key}
                                        label={st.label}
                                        title={(row.status ?? "draft") === "draft" ? row.awaiting.explanation : null}
                                    />
                                </span>
                                <span
                                    className="alloy-os-billingdetail__source"
                                    data-financials-responsible="true"
                                    data-financials-responsibility={owes.state}
                                >
                                    {owes.text}
                                </span>
                            </div>
                            );
                        })
                    )}
                    {data?.truncated ? (
                        <p className="px-4 py-2 text-[11px] text-alloy-midnight/45">Showing the most recent 2,000 charges. Search or filter to narrow.</p>
                    ) : null}
                </div>
            </WorkspaceSurface>

            {/*
              * ── THE CANONICAL CHARGE DETAILS ──
              * The account's own card, opened on this charge. Closing it returns here and re-reads.
              */}
            {open ? (
                <div className="alloy-accounts-command-host" data-financials-charges-detail-host={open.chargeId}>
                    <FinancialsAccountDetail
                        key={open.chargeId}
                        customerId={open.customerId}
                        customerMemberId={open.customerMemberId}
                        participationId={null}
                        displayName={open.childName}
                        openCharge={{ chargeId: open.chargeId, label: open.label, seed: open.seed }}
                        onSurfacesClosed={() => {
                            setOpen(null);
                            void refresh();
                        }}
                    />
                </div>
            ) : null}

            {dialog === "tuition" ? (
                <CommandDialog overlay="tuition_billing" title="Tuition billing" iconName="Repeat" onClose={() => setDialog(null)}>
                    <FinancialsTuitionBilling onCommitted={refresh} siteSelected={siteSelected} />
                </CommandDialog>
            ) : null}
            {dialog === "bulk" ? (
                <CommandDialog overlay="bulk_charge" title="New bulk charge" iconName="Receipt" onClose={() => setDialog(null)}>
                    <FinancialsBulkAddCharge siteLocationId={siteLocationId} onCommitted={refresh} />
                </CommandDialog>
            ) : null}
        </div>
    );
}
