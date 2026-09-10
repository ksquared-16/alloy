/**
 * THE ROLE EDITOR CAN GRANT AND WITHHOLD FINANCIALS.
 *
 * It could not, and the reason was not a missing screen. `unenforcedPermissionKeys.json` still
 * listed `fin.read` and `fin.write` as keys nothing consults, so `rowEnforcement` called the whole
 * `fin` row inert, `offerableLevelsForRow` returned `["none"]`, and the editor rendered no radio at
 * all — while the server enforced Financials the entire time. The taxonomy had no home for the
 * group either, so all five live keys landed in "Not yet mapped to a product area".
 *
 * ── WHY THIS IS ASSERTED OVER THE CATALOG RATHER THAN OVER A LIST OF CONTROLS ──
 *
 * The mission sketched a Financials group with eight checkboxes. Eight is not what the platform
 * owns: `charge.post` is `fin.write` and `charge.reverse` is `fin.adjust`, so "post/reverse charges"
 * is not separately grantable and a checkbox for it would claim control over an authority the
 * server does not distinguish. `IA-R6` forbids exactly that — simulating unbuilt capability — and a
 * control that changes nothing is `T-6`, which is what this file exists to prevent.
 *
 * So the group is what the five keys actually own, and the assertions are about the properties that
 * make it a real editor: every capability reachable, no dead control offered, and a preset that
 * moves only its own rows.
 */
import { describe, expect, it } from "vitest";

import {
    buildPermissionGridRows,
    levelFromGrantedKeys,
    offerableLevelsForRow,
    rowEnforcement,
} from "@/lib/admin/permissionGrid";
import { areaForRow } from "@/lib/access/capabilityTaxonomy";
import { applyAreaPreset, areaLevelLabel, buildCapabilityMatrix, offerableAreaLevels } from "@/lib/access/capabilityMatrix";
import { discoverCatalogEntries } from "./permissionCatalogDiscovery";

const CATALOG = discoverCatalogEntries();
const GRID = buildPermissionGridRows(CATALOG);
const FINANCIAL_KEYS = ["fin.read", "fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy"] as const;

function financialsArea(granted: ReadonlySet<string>) {
    const area = buildCapabilityMatrix(GRID, granted).find((a) => a.areaKey === "financials");
    expect(area, "the role editor has no Financials group at all").toBeTruthy();
    return area!;
}

describe("the Financials capability group", () => {
    it("exists as its own operator area, not as a corner of Billing", () => {
        const area = financialsArea(new Set());
        expect(area.label).toBe("Financials");
        // Billing's two keys are enforced by nothing; filing the live keys beside them would put the
        // product's actual money authority under a heading whose other rows change nothing.
        const rowIds = area.rows.map((r) => r.id).sort();
        expect(rowIds).toEqual(["fin", "fin.adjust", "fin.responsibility", "fin.subsidy"]);
    });

    it("reaches every Financials capability the platform enforces — none is ungrantable", () => {
        const area = financialsArea(new Set());
        const reachable = new Set(area.rows.flatMap((r) => [...r.readKeys, ...r.writeKeys]));
        for (const key of FINANCIAL_KEYS) {
            expect(reachable.has(key), `${key} cannot be granted from the product`).toBe(true);
        }
    });

    /*
     * THE ASSERTION THAT WAS FALSE BEFORE THIS SPRINT. `View Financials` and `Manage Financials` are
     * controls an administrator can actually set. Written per column, because that is the grain the
     * control has: a row-level verdict would either hide a real capability or keep offering an inert
     * one.
     */
    it("offers View and Manage on the row that carries fin.read and fin.write", () => {
        const fin = financialsArea(new Set()).rows.find((r) => r.id === "fin")!;
        expect(fin.readKeys).toEqual(["fin.read"]);
        expect(fin.writeKeys).toEqual(["fin.write"]);
        const enforcement = rowEnforcement(fin);
        expect(enforcement.readEnforced, "fin.read is enforced by five workspace routes").toBe(true);
        expect(enforcement.writeEnforced, "fin.write is enforced by six registered actions").toBe(true);
        expect(offerableLevelsForRow(fin)).toEqual(["none", "read", "write"]);
    });

    it("offers no dead control anywhere in the group", () => {
        for (const row of financialsArea(new Set()).rows) {
            for (const level of offerableLevelsForRow(row)) {
                if (level === "none") continue;
                const keys = level === "read" ? row.readKeys : row.writeKeys;
                expect(keys.length, `${row.id} offers ${level} with no key behind it`).toBeGreaterThan(0);
            }
        }
        expect(offerableAreaLevels(financialsArea(new Set()))).toContain("write");
    });

    /*
     * A LEVEL IS A PRESET OVER REAL ROWS, NEVER A STORED VALUE — and `H2`/`RL-48` is why the preset
     * may not be implemented as "replace this role's grants with the area's keys". A role holds keys
     * this screen cannot draw, and a save that dropped them would revoke them silently.
     */
    it("granting the whole area touches only Financials keys", () => {
        const area = financialsArea(new Set());
        const elsewhere = new Set(["crm.customers.read", "settings.users_roles", "health.view"]);
        const next = applyAreaPreset({ area, level: "write", granted: elsewhere });
        for (const key of elsewhere) expect(next.has(key), `${key} was revoked by a Financials preset`).toBe(true);
        for (const key of FINANCIAL_KEYS) expect(next.has(key), `${key} was not granted`).toBe(true);
    });

    it("withholding the whole area removes only Financials keys", () => {
        const area = financialsArea(new Set(FINANCIAL_KEYS));
        const held = new Set<string>([...FINANCIAL_KEYS, "crm.customers.read"]);
        const next = applyAreaPreset({ area, level: "none", granted: held });
        for (const key of FINANCIAL_KEYS) expect(next.has(key), `${key} survived a withhold`).toBe(false);
        expect(next.has("crm.customers.read"), "an unrelated capability was revoked").toBe(true);
    });

    /*
     * AND THE GROUP REPORTS ITS OWN ARITHMETIC RATHER THAN ROUNDING. A role that may bill but may
     * not forgive is neither "Manage" nor "View", and calling it either is an authority misstatement
     * an administrator would act on.
     */
    it("names a partially-granted Financials role Limited, with the count", () => {
        const area = financialsArea(new Set(["fin.read", "fin.write"]));
        expect(area.level).toBe("limited");
        expect(areaLevelLabel(area)).toBe(`Limited · ${area.granted} of ${area.enforcedTotal}`);
        expect(area.granted).toBeLessThan(area.enforcedTotal);

        const full = financialsArea(new Set(FINANCIAL_KEYS));
        expect(full.level).toBe("manage");
        expect(areaLevelLabel(full)).toBe("Manage");

        const readOnly = financialsArea(new Set(["fin.read"]));
        expect(readOnly.level, "a viewer is not a manager and not 'no access'").toBe("limited");
        expect(levelFromGrantedKeys(readOnly.rows.find((r) => r.id === "fin")!, new Set(["fin.read"]))).toBe("read");
    });

    it("files every fin key in Financials and nothing else there", () => {
        for (const row of GRID) {
            const isFinancial = [...row.readKeys, ...row.writeKeys].some((k) => k.startsWith("fin."));
            expect(areaForRow(row) === "financials", `${row.id} is filed wrong`).toBe(isFinancial);
        }
    });
});
