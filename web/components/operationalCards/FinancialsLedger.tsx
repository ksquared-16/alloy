"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import {
    ArrowLeftRight,
    ChevronRight,
    CheckCircle2,
    CircleDollarSign,
    SlidersHorizontal,
    Undo2,
    type LucideIcon,
    UserCog,
    UserPlus,
} from "lucide-react";
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
    /**
     * WHETHER "UNMAPPED" WOULD BE A TRUE STATEMENT ABOUT CONFIGURATION.
     *
     * GL mapping in Core is keyed by CHARGE CATEGORY, so an obligation without an account is a real
     * configuration deficiency somebody must fix, and saying "Unmapped" is right. A PAYMENT has no
     * charge category and Core has no payment-GL authority at all — calling that "Unmapped" blames
     * a tenant for a mapping the product does not yet offer. Reductions are the same shape: the
     * reduction read does not carry a resolved account, so the row does not know rather than the
     * tenant not having configured one.
     *
     * Default true. `false` means the row may not make a claim about configuration either way.
     */
    glApplies?: boolean;
    /** Already formatted and signed by the authority that owns the figure. */
    amount: string;
    /** A second line beneath the amount — what a row still owes, what is unapplied. */
    amountNote?: string | null;
    status: string;
    /** Who owes it. Null with `responsibilityUnassigned` false means no allocation exists at all. */
    responsibleParty: string | null;
    responsibilityUnassigned?: boolean;
    /** Owed by the named party, and owed by nobody yet. Both can be non-zero on one obligation. */
    responsibilityAssignedCents?: number;
    responsibilityUnassignedCents?: number;
    /** Formatter, so this component states money without owning an opinion about currency. */
    money?: (cents: number) => string;
    /**
     * WHETHER RESPONSIBILITY IS A QUESTION THIS ROW TYPE ANSWERS.
     *
     * An obligation has a responsible party — named, deliberately unassigned, or never allocated,
     * and all three are business states an operator can act on. A PAYMENT does not: it has a payer,
     * which is a different fact and is carried in the description; putting the payer here would
     * assert that whoever paid is whoever owed. A reduction does not either: it reduces an
     * obligation, and the responsibility belongs to that obligation rather than to the credit.
     *
     * Default true, because most rows are obligations. `false` is the only case that earns an em
     * dash — everything else states which of the three obligation states is true.
     */
    responsibilityApplies?: boolean;
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
/**
 * ── ONE TRANSACTION ACTION, WHEREVER THE LEDGER RENDERS ────────────────────────────────────────
 *
 * Every surface that shows a financial transaction offers the same operations on it, so they are
 * the same control: same icon, same accessible name, same command, same binding to the source row.
 * The Focus Panel and Financials → Accounts differ in container width; they may not differ in what
 * an operator can do to a charge.
 *
 * ICONS, INLINE, AND LEADING. These used to render as labelled buttons AFTER Description, which put
 * them on a second line beneath the transaction and made a row with actions taller than a row
 * without — so a ledger's row rhythm depended on which rows happened to be actionable. They now sit
 * in a narrow leading cell that is ALWAYS present, so the grid is identical whether a row offers
 * operations or not.
 *
 * An icon alone is not an affordance: each carries `title` and `aria-label`, is a real button in
 * the markup, and is therefore reachable by keyboard as well as pointer. Nothing here depends on
 * hover.
 */
export type FinancialsRowActionKind =
    | "adjust" | "reverse" | "post" | "move" | "apply"
    /* Who owes this obligation — resolve it under the arrangement, or move it to another party. */
    | "resolveResponsibility" | "reallocateResponsibility";

const ROW_ACTION_ICON: Record<FinancialsRowActionKind, LucideIcon> = {
    adjust: SlidersHorizontal,
    reverse: Undo2,
    post: CheckCircle2,
    move: ArrowLeftRight,
    apply: CircleDollarSign,
    resolveResponsibility: UserPlus,
    reallocateResponsibility: UserCog,
};

