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
     * NOTHING IS COMMITTED THAT HAS NOT BEEN PREVIEWED. The disabled Confirm is the whole of that
     * guarantee on this surface.
     */
    it("cannot confirm before the action has said what will change", () => {
        expect(panel).toMatch(/disabled=\{busy !== null \|\| !preview\}/);
    });
});
