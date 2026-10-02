/**
 * ADD CHARGE LEAVES THE OBLIGATION DIVIDED, NOT MERELY GOVERNED.
 *
 * Measured on deployed staging: the charge posted, its charge-scoped arrangement named Ada Certfree
 * at 10000 bp, and `financial_responsibility_allocations` was EMPTY — so the ledger read
 * "Not allocated" and Details said, truthfully, "This posted charge is not divided under it."
 *
 * Configuring who owes a charge and dividing its net are two canonical acts. The workflow sequences
 * the EXISTING authorities rather than folding allocation into either of the other two: three
 * governed, independently auditable writes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    financialResponsibilityActions,
    BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/financialResponsibilityActions";

const CARD = readFileSync(
    path.join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
    "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/** The orchestration body, so the assertions cannot be satisfied from elsewhere in the file. */
const ORCHESTRATION = CARD.slice(CARD.indexOf("const applyChargeDecisions"), CARD.indexOf("const commit"));

describe("the resolve authority already exists and admits the grain", () => {
    const resolve = financialResponsibilityActions.find((a) => a.actionKey === BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY);

    it("is registered — nothing new was invented", () => {
        expect(resolve, "billing.resolve_responsibility is the canonical divider").toBeDefined();
    });

    it("admits household grain, so a customer-grain charge can be divided", () => {
        expect(resolve!.supportedEntityTypes).toContain("customer");
    });
});

describe("the workflow sequences all three acts, in order", () => {
    it("configures responsibility and then divides the charge under it", () => {
        const configureAt = ORCHESTRATION.indexOf('run("billing.configure_responsibility"');
        const resolveAt = ORCHESTRATION.indexOf('run("billing.resolve_responsibility"');
        expect(configureAt, "configure is called").toBeGreaterThan(-1);
        expect(resolveAt, "resolve is called").toBeGreaterThan(-1);
        expect(resolveAt, "and it comes after configure").toBeGreaterThan(configureAt);
    });

    it("divides ONLY after configure succeeded", () => {
        /*
         * Dividing a charge under an arrangement that was not saved would divide it under the wrong
         * answer. The call sits in the `else` of the configure failure, not beside it.
         */
        expect(ORCHESTRATION).toMatch(
            /if \(error\) \{[\s\S]{0,200}?failures\.push\(`responsibility for this charge[\s\S]{0,120}?\} else \{[\s\S]{0,400}?run\("billing\.resolve_responsibility"/,
        );
    });

    it("reports a failed division without claiming the charge failed", () => {
        expect(ORCHESTRATION).toMatch(/failures\.push\(`dividing this charge under its responsibility/);
    });

    it("sends only the charge id — the divisible net is the server's to derive", () => {
        const call = ORCHESTRATION.slice(ORCHESTRATION.indexOf('run("billing.resolve_responsibility"'));
        const args = call.slice(0, call.indexOf("}"));
        expect(args).toMatch(/charge_id: chargeId/);
        for (const forbidden of ["amount", "net", "shares", "percent"]) {
            expect(args, `${forbidden} is never sent by the caller`).not.toContain(forbidden);
        }
    });
});

describe("a no-op follows nothing up", () => {
    it("gates the follow-up ids on an actual write, not on an id being present", () => {
        /*
         * charge.add answers `skipped_posted` carrying the EXISTING charge's id. Treating that as
         * created let a duplicate click silently give a historical charge a new arrangement —
         * observed on deployed staging.
         */
        expect(CARD).toMatch(/const WROTE = new Set\(\["created", "recalculated"\]\);/);
        expect(CARD).toMatch(/WROTE\.has\(wroteStatus\) \? answeredChargeIds : \[\]/);
        expect(CARD).toMatch(/\.filter\(\(r\) => WROTE\.has\(\(r\.write_status \?\? ""\)\.trim\(\)\)\)/);
    });

    it("still tells the operator nothing new was created — on the household path too", () => {
        expect(CARD).toMatch(/if \(!wroteSomething && answeredChargeIds\.length > 0\)/);
        expect(CARD).toContain("already exists on this account. Nothing new was created.");
    });
});
