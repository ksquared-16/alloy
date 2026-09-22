/**
 * ADD CHARGE DECIDES ABOUT THIS CHARGE — and writes those decisions against the charge it made.
 *
 * Two authority decisions became reachable here and nowhere else:
 *
 *   1. CHARGE > CHILD > HOUSEHOLD. A charge-scoped arrangement answers "who owes THIS obligation"
 *      and supersedes neither standing answer. The column, the no-overlap constraint and the
 *      per-scope supersession were all built before anything could reach them — the action did not
 *      read a charge id, so every arrangement the product could author was standing.
 *
 *   2. A policy can be excluded from ONE charge, with a reason, instead of being countered by an
 *      adjustment that reads as a decision about the family.
 *
 * Both are keyed by a charge id that does not exist until `charge.add` returns one, so both run
 * AFTER the create. That ordering is the whole design, and it is what these locks hold.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const CMD = "components/operationalCards/AddChargeCommand.tsx";
const ARRANGEMENT = "lib/financials/responsibility/arrangementService.ts";
const RESP_ACTIONS = "lib/adminV2/actions/definitions/financialResponsibilityActions.ts";
const RED_ACTIONS = "lib/adminV2/actions/definitions/financialReductionActions.ts";
const EXCLUSIONS = "lib/financials/reductions/chargePolicyExclusionService.ts";

describe("the charge scope reaches the authority it was built for", () => {
    it("the action forwards a charge id to the service", () => {
        /*
         * The gap this closes: `charge_id` existed on the table, the service accepted `chargeId`,
         * and the action in between read neither — so the narrowest scope was unreachable from
         * every surface in the product.
         */
        expect(code(RESP_ACTIONS), "the action reads a charge id").toContain("charge_id");
        expect(code(RESP_ACTIONS), "and hands it to the service as the scope")
            .toMatch(/chargeId:\s*t\(payload\?\.charge_id\)/);
    });

    it("a charge-scoped arrangement cannot be attached to another account's charge", () => {
        /*
         * The org-parity trigger refuses another ORGANISATION's charge. It cannot refuse another
         * HOUSEHOLD's, which is the mistake a ledger-row id can actually make — and the result
         * would read as deliberate on every screen that rendered it.
         */
        const service = code(ARRANGEMENT);
        expect(service, "the charge's own account is resolved").toContain("resolveAllocatableNet");
        expect(service, "and a mismatch is refused, not logged")
            .toContain("charge_belongs_to_another_account");
        const guard = service.slice(service.indexOf("if (input.chargeId)"));
        expect(guard.slice(0, 1400), "the check runs before anything is written")
            .toMatch(/throw new ResponsibilityError/);
        expect(service.indexOf("if (input.chargeId)"), "and before the insert")
            .toBeLessThan(service.indexOf(".insert({"));
    });

    it("supersession stays per scope", () => {
        /* A charge-scoped arrangement closing the standing one would defeat the point of scoping. */
        expect(code(ARRANGEMENT)).toMatch(/\.filter\(\(p\) => \(p\.charge_id \?\? null\) === \(input\.chargeId \?\? null\)\)/);
    });
});

