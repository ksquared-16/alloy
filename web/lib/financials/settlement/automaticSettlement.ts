/**
 * AUTOMATIC SETTLEMENT — WHERE ORDINARY MONEY GOES (W7-F050 / W7-F051).
 *
 * ── THE FOUR FACTS, KEPT APART ─────────────────────────────────────────────────────────────────
 *
 *   CHARGE          the obligation and its revenue classification. Settlement never writes it.
 *   RESPONSIBILITY  who owes what share (`financial_responsibility_allocations`).
 *   PAYMENT         money received and the asset account it landed in (stamped at receipt).
 *   ALLOCATION      which obligation the money settles (`payment_allocations`, one row per charge),
 *                   and — where a named person paid their own share — which share it settled
 *                   (`payment_responsibility_attributions`).
 *
 * Allocation changes settlement status only. It journals `payment_applied` (an obligation delta in
 * the non-GL subledger); it never touches a charge's GL account or recognises revenue again.
 *
 * ── THE DOCTRINE (Director decision, 2026-10-21) ───────────────────────────────────────────────
 *
 * Allocation is canonical but NORMALLY AUTOMATIC. An ordinary family payment — whatever the method:
 * card, bank, cash, check, money order, external — settles the payer's eligible outstanding
 * responsibility by one deterministic rule. Choosing a charge by hand is the exception (explicit
 * allocation, Reallocate, Apply payment on unapplied money), not the way money is taken.
 *
 * ── ELIGIBILITY ───────────────────────────────────────────────────────────────────────────────
 *
 * A charge on the household (its own charges and every child agreement's) is eligible when it is:
 *   · owed — stored status posted / partially_paid / paid (a draft, including a Scheduled charge
 *     awaiting its period, is never owed; void is never owed);
 *   · not reversed, and not itself a reversal or credit row (amount > 0);
 *   · outstanding — amount − active allocations of POSTED payments > 0 (`readAppliedByChargeId`);
 *   · collectible — capped at `currentlyCollectibleCents` (a submitted subsidy claim suppresses);
 *   · due by the settlement date — its `due_date` is on or before `asOf`, by the SAME rule as the
 *     canonical Due / Past due classification (`accountDueClassification`, #1553). A charge with no
 *     due date (no payment terms configured) is not "due" there and is not settled automatically
 *     here either — it waits for explicit allocation rather than for invented terms (deployed proof
 *     on 769c36ba: an invoice-date fallback offered Certhouse $2,594 against a canonical $2,005).
 *     A not-yet-due obligation is never settled early.
 *
 * ── WHOSE OUTSTANDING ─────────────────────────────────────────────────────────────────────────
 *
 * Per charge, the outstanding amount splits into what NAMED people still owe (their active
 * responsibility allocations minus attributions on still-active applications) and what the ACCOUNT
 * owes as a whole (no arrangement, unassigned cents, or cents nobody's share explains).
 *
 *   A NAMED PAYER settles their own remaining share first, then the account-owned part. Never
 *   another person's share: Dana paying never settles Rosa's 25%, however old Rosa's charge is.
 *   A HOUSEHOLD payment (no payer named) settles only account-owned outstanding. Where named people
 *   owe, the money cannot know whose debt it is — it stays UNAPPLIED for an operator to resolve.
 *
 * ── ORDER ─────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. past due (effective due date before `asOf`), then due today/now;
 *   2. oldest effective due date first;
 *   3. then oldest invoice date, then charge id — a stable, deterministic tie-break.
 *
 * Anything left after the eligible responsibility is settled stays on the payment as unapplied —
 * the existing prepaid authority, traceable to this payment. Nothing is invented to consume it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { chargeDisplayLabel } from "@/lib/financials/chargeCategories";
import { ACCOUNT_CHARGE_SELECT, readAppliedByChargeId } from "@/lib/financials/account/accountChargeLedger";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";

export const SETTLEMENT_POLICY_LABEL = "Past due first, then currently due — oldest due date first.";

const OWED = new Set(["posted", "partially_paid", "paid"]);
const t = (v: unknown): string => (v == null ? "" : String(v).trim());
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);

export type SettlementShare = {
    /** The responsibility allocation row. */
    allocationId: string;
    partyId: string | null;
    /** What this share still owes: assigned − attributions on still-active applications. */
    remainingCents: number;
};

