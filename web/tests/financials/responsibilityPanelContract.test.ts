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
     * NOTHING IS COMMITTED THAT HAS NOT BEEN PREVIEWED. The mechanism changed; the guarantee did
     * not, and the guarantee is what this lock exists for.
     */
    it("cannot commit before the action has said what will change", () => {
        /*
         * ── THE RULE, TWICE REHOMED, AND STRICTLY STRONGER EACH TIME ─────────────────────────
         *
         * V1 pinned the literal `disabled={busy !== null || !preview}`, so ADDING a reconciliation
         * guard broke it — a lock that reddens when the code becomes safer is testing the spelling.
         *
         * V2 followed the named reason: `confirmBlocker !== null`, with `!preview ?` as one of its
         * branches. W7-F003 then asked the better question — must Preview be a separate mandatory
         * click at all? It must not. What a financial change needs is that the operator SEES the
         * effect before it is committed, not that they find an extra button.
         *
         * V3 is the current rule and it is structural rather than a precondition: there is ONE
         * primary control with a `stage`, the stage is `commit` only when a preview exists, and
         * `execute` is reachable only from the commit stage. An unpreviewed commit is not guarded
         * against — it is unreachable.
         */
        expect(panel, "the stage is derived from whether a preview exists").toMatch(
            /const stage:\s*"review"\s*\|\s*"commit"\s*=\s*preview\s*\?\s*"commit"\s*:\s*"review"/,
        );
        expect(panel, "and execute is reachable only from the commit stage").toMatch(
            /run\(stage === "commit" \? "execute" : "preview"\)/,
        );

        /*
         * A STALE PREVIEW IS NOT A PREVIEW. Found while making the control staged, and it was a
         * defect under the two-button flow too: preview, then edit an amount, then confirm
         * committed a split nobody had reviewed. Any edit invalidates it, which also returns the
         * control to its review stage.
         */
        expect(panel, "an edit invalidates the preview it no longer describes").toMatch(
            /setPreview\(null\);\s*\n\s*\},\s*\[shares, effectiveStart\]\)/,
        );

        /*
         * AND A DISABLED PRIMARY ALWAYS STATES ITS UNMET REQUIREMENT (W7-F003D). Measured on
         * deployed before the repair: `confirmDisabled: true`, `reconciliationMessage: null`, no
         * visible requirement anywhere. The button now derives its disabled state from a named
         * reason, so a blocking condition cannot be added without a sentence for it.
         */
        const primary = panel.slice(
            panel.indexOf("data-financials-responsibility-stage=") - 900,
            panel.indexOf("data-financials-responsibility-stage="),
        );
        expect(primary, "the primary is guarded at all").toMatch(/disabled=\{/);
        expect(primary, "and derives from the stated reason").toContain("confirmBlocker !== null");
        expect(primary, "and not while a call is in flight").toContain("busy !== null");
        expect(panel, "the unmet requirement is shown to the operator").toContain(
            "data-financials-responsibility-confirm-blocker",
        );
        /* And when nothing is unmet, the control still says which half of the sequence it performs. */
        expect(panel, "the stage is stated even when nothing blocks").toContain(
            "data-financials-responsibility-stage-hint",
        );
    });
});