describe("waiving a discount for one charge is a decision with a reason", () => {
    it("the action exists and is registered", () => {
        const actions = code(RED_ACTIONS);
        expect(actions).toContain('BILLING_WAIVE_CHARGE_DISCOUNT_ACTION_KEY = "billing.waive_charge_discount"');
        expect(actions, "and the way back exists too")
            .toContain('BILLING_RESTORE_CHARGE_DISCOUNT_ACTION_KEY = "billing.restore_charge_discount"');
        const list = actions.slice(actions.indexOf("export const financialReductionActions"));
        expect(list).toContain("waiveChargeDiscount");
        expect(list).toContain("restoreChargeDiscount");
    });

    it("refuses a waiver with no reason, as a command and as a write", () => {
        /*
         * TWO REFUSALS OF ONE RULE, to two audiences: the command refuses before the operator
         * confirms, the service refuses before anything reaches the table. Neither is redundant —
         * an exclusion in the table without a reason is already the unattributable decision the
         * model exists to prevent, and being told so afterwards is being told too late.
         */
        expect(code(RED_ACTIONS), "the command refuses first").toContain("reason_required");
        expect(code(EXCLUSIONS), "and the service refuses independently").toContain("reason_required");
    });

    it("takes the grant that governs changing what is owed", () => {
        /*
         * Applying authored policy is billing — the machine runs and decides nothing. REFUSING
         * authored policy for one charge increases what a real family owes, which is the same
         * class of act as adjusting an account by hand.
         */
        const actions = code(RED_ACTIONS);
        const waive = actions.slice(actions.indexOf("const waiveChargeDiscount"));
        expect(waive.slice(0, 4000)).toContain("BILLING_ADJUST_PERMISSION");
        expect(waive.slice(0, 4000), "and permission is checked on execute, not only on eligibility")
            .toMatch(/async execute[\s\S]{0,400}BILLING_ADJUST_PERMISSION/);
    });

    it("the charge and the policy reach the service, not just the payload", () => {
        /*
         * A waiver that loses its charge id writes nothing, or worse writes against whatever the
         * service defaults to — and the command reports success either way, because the refusal
         * it checks is the service's and the service was never told which charge.
         */
        const actions = code(RED_ACTIONS);
        const waive = actions.slice(actions.indexOf("const waiveChargeDiscount"));
        const call = waive.slice(waive.indexOf("createChargePolicyExclusion"));
        expect(call.slice(0, 500)).toMatch(/chargeId:\s*t\(payload\?\.charge_id\)/);
        expect(call.slice(0, 500)).toMatch(/policyId:\s*t\(payload\?\.policy_id\)/);
        expect(call.slice(0, 500)).toMatch(/reason:\s*t\(payload\?\.reason\)/);
    });

    it("an exclusion states applicability, never an amount", () => {
        const actions = code(RED_ACTIONS);
        const waive = actions.slice(actions.indexOf("const waiveChargeDiscount"));
        expect(waive.slice(0, 4000)).toContain("POLICY_FORBIDDEN_FIELDS");
    });

    it("lifting a waiver reports which charge, not a bare boolean", () => {
        /* A caller needs to know WHAT to re-read, and why a lift did nothing. */
        const service = code(EXCLUSIONS);
        const end = service.slice(service.indexOf("export async function endChargePolicyExclusion"));
        expect(end).toMatch(/Promise<ChargeExclusionResult>/);
        expect(end, "only a waiver still in force can be lifted").toContain('.is("ended_at", null)');
    });
});

