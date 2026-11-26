/**
 * THE REAL ENROLLMENT PACKET, AS PUBLISHED — certified against the actual revision 38 payload.
 *
 * This is not a hand-built fixture. `__fixtures_published_rev38.json` is the published
 * business-process payload read back from deployed staging after publication, and every assertion
 * below runs the REAL parser and the REAL packet planner over it. So it proves what the platform
 * will actually do at launch, not what a test author believed it would do.
 *
 * ## Why this test exists at all
 *
 * Revision 37's Enrolling stage carried exactly one requirement, of kind `packet`, pointing at a
 * packet definition. `packet` is not in `REQUIREMENT_KINDS_V1`, so `parseRef` returned null and the
 * canonical parser silently skipped it — the stage's requirement set read as EMPTY. Since the
 * participant packet is derived from `kind: "form"` requirements, a real launch would have refused
 * with `no_form_requirements`: the family could not be sent anything at all. That is what ledger
 * item 4 had to clear, and this pins it closed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { planRequirementDerivedPacket } from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import { canonicalStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";

const ADMISSIONS = "57507992-db0e-4ceb-b4ba-ba2d9bc0155f";
const HANDBOOK = "463404e5-8ae2-48d7-b8ae-cf0ba0dcf91d";
const IMMUNIZATION = "883a30e5-7824-4e26-9fbd-d260a539329d";

const published = JSON.parse(
    readFileSync(resolve(__dirname, "__fixtures_published_rev38.json"), "utf8"),
) as unknown;
const builder = parseLifecycleBuilderV1(published);

describe("the published Enrollment revision", () => {
    it("parses, and its Enrolling stage states its requirements canonically", () => {
        expect(builder).not.toBeNull();
        const section = canonicalStageRequirements(builder, "enrolling", "enrollment");
        expect(section, "the Enrolling stage must state a canonical requirement section").toBeTruthy();
        expect(section?.requirements).toHaveLength(4);
    });

    it("no longer carries the unreadable legacy packet reference", () => {
        const section = canonicalStageRequirements(builder, "enrolling", "enrollment");
        // Every requirement now has a ref the parser could read — which is what revision 37's single
        // `kind: "packet"` row did not.
        for (const requirement of section?.requirements ?? []) {
            expect(requirement.ref.kind, requirement.requirement_id).not.toBe("packet");
        }
        /*
         * Checked precisely, not by substring: `send_enrollment_packet` is the legitimate work
         * template and capability key, and a naive `not.toContain("enrollment_packet")` fails on it.
         * The claim is about the REQUIREMENT and the packet reference it carried.
         */
        const ids = (section?.requirements ?? []).map((r) => r.requirement_id);
        expect(ids).not.toContain("enrollment_packet");
        expect(JSON.stringify(published)).not.toContain("packet_definition_id");
        expect(JSON.stringify(published)).not.toContain("c03425c9");
    });
});

describe("the participant packet the revision derives", () => {
    const plan = planRequirementDerivedPacket({ builder, processKey: "enrollment", stageKey: "enrolling" });

    /*
     * The refusal this replaces: a plan with no steps makes
     * `ensureRequirementDerivedPacketDefinition` refuse `no_form_requirements`, and the launch stops.
     */
    it("derives steps, so a launch can no longer refuse with no_form_requirements", () => {
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.stage_key).toBe("enrolling");
    });

    it("derives exactly the three Forms, in the authored participant order", () => {
        expect(plan.steps.map((s) => s.form_definition_id)).toEqual([ADMISSIONS, HANDBOOK, IMMUNIZATION]);
    });

    it("requires every step", () => {
        for (const step of plan.steps) expect(step.level, step.form_definition_id).toBe("required");
    });

    /*
     * D-94 lives at SESSION realization, not in configuration. A version id in the requirement would
     * freeze every future family to whatever was published the first time anyone started.
     */
    it("names forms and never a form version", () => {
        const text = JSON.stringify(plan);
        expect(text).not.toContain("ee75bbc6");
        expect(text).not.toContain("80e2b3c2");
    });

    it("does not derive a step for the fee — money is not paperwork", () => {
        // The financial requirement is real and is fourth in the authored order, but it is settled
        // through the Financials bridge and the participant payment surface, not by filling a Form.
        // A derived step for it would be the fake payment Form the doctrine forbids.
        expect(plan.steps).toHaveLength(3);
    });
});

describe("the financial requirement on the published revision", () => {
    const section = canonicalStageRequirements(builder, "enrolling", "enrollment");
    const financial = (section?.requirements ?? []).filter((r) => r.ref.kind === "financial");

    it("is exactly one requirement, referencing the canonical charge definition", () => {
        expect(financial).toHaveLength(1);
        expect(financial[0].ref).toEqual({ kind: "financial", charge_template_key: "registration_fee" });
    });

    it("is owed once per enrolling child", () => {
        expect(financial[0].scope).toBe("each_child");
    });

    it("is required and blocks leaving the stage", () => {
        expect(financial[0].level).toBe("required");
        expect(financial[0].enforcement).toBe("blocking");
    });

    it("is authored last, after the paperwork", () => {
        const kinds = (section?.requirements ?? []).map((r) => r.ref.kind);
        expect(kinds).toEqual(["form", "form", "form", "financial"]);
    });

    /*
     * THE WHOLE POINT OF THE BRIDGE. A copied amount would be stale the moment a rate, discount or
     * funding arrangement changed, and there would then be two answers to what a family owes.
     */
    it("carries no amount, and neither does the rest of the published payload", () => {
        expect(JSON.stringify(financial[0])).not.toMatch(/amount|7500|cents/i);
        const text = JSON.stringify(published);
        expect(text).not.toContain("amount_cents");
        expect(text).not.toContain("7500");
    });
});

describe("what the revision must not have disturbed", () => {
    it("keeps the Enrolling stage child-grained, so each child keeps its own journey", () => {
        const process = (builder?.processes ?? []).find((p) => p.key === "enrollment");
        const stage = (process?.stages ?? []).find((s) => s.key === "enrolling");
        expect(stage?.grain).toBe("child");
    });

    it("still references the registered send-enrollment-packet capability, not the stale key", () => {
        const text = JSON.stringify(published);
        expect(text).toContain("send_enrollment_packet");
        // The key that made publication impossible: it is not in the capability registry at all.
        expect(text).not.toContain("enrollment.send_paperwork");
    });
});