export function RowAction({
    kind,
    title,
    onClick,
    command,
    chargeId,
}: {
    kind: FinancialsRowActionKind;
    /** The accessible name AND the tooltip. Never decoration — it says what the operation does. */
    title: string;
    onClick: () => void;
    /** The canonical action this control raises, carried for mounted instrumentation. */
    command?: string;
    chargeId?: string;
}) {
    const Icon = ROW_ACTION_ICON[kind];
    return (
        <button
            type="button"
            className="alloy-os-fdetail__rowaction"
            data-financials-row-action={kind}
            data-charge-command={command}
            data-charge-id={chargeId}
            title={title}
            aria-label={title}
            onClick={onClick}
        >
            <Icon aria-hidden size={13} strokeWidth={2} />
        </button>
    );
}

/** The column vocabulary, defined once so no surface can invent a seventh heading. */
export function FinancialsLedgerHead() {
    return (
        <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head">
            {/* The actions track. Named for assistive technology, silent for the eye. */}
            <span className="alloy-os-billingdetail__rowactions-head">
                <span className="sr-only">Actions</span>
            </span>
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
            {/*
             * ALWAYS PRESENT, even when empty: the grid must not change shape because a particular
             * transaction happens to be actionable.
             */}
            <span className="alloy-os-billingdetail__rowactions">{row.actions ?? null}</span>
            <span className="alloy-os-billingdetail__when">{row.when}</span>
            <span className="alloy-os-billingdetail__type">{row.type}</span>
            <span className="alloy-os-billingdetail__subject">{row.child}</span>
            {/*
             * UNMAPPED IS A STATE, NOT A DASH. A charge with no GL account is a configuration fact
             * somebody must act on, so it is toned as one and never as a successful mapping.
             */}
            <span
                className="alloy-os-billingdetail__gl"
                data-financials-gl-state={
                    row.glLabel ? "mapped" : row.glApplies === false ? "not-applicable" : "unmapped"
                }
            >
                {row.glLabel ?? (row.glApplies === false ? "—" : "Unmapped")}
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
            {/*
             * THREE OBLIGATION STATES, NONE OF THEM A BLANK.
             *
             *   a named party            → the name
             *   an allocation naming none → "Unassigned"
             *   no allocation at all      → "Not allocated"
             *
             * The last two are different facts and both are actionable: somebody decided nobody is
             * responsible, versus nobody has decided. A dash for either read as missing data, which
             * is the one thing neither of them is.
             */}
            {(() => {
                /*
                 * ── A NAME IS NOT THE SAME AS "FULLY OWED BY THIS PERSON" ────────────────────
                 *
                 * A $75.00 obligation resolved under an arrangement naming one $18.00 share leaves
                 * $57.00 owed by nobody. This cell rendered the name alone, so an operator read a
                 * partially allocated obligation as fully owned — the most expensive kind of wrong,
                 * because the unowned remainder is exactly the thing that needs work.
                 *
                 * PARTIAL is its own state, marked in the DOM and visible in the cell. The cell
                 * stays a cell: the name, and a short remainder. The amounts are on the title for
                 * anyone who wants both numbers.
                 */
                const named = Boolean(row.responsibleParty);
                const remainder = row.responsibilityUnassignedCents ?? 0;
                const partial = named && remainder > 0;
                const fmt = row.money ?? ((c: number) => `$${(c / 100).toFixed(2)}`);
                const state =
                    row.responsibilityApplies === false ? "not-applicable"
                    : partial ? "partial"
                    : named ? "named"
                    : row.responsibilityUnassigned ? "unassigned"
                    : "not-allocated";
                const title =
                    partial
                        ? `${row.responsibleParty} ${fmt(row.responsibilityAssignedCents ?? 0)} · Unassigned ${fmt(remainder)}`
                        : undefined;
                return (
                    <span
                        className="alloy-os-billingdetail__source"
                        data-financials-responsible="true"
                        data-financials-responsibility={state}
                        title={title}
                    >
                        {row.responsibilityApplies === false ? "—"
                        : partial ? (
                            <>
                                {row.responsibleParty}
                                <span className="alloy-os-billingdetail__partial" data-financials-responsibility-remainder>
                                    {` · ${fmt(remainder)} unassigned`}
                                </span>
                            </>
                        )
                        : named ? row.responsibleParty
                        : row.responsibilityUnassigned ? "Unassigned"
                        : "Not allocated"}
                    </span>
                );
            })()}
            {/*
             * DESCRIPTION LAST, AND SMALLEST. It is free text and the least identifying thing on the
             * row; an operator scans Date → Type → Child → GL → Amount → Status → Responsibility and
             * reads the description only once they have found the row. It sat in the visual centre
             * and pushed every identity column outward.
             */}
            {/*
             * A PREVIEW, AND THE WHOLE VALUE IS STILL REACHABLE. It truncates to one line so it can
             * never push Child, GL, Amount, Status or the actions out of shape; `title` carries the
             * full text for anyone who needs it.
             */}
            <span className="alloy-os-billingdetail__desc" title={row.description || undefined}>
                {row.description}
            </span>
        </div>
    );
}

