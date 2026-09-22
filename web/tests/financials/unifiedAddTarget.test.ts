/**
 * ONE TARGET CONTROL, THE SAME GRAIN MODEL UNDERNEATH.
 *
 * "Applies to" and "Also bill" were two controls for one question — who receives this charge —
 * and using them required understanding the grain model: pick an anchor, then widen. The model is
 * right; the presentation was not. The economics are certified and untouched: the anchor is still
 * `subjectFilter`, the widening still `extraChildIds`, and the payload, the writer and per-child
 * obligation identity are unchanged.
 *
 * The rule that must never come back: an EMPTY selection meaning Household.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CMD = "components/operationalCards/AddChargeCommand.tsx";
const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const target = () => {
    const host = src(HOST);
    const at = host.indexOf("unifiedTarget:");
    expect(at, "the unified target is wired").toBeGreaterThan(-1);
    return host.slice(at, host.indexOf("subjects: [", at));
};

describe("Household is explicit, and never an absence", () => {
    it("is its own control with its own value", () => {
        /*
         * The PRESENTATION moved — the radio and its sibling checkboxes are now one canonical
         * `AlloyMultiSelect`, so this no longer looks for `type="radio"`. The RULE did not move,
         * and is what is asserted: Household is carried by a value of its own, it is offered as a
         * real option, and `householdSelected` still decides whether it is chosen.
         *
         * Its mutual exclusivity with the children is now enforced by the primitive rather than by
         * this surface, and is locked at that primitive in `alloyMultiSelectGrammar.test.ts` —
         * where the rule is decided — plus `operatorModelConvergence.test.ts` for the wiring that
         * declares it here.
         */
        const cmd = src(CMD);
        expect(cmd).toContain("ADDCHARGE_HOUSEHOLD_VALUE");
        expect(cmd).toMatch(/const ADDCHARGE_HOUSEHOLD_VALUE = "__household__"/);
        expect(cmd).toMatch(/value: ADDCHARGE_HOUSEHOLD_VALUE, label: "Household", exclusive: true/);
        expect(cmd).toContain("householdSelected");
        /* An absence must never be the household: no branch may treat an empty list as Household. */
        expect(strip(cmd)).not.toMatch(/length === 0[\s\S]{0,80}onSelectHousehold/);
    });

    it("selecting it clears every child", () => {
        expect(target()).toMatch(/onSelectHousehold:[\s\S]{0,200}setExtraChildIds\(\[\]\)/);
        expect(target()).toMatch(/onSelectHousehold:[\s\S]{0,200}setSubjectFilter\("all"\)/);
    });

    it("selecting a child leaves the household grain", () => {
        const t = target();
        const toggle = t.slice(t.indexOf("onToggleChild:"));
        expect(toggle).toContain('if (subjectFilter === "all")');
        expect(toggle.slice(0, 500)).toContain("setSubjectFilter(id)");
    });

    it("unticking the last child does NOT become Household", () => {
        /*
         * THE DEFECT THIS EXISTS FOR. An empty child selection must never resolve to the
         * household grain — that is the ambiguity the model forbids and the reason the household
         * option is a radio with a value rather than the absence of ticks.
         */
        const t = target();
        /* Sliced to the branch, not a character window — the indentation here is deep enough
           that a fixed window cuts the very line this asserts. */
        const from = t.indexOf("if (id === subjectFilter)");
        const toggle = t.slice(from, t.indexOf("setExtraChildIds((prev)", from));
        expect(toggle).toContain('setSubjectFilter("")');
        expect(toggle, "never all").not.toMatch(/setSubjectFilter\("all"\)/);
    });

    it("an empty target cannot be committed", () => {
        const cmd = src(CMD);
        const row = cmd.slice(cmd.indexOf("<ActionRow>"));
        expect(row.slice(0, 700)).toContain("householdSelected");
        expect(row.slice(0, 700)).toContain("selectedChildIds.length === 0");
        expect(row.slice(0, 700)).toContain("disabled=");
    });
});

describe("category grain still governs what is offered", () => {
    it("household appears only where the category permits it", () => {
        expect(target()).toContain("householdOffered: categoryPermitsHouseholdGrain(");
    });

    it("the control appears only where child grain is permitted", () => {
        expect(target()).toContain("categoryPermitsChildGrain(");
    });

    it("the selector is not more permissive than the write path", () => {
        /* Both halves conditional, exactly as the two-control version was. */
        const host = src(HOST);
        expect(host).toContain("categoryPermitsHouseholdGrain");
        expect(host).toContain("categoryPermitsChildGrain");
    });
});

describe("the economics beneath are untouched", () => {
    it("the anchor and the widening are still the model", () => {
        const t = target();
        expect(t).toContain("setSubjectFilter");
        expect(t).toContain("setExtraChildIds");
    });

    it("per-child identity is unchanged", () => {
        const host = src(HOST);
        /* selectedChildIds is still anchor-first and de-duplicated. */
        expect(host).toContain("const ids = [anchorId, ...extraChildIds]");
        expect(host).toContain("[...new Set(ids)]");
    });

    it("household still means naming no child", () => {
        const t = target();
        expect(t).toContain('selectedChildIds: subjectFilter === "all" ? [] : selectedChildIds');
    });

    it("the old two-control path is still available where the unified one is not offered", () => {
        /* A category that permits only household grain keeps the original select. */
        const cmd = src(CMD);
        expect(cmd).toContain("controls.unifiedTarget ?");
        expect(cmd).toContain("data-addcharge-subject");
    });
});

describe("it stays compact", () => {
    it("summarises in one line rather than a chip row", () => {
        const cmd = src(CMD);
        expect(cmd).toContain("data-addcharge-targetsum");
        expect(cmd).toContain("children selected · each receives their own charge");
        expect(strip(cmd), "no token or chip vocabulary").not.toMatch(/chip|token|pill/i);
    });
});

describe("a subject is a child, not an agreement", () => {
    /*
     * MEASURED on the mounted product: two children, FOUR target checkboxes — all in one command
     * host (`commandHosts: 1`), consecutive rows, every one visible and interactive. Not two
     * hosts and not a depth artefact: `vm.subjects` mapped AGREEMENTS, so a child with a closed
     * enrolment beside a live one became two subjects with the same name.
     *
     * The defect predates the unified control — the old "Applies to" select listed each child
     * twice for the same reason — and every surface reading `vm.subjects` inherited it.
     */
    const vm = src("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");

    it("de-duplicates by member", () => {
        expect(vm).toContain("const subjectByMember = new Map<");
        expect(vm).toContain("subjectByMember.get(a.customer_member_id)");
        expect(vm, "the list is built from the de-duplicated map").toContain("[...subjectByMember.values()].map");
        expect(vm, "never straight from agreements").not.toMatch(/vm\.subjects = agreements\.map/);
    });

    it("prefers the agreement a new charge belongs to", () => {
        const block = vm.slice(vm.indexOf("const subjectByMember"), vm.indexOf("vm.subjects = [..."));
        expect(block).toContain("heldActive");
        expect(block).toContain("thisActive");
        expect(block, "an active agreement wins").toContain("if (!heldActive && thisActive)");
    });

    it("keeps the agreement alongside, because it is the billable source", () => {
        expect(vm).toContain("agreementId: a.id");
        expect(vm).toContain("agreementStatus: a.status");
    });
});
