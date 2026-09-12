/**
 * A WAITLIST CANDIDATE MUST CARRY THE HOUSEHOLD IT ALREADY KNOWS.
 *
 * ── WHAT THE DEPLOYED TENANT ACTUALLY SAYS ──
 *
 * Captured by governed census against the deployed database, for the exact failing family
 * (Kurzman Family, waitlist, org Firefly Early Learning):
 *
 *   opportunities.customer_id                          PRESENT
 *   placement_candidates.customer_id                   PRESENT — 35/35 on this case, 37/37 tenant
 *   placement_candidates.customer_member_id            PRESENT — 37/37
 *   placement_candidates.opportunity_customer_member_id  NULL on all 35
 *
 * So the account exists at every grain in persistence. It was unreachable on the surface because the
 * candidate queue projection never selected the candidate's own `customer_id` — the household
 * survived only NESTED under `opportunities`, and a nested `opportunities.customer_id` matches none
 * of the flat household keys `resolveFinancialSubjectId` reads. Financials was then placed at
 * settlement with no account to ask about, beside an Enrollment card and a Children card that had
 * resolved the same family.
 *
 * These pin the projection contract at the boundary where the identity was lost, not downstream of
 * it in the card.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { resolveFinancialSubjectId } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const queue = fs.readFileSync(
    path.join(__dirname, "../../../lib/queues/candidateGrainWaitlistQueue.ts"),
    "utf8",
);

/** A context is only its composed truth as far as the financial subject rule is concerned. */
const ctx = (truth: Record<string, unknown>) => ({ truth }) as unknown as OperationalContext;

/**
 * The FLAT column list of a candidate select — everything ahead of the first nested block.
 *
 * Nesting is the entire subject of this file. `opportunities!inner ( ..., customer_id, ... )` puts
 * the text "customer_id" inside the select while leaving the flat key absent, which is precisely the
 * shape that stranded Financials. A substring check across the whole select therefore goes green on
 * the defect it exists to catch — verified by planting it, which passed every assertion here before
 * this helper existed. `opportunity_customer_member_id` sets the same trap for "customer_member_id".
 *
 * So the nested blocks are cut away and what remains is compared as whole comma-delimited tokens,
 * never as substrings.
 */
const flatColumns = (select: string): string[] => {
    const nestedAt = select.indexOf("(");
    return (nestedAt === -1 ? select : select.slice(0, nestedAt))
        .replace(/`/g, "")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
};

describe("the waitlist candidate projection", () => {
    it("selects the household and member columns the candidate row already carries", () => {
        const selects = queue.match(/id, org_id, opportunity_id, status, site_id[^`]*/g) ?? [];
        expect(selects.length, "both candidate reads must be covered").toBeGreaterThanOrEqual(2);
        for (const select of selects) {
            const columns = flatColumns(select);
            expect(columns, "the candidate's own household column must be read").toContain("customer_id");
            expect(columns, "and the child it names").toContain("customer_member_id");
        }
    });

    /*
     * NO NEW READ. The columns are on `placement_candidates`, which this query already reads — same
     * table, same round trip. The brief forbids another database read and this does not add one.
     *
     * This pins the invariant rather than a census of reads. The original assertion pinned the count
     * at two, which is not the same claim: it failed the moment an unrelated lens was added, and one
     * was — the child-grain membership lens brought a third read that carries the columns perfectly
     * well. A test that goes red on correct growth teaches the next reader to delete it rather than
     * reason about it, and then the real invariant is unguarded.
     *
     * What must stay true is narrower and permanent: the household rides along on EVERY read of the
     * candidate table and never earns one of its own. A dedicated household lookup is the regression
     * this is here to catch, and a fourth legitimate lens that carries its columns is not.
     */
    it("obtains them without a read of its own", () => {
        const reads = queue.split('.from("placement_candidates")').slice(1);
        expect(reads.length, "the candidate table must still be read").toBeGreaterThanOrEqual(1);

        reads.forEach((read, i) => {
            const open = read.indexOf("`");
            const close = open === -1 ? -1 : read.indexOf("`", open + 1);
            expect(
                close,
                `candidate read ${i + 1} has no template-literal select; look at it by hand rather than loosening this`,
            ).toBeGreaterThan(-1);

            const columns = flatColumns(read.slice(open, close + 1));
            expect(columns, `candidate read ${i + 1} must carry the household inline`).toContain(
                "customer_id",
            );
            expect(columns, `candidate read ${i + 1} must carry the child inline`).toContain(
                "customer_member_id",
            );
        });
    });

    /*
     * ── THE RULE THE PROJECTION HAS TO SATISFY ──
     *
     * A nested opportunity is not a household key. This is the shape that stranded Financials, and
     * it must keep reading as "no subject" so the repair cannot be faked by loosening the rule.
     */
    it("cannot resolve a household from a nested opportunity alone", () => {
        const nestedOnly = {
            id: "cand-1",
            opportunity_id: "opp-1",
            opportunities: { id: "opp-1", customer_id: "cust-1" },
        };
        expect(
            resolveFinancialSubjectId(ctx(nestedOnly)),
            "a household nested under the case is not a flat household identity",
        ).toBeNull();
    });

    it("resolves the household once the candidate's own column travels", () => {
        const carried = {
            id: "cand-1",
            opportunity_id: "opp-1",
            customer_id: "cust-1",
            customer_member_id: "cm-1",
            opportunities: { id: "opp-1", customer_id: "cust-1" },
        };
        expect(
            resolveFinancialSubjectId(ctx(carried)),
            "the account the candidate row names is the family's account",
        ).toBe("cust-1");
    });

    /*
     * MULTI-CHILD: the household is the household. Every Kurzman candidate carries the SAME
     * `customer_id` and a different `customer_member_id`, so the financial subject must not depend on
     * which child is active — and must never be a first-child fallback.
     */
    it("resolves one household across siblings, whichever child is selected", () => {
        const childA = { customer_id: "cust-1", customer_member_id: "cm-a" };
        const childB = { customer_id: "cust-1", customer_member_id: "cm-b" };
        expect(resolveFinancialSubjectId(ctx(childA))).toBe("cust-1");
        expect(resolveFinancialSubjectId(ctx(childB))).toBe("cust-1");
        expect(
            resolveFinancialSubjectId(ctx(childA)),
            "two children of one family are one financial subject",
        ).toBe(resolveFinancialSubjectId(ctx(childB)));
    });

    /*
     * A case with no candidate row of its own still has an account — the case's. The synthetic row
     * must carry it rather than leaving the household to the nested preview.
     */
    it("gives a synthetic candidate the case's household", () => {
        expect(queue).toMatch(/customer_id: opp\.customer_id \?\? null/);
    });

    /*
     * AND THE NEGATIVE, so none of this is vacuous: a candidate whose family genuinely has no
     * account resolves to nothing, and the terminal state stays reachable for it.
     */
    it("still resolves nothing when no grain names a household", () => {
        expect(resolveFinancialSubjectId(ctx({ id: "cand-1", opportunity_id: "opp-1" }))).toBeNull();
    });
});