/**
 * One billing period's rows, behind a real disclosure.
 *
 * COLLAPSE CHANGES WHAT IS SHOWN, NEVER HOW. A collapsed period is the same header; expanding it
 * reveals the same head row and the same row component. There is no second renderer behind the
 * collapsed state, which is how a period used to come back looking different from the one above it.
 *
 * ── AND IT IS A CONTROL NOW, NOT A SENTENCE ────────────────────────────────────────────────────
 *
 * The collapsed state read "Collapsed · select to expand" — an explanatory line spending a ledger
 * row to describe an affordance, and describing one that did not exist: `open` was a static prop
 * with no toggle anywhere, so there was nothing to select. The period heading is now the disclosure
 * itself: a button carrying `aria-expanded`, a chevron that rotates with the state, and the whole
 * heading as its hit target, reachable by keyboard like any other button.
 */
export function FinancialsLedgerPeriod({
    label,
    summary,
    open,
    rows,
    expandedOverride,
    onToggle,
}: {
    label: string;
    summary: string;
    /** The period's initial state — the caller decides which periods open, the operator decides after. */
    open: boolean;
    rows: FinancialsLedgerRowView[];
    /*
     * ── WHO REMEMBERS THE DISCLOSURE ──────────────────────────────────────────────────────────
     *
     * Local state is right for a surface that stays mounted, and wrong for one that a command can
     * replace: the operator collapsed three periods, opened a row command, cancelled, and found
     * every period open again. A host that outlives commands may hold the answer instead. Omit
     * both props and this behaves exactly as it did.
     */
    expandedOverride?: boolean;
    onToggle?: (label: string, expanded: boolean) => void;
}) {
    const [expandedOwn, setExpandedOwn] = useState(open);
    /* A caller that changes which period is current re-seeds the disclosure. */
    useEffect(() => setExpandedOwn(open), [open]);
    const expanded = expandedOverride ?? expandedOwn;
    const setExpanded = (next: boolean) => {
        setExpandedOwn(next);
        onToggle?.(label, next);
    };
    return (
        <section
            className="alloy-os-fdetail__period"
            data-financials-ledger-period={label}
            data-financials-period-expanded={expanded ? "true" : "false"}
        >
            <button
                type="button"
                className="alloy-os-fdetail__periodhead"
                aria-expanded={expanded}
                data-financials-period-toggle={label}
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight
                    aria-hidden
                    size={13}
                    strokeWidth={2.25}
                    className="alloy-os-fdetail__perioddisclosure"
                />
                <span className="alloy-os-fdetail__periodname">{label}</span>
                <span className="alloy-os-fdetail__periodsum">{summary}</span>
            </button>
            {expanded ? (
                <div className="alloy-os-billingdetail__ledger" role="table" data-financials-ledger-open="true">
                    <FinancialsLedgerHead />
                    {rows.map((row) => (
                        <FinancialsLedgerRow key={row.key} row={row} />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