describe("the command offers the decisions and the host applies them", () => {
    it("the operator's default changes nothing", () => {
        /*
         * An operator who touches neither control must create no charge-scoped anything. The
         * account's standing arrangement governs exactly as it did before these controls existed.
         */
        const card = code(CARD);
        expect(card).toMatch(/useState<"account" \| "charge">\("account"\)/);
        expect(card, "and the follow-up runs only under the charge scope")
            .toMatch(/chargeScope === "charge" && chargeShares\.length > 0/);
    });

    it("choosing the charge scope does not pre-fill the standing answer", () => {
        /*
         * A pre-filled copy gets committed unread, producing a charge-scoped duplicate of the
         * answer that already governed — an override that overrides nothing, and which hides the
         * next real change to the standing arrangement.
         */
        const card = code(CARD);
        const onScope = card.slice(card.indexOf("onScope:"));
        expect(onScope.slice(0, 700)).toMatch(/partyId: "", method: "percentage", value: ""/);
    });

    it("the reason is asked for only once a waiver is chosen", () => {
        const cmd = code(CMD);
        expect(cmd).toMatch(/waivedPolicyIds\.length > 0 \?[\s\S]{0,600}data-addcharge-waiver-reason/);
    });

    it("remainder takes no number", () => {
        /* It is defined as what is left; a box to type one in invites a figure the domain ignores. */
        expect(code(CMD)).toMatch(/share\.method === "remainder" \?[\s\S]{0,200}whatever is left/);
    });

    it("the share vocabulary is the domain's three methods and no fourth", () => {
        const cmd = code(CMD);
        const list = cmd.slice(cmd.indexOf("const SHARE_METHODS"), cmd.indexOf("const SHARE_METHODS") + 400);
        for (const method of ["percentage", "fixed", "remainder"]) {
            expect(list).toContain(`"${method}"`);
        }
        expect(cmd).toMatch(/type ShareMethod = "percentage" \| "fixed" \| "remainder"/);
    });

    it("the preview states both decisions and computes neither", () => {
        /*
         * The preview is the only place the two decisions appear together, so it is where an
         * operator sees what they are about to commit. What it must NOT do is put a number on
         * them: what a waived policy would have been worth is the resolver's answer about a
         * charge that does not exist yet, and a figure invented here would make this card a
         * second reduction authority.
         */
        const cmd = code(CMD);
        expect(cmd).toContain('data-addcharge-preview-responsibility="true"');
        expect(cmd).toContain('data-addcharge-preview-waivers="true"');
        expect(cmd, "a waived policy states applicability, not money")
            .toMatch(/data-addcharge-preview-waivers[\s\S]{0,1200}does not apply/);
        expect(cmd, "and the standing arrangement is declared untouched")
            .toContain('data-addcharge-preview-standing="true"');
        const waivers = cmd.slice(cmd.indexOf('data-addcharge-preview-waivers="true"'));
        expect(waivers.slice(0, 1200), "no arithmetic on the waived amount")
            .not.toMatch(/amountCents|\* 100|toFixed\(/);
    });

    it("no native select reaches the new controls", () => {
        /* Every dropdown on a touched surface is the platform's, never a raw <select>. */
        expect(code(CMD).match(/<select\b/g) ?? []).toHaveLength(0);
    });
});

describe("orchestration runs against the charges that exist", () => {
    it("the follow-up work is keyed by the ids the create returned", () => {
        const card = code(CARD);
        expect(card, "multi-child reports per child").toContain("per_child");
        expect(card, "single reports one").toContain("affectedId");
        expect(card).toMatch(/applyChargeDecisions\(createdChargeIds\)/);
    });

    it("a failed follow-up does not unmake the charge", () => {
        /*
         * The charge is canonical the instant it is written. Reversing it because a waiver failed
         * would destroy real money to tidy up a follow-up, so refusals are collected and reported
         * and every step stays independently retryable.
         */
        const card = code(CARD);
        const orchestration = card.slice(card.indexOf("const applyChargeDecisions"));
        const body = orchestration.slice(0, orchestration.indexOf("const commit"));
        expect(body, "no reversal is attempted").not.toContain("charge.reverse");
        expect(body, "refusals are collected").toMatch(/failures\.push/);
    });

    it("partial completion is reported rather than rounded to success", () => {
        /*
         * An operator told only "done" would believe a waiver stands that does not, and would find
         * out from an invoice. The command stays open, naming what DID happen first.
         */
        const card = code(CARD);
        expect(card).toMatch(/followUpFailures\.length > 0/);
        expect(card, "the charge is named as real before the failure is named")
            .toMatch(/charges? (was|were) created[\s\S]{0,200}did not complete/);
        const at = card.indexOf("if (followUpFailures.length > 0)");
        /* The branch itself, not a window that runs on into the success path below it. */
        const branch = card.slice(at, card.indexOf("setPending(null);", at));
        expect(branch, "and the command does not close on a partial outcome").toContain("return;");
        expect(branch, "nor discard the decisions the operator must retry")
            .not.toContain("resetChargeDecisions()");
    });

    it("an abandoned command leaves nothing behind", () => {
        /*
         * There is deliberately no durable charge-intent model: the decisions are React state, so
         * cancelling writes nothing and reconciles nothing.
         */
        const card = code(CARD);
        const cancel = card.slice(card.indexOf("onCancel: () => {"));
        expect(cancel.slice(0, 500)).toContain("resetChargeDecisions()");
    });
});

describe("two Waives, two grains, and they must not blur", () => {
    /*
     * The family card now says "Waive discount" for a RELATIONSHIP-level exception; Add Charge has
     * said "Waive" for a CHARGE-level exclusion since it was built. Same verb, same operator word,
     * deliberately — and two different decisions about two different amounts of money.
     *
     * Waiving at the relationship stops the policy reducing every charge that relationship
     * produces, until somebody restores it. Waiving on one charge leaves the policy in force
     * everywhere else. If either surface ever routed to the other's authority, an operator would
     * make the larger decision while believing they had made the smaller one.
     */
    it("the family card waives a relationship, through the relationship authority", () => {
        const panel = code("app/adminV2/financials/FinancialsDiscountPanel.tsx");
        expect(panel, "the relationship exception service").toMatch(/runException\("create"/);
        expect(panel, "and never the charge-level one")
            .not.toContain("billing.waive_charge_discount");
    });

    it("Add Charge waives one charge, through the charge authority", () => {
        const card = code(CARD);
        expect(card).toContain("billing.waive_charge_discount");
        const orchestration = card.slice(card.indexOf("const applyChargeDecisions"));
        const body = orchestration.slice(0, orchestration.indexOf("const commit"));
        expect(body, "keyed by the charge it just created").toMatch(/charge_id: chargeId/);
        expect(body, "and never the relationship exception")
            .not.toMatch(/except_commercial_policy/);
    });

    it("each surface says which grain it is about", () => {
        const cmd = code(CMD);
        expect(cmd, "Add Charge is explicit that it means this charge")
            .toMatch(/waived for this charge/i);
        const labels = code("lib/financials/reductions/reductionReasonLabels.ts");
        expect(labels, "and the reason codes stay distinct")
            .toMatch(/excluded_by_charge_exception:\s*"Waived for this charge"/);
        expect(labels).toMatch(/excluded_by_exception:/);
    });
});
