/**
 * WORK REQUIREMENTS ARE AUTHORABLE, AND AUTHORING ONE DOES NOT DESTROY THE OTHERS.
 *
 * `set_stage_requirements` REPLACES a stage's whole authored section, which is correct — an author
 * saving an empty set is saying "this stage requires nothing", and a merging writer could never
 * express that. But it means a kind-specific editor that submits only its own rows silently deletes
 * every other kind's, and two such editors on one stage delete each other's work in turn. The
 * operator sees requirements that keep disappearing, with no error anywhere.
 *
 * That is the defect these tests exist to hold shut, along with the reference gate: a work
 * requirement naming work the stage does not produce would be permanently unsatisfiable, which is
 * the same failure `no_published_version` prevents for forms.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    requirementsOfOtherKinds,
    validateWorkRequirementReferences,
    type StageRequirementV1,
    type StageRequirementsV1,
} from "@/lib/lifecycle/stageRequirementsV1";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const WORK_REQ: StageRequirementV1 = {
    requirement_id: "work_conduct_tour",
    ref: { kind: "work", work_template_key: "conduct_tour" },
    level: "required",
    timing: "stage_exit",
    enforcement: "blocking",
} as StageRequirementV1;

const FORM_REQ: StageRequirementV1 = {
    requirement_id: "form_x",
    ref: { kind: "form", form_definition_id: "form-x" },
    level: "required",
    timing: "stage_exit",
} as StageRequirementV1;

const SECTION: StageRequirementsV1 = { version: 1, requirements: [WORK_REQ, FORM_REQ] };

describe("work requirement references", () => {
    it("accepts work the stage actually produces", () => {
        expect(validateWorkRequirementReferences([WORK_REQ], ["conduct_tour", "send_packet"])).toEqual([]);
    });

    it("refuses work the stage does not produce, and says what it does produce", () => {
        const refusals = validateWorkRequirementReferences([WORK_REQ], ["send_packet"]);
        expect(refusals).toHaveLength(1);
        expect(refusals[0]!.code).toBe("unknown_work_template");
        expect(refusals[0]!.detail).toContain("send_packet");
        expect(refusals[0]!.detail).not.toMatch(/not implemented|todo/i);
    });

    it("says so plainly when the stage has no work at all", () => {
        const refusals = validateWorkRequirementReferences([WORK_REQ], []);
        expect(refusals[0]!.detail).toContain("no work configured");
    });

    it("judges work references only, leaving other kinds alone", () => {
        expect(validateWorkRequirementReferences([FORM_REQ], [])).toEqual([]);
    });
});

describe("one section, two editors", () => {
    it("carries the kinds an editor does not edit", () => {
        const carried = requirementsOfOtherKinds(SECTION, "work");
        expect(carried).toHaveLength(1);
        expect(carried[0]).toMatchObject({ requirement_id: "form_x", kind: "form", form_definition_id: "form-x" });

        const theOtherWay = requirementsOfOtherKinds(SECTION, "form");
        expect(theOtherWay).toHaveLength(1);
        expect(theOtherWay[0]).toMatchObject({ kind: "work", work_template_key: "conduct_tour" });
    });

    it("round-trips the carried row without losing its scoping", () => {
        // A carried row is re-submitted verbatim, so anything dropped here would be silently
        // deleted from a requirement the operator never touched.
        const scoped: StageRequirementsV1 = {
            version: 1,
            requirements: [
                { ...WORK_REQ, applies_to_transition_keys: ["tour_to_decision"], scope: "record" } as StageRequirementV1,
            ],
        };
        expect(requirementsOfOtherKinds(scoped, "form")[0]).toMatchObject({
            applies_to_transition_keys: ["tour_to_decision"],
            timing: "stage_exit",
            enforcement: "blocking",
            scope: "record",
        });
    });

    it("carries nothing when there is nothing else", () => {
        expect(requirementsOfOtherKinds({ version: 1, requirements: [WORK_REQ] }, "work")).toEqual([]);
        expect(requirementsOfOtherKinds(null, "work")).toEqual([]);
    });

    it("BOTH editors carry the other's rows — neither can delete the other's work", () => {
        for (const editor of [
            "components/adminV2/settings/lifecycle/StageWorkRequirementsEditor.tsx",
            "components/adminV2/settings/lifecycle/StageFormRequirementsEditor.tsx",
        ]) {
            expect(read(editor), `${editor} would delete the other kinds`).toContain("requirementsOfOtherKinds");
        }
    });
});

describe("Settings authoring surface", () => {
    it("the route validates work references before storing them", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts");
        expect(route).toContain("validateWorkRequirementReferences");
        expect(route).toContain("unknown_work_template");
    });

    it("the editor is mounted beside forms, not on a surface of its own", () => {
        const editorHost = read("components/adminV2/settings/lifecycle/StageEditorV2.tsx");
        expect(editorHost).toContain("StageWorkRequirementsEditor");
    });

    it("NO TOUR-SPECIFIC UI — the editor names no stage, work or process", () => {
        /*
         * The configuration/runtime line, applied to the authoring surface. The selectable work is
         * whatever the stage's operating plan configures and the selectable exits are the stage's
         * own transitions, so pointing this at a Billing stage authors Billing's work with no code
         * change. A single mention of "tour" here would make it one process's feature.
         */
        const editor = read("components/adminV2/settings/lifecycle/StageWorkRequirementsEditor.tsx");
        const code = editor
            .split("\n")
            .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.includes("/*"))
            .join("\n");
        for (const forbidden of ["conduct_tour", "enrollment", "waitlist", "enrolling"]) {
            expect(code.toLowerCase(), `the editor must not name "${forbidden}"`).not.toContain(forbidden);
        }
    });

    it("the editor reads its options from stage configuration, not a constant", () => {
        const editor = read("components/adminV2/settings/lifecycle/StageWorkRequirementsEditor.tsx");
        expect(editor).toContain("stage_operating_plan_v1?.work_templates");
        expect(editor).toContain("stage_operating_plan_v1?.outgoing_transitions");
    });

    it("an empty exit selection is stored as ABSENT, never as an empty list", () => {
        // "No filter" means every exit; "filtered to nothing" would mean no exit. Storing an empty
        // array would make a requirement that gates nothing look like one that gates everything.
        const editor = read("components/adminV2/settings/lifecycle/StageWorkRequirementsEditor.tsx");
        expect(editor).toContain("next.length ? { ...rest, applies_to_transition_keys: next } : rest");
    });
});
