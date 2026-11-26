/**
 * A per-child path is authorable in full — label, how it reads once chosen, destination, the child
 * status it lands in, what it asks first, whether it is offered — and what the editor writes is what
 * the runtime parser reads back. Two paths may share a destination (Offer spot and Waitlist both keep
 * the child on the waitlist track).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    childPathTargets,
    destinationOf,
    statusOf,
    uniqueDecisionKey,
    withRoute,
} from "@/components/adminV2/settings/lifecycle/StagePerChildPathsEditor";
import { parseParticipantDecision, type StageWorkParticipantDecisionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const EDITOR = readFileSync(resolve(__dirname, "../../components/adminV2/settings/lifecycle/StagePerChildPathsEditor.tsx"), "utf8");

const offerSpot: StageWorkParticipantDecisionV1 = {
    decision_key: "child_offer_spot",
    action_ref: "update_enrollment_status",
    label: "Offer spot",
    state_label: "Offer pending",
    subject_grain: "child",
    targets: childPathTargets("offered", "offered"),
    required_inputs: [{ key: "placement", label: "Program offered", type: "select", required: true, options_source: "location_program_categories" }],
};

describe("per-child path authoring", () => {
    it("writes disposition_key — the field the per-child runtime reads", () => {
        const t = childPathTargets("waitlist", "waitlisted");
        expect(t[0]).toEqual({ kind: "update_child_enrollment_status", disposition_key: "waitlisted" });
        expect(JSON.stringify(t)).not.toContain('"status_key"');
    });

    it("round-trips label, state label, inputs and availability through the runtime parser", () => {
        const parsed = parseParticipantDecision({ ...offerSpot, available: false });
        expect(parsed).not.toBeNull();
        expect(parsed!.label).toBe("Offer spot");
        expect(parsed!.state_label).toBe("Offer pending");
        expect(parsed!.available).toBe(false);
        expect(parsed!.required_inputs?.[0]).toMatchObject({ key: "placement", options_source: "location_program_categories" });
        expect(statusOf(parsed!)).toBe("offered");
        expect(destinationOf(parsed!)).toBe("offered");
    });

    it("re-routes destination and status while keeping other targets, and migrates a legacy status_key", () => {
        const legacy: StageWorkParticipantDecisionV1 = {
            ...offerSpot,
            targets: [
                { kind: "update_child_enrollment_status", status_key: "offered", close_reason_key: "x" } as never,
                { kind: "move_to_stage", stage_key: "offered" },
            ],
        };
        const next = withRoute(legacy, "waitlist", "waitlisted");
        const status = next.targets.find((t) => t.kind === "update_child_enrollment_status")!;
        expect(status).toMatchObject({ disposition_key: "waitlisted", close_reason_key: "x" });
        expect("status_key" in status).toBe(false);
        expect(destinationOf(next)).toBe("waitlist");
        expect(parseParticipantDecision(next)).not.toBeNull();
    });

    it("lets two paths share a destination with distinct, stable keys", () => {
        const taken = new Set(["child_waitlist"]);
        expect(uniqueDecisionKey("Waitlist", taken)).toBe("child_waitlist_2");
        expect(uniqueDecisionKey("Offer spot", taken)).toBe("child_offer_spot");
        expect(EDITOR).not.toMatch(/already has a path|decisionKeyFor/);
    });

    it("exposes every authorable field in the editor", () => {
        for (const id of ["label", "state-label", "row-stage", "row-status", "available", "add-input", "new-label"]) {
            expect(EDITOR).toContain(`data-testid="stage-per-child-paths-${id}"`);
        }
        expect(EDITOR).toContain("location_program_categories");
        expect(EDITOR).toContain("close_reason_key");
    });
});
