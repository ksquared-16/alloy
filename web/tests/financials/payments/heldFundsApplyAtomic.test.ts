/**
 * APPLYING HELD MONEY — one act, one commit, and reachable at all.
 *
 * W6-B found two defects in the same lifecycle, and the second is the larger one.
 *
 *   1. `applyHeldFunds` allocated the money and then disposed the hold as two sequential client
 *      writes with no compensating path. A failure between them left the money applied to the charge
 *      AND still counted as restricted — the balance fell, available prepaid was short by the same
 *      cents, the hold looked too large, and nothing connected the three.
 *
 *   2. It had NO CALLER and NO TEST. `deposit.hold` had been registered and executable since W4 with
 *      no mounted caller either, so no hold could be created on a real account and the apply half
 *      could never run. The lifecycle existed as code and not as product.
 *
 * ── WHAT IS PROVED HERE AND WHAT IS NOT ──
 *
 * The ATOMICITY ITSELF is not provable here and this suite does not pretend to: "both rows or
 * neither" is a property of a database transaction, and a fake that implements a transaction is the
 * test agreeing with itself. It is proved in the live suite against the real stack.
 *
 * What these cases prove is everything around it that a fake CAN see: that the caller makes one
 * write instead of two, that it names the hold, that the canonical guards and the general ledger are
 * still the ordinary ones, and that the acts are mounted where an operator can reach them.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { applyHeldFunds } from "@/lib/financials/prepaid/heldDeposits";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MIGRATION = "../supabase/migrations/20261102120000_apply_held_funds_atomic.sql";
const SERVICE = "lib/financials/childcarePaymentService.ts";
const HELD = "lib/financials/prepaid/heldDeposits.ts";
const APPLY_ACTION = "lib/adminV2/actions/definitions/financialPaymentActions.ts";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";

const ORG = "org-1";
const PAYMENT = "pay-1";
const HOLD_ID = "hold-1";
const CHARGE = "charge-1";

/**
 * A store that answers the two reads `applyHeldFunds` makes, and RECORDS every write.
 *
 * Recording is the point. The defect was an extra write, so the assertion that matters is about how
 * many writes happened and to which tables — which a store that only returns rows cannot see.
 */
function store(holdAmountCents = 50_000, disposed: Array<Record<string, unknown>> = []) {
    const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
    const holdRows = [{
        id: HOLD_ID, org_id: ORG, payment_id: PAYMENT, amount_cents: holdAmountCents,
        refundable: true, refundable_terms: {}, policy_id: null, reason: "Security deposit",
        held_at: "2026-08-01T00:00:00Z", created_by: null, metadata: {},
    }];
    /* `org_id` matters: the reader filters dispositions by it, so omitting it silently returns none
     * and every remaining-amount bound reads as untouched. */
    const dispRows = disposed.map((d) => ({ org_id: ORG, hold_id: HOLD_ID, ...d }));

    const client = {
        from(table: string) {
            const filters: Array<(r: Record<string, unknown>) => boolean> = [];
            let pending: Record<string, unknown> | null = null;
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return self; };
            self.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return self; };
            self.insert = (v: Record<string, unknown>) => { pending = v; return self; };

            const source = () => (table === "payment_holds" ? holdRows : table === "payment_hold_dispositions" ? dispRows : []);
            const settle = () => {
                if (pending) {
                    writes.push({ table, row: pending });
                    return { data: { ...pending }, error: null };
                }
                return { data: source().filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null };
            };
            self.maybeSingle = async () => {
                const res = settle();
                return Array.isArray(res.data) ? { data: res.data[0] ?? null, error: res.error } : res;
            };
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return { client, writes };
}

