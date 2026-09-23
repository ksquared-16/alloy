/**
 * THE TWO SILENT FAILURES MANAGE RESPONSIBILITY SHIPPED WITH.
 *
 * Neither showed an error. That is what makes them worth pinning: a workflow that refuses out loud
 * gets reported, and one that simply does nothing gets abandoned.
 *
 *   1 · The candidate list came from `contacts`, a table with zero rows in the tenant, so every
 *       account offered nobody and said so as though it were a fact about the family.
 *   2 · The preview was read from `data.preview`. A registry-owned command answers
 *       `data.execution_result.preview`, so the fetch succeeded, the payload was undefined, nothing
 *       rendered, and Confirm — which unlocks only on a preview — stayed disabled forever.
 *
 * Source-level, deliberately. Both are wiring, both were invisible to every green test in the
 * repository, and the cost of the next edit re-introducing either is an unreachable capability.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
    path.join(__dirname, "../../app/adminV2/financials/FinancialsResponsibilityPanel.tsx"),
    "utf8",
);

describe("the Manage Responsibility panel", () => {
    it("reads its candidates from the canonical financial resolver", () => {
        expect(panel).toContain("/api/admin/financials/responsibility-candidates");
    });

    /*
     * `contact-options` means "the contacts recorded on this account" and other callers depend on
     * it meaning that. Responsibility asks a different question and must not re-point at it.
     */
    it("no longer reads the empty contacts table", () => {
        expect(panel, "the picker must not go back to contact-options").not.toContain("contact-options");
    });

    it("takes the preview from where a registry-owned command puts it", () => {
        expect(panel).toContain("execution_result?.preview");
    });

    /*
     * A FAILED CANDIDATE READ IS NOT AN EMPTY HOUSEHOLD. "Nobody on this account can be made
     * responsible" is a sentence an operator believes; it may only be said about a household that
     * was actually read.
     */
    it("keeps the parties already on record when the read fails", () => {
        expect(panel).toMatch(/return \{ candidates: fallback, error:/);
    });

    /*
     * THE GRAIN THE PANEL CLAIMS IS THE GRAIN IT WRITES — now a CHOICE rather than a constant.
     *
     * This once asserted `customer_member_id: null` outright, because the panel had silently been
     * passing the child whose charge happened to be open: an operator believed they had arranged
     * the family's responsibility and the sibling's tuition stayed outside it. Pinning it to null
     * was the right fix for that defect and the wrong resting state, because the runtime prefers
     * the MOST SPECIFIC arrangement and a child-grain one was therefore unauthorable.
     *
     * The rule that replaces it keeps the original guarantee: the grain is never an accident of
     * which charge is open. It is the operator's stated scope, defaulting to the household.
     */
    it("writes the scope the operator chose, defaulting to the household", () => {
        expect(panel, "the scope is stated, not inherited from the open charge")
            .toContain("arrangementMemberId: effectiveMemberId");
        /* And both branches of that value are stated — the member select, or the scope choice. */
        expect(panel).toMatch(/effectiveMemberId = administering[\s\S]{0,200}scope === "child" \? customerMemberId : null/);
        expect(panel, "and the payload carries exactly that").toContain("customer_member_id: args.arrangementMemberId");
        expect(panel, "household remains the default").toMatch(/useState<"household" \| "child">\("household"\)/);
    });

    /*
     * NOTHING IS COMMITTED THAT HAS NOT BEEN PREVIEWED. The disabled Confirm is the whole of that
     * guarantee on this surface.
     */
    it("cannot confirm before the action has said what will change", () => {
        /*
         * ASSERTED AS A REQUIREMENT, NOT AS A LITERAL. The first version pinned the exact
         * expression `disabled={busy !== null || !preview}`, so ADDING a guard broke it — the
         * panel now also refuses an arrangement whose shares cannot reconcile, which is strictly
         * more careful than what the lock demanded. A lock that reddens when the code becomes
         * safer is testing the spelling rather than the rule.
         *
         * What must remain true: Confirm is disabled while busy, and disabled until a preview
         * exists. Further guards are welcome.
         */
        const confirm = panel.slice(panel.indexOf('data-financials-responsibility-confirm') - 600,
                                    panel.indexOf('data-financials-responsibility-confirm'));
        expect(confirm, "Confirm is guarded at all").toMatch(/disabled=\{/);
        expect(confirm, "nothing is committed that has not been previewed").toContain("!preview");
        expect(confirm, "and not while a call is in flight").toContain("busy !== null");
    });
});