export type SettlementCandidate = {
    chargeId: string;
    label: string;
    categoryKey: string | null;
    amountCents: number;
    /** Outstanding, already capped at what is collectible. */
    collectibleCents: number;
    dueDate: string | null;
    billableOn: string | null;
    status: string;
    reversed: boolean;
    shares: SettlementShare[];
};

export type SettlementLine = {
    chargeId: string;
    label: string;
    categoryKey: string | null;
    effectiveDueOn: string;
    dueClass: "past_due" | "due";
    applyCents: number;
    /** The part that settles the payer's OWN shares, per share (written as attributions). */
    shareParts: Array<{ allocationId: string; cents: number }>;
    /** The part that settles what the account owes as a whole. */
    accountCents: number;
};

export type SettlementPlan = {
    asOf: string;
    payerPersonId: string | null;
    amountCents: number;
    lines: SettlementLine[];
    appliedCents: number;
    unappliedCents: number;
    /** Outstanding the money could not settle because named people owe it and no payer was named. */
    heldForPayerCents: number;
    /** Every cent this payer could settle today (the autopay amount). */
    eligibleCents: number;
    outcome: "settled" | "partial_left_unapplied" | "nothing_eligible";
};

/** A posted charge's due date — the canonical due authority's only input; no fallback. */
export function effectiveDueOn(c: Pick<SettlementCandidate, "dueDate" | "billableOn">): string | null {
    return c.dueDate || null;
}

/**
 * THE ALGORITHM — pure. Given the candidates, the amount and who paid, what settles and in what
 * order. Readers and writers below only gather inputs and carry out its answer.
 */
export function planSettlementFrom(input: {
    asOf: string;
    amountCents: number;
    payerPersonId: string | null;
    candidates: readonly SettlementCandidate[];
}): SettlementPlan {
    const payer = input.payerPersonId || null;
    const rows = input.candidates
        .filter((c) => OWED.has(c.status) && !c.reversed && c.amountCents > 0 && c.collectibleCents > 0)
        .map((c) => ({ c, due: effectiveDueOn(c) }))
        .filter((x): x is { c: SettlementCandidate; due: string } => Boolean(x.due) && x.due! <= input.asOf)
        .map(({ c, due }) => {
            const named = c.shares.filter((s) => s.partyId);
            const namedRemaining = named.reduce((a, s) => a + Math.max(0, s.remainingCents), 0);
            const accountOwned = Math.max(0, c.collectibleCents - namedRemaining);
            const own = payer ? named.filter((s) => s.partyId === payer && s.remainingCents > 0) : [];
            return {
                c,
                due,
                dueClass: (due < input.asOf ? "past_due" : "due") as "past_due" | "due",
                own,
                accountOwned,
                heldForPayer: payer ? 0 : Math.min(c.collectibleCents, namedRemaining),
            };
        })
        .sort((a, b) =>
            (a.dueClass === b.dueClass ? 0 : a.dueClass === "past_due" ? -1 : 1)
            || a.due.localeCompare(b.due)
            || (a.c.billableOn ?? "").localeCompare(b.c.billableOn ?? "")
            || a.c.chargeId.localeCompare(b.c.chargeId),
        );

    let left = Math.max(0, n(input.amountCents));
    let eligible = 0;
    let heldForPayer = 0;
    const lines: SettlementLine[] = [];
    for (const r of rows) {
        heldForPayer += r.heldForPayer;
        let chargeRoom = r.c.collectibleCents;
        const shareParts: SettlementLine["shareParts"] = [];
        for (const s of r.own) {
            const cap = Math.min(s.remainingCents, chargeRoom);
            eligible += cap;
            const take = Math.min(cap, left);
            if (take > 0) {
                shareParts.push({ allocationId: s.allocationId, cents: take });
                left -= take;
            }
            chargeRoom -= cap;
        }
        const accountCap = Math.min(r.accountOwned, chargeRoom);
        eligible += accountCap;
        const accountCents = Math.min(accountCap, left);
        left -= accountCents;
        const applyCents = shareParts.reduce((a, p) => a + p.cents, 0) + accountCents;
        if (applyCents > 0) {
            lines.push({
                chargeId: r.c.chargeId,
                label: r.c.label,
                categoryKey: r.c.categoryKey,
                effectiveDueOn: r.due,
                dueClass: r.dueClass,
                applyCents,
                shareParts,
                accountCents,
            });
        }
    }
    const applied = lines.reduce((a, l) => a + l.applyCents, 0);
    return {
        asOf: input.asOf,
        payerPersonId: payer,
        amountCents: n(input.amountCents),
        lines,
        appliedCents: applied,
        unappliedCents: Math.max(0, n(input.amountCents) - applied),
        heldForPayerCents: heldForPayer,
        eligibleCents: eligible,
        outcome: applied === 0 ? "nothing_eligible" : applied < n(input.amountCents) ? "partial_left_unapplied" : "settled",
    };
}

