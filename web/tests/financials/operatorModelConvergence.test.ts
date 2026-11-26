/**
 * 11C — the convergence slice, locked where it is decided.
 *
 * Three things changed: the canonical select primitive learned to answer "which of these", the
 * surface that commits money stopped carrying its own checkbox island, and Accounting stopped
 * being one vertical page. Each lock below fails for exactly one of those regressing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Source with comments removed, for locks that must judge what the file DOES rather than what it
 * says about itself. A rule asserted against prose fires on the sentence explaining the rule.
 */
function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the multi-select is an extension of the canonical primitive, not a Financials control", () => {
    it("lives in the platform primitive's own file", () => {
        const primitive = src("components/workspace/AlloySelect.tsx");
        expect(primitive).toContain("export function AlloyMultiSelect");
        expect(primitive).toContain("export function resolveMultiSelection");
    });

    it("shares the single-select stylesheet rather than shipping a second one", () => {
        const primitive = src("components/workspace/AlloySelect.tsx");
        /* One import of one stylesheet, at the top, for both controls. */
        expect(primitive.match(/import "\.\/alloySelect\.css"/g) ?? []).toHaveLength(1);
        expect(src("components/workspace/alloySelect.css")).toContain(".alloy-select__option--check");
    });

    it("no Financials-only dropdown component was created", () => {
        /*
         * The failure this forbids is a `FinancialsMultiSelect` (or similar) appearing beside the
         * canonical one. Named by SHAPE, so a differently-spelled copy is still caught.
         */
        const addCharge = src("components/operationalCards/AddChargeCommand.tsx");
        expect(addCharge).toContain('from "@/components/workspace/AlloySelect"');
        expect(addCharge).not.toMatch(/function\s+\w*(Multi)?Select\s*\(/);
    });

    it("the listbox announces itself as multi-selectable", () => {
        expect(src("components/workspace/AlloySelect.tsx")).toContain("aria-multiselectable");
    });
});

describe("Add Charge asks who receives this with one control", () => {
    const addCharge = () => src("components/operationalCards/AddChargeCommand.tsx");

    it("uses the canonical multi-select for the target", () => {
        expect(addCharge()).toContain("<AlloyMultiSelect");
    });

    it("no longer keeps a checkbox list open on the command surface", () => {
        const target = addCharge().slice(
            addCharge().indexOf("controls && controls.unifiedTarget ?"),
            addCharge().indexOf("data-addcharge-targetsum"),
        );
        expect(target).not.toContain('type="checkbox"');
        expect(target).not.toContain('type="radio"');
    });

    it("Household is an explicit exclusive option, never an empty selection", () => {
        const text = addCharge();
        expect(text).toContain("ADDCHARGE_HOUSEHOLD_VALUE");
        expect(text).toMatch(/label: "Household", exclusive: true/);
    });

    it("per-child economics are still spoken out loud", () => {
        /* Each selected child receives their own charge — the line that says so must survive. */
        expect(addCharge()).toContain("each receives their own charge");
    });

    it("the existing per-child toggle remains the writer", () => {
        /* A surface that set the child list wholesale would be a second writer for one decision. */
        expect(addCharge()).toContain("onToggleChild");
    });
});

describe("Accounting is two tools, one at a time", () => {
    const surface = () => src("components/adminV2/settings/financials/FinancialsWorkspaceSurface.tsx");
    const workspace = () => src("components/adminV2/settings/financials/accounting/AccountingWorkspace.tsx");

    it("the chapter renders the workspace, not both tools stacked", () => {
        const text = surface();
        expect(text).toContain("<AccountingWorkspace />");
        /* The two tools must no longer be siblings in the chapter. */
        expect(text).not.toContain("<GlCodesConfigurationPage />");
        expect(text).not.toContain("<AccountingPostingPanels />");
    });

    it("offers exactly GL Codes and Accounting Calendar in the rail", () => {
        const text = workspace();
        expect(text).toContain('label: "GL Codes"');
        expect(text).toContain('label: "Accounting Calendar"');
    });

    it("uses the canonical rail/workspace grammar rather than a new two-pane layout", () => {
        expect(workspace()).toContain("ConfigChildObjectMasterDetail");
        /*
         * No hand-rolled grid: the canonical component owns the two-pane layout AND its responsive
         * collapse. Asserted against CODE with comments stripped — the file's own note quotes the
         * canonical grid to explain where the behaviour comes from, and a prose mention of it is
         * not a second implementation of it.
         */
        expect(stripComments(workspace())).not.toMatch(/grid-cols-\[/);
    });

    it("a workspace opens on something", () => {
        expect(workspace()).toContain('ACCOUNTING_DEFAULT_TOOL: AccountingToolKey = "gl_codes"');
    });

    it("selects only — neither tool's semantics or copy moved into the workspace", () => {
        const text = workspace();
        /* The period doctrine sentence belongs to the calendar panel and must not be restated. */
        expect(text).not.toContain("Closing a period is final");
        expect(src("components/adminV2/settings/financials/accounting/AccountingPostingPanels.tsx"))
            .toContain("Closing a period is final");
    });
});
