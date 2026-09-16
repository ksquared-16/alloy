"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * THE FINANCIALS LEDGER — one renderer, every lens, both surfaces.
 *
 * ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────────────────────────────
 *
 * There were THREE presentation systems for one concept. Charges rendered as an eight-column grid.
 * Adjustments rendered as prose — "Raises what is owed · Sep 14, 2026 · Reason…" — in a section of
 * their own, beneath an empty ledger, because selecting "Credits & adjustments" filtered the ledger
 * to nothing and then showed a different component underneath. Payments rendered as a third thing
 * again, a stack of stat strips. An operator switching lenses was not narrowing a ledger; they were
 * being handed a different document each time.
 *
 * The lens decides the COHORT. It does not decide the renderer. That sentence is the whole of this
 * module, and the reason the row markup is defined exactly once rather than copied into each
 * surface — the workspace and the Focus Panel had two copies of it, and two copies of a grid drift
 * the moment one of them is edited.
 *
 * ── THE ROW IS A PRESENTATION SHAPE, NOT A DOMAIN OBJECT ───────────────────────────────────────
 *
 * Callers map their own canonical rows into `FinancialsLedgerRowView`. Nothing here reads a
 * database, resolves a label, formats money or decides what a row IS: every field arrives already
 * decided by the authority that owns it. This file only lays them out.
 *
 * ── AND WHY COLOUR IS NOT COMPUTED FROM THE SIGN ───────────────────────────────────────────────
 *
 * A negative amount is not a bad amount. A credit reducing an obligation is negative and entirely
 * legitimate; a refund is negative movement and legitimate; a reversal's sign depends on what it
 * reverses; a negative balance is money the centre owes the family. The ledger therefore has NO
 * rule of the shape `amount < 0 ? red : green`. Sign communicates arithmetic direction and the
 * minus sign already carries it. Colour is reserved for business STATE, which arrives on the row as
 * `tone` and is set by a caller that actually knows the state — never inferred here from a number.
 */

export type FinancialsLedgerTone = "attention" | "muted";

export type FinancialsLedgerRowView = {
    /** Stable across re-renders. The charge, payment or application id — never an array index. */
    key: string;
    /** Already formatted and year-bearing. `—` where the row genuinely carries no date. */
    when: string;
    /** The configured category label. Never a stored key. */
    type: string;
    /** The child this is for, or the household when the row genuinely belongs to no child. */
    child: string;
    /** Free text, treated as a preview: it truncates and never pushes an identity column. */
    description: string;
    /** `4000 · Tuition Revenue`, or null when the category has no mapping. */
    glLabel: string | null;
    /** Already formatted and signed by the authority that owns the figure. */
    amount: string;
    /** A second line beneath the amount — what a row still owes, what is unapplied. */
    amountNote?: string | null;
    status: string;
    /** Who owes it. Null with `responsibilityUnassigned` false means no allocation exists at all. */
    responsibleParty: string | null;
    responsibilityUnassigned?: boolean;
    /**
     * BUSINESS STATE, decided by the caller. Never derived from the amount's sign — see the note
     * above. `attention` is the canonical warning treatment; `muted` is history that no longer
     * counts, such as a reversed application.
     */
    tone?: FinancialsLedgerTone;
    /** Row-level transitions the read model has already decided this row qualifies for. */
    actions?: ReactNode;
    /** Full provenance for a row whose reason does not fit the Description preview. */
    title?: string;
};

/**
 * A TRANSACTION'S OWN COMMAND, on the transaction.
 *
 * These were footer links: "Reverse Credit →" repeated once per credit, "Move payment →" once per
 * allocation, and an operator could not tell which row any of them acted on except by matching an
 * amount by eye. A command that belongs to a row belongs ON the row.
 *
 * A real button, always in the DOM and always reachable by keyboard — never a hover-only affordance,
 * which is invisible to a keyboard and to a touch screen and is exactly how a command becomes
 * unreachable for the operators least able to work around it. It carries its own accessible name
 * through `title`, because "Reverse" alone does not say what it reverses.
 */