/**
 * Every charge this household could owe, with what is collectible and who still owes it. Reads are
 * batched by household; the per-charge collectible check runs only for charges that survive the
 * cheap filters (owed, positive, outstanding, due).
 */
export async function readSettlementCandidates(
    supabase: SupabaseClient,
    args: { orgId: string; householdId: string; asOf: string },
): Promise<SettlementCandidate[]> {
    const orgId = t(args.orgId);
    const householdId = t(args.householdId);
    if (!orgId || !householdId) return [];

    const { data: agreements } = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", householdId);
    const sourceIds = [householdId, ...((agreements ?? []) as Array<{ id?: unknown }>).map((r) => t(r.id)).filter(Boolean)];

    const { data: chargeRows, error } = await supabase
        .from("charges")
        .select(ACCOUNT_CHARGE_SELECT)
        .eq("org_id", orgId)
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
        .in("billable_source_id", sourceIds);
    if (error) throw new Error(`settlement: charges could not be read (${error.message})`);
    const charges = (chargeRows ?? []) as unknown as Array<Record<string, unknown>>;

    /*
     * A reversal row names the charge it undoes; that charge is no longer owed. Any OTHER negative
     * row that names a source charge (a correction lowering it) reduces what that charge still owes —
     * a $18 charge corrected by −$5 owes $13, and settling $18 would pay a debt that no longer exists.
     */
    const reversedIds = new Set<string>();
    const reducedBy = new Map<string, number>();
    for (const c of charges) {
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        const source = t(c.source_charge_id);
        if (!source || t(c.status) === "void" || t(c.status) === "draft") continue;
        if (t(meta.correction_kind) === "reversal") reversedIds.add(source);
        else if (n(c.amount_cents) < 0) reducedBy.set(source, (reducedBy.get(source) ?? 0) + Math.abs(n(c.amount_cents)));
    }
    const owed = charges.filter((c) => {
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        if (!OWED.has(t(c.status)) || n(c.amount_cents) <= 0) return false;
        if (t(meta.correction_kind) === "reversal" || reversedIds.has(t(c.id))) return false;
        const due = t(c.due_date);
        return Boolean(due) && due <= args.asOf;
    });
    if (!owed.length) return [];

    const applied = await readAppliedByChargeId(supabase, { orgId, chargeIds: owed.map((c) => t(c.id)) });
    if (applied.state !== "ok") throw new Error(`settlement: applied money could not be read (${applied.reason})`);
    const outstanding = owed
        .map((c) => ({
            c,
            out: n(c.amount_cents) - (reducedBy.get(t(c.id)) ?? 0) - (applied.appliedByChargeId.get(t(c.id)) ?? 0),
        }))
        .filter((x) => x.out > 0);
    if (!outstanding.length) return [];

    const ids = outstanding.map((x) => t(x.c.id));
    const [collectibles, shares] = await Promise.all([
        Promise.all(outstanding.map((x) => resolveFamilyCollectible(supabase, { orgId, chargeId: t(x.c.id) }).catch(() => null))),
        readRemainingShares(supabase, { orgId, chargeIds: ids }),
    ]);

    return outstanding.map(({ c, out }, i) => {
        const position = collectibles[i];
        /* A failed collectible read is not "collectible": settle nothing on that charge. */
        const collectible = position ? Math.min(out, Math.max(0, n(position.currentlyCollectibleCents))) : 0;
        return {
            chargeId: t(c.id),
            label: chargeDisplayLabel(t(c.description) || null, t(c.charge_category) || null),
            categoryKey: t(c.charge_category) || null,
            amountCents: n(c.amount_cents),
            collectibleCents: collectible,
            dueDate: t(c.due_date) || null,
            billableOn: t(c.billable_on) || null,
            status: t(c.status),
            reversed: false,
            shares: shares.get(t(c.id)) ?? [],
        };
    });
}

