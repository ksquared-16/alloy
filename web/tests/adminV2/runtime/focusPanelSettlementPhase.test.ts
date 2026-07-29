import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SETTLEMENT PHASE is declared, never inferred from provenance.
 *
 * `FocusPanelWorkModeModel.source` is documented as "DIAGNOSTIC ONLY — the grid must never branch on
 * it", but the grid derived its settled/still-loading treatment from `source === "drawer_vm"`. That
 * both violated the stated contract and blocked a second surface: a Child producer would have had to
 * name itself `drawer_vm` to get settled semantics. Producers now DECLARE `phase`.
 */

const web = process.cwd();
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
/** Strip comments — these files legitimately DISCUSS `source` in prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Focus Panel settlement phase", () => {
    it("the grid reads the declared phase, not the producer's name", () => {
        const grid = code(read("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"));
        expect(grid).toMatch(/model\.phase === "settled"/);
        expect(grid).not.toMatch(/model\.source/);
        expect(grid).not.toMatch(/"drawer_vm"/);
        expect(grid).not.toMatch(/"provisioning_answer"/);
    });

    it("both producers declare a phase", () => {
        expect(code(read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts")))
            .toMatch(/phase:\s*"commit"/);
        expect(code(read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromDrawerVm.ts")))
            .toMatch(/phase:\s*"settled"/);
    });

    it("phase is part of the canonical model contract", () => {
        const model = read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel.ts");
        expect(model).toMatch(/FocusPanelSettlementPhase/);
        expect(model).toMatch(/phase: FocusPanelSettlementPhase/);
    });
});
