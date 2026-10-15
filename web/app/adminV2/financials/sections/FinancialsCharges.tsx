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

type IndexPayload = {
    rows: FinancialWorkRow[];
    counts: Record<ChargeIndexView, number>;
    typeOptions: ChargeIndexOption[];
    periodOptions: ChargeIndexOption[];
    truncated?: boolean;
};

type OpenCharge = { chargeId: string; label: string; customerId: string; customerMemberId: string | null; childName: string | null };

/** The date part of a stored timestamp, for a label — never printed raw. */
function dayOf(stamp: string | null | undefined): string | null {
    return stamp ? stamp.substring(0, 10) : null;
}

/** What a row's state reads as, in the operator's words. */
function stateLine(row: FinancialWorkRow): string {
    const status = row.status ?? "draft";
    if (status === "void") return `Cancelled${row.voidedAt ? ` ${shortDate(dayOf(row.voidedAt))}` : ""}`;
    if (status !== "draft") {
        const paid = status === "paid" ? " · paid" : status === "partially_paid" ? " · partly paid" : "";
        return `Posted${row.postedAt ? ` ${shortDate(dayOf(row.postedAt))}` : ""}${paid}`;
    }
    if (row.awaiting.key === "period_not_started" && row.awaiting.postsOn) return `Draft · Posts ${shortDate(row.awaiting.postsOn)}`;
    return row.awaiting.label;
}

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
    const [posting, setPosting] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

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

    /*
     * POSTING GOES THROUGH THE REGISTERED ACTION, from the operator's own session. `charge.post` owns
     * eligibility, authorization, idempotency and audit; a refusal is shown as it came back.
     */
    const postCharge = useCallback(
        async (row: FinancialWorkRow) => {
            setPosting(row.chargeId);
            setActionError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "charge.post",
                        entity_type: "child",
                        entity_id: row.customerMemberId ?? row.customerId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: { charge_id: row.chargeId, charge_label: row.typeLabel ?? row.categoryLabel },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: unknown };
                if (!res.ok || json.ok === false) {
                    setActionError(
                        typeof json.error === "string"
                            ? json.error
                            : ((json.error as { message?: string } | undefined)?.message ?? "Posting was refused."),
                    );
                    return;
                }
                await refresh();
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Posting failed.");
            } finally {
                setPosting(null);
            }
        },
        [refresh],
    );

    const rows = data?.rows ?? [];
    const counts = data?.counts ?? { attention: 0, scheduled: 0, posted: 0, cancelled: 0 };
    const filtered = Boolean(debounced || typeKey || periodKey);
    const openRow = (row: FinancialWorkRow) => {
        if (!row.customerId) return;
        setOpen({
            chargeId: row.chargeId,
            label: row.typeLabel ?? row.categoryLabel,
            customerId: row.customerId,
            customerMemberId: row.customerMemberId,
            childName: row.childName,
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
                                setActionError(null);
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

                {actionError ? (
                    <p className="px-4 py-2 text-xs text-alloy-ember" data-financials-action-error="true">
                        {actionError}
                    </p>
                ) : null}

                {/* ── THE LIST ── */}
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-charge-index="true" aria-busy={loading ? "true" : undefined}>
                    <div className="sticky top-0 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_8rem_minmax(0,1.2fr)] gap-3 border-b border-alloy-stone/10 bg-white px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        <span>Household</span>
                        <span>Child</span>
                        <span>Charge type</span>
                        <span className="text-right">Amount</span>
                        <span>Billing period</span>
                        <span>State</span>
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
                        rows.map((row) => (
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
                                className="grid cursor-pointer grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_8rem_minmax(0,1.2fr)] items-center gap-3 border-b border-alloy-stone/10 px-4 py-2 text-xs transition hover:bg-alloy-stone/5 focus:bg-alloy-bend-pine/5 focus:outline-none"
                            >
                                <span className="truncate text-sm text-alloy-midnight">{row.householdName ?? "Household"}</span>
                                <span className="truncate text-alloy-midnight/75">{row.childName ?? "Account-wide"}</span>
                                <span className="truncate text-alloy-midnight/75">{row.typeLabel ?? row.categoryLabel}</span>
                                <span className="text-right tabular-nums text-alloy-midnight">{moneyExact(row.amountCents, row.currencyCode)}</span>
                                <span className="truncate text-alloy-midnight/75">
                                    {row.billingPeriodKey ? billingPeriodLabel(row.billingPeriodKey) : "Unplaced"}
                                </span>
                                <span className="flex min-w-0 items-center justify-between gap-2">
                                    <span
                                        className={`truncate ${row.awaiting.key === "post_failed" && (row.status ?? "draft") === "draft" ? "text-alloy-ember" : "text-alloy-midnight/70"}`}
                                        data-financials-awaiting-reason={(row.status ?? "draft") === "draft" ? row.awaiting.key : undefined}
                                        title={(row.status ?? "draft") === "draft" ? row.awaiting.explanation : undefined}
                                    >
                                        {stateLine(row)}
                                    </span>
                                    {view === "attention" ? (
                                        <button
                                            type="button"
                                            className="alloy-os-chargedetail__action alloy-os-chargedetail__action--secondary shrink-0"
                                            disabled={posting !== null}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void postCharge(row);
                                            }}
                                            data-financials-post-charge={row.chargeId}
                                        >
                                            {posting === row.chargeId ? "Posting…" : "Post"}
                                        </button>
                                    ) : null}
                                </span>
                            </div>
                        ))
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
                        openCharge={{ chargeId: open.chargeId, label: open.label }}
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