export function RowAction({
    label,
    title,
    onClick,
}: {
    label: string;
    title: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="alloy-os-fdetail__rowaction"
            data-financials-row-action={label.toLowerCase()}
            title={title}
            aria-label={title}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

/** The column vocabulary, defined once so no surface can invent a seventh heading. */
export function FinancialsLedgerHead() {
    return (
        <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head">
            <span>Date</span>
            <span>Type</span>
            <span>Child</span>
            <span>GL account</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Responsible party</span>
            <span>Description</span>
        </div>
    );
}

export function FinancialsLedgerRow({ row }: { row: FinancialsLedgerRowView }) {
    return (
        <div
            className={clsx("alloy-os-billingdetail__row", row.tone && `alloy-os-billingdetail__row--${row.tone}`)}
            data-financials-ledger-row={row.key}
            data-financials-ledger-tone={row.tone ?? undefined}
            title={row.title ?? undefined}
        >
            <span className="alloy-os-billingdetail__when">{row.when}</span>
            <span className="alloy-os-billingdetail__type">{row.type}</span>
            <span className="alloy-os-billingdetail__subject">{row.child}</span>
            {/*
             * UNMAPPED IS A STATE, NOT A DASH. A charge with no GL account is a configuration fact
             * somebody must act on, so it is toned as one and never as a successful mapping.
             */}
            <span
                className="alloy-os-billingdetail__gl"
                data-financials-gl-state={row.glLabel ? "mapped" : "unmapped"}
            >
                {row.glLabel ?? "Unmapped"}
            </span>
            {/*
             * No colour from the sign. The minus sign is the arithmetic; the emphasis is the same
             * for every amount because every amount is equally real.
             */}
            <span className="alloy-os-billingdetail__amount">
                {row.amount}
                {row.amountNote ? (
                    <span className="alloy-os-billingdetail__outstanding">{row.amountNote}</span>
                ) : null}
            </span>
            <span className="alloy-os-billingdetail__status">{row.status}</span>
            <span className="alloy-os-billingdetail__source" data-financials-responsible="true">
                {row.responsibleParty ?? (row.responsibilityUnassigned ? "Unassigned" : "—")}
            </span>
            {/*
             * DESCRIPTION LAST, AND SMALLEST. It is free text and the least identifying thing on the
             * row; an operator scans Date → Type → Child → GL → Amount → Status → Responsibility and
             * reads the description only once they have found the row. It sat in the visual centre
             * and pushed every identity column outward.
             */}
            <span className="alloy-os-billingdetail__desc">{row.description}</span>
            {row.actions ? <span className="alloy-os-billingdetail__rowactions">{row.actions}</span> : null}
        </div>
    );
}

/**
 * One billing period's rows, headed and optionally collapsed.
 *
 * COLLAPSE CHANGES WHAT IS SHOWN, NEVER HOW. A collapsed period is the same header with a line
 * saying so; expanding it reveals the same head row and the same row component. There is no second
 * renderer behind the collapsed state, which is how a period used to come back looking different
 * from the one above it.
 */
export function FinancialsLedgerPeriod({
    label,
    summary,
    open,
    rows,
}: {
    label: string;
    summary: string;
    open: boolean;
    rows: FinancialsLedgerRowView[];
}) {
    return (
        <section className="alloy-os-fdetail__period" data-financials-ledger-period={label}>
            <p className="alloy-os-fdetail__periodhead">
                <span className="alloy-os-fdetail__periodname">{label}</span>
                <span className="alloy-os-fdetail__periodsum">{summary}</span>
            </p>
            {open ? (
                <div className="alloy-os-billingdetail__ledger" role="table" data-financials-ledger-open="true">
                    <FinancialsLedgerHead />
                    {rows.map((row) => (
                        <FinancialsLedgerRow key={row.key} row={row} />
                    ))}
                </div>
            ) : (
                <p className="alloy-os-fdetail__collapsed">Collapsed · select to expand</p>
            )}
        </section>
    );
}