/**
 * Each charge's active responsibility shares and what each still owes. An attribution counts only
 * while its application is ACTIVE — a reversed (reallocated, refunded) application no longer pays
 * anybody's share.
 */
export async function readRemainingShares(
    supabase: SupabaseClient,
    args: { orgId: string; chargeIds: readonly string[] },
): Promise<Map<string, SettlementShare[]>> {
    const out = new Map<string, SettlementShare[]>();
    if (!args.chargeIds.length) return out;
    const { data: allocRows, error } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, charge_id, responsible_party_id, is_unassigned, assigned_amount_cents")
        .eq("org_id", args.orgId)
        .eq("state", "active")
        .in("charge_id", [...args.chargeIds]);
    if (error) throw new Error(`settlement: responsibility could not be read (${error.message})`);
    const allocs = (allocRows ?? []) as Array<Record<string, unknown>>;
    const named = allocs.filter((a) => !a.is_unassigned && t(a.responsible_party_id));
    const attributed = new Map<string, number>();
    if (named.length) {
        const { data: attrRows, error: attrError } = await supabase
            .from("payment_responsibility_attributions")
            .select("responsibility_allocation_id, payment_allocation_id, amount_cents")
            .eq("org_id", args.orgId)
            .in("responsibility_allocation_id", named.map((a) => t(a.id)));
        if (attrError) throw new Error(`settlement: attributions could not be read (${attrError.message})`);
        const attrs = (attrRows ?? []) as Array<Record<string, unknown>>;
        const appIds = [...new Set(attrs.map((a) => t(a.payment_allocation_id)).filter(Boolean))];
        const active = new Set<string>();
        if (appIds.length) {
            const { data: appRows, error: appError } = await supabase
                .from("payment_allocations")
                .select("id, status")
                .eq("org_id", args.orgId)
                .in("id", appIds);
            if (appError) throw new Error(`settlement: applications could not be read (${appError.message})`);
            for (const r of (appRows ?? []) as Array<Record<string, unknown>>) if (t(r.status) === "active") active.add(t(r.id));
        }
        for (const a of attrs) {
            if (!active.has(t(a.payment_allocation_id))) continue;
            const k = t(a.responsibility_allocation_id);
            attributed.set(k, (attributed.get(k) ?? 0) + n(a.amount_cents));
        }
    }
    for (const a of allocs) {
        const chargeId = t(a.charge_id);
        const list = out.get(chargeId) ?? [];
        const party = a.is_unassigned ? null : t(a.responsible_party_id) || null;
        list.push({
            allocationId: t(a.id),
            partyId: party,
            remainingCents: party ? n(a.assigned_amount_cents) - (attributed.get(t(a.id)) ?? 0) : n(a.assigned_amount_cents),
        });
        out.set(chargeId, list);
    }
    return out;
}

/** Read and plan in one call — what the Payment command previews and every writer commits. */
export async function planSettlement(
    supabase: SupabaseClient,
    args: { orgId: string; householdId: string; asOf: string; amountCents: number; payerPersonId: string | null },
): Promise<SettlementPlan> {
    const candidates = await readSettlementCandidates(supabase, args);
    return planSettlementFrom({ asOf: args.asOf, amountCents: args.amountCents, payerPersonId: args.payerPersonId, candidates });
}
