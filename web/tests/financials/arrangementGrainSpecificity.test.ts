/**
 * TWO GRAINS, ONE RULE, AND THE READER THAT DID NOT HAVE IT.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────────────────────────
 *
 * Responsibility is configurable at two canonical grains: the HOUSEHOLD (`customer_member_id`
 * null) and a CHILD (`customer_member_id` set). Where both apply, the more specific wins; within a
 * grain the latest start wins, and the database's exclusion constraint refuses overlap inside a
 * grain so there is never an untied comparison.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `readArrangementInForce` implemented that rule. `readAccountArrangement` implemented none of it:
 *
 *     .eq("customer_id", …).eq("state", "active")
 *     .order("effective_start", { ascending: false }).limit(1)
 *
 * No grain filter at all. So a household holding a household arrangement AND a later child-scoped
 * one had the CHILD's returned, and `resolveChargeDetail` presented it as the account's — naming a
 * party and an amount that govern one child, and handing that child's share ids to the expected-
 * funding control as the shares an operator funds "for the account".
 *
 * Two readers of one model, two answers, because the rule lived inside one of them.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * The rule itself; that a child-scoped arrangement is never an answer to a household question;
 * that both readers go through the shared module; and that a charge asks with its own subject.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    arrangementAppliesTo,
    arrangementInForceOn,
    pickGoverningArrangement,
} from "@/lib/financials/responsibility/arrangementSpecificity";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

const HOUSEHOLD = { id: "arr-household", customerMemberId: null, effectiveStart: "2026-01-01", effectiveEnd: null };
const CERTA = { id: "arr-certa", customerMemberId: "certa", effectiveStart: "2026-09-01", effectiveEnd: null };
/** Authored EARLIER than the household one, to prove specificity is not a date comparison. */
const CERTA_OLD = { id: "arr-certa-old", customerMemberId: "certa", effectiveStart: "2025-01-01", effectiveEnd: null };

describe("a child-scoped arrangement is not an answer to a household question", () => {
    it("excludes child arrangements from the household grain", () => {
        expect(arrangementAppliesTo(CERTA, null)).toBe(false);
        expect(arrangementAppliesTo(HOUSEHOLD, null)).toBe(true);
    });

    it("includes the household arrangement for every child", () => {
        expect(arrangementAppliesTo(HOUSEHOLD, "certa")).toBe(true);
        expect(arrangementAppliesTo(HOUSEHOLD, "certb")).toBe(true);
    });

    it("excludes another child's arrangement", () => {
        expect(arrangementAppliesTo(CERTA, "certb")).toBe(false);
        expect(arrangementAppliesTo(CERTA, "certa")).toBe(true);
    });
});

describe("most specific wins, and it is not a date comparison", () => {
    const all = [HOUSEHOLD, CERTA, CERTA_OLD];

    it("Certa resolves through its own arrangement", () => {
        expect(pickGoverningArrangement(all, { customerMemberId: "certa" })?.id).toBe("arr-certa");
    });

    it("Certb, with no child-specific arrangement, uses the household one", () => {
        expect(pickGoverningArrangement(all, { customerMemberId: "certb" })?.id).toBe("arr-household");
    });

    it("the household question gets the household answer, never the newest row", () => {
        /* THE DEFECT, stated as a case: CERTA starts later, and must still not win here. */
        expect(pickGoverningArrangement(all, { customerMemberId: null })?.id).toBe("arr-household");
    });

    it("a child arrangement older than the household one still wins for that child", () => {
        expect(pickGoverningArrangement([HOUSEHOLD, CERTA_OLD], { customerMemberId: "certa" })?.id).toBe(
            "arr-certa-old",
        );
    });

    it("answers null when nothing applies", () => {
        expect(pickGoverningArrangement([CERTA], { customerMemberId: null })).toBeNull();
        expect(pickGoverningArrangement([], { customerMemberId: "certa" })).toBeNull();
    });
});

describe("effective dating", () => {
    it("has not started yet, so it is not in force", () => {
        expect(arrangementInForceOn({ effectiveStart: "2026-10-01", effectiveEnd: null }, "2026-09-19")).toBe(false);
    });

    it("an open end never expires", () => {
        expect(arrangementInForceOn({ effectiveStart: "2026-01-01", effectiveEnd: null }, "2030-01-01")).toBe(true);
    });

    it("an ended arrangement stops on the day after its end, inclusive", () => {
        const ended = { effectiveStart: "2026-01-01", effectiveEnd: "2026-09-19" };
        expect(arrangementInForceOn(ended, "2026-09-19")).toBe(true);
        expect(arrangementInForceOn(ended, "2026-09-20")).toBe(false);
    });

    it("dating is only applied when a date is asked for", () => {
        /*
         * The account reader has always answered "is there an arrangement on record" rather than
         * "which applies today" — the sentence that invites an operator to create one. Narrowing
         * that silently would make an existing arrangement vanish from the screen offering to
         * create a duplicate.
         */
        const future = [{ id: "future", customerMemberId: null, effectiveStart: "2099-01-01", effectiveEnd: null }];
        expect(pickGoverningArrangement(future, { customerMemberId: null })?.id).toBe("future");
        expect(pickGoverningArrangement(future, { customerMemberId: null, onDate: "2026-09-19" })).toBeNull();
    });
});

describe("both readers go through the one rule", () => {
    it("the account reader no longer takes the newest row of any grain", () => {
        const code = src("lib/financials/responsibility/readAccountArrangement.ts");
        expect(code).toContain("pickGoverningArrangement");
        expect(code, "the grain is a parameter, not an assumption").toContain("customerMemberId?: string | null");
        expect(code, "the ungrained limit-1 is gone").not.toMatch(/\.order\("effective_start"[\s\S]{0,80}\.limit\(1\)/);
        expect(code, "and the grain reaches the caller").toContain("customerMemberId: row.customerMemberId");
    });

    it("the in-force reader restates neither the filters nor the comparator", () => {
        const code = src("lib/financials/responsibility/responsibilityService.ts");
        expect(code).toContain("pickGoverningArrangement");
        expect(code, "no hand-written specificity comparator").not.toMatch(
            /Number\(b\.customer_member_id !== null\) - Number\(a\.customer_member_id !== null\)/,
        );
    });

    it("a charge asks with its own subject", () => {
        const code = src("lib/financials/workspace/resolveChargeDetail.ts");
        const call = code.slice(code.indexOf("readAccountArrangement(supabase"));
        expect(call.slice(0, 260)).toContain("customerMemberId");
    });
});
