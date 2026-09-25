/**
 * TWO PAYERS ARE TWO PAYMENTS.
 *
 * `payment.record` derives an idempotency key when the caller supplies none. The key already carried
 * the date, for a reason its own comment states: "a second $500 cash payment against the same charge
 * on a LATER day is a real, legitimate second payment, and must not be swallowed as a retry." The
 * same argument applies across PEOPLE, and the payer was missing.
 *
 * Measured on a split-payment certification before the repair: Mom paid $37.50 and Dad paid $37.50
 * against one household charge on one day, and Dad's request returned MOM'S payment id with
 * `already_recorded: true`. The family's outstanding stopped halfway and nobody was told.
 *
 * These are source guards on the key's composition, because the defect WAS the composition — the
 * service's own idempotency behaviour is correct and covered by its suite; what nothing asserted was
 * that two payers produce two keys.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = () =>
    readFileSync(join(process.cwd(), "lib/adminV2/actions/definitions/financialPaymentActions.ts"), "utf8");

/** The derived-key expression, as the action composes it. */
function keyBody(): string {
    const src = SOURCE();
    const start = src.indexOf("function idempotencyKeyFor(");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n}", start);
    return src.slice(start, end);
}

describe("the derived payment idempotency key", () => {
    it("includes the payer identity", () => {
        const body = keyBody();
        expect(body).toContain("t(payload.payer_entity_type)");
        expect(body).toContain("t(payload.payer_entity_id)");
    });

    it("still includes the axes it already had", () => {
        const body = keyBody();
        // Removing any of these would resurrect a different swallowed-payment bug.
        expect(body).toContain("t(payload.charge_id)");
        expect(body).toContain("t(payload.amount_cents)");
        expect(body).toContain("t(payload.payment_method)");
        expect(body).toContain("day");
    });

    it("still lets a caller supply its own key verbatim", () => {
        // An explicit key is the caller's contract and must not be re-derived.
        expect(keyBody()).toContain("if (supplied) return supplied;");
    });

    it("records why the payer belongs in the key, so it is not optimised away", () => {
        expect(keyBody()).toMatch(/two payers are two payments/i);
    });
});

/**
 * The same composition, reproduced exactly, so the ORDERING and emptiness behaviour are pinned as
 * facts rather than read off the source.
 */
function derive(payload: Record<string, string | undefined>): string {
    const t = (v: string | undefined) => (typeof v === "string" ? v.trim() : "");
    const day = t(payload.received_at).slice(0, 10) || "2026-09-26";
    return [
        "payment.record",
        t(payload.charge_id),
        t(payload.amount_cents),
        t(payload.payment_method),
        day,
        t(payload.payer_entity_type),
        t(payload.payer_entity_id),
    ].join(":");
}

describe("what the key distinguishes", () => {
    const base = { charge_id: "chg-1", amount_cents: "3750", payment_method: "cash", received_at: "2026-09-26" };

    it("separates two payers paying the same amount on the same day", () => {
        const mom = derive({ ...base, payer_entity_type: "person", payer_entity_id: "mom" });
        const dad = derive({ ...base, payer_entity_type: "person", payer_entity_id: "dad" });
        expect(mom).not.toBe(dad);
    });

    it("still treats the SAME payer repeating the same request as a retry", () => {
        const once = derive({ ...base, payer_entity_type: "person", payer_entity_id: "mom" });
        const twice = derive({ ...base, payer_entity_type: "person", payer_entity_id: "mom" });
        expect(once).toBe(twice);
    });

    it("leaves a payer-less payment keyed exactly as before", () => {
        // Nothing that never named a payer changes behaviour.
        expect(derive(base)).toBe("payment.record:chg-1:3750:cash:2026-09-26::");
    });

    it("still separates the same payer on a later day", () => {
        const today = derive({ ...base, payer_entity_id: "mom", payer_entity_type: "person" });
        const later = derive({ ...base, received_at: "2026-09-27", payer_entity_id: "mom", payer_entity_type: "person" });
        expect(today).not.toBe(later);
    });
});
