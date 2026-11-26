/**
 * Financials navigation answers to effective access — and never becomes the thing that enforces it.
 *
 * The mission's clause is two-sided and both sides are asserted here, because implementing one
 * without the other is how a product acquires a security hole that looks like a feature:
 *
 *   - a principal with no Financials read access is not offered the surface;
 *   - the direct API refuses anyway, and would refuse if this module did not exist.
 *
 * The second is proved where it lives — `assertFinancialsReadAllowed` and the registered financial
 * actions, each with their own tests. What this file holds is the first, plus the property that
 * makes the first safe to ship: an UNKNOWN capability set offers the surface rather than hiding it.
 */
import { describe, expect, it } from "vitest";

import { offersFinancialsSurface } from "@/lib/access/financialsSurfaceVisibility";
import { FINANCIALS_READ_PERMISSION_KEY } from "@/lib/financials/financialsPermissions";

describe("Financials surface visibility", () => {
    it("offers the surface to a principal who holds fin.read", () => {
        expect(offersFinancialsSurface([FINANCIALS_READ_PERMISSION_KEY])).toBe(true);
        expect(offersFinancialsSurface(["crm.customers.read", FINANCIALS_READ_PERMISSION_KEY])).toBe(true);
    });

    it("withholds it from a principal whose grants are known and do not include it", () => {
        expect(offersFinancialsSurface([])).toBe(false);
        expect(offersFinancialsSurface(["crm.customers.read", "reports.read"])).toBe(false);
    });

    /*
     * THE DIRECTION THIS FAILS IN IS A DECISION, NOT AN OVERSIGHT.
     *
     * `AdminAuthProvider` is mounted from several shells and `permissionKeys` is optional on all of
     * them. A mount that does not pass it must not hide Financials from an operator who holds the
     * grant — that is the operator report this whole workstream began with, arriving from the other
     * side: instead of a workspace that says "you don't have access", a nav item that is simply
     * gone, with nothing to explain it and nothing to ask an administrator about.
     *
     * Failing open is safe here for one reason only, and it is the reason stated everywhere else in
     * this slice: the server is authoritative. An operator offered a surface they cannot read is
     * told so, in words, by a route that checked.
     */
    it("offers the surface when the capability set is UNKNOWN, not when it is empty", () => {
        expect(offersFinancialsSurface(null)).toBe(true);
        expect(offersFinancialsSurface(undefined)).toBe(true);
        // …and the two are genuinely different answers, which is the whole point.
        expect(offersFinancialsSurface([])).toBe(false);
    });

    it("asks for the same key the server enforces, not a copy of it", () => {
        // A second literal would be a second permission vocabulary: the surface could then be
        // gated on a key nothing enforces, or enforcement could move and leave the nav behind.
        expect(FINANCIALS_READ_PERMISSION_KEY).toBe("fin.read");
        expect(offersFinancialsSurface(["fin.read"])).toBe(true);
        expect(offersFinancialsSurface(["fin.write"])).toBe(false);
    });

    /*
     * READ IS THE KEY, NOT WRITE. A role granted `fin.write` and not `fin.read` is a configuration
     * mistake rather than a persona, but the nav must not paper over it: offering the workspace to
     * someone whose every read will be refused produces exactly the screen this work removed.
     */
    it("does not treat write authority as a substitute for read", () => {
        expect(offersFinancialsSurface(["fin.write", "fin.adjust", "fin.subsidy"])).toBe(false);
    });
});
