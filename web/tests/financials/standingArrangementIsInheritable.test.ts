/**
 * THE STANDING ARRANGEMENT MUST SURVIVE THE TRIP TO THE WRITER.
 *
 * The W7 defect: preview responsibility did not become posted-charge responsibility. The first
 * repair was correct in intent and inert in fact — it parsed `responsiblePartyId` out of
 * `/api/admin/financials/responsibility-positions`, and that route projected only a NAME. Every
 * share failed the card's "a share with no party is not a share this card may act on" filter, so
 * `billing.configure_responsibility` was never called and the charge was created with no
 * allocation under a household that had one on record.
 *
 * Measured on deployed staging before the repair (inheritance-proof-census): one active standing
 * arrangement with one 100% share for Ada Certfree, one posted $40 charge, and ZERO rows in
 * financial_responsibility_allocations.
 *
 * This binds the two halves together: the shape the route emits must be the shape the parser
 * accepts. A test of either alone is what let the defect ship.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { standingArrangementShares } from "@/components/admin/focusPanel/cards/FinancialsCard";

/** Exactly the body `responsibility-positions` returns for a 100% household arrangement. */
const routeBody = {
    customerId: "cust-1",
    household: {
        effectiveStart: "2026-10-01",
        shares: [
            { responsiblePartyId: "party-1", name: "Ada Certfree", method: "percentage", amountCents: null, percentBasisPoints: 10_000 },
        ],
    },
    positions: [],
};

describe("the parser accepts what the route actually sends", () => {
    it("reads a 100% household share into a writable share", () => {
        const shares = standingArrangementShares(routeBody);
        expect(shares).toEqual([
            { responsible_party_id: "party-1", method: "percentage", percent_basis_points: 10_000, amount_cents: null },
        ]);
    });

    it("reads a fixed share into cents", () => {
        const shares = standingArrangementShares({
            household: { shares: [{ responsiblePartyId: "p2", name: "B", method: "fixed", amountCents: 4_000, percentBasisPoints: null }] },
        });
        expect(shares[0]).toMatchObject({ responsible_party_id: "p2", method: "fixed", amount_cents: 4_000 });
    });

    it("DROPS a share with no party — the defect's own symptom, kept as the rule", () => {
        /* A share the writer cannot be keyed on is correctly refused; the bug was the route
           emitting only this shape, not the parser rejecting it. */
        const shares = standingArrangementShares({
            household: { shares: [{ name: "Ada Certfree", method: "percentage", percentBasisPoints: 10_000 }] },
        });
        expect(shares).toEqual([]);
    });

    it("treats an absent arrangement as nothing to inherit", () => {
        expect(standingArrangementShares(null)).toEqual([]);
        expect(standingArrangementShares({ household: null })).toEqual([]);
    });
});

describe("the route emits the id the writer is keyed on", () => {
    const route = readFileSync(
        path.join(process.cwd(), "app/api/admin/financials/responsibility-positions/route.ts"),
        "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    it("projects responsiblePartyId in BOTH share projections", () => {
        const hits = route.match(/responsiblePartyId: share\.responsiblePartyId/g) ?? [];
        expect(
            hits.length,
            "household and per-child both — a child-grain inheritance meets the identical bug",
        ).toBe(2);
    });

    it("still projects the name, because a row prints a name", () => {
        expect((route.match(/name: share\.name/g) ?? []).length).toBe(2);
    });
});
