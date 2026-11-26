/**
 * THE PREVIEW AND THE POSTED CHARGE MUST AGREE ABOUT WHO OWES.
 *
 * W7 finding: Add Charge previewed "Dana Alvarez 50% · Rosa Alvarez 50% · household
 * responsibility" and the posted ledger row then read "Responsible party: Not allocated".
 *
 * Both were true, about different subjects — the first is the household's STANDING arrangement,
 * the second is THIS charge's allocation. Census confirmed the cause: the newest allocation row
 * predated the QA charge by six days, so nothing was written for it. Add Charge called
 * `billing.configure_responsibility` only when `chargeToChanging && chargeShares.length > 0` — i.e.
 * only if the operator opened the Charge-to editor and changed it. An operator reading a preview
 * that already said the right thing had no reason to open it.
 *
 * The repair is not a relabel. A charge created under a household that HAS an arrangement inherits
 * it, which is what "divide it under the arrangement in force" means everywhere else here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const executable = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
const CARD = () => executable(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));

describe("a charge inherits the arrangement in force", () => {
    it("writes responsibility when the household has one, not only when the operator edits", () => {
        const src = CARD();
        expect(src, "the standing arrangement is read as shares, not only as a sentence")
            .toContain("const standingShares = standingArrangementShares(responsibilityPositionBody)");
        expect(src, "an override OR a standing arrangement reaches the write")
            .toMatch(/if \(applying \|\| standingShares\.length > 0\)/);
        expect(src, "and the old editor-only condition is gone")
            .not.toMatch(/if \(chargeToChanging && chargeShares\.length > 0\) \{/);
    });

    it("an operator override still wins over the standing arrangement", () => {
        const src = CARD();
        expect(src).toMatch(/const applying = chargeToChanging && chargeShares\.length > 0;/);
        /*
         * ANCHORED AT THE DECLARATION, NOT AT A SUBSTRING. A first cut matched
         * /applying\s*\?\s*chargeShares/, which still matches `false && applying ? chargeShares` —
         * so a plant that disabled the operator override entirely left this green. The condition
         * must BE `applying`, with nothing in front of it.
         */
        expect(src, "the operator's own shares are used when they departed from the arrangement")
            .toMatch(/const shares = applying\s*\?\s*chargeShares/);
        expect(src, "and the arrangement is the fallback, never an override of an override")
            .toMatch(/:\s*standingShares;/);
    });

    it("it still goes through the governed responsibility action, not a direct write", () => {
        const src = CARD();
        expect(src, "one authority writes allocations").toContain('run("billing.configure_responsibility"');
        expect(src, "this card never inserts allocations itself")
            .not.toMatch(/from\("financial_responsibility_allocations"\)/);
    });
});

describe("the shares handed over are the domain's own shape", () => {
    it("a share with no party or no method is not acted on", () => {
        const src = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        const fn = src.slice(src.indexOf("function standingArrangementShares"));
        const body = fn.slice(0, fn.indexOf("\n}\n"));
        expect(body).toMatch(/filter\(\(share\) => share\.responsible_party_id\.length > 0 && share\.method\.length > 0\)/);
    });

    it("percentage and fixed carry their own field, and never each other's", () => {
        const src = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        const fn = src.slice(src.indexOf("function standingArrangementShares"));
        const body = fn.slice(0, fn.indexOf("\n}\n"));
        expect(body).toMatch(/percent_basis_points: share\.method === "percentage"/);
        expect(body).toMatch(/amount_cents: share\.method === "fixed"/);
    });
});
