/**
 * THE DISCOUNTS DRAWER MUST NEVER BE SILENTLY BLANK.
 *
 * W7 finding: the Discount gear opened "DISCOUNTS" with an empty body and Close, from BOTH
 * Financials → Accounts and the Focus Panel.
 *
 * The mount was correct — `discountAdmin` is wired with the real customerId. The surface was not.
 * Opened from the gear the panel mounts with `hostedOpen`, which renders the MANAGE surface and
 * skips the inline summary where `loading` and `error` live; and the manage surface rendered only
 * `childRows.map(...)`, where childRows is built by iterating POLICIES. So no configured policies,
 * a read in flight, or a failed read each produced a blank body.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PANEL = () => read("app/adminV2/financials/FinancialsDiscountPanel.tsx");
const manageSurface = () => {
    const s = PANEL();
    const from = s.indexOf("{manageOpen ? (");
    return s.slice(from, s.indexOf("childRows.map((child) => (", from));
};

describe("every blank path now says which state it is", () => {
    it("the hosted manage surface states loading, error and empty", () => {
        const m = manageSurface();
        for (const state of ["loading", "error", "empty"]) {
            expect(m, `the hosted surface must name its ${state} state`).toContain(
                `data-financials-discount-admin-state="${state}"`,
            );
        }
    });

    it("an empty position is a claim about the family, not a shrug", () => {
        expect(manageSurface(), "it says what is absent and for whom")
            .toContain("No discount policies are configured for this family.");
    });

    it("the three states are distinguishable from one another", () => {
        /*
         * A read in flight and a family with no policies are different facts. Rendering either as
         * the other is the defect wearing a new face, so each carries its own marker.
         */
        const m = manageSurface();
        const markers = [...m.matchAll(/data-financials-discount-admin-state="(\w+)"/g)].map((x) => x[1]);
        expect(new Set(markers).size, "three distinct states").toBe(3);
    });
});

describe("the mount was never the cause", () => {
    it("the overlay supplies the real account to the panel", () => {
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        /* The RENDER branch, not the earlier guard clause that merely mentions the same overlay. */
        const overlay = card.slice(card.indexOf('if (overlay === "discount_admin" && vm && customerId) {'));
        const upto = overlay.slice(0, overlay.indexOf("</UniversalCard>"));
        expect(upto, "the panel is given the household it is about").toContain("customerId={customerId}");
        expect(upto, "and seeded with the position already read").toContain("initialPosition={discountPositionBody}");
    });

    it("both surfaces reach the same panel, so neither can be repaired alone", () => {
        /*
         * Accounts and the Focus Panel both open this through the card's own overlay, so there is
         * one surface to fix and one truth to show. A fork here would be two Discounts.
         */
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect((card.match(/<FinancialsDiscountPanel/g) ?? []).length, "one discount panel").toBe(1);
    });
});
