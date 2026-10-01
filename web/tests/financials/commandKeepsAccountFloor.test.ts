/**
 * A COMMAND IS A LAYER OVER THE ACCOUNT, NEVER INSTEAD OF IT.
 *
 * Measured mounted on deployed staging (certification/financials/w7-repair-1/after-add-charge.png):
 * opening Add from Financials → Accounts drew the command over an EMPTY right pane —
 * `data-financials-detail-account` absent from the document, the ledger at zero rows — because
 * every command branch returned straight out of the component while Details is the floor of that
 * host. The scrim doctrine (`financialsSurfaceRole`) already distinguished floor from command; it
 * was simply never given a floor to describe.
 *
 * These assertions are shaped against CALLS and STRUCTURE, not against names appearing somewhere
 * in the file: a name survives the deletion of the thing that uses it, and a guard that a planted
 * regression leaves green is not a guard.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
    path.join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
    "utf8",
);

/** Comments carry the vocabulary too, so every structural claim is made against code alone. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const COMMAND_GUARD = /if \(overlay === "(add_charge|payment|responsibility_admin|discount_admin|payments_admin)"/g;

describe("a command never replaces the account it is about", () => {
    it("collects the command surfaces instead of returning them", () => {
        const opener = CODE.indexOf("const commandSurface = (() => {");
        expect(opener, "the commands are collected into a surface").toBeGreaterThan(-1);
        const floorOpener = CODE.indexOf("const detailFloor = (() => {");
        expect(floorOpener, "the floor is collected too").toBeGreaterThan(opener);

        /* EVERY command guard must sit inside the collector — none may escape it as an early return. */
        const guards = [...CODE.matchAll(COMMAND_GUARD)];
        expect(guards.length, "all five commands are present").toBeGreaterThanOrEqual(5);
        for (const g of guards) {
            expect(
                g.index! > opener && g.index! < floorOpener,
                `the ${g[1]} command is inside the collector, not an early return`,
            ).toBe(true);
        }
    });

    it("renders the floor beneath the command in the host where Details is the floor", () => {
        /* The fragment itself, not the two names in the same file. */
        expect(
            /return detailsAreTheSurface && detailFloor \?\s*\(\s*<>\s*\{detailFloor\}\s*\{commandSurface\}\s*<\/>/.test(CODE),
            "the workspace renders floor then command, in that order",
        ).toBe(true);
    });

    it("wants the floor whenever it is a floor, not only when it is the top layer", () => {
        expect(
            /const detailFloorWanted = detailsAreTheSurface \|\| overlay === "detail";/.test(CODE),
            "being the floor is enough — the old guard asked whether it was also on top",
        ).toBe(true);
        /* Both floor branches must consult it; one left on the old guard re-opens the defect. */
        expect(CODE.match(/if \(detailFloorWanted &&/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
});
