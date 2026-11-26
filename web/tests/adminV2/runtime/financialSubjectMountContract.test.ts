/**
 * A CARD MAY NOT BE MOUNTED ON A SUBJECT IT CANNOT RESOLVE.
 *
 * ── THE DEFECT THIS EXISTS TO CATCH ──
 *
 * Mounted twice on a Waitlist record (Lennox Kurzman, Tour Scheduled, North Campus, two children):
 * the Enrollment and Children cards fully resolved, and Financials rendered its terminal state.
 * Not an early frame — the siblings had settled.
 *
 * The Focus Panel mounts Financials through TWO different paths, and only one of them asks whether
 * the subject has a financial identity at all:
 *
 *   · COMMIT — `MOUNTABLE_CARD_SPECS` admits Financials only when `identityKnowable(context)` finds
 *     a household key in the composed truth. No identity, no card: the grid reserves the cell.
 *
 *   · SETTLED — `deriveOpportunityFocusPanelCards` places `financials` unconditionally, as
 *     configuration. Nothing asks whether a customer can be resolved from the settled context.
 *
 * So a subject whose truth carries no household key gets no Financials at commit and then gets one
 * at settlement that can never resolve an account — which is precisely the observed shape: siblings
 * rendered, Financials terminal, on a family whose `opportunities.customer_id` is not null.
 *
 * These pin the contract rather than the symptom. The repair is not to hide the card at settlement:
 * the product law says an opportunity with a customer HAS a financial subject, so the identity must
 * reach the composed context. What must never return is the two paths disagreeing about whether
 * identity is required at all.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { HOUSEHOLD_IDENTITY_TRUTH_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";

const root = path.join(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const commitPath = read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts");
const settledPath = read("lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts");
const registry = read("lib/adminV2/runtime/focusPanel/focusPanelMountableCards.ts");

/** The card's own rule for what counts as a financial subject, quoted rather than re-implemented. */
function resolvesCustomer(truth: Record<string, unknown>): boolean {
    return HOUSEHOLD_IDENTITY_TRUTH_KEYS.some((key) => {
        const value = truth[key];
        return value != null && String(value).trim() !== "";
    });
}

describe("the financial subject contract", () => {
    /*
     * THE PRODUCT LAW, STATED AS AN INVARIANT. An opportunity record carrying a customer HAS a
     * financial subject — the terminal "account unavailable" state must be unreachable for it.
     */
    it("resolves a customer from any record that carries one, whatever the grain", () => {
        const caseRecord = { id: "opp-1", stage_key: "waitlist", customer_id: "cust-1" };
        expect(resolvesCustomer(caseRecord), "a waitlist case with a customer is a financial subject").toBe(
            true,
        );

        const childShaped = { id: "opp-1", stage_key: "waitlist", "child.family_customer_id": "cust-1" };
        expect(resolvesCustomer(childShaped), "a child's family account is the same account").toBe(true);
    });

    /*
     * AND THE NEGATIVE, so the invariant is not vacuous: a record that names the case and the child
     * but never the household cannot resolve one. This is the candidate-grain shape the Waitlist
     * opens with — case id, child id, no account — and it is the shape the terminal state is FOR.
     */
    it("cannot resolve a customer from a case-and-child record that names no household", () => {
        const candidateShaped = {
            id: "cand-1",
            opportunity_id: "opp-1",
            customer_member_id: "cm-1",
            stage_key: "waitlist",
        };
        expect(
            resolvesCustomer(candidateShaped),
            "naming the case is not naming the account — this is the state the defect lives in",
        ).toBe(false);
    });

    /*
     * ── THE SPLIT BRAIN ────────────────────────────────────────────────────────────────────────
     *
     * The commit path asks. If the settled path does not, a subject can be refused a card at commit
     * and handed one at settlement that cannot answer — and the operator reads the difference as a
     * statement about their family's money.
     */
    it("mounts Financials at commit only when the subject has a financial identity", () => {
        expect(commitPath, "the commit path gates on identity").toMatch(
            /if \(!spec\.identityKnowable\(context\)\) continue;/,
        );
        expect(registry).toMatch(/key: "financials"[\s\S]{0,200}identityKnowable: hasHouseholdIdentity/);
    });

    /*
     * THE FAILING HALF, PINNED AS A KNOWN DEFECT.
     *
     * `deriveOpportunityFocusPanelCards` places `financials` with no identity condition at all. This
     * assertion documents the current state and will fail the moment the settled path starts asking
     * — which is the change that closes this defect, and the moment this case must be rewritten to
     * demand the gate rather than record its absence.
     *
     * It is deliberately not a passing assertion about correct behaviour. The two paths disagree
     * today, and a test suite that did not say so would let the disagreement look intentional.
     */
    it("records that the settled path still places Financials without asking for identity", () => {
        const financialsPlacement = settledPath.slice(
            settledPath.indexOf('map.set(\n        "financials"'),
            settledPath.indexOf('map.set(\n        "billing_preview"'),
        );
        expect(financialsPlacement.length, "the settled placement must be locatable").toBeGreaterThan(0);
        expect(
            /identityKnowable|customer|household/.test(financialsPlacement),
            "KNOWN DEFECT: settlement places Financials unconditionally while commit gates on identity. "
                + "When this starts failing, the split-brain is closed — make the assertion demand the gate.",
        ).toBe(false);
    });
});