describe("applying held money makes ONE write, and names the hold", () => {
    it("calls the canonical allocator once, carrying the hold that is being discharged", async () => {
        const s = store();
        const calls: Array<Record<string, unknown>> = [];
        const out = await applyHeldFunds(
            s.client as never,
            { orgId: ORG, holdId: HOLD_ID, chargeId: CHARGE, amountCents: 20_000, notes: "Applied to tuition" },
            async (input) => {
                calls.push(input as unknown as Record<string, unknown>);
                return { allocationId: "alloc-1", appliedCents: 20_000 };
            },
        );
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        expect(calls).toHaveLength(1);
        /* The hold must reach the allocator, or the disposition is never written at all. */
        expect(calls[0].disposeHoldId).toBe(HOLD_ID);
        expect(calls[0].paymentId).toBe(PAYMENT);
        expect(calls[0].chargeId).toBe(CHARGE);
        expect(calls[0].amountCents).toBe(20_000);
    });

    /**
     * THE REGRESSION ASSERTION.
     *
     * The old implementation followed the allocation with `disposeHold`, which INSERTs into
     * `payment_hold_dispositions` from the client. That insert is the second write — the one that
     * could fail on its own — so its absence is what "one act, one commit" means here.
     */
    it("writes NO disposition of its own — the database writes both rows together", async () => {
        const s = store();
        await applyHeldFunds(
            s.client as never,
            { orgId: ORG, holdId: HOLD_ID, chargeId: CHARGE, amountCents: 20_000 },
            async () => ({ allocationId: "alloc-1", appliedCents: 20_000 }),
        );
        expect(
            s.writes.filter((w) => w.table === "payment_hold_dispositions"),
            "a client-side disposition insert is the two-write defect",
        ).toHaveLength(0);
        expect(s.writes.filter((w) => w.table === "payment_allocations")).toHaveLength(0);
    });

    it("refuses an over-application before the allocator is reached", async () => {
        const s = store(50_000, [{ id: "d1", kind: "released", amount_cents: 40_000 }]);
        let called = false;
        const out = await applyHeldFunds(
            s.client as never,
            { orgId: ORG, holdId: HOLD_ID, chargeId: CHARGE, amountCents: 20_000 },
            async () => { called = true; return { allocationId: "x", appliedCents: 0 }; },
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("exceeds_remaining");
        /* Only $100 remains held. Allocating first and discovering that afterwards is the old order. */
        expect(called, "nothing is allocated against money that is not held").toBe(false);
    });

    /* The database's bound refusal is the authority; the caller only translates it. */
    it("surfaces the database's own bound refusal as exceeds_remaining", async () => {
        const s = store();
        const out = await applyHeldFunds(
            s.client as never,
            { orgId: ORG, holdId: HOLD_ID, chargeId: CHARGE, amountCents: 20_000 },
            async () => { throw new Error("only 1000 cents remain held on deposit hold-1, so 20000 cannot be applied"); },
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("exceeds_remaining");
    });

    it("reports a failed application as a failure rather than a silent success", async () => {
        const s = store();
        const out = await applyHeldFunds(
            s.client as never,
            { orgId: ORG, holdId: HOLD_ID, chargeId: CHARGE, amountCents: 20_000 },
            async () => { throw new Error("charge belongs to a different household"); },
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("write_failed");
        expect(out.message).toMatch(/different household/i);
    });
});

describe("the allocation the database writes is an ORDINARY allocation", () => {
    /**
     * A row of a different shape would be a second kind of allocation wearing the same table —
     * invisible to every reader that filters the canonical way, and to the balance itself.
     */
    it("names every column the canonical allocator names", () => {
        const sql = read(MIGRATION);
        const insert = sql.slice(sql.indexOf("INSERT INTO public.payment_allocations"));
        for (const column of [
            "org_id", "payment_id", "charge_id",
            "target_entity_type", "target_entity_id",
            "allocated_amount_cents", "status", "allocation_type",
            "allocated_at", "notes", "metadata", "updated_at", "created_by", "updated_by",
        ]) {
            expect(insert, `payment_allocations.${column} is written by the ordinary path`).toContain(column);
        }
        /* The two literals the canonical insert uses, and the only value the CHECK admits. */
        expect(insert).toMatch(/'charge'/);
        expect(insert).toMatch(/'payment_application'/);
        expect(insert).toMatch(/'active'/);
    });

    it("writes the disposition column that exists, not the one the allocations table has", () => {
        /*
         * `payment_allocations` has `created_by`; `payment_hold_dispositions` has `disposed_by`. The
         * first draft of this migration wrote `created_by` to both, which would have failed at apply
         * time against a column that does not exist.
         */
        const sql = read(MIGRATION);
        const insert = sql.slice(sql.indexOf("INSERT INTO public.payment_hold_dispositions"));
        expect(insert).toContain("disposed_by");
        expect(insert).not.toMatch(/\bcreated_by\b/);
        /* `..._applied_names_allocation_chk` requires it, and only one transaction can satisfy that. */
        expect(insert).toContain("allocation_id");
        expect(insert).toMatch(/'applied'/);
    });

    it("takes its money in bigint, as the money columns are declared", () => {
        /* `amount_cents` is bigint on both tables; an integer parameter narrows the schema. */
        const sql = read(MIGRATION);
        expect(sql).toMatch(/p_amount_cents bigint/);
        expect(sql).not.toMatch(/p_amount_cents integer/);
    });

    it("re-runnable, because a failed apply does not roll back DDL", () => {
        expect(read(MIGRATION)).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_held_funds_atomic/);
    });

    /**
     * THE SELF-TEST MUST NOT FAIL A FUNCTION IT JUST CREATED CORRECTLY.
     *
     * It first compared `pg_get_function_identity_arguments` against 'uuid, uuid, uuid, bigint,
     * uuid, text'. That function includes PARAMETER NAMES, so the comparison could never be true:
     * the apply failed, printing the very signature it wanted, and because a failed apply does not
     * roll back DDL the function was installed while the migration reported otherwise.
     */
    it("the self-test does not compare the signature against a bare type list", () => {
        const sql = read(MIGRATION);
        expect(sql, "identity arguments carry names, so this can never match")
            .not.toMatch(/<>\s*'uuid, uuid, uuid, bigint, uuid, text'/);
        /* It asserts the one property that matters: money is bigint, not integer. */
        expect(sql).toMatch(/p_amount_cents bigint%/);
    });
});

describe("held money is applied through the canonical authority, not beside it", () => {
    it("the RPC branch is taken only when a hold is named", () => {
        const src = code(SERVICE);
        expect(src).toMatch(/disposeHoldId/);
        expect(src).toMatch(/apply_held_funds_atomic/);
        /* The guards run ABOVE the branch, so held money inherits them rather than restating them. */
        const branch = src.indexOf("apply_held_funds_atomic");
        expect(src.indexOf("different household than payment"), "the household guard precedes the write")
            .toBeLessThan(branch);
        expect(src.indexOf("would over-pay charge"), "the charge ceiling precedes the write")
            .toBeLessThan(branch);
    });

    /**
     * THE GENERAL LEDGER MUST NOT FORK.
     *
     * Moving journaling into the RPC would give hold application its own accounting path. The held
     * branch has to record the SAME entry the ordinary branch records, through the same function.
     */
    it("still records the ordinary general ledger entry", () => {
        const src = code(SERVICE);
        const branch = src.slice(src.indexOf("apply_held_funds_atomic"));
        const untilReturn = branch.slice(0, branch.indexOf("const { data, error }"));
        expect(untilReturn).toMatch(/recordPaymentAppliedEntry\(supabase, payment, allocation/);
        /*
         * Against the EXECUTABLE sql only. The migration's own header explains at length that it
         * does NOT journal, so matching the raw file finds the word in the prose that promises its
         * absence — the assertion would fail on the comment that makes it true.
         */
        const sql = read(MIGRATION)
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*--.*$/gm, "");
        expect(sql).not.toMatch(/ledger_transactions/i);
        expect(sql, "journaling stays with the caller").not.toMatch(/recordPaymentAppliedEntry/i);
    });

    it("the held branch re-reads the row through the same columns as the ordinary path", () => {
        /* Otherwise the shape the caller receives depends on which writer produced it. */
        const src = code(SERVICE);
        const branch = src.slice(src.indexOf("apply_held_funds_atomic"));
        expect(branch.slice(0, branch.indexOf("const { data, error }"))).toMatch(/select\(ALLOCATION_COLUMNS\)/);
    });

    it("does not mint a second deposit authority", () => {
        /*
         * `deposit.hold` and `deposit.release` were minted as the ONLY two deposit authorities, on
         * the stated grounds that applying held money is an ordinary allocation. A `deposit.apply`
         * action would be the second authority that reasoning refused.
         */
        for (const rel of ["lib/adminV2/actions/definitions/depositHoldActions.ts", APPLY_ACTION]) {
            expect(code(rel), `${rel} must not register deposit.apply`).not.toMatch(/"deposit\.apply"/);
        }
    });

    it("requires an amount when a hold is named, because the default spans the whole receipt", () => {
        const src = code(APPLY_ACTION);
        expect(src).toMatch(/hold_id/);
        expect(src).toMatch(/missing_amount/);
    });

    /* `created_by` was null on every allocation this action wrote. */
    it("records who applied the money", () => {
        const src = code(APPLY_ACTION);
        const exec = src.slice(src.indexOf("applyPaymentToCharge(supabase as SupabaseClient, {"));
        expect(exec.slice(0, 900)).toMatch(/actorUserId: ctx\.userId/);
    });
});

describe("the lifecycle is reachable by an operator", () => {
    /**
     * THE DEFECT THAT MADE ALL OF W4 INERT.
     *
     * `deposit.hold` was registered, catalogued and executable with zero mounted callers, so no hold
     * could be created on a real account — which made the position, its provenance and both acts
     * unreachable however correct they were. A registered action is not an executable one.
     */
    it("hold is raised from the receipt it restricts", () => {
        const host = code(HOST);
        expect(host).toMatch(/data-financials-command="deposit\.hold"/);
        expect(host).toMatch(/runAction\("deposit\.hold"/);
        /* Bounded by what is left to restrict, not by the receipt. */
        expect(host).toMatch(/offersHold/);
        expect(host).toMatch(/holdableCents/);
    });

    it("release is raised from the lot, and says that no money moves", () => {
        const host = code(HOST);
        expect(host).toMatch(/runAction\("deposit\.release"/);
        expect(read(HOST)).toMatch(/No money moves and the family is not refunded/);
    });

    it("apply reuses the apply panel and carries the hold", () => {
        const host = code(HOST);
        expect(host).toMatch(/hold_id: applyPending\.hold\.holdId/);
        /* The action refuses a held apply with no amount, so the host must supply one. */
        expect(host).toMatch(/amount_cents: heldAmountCents/);
    });

    it("the detail card is MOUNTED with both acts", () => {
        /*
         * Read at the mount, not on the component. Three times this sprint a component was written
         * to consume canonical truth that the only production mount never supplied, and every one of
         * those passed a component test — because a component test supplies the prop itself.
         */
        const host = code(HOST);
        const at = host.indexOf("onReverseAdjustment={openReverseAdjustment}");
        expect(at).toBeGreaterThan(-1);
        const block = host.slice(at, at + 400);
        expect(block).toMatch(/onApplyHeldFunds=\{/);
        expect(block).toMatch(/onReleaseHeldFunds=\{/);
        expect(block, "a literal null reproduces the defect while satisfying the assertion")
            .not.toMatch(/onApplyHeldFunds=\{\s*null\s*\}/);
    });

    it("the position states its provenance, not just its total", () => {
        const detail = read(DETAIL);
        expect(detail).toMatch(/data-financials-held-deposits="true"/);
        expect(detail).toMatch(/refundableNote/);
        expect(detail).toMatch(/policyReference|h\.reason/);
        /* The sentence that stops held money reading as spendable. */
        expect(detail).toMatch(/not available prepaid/i);
    });

    /**
     * ALL THREE ACTS ARE REACHABLE, AND EACH IS GUARDED BY WHAT IT DEPENDS ON.
     *
     * Refund was withheld at first, on the grounds that `..._refunded_names_payment_chk` requires
     * the disposition to name a canonical refund payment that does not exist when a card refund
     * returns. That constraint is real; omitting the act was the wrong answer to it. The hold is now
     * carried on the provider refund record and discharged at RECOGNITION, and the terms are what
     * gate the control — `heldFundsRefund.test.ts` owns that path in full.
     */
    it("apply, release and refund are each offered, and refund only where honourable", () => {
        const detail = read(DETAIL);
        expect(detail).toMatch(/command="payment\.apply_to_charge"/);
        expect(detail).toMatch(/command="deposit\.release"/);
        expect(detail).toMatch(/command="payment\.refund"/);
        /* Refund is guarded by the lot's own snapshot terms, not by a flag or a permission. */
        const at = detail.indexOf('kind="refund"');
        expect(detail.slice(Math.max(0, at - 400), at)).toMatch(/h\.refundable/);
        /* And the terms are stated on every lot, refundable or not. */
        expect(detail).toMatch(/data-financials-held-refundable/);
    });
});
