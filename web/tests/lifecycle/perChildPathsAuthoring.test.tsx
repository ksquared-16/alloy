/**
 * Authoring a per-child path — the surface that did not exist.
 *
 * `participant_decisions` was parsed, validated, projected and executed, and authorable nowhere. Six
 * legitimate family→child movements in the certification tenant were configured as stage transitions
 * instead, which the grain rule correctly refuses: a family stage's transitions move the FAMILY, and
 * a family cannot be moved onto a child-grain stage.
 *
 * The behaviour these controls protect is the asymmetry the type documents — the family stays on the
 * family track while each child moves on its own, and two children on the same decision can go to
 * different stages.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StagePerChildPathsEditor from "@/components/adminV2/settings/lifecycle/StagePerChildPathsEditor";
import { parseParticipantDecision } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageWorkParticipantDecisionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const ROUTE = readFileSync(
    resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts"),
    "utf8",
);
const EDITOR = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/StagePerChildPathsEditor.tsx"),
    "utf8",
);
const STAGE_EDITOR = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/StageEditorV2.tsx"),
    "utf8",
);

const PROCESS = { id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] } as LifecycleBuilderProcessRecord;
const CHILD_STAGES = [{ key: "enrolling", label: "Enrolling" }, { key: "waitlist", label: "Waitlist" }];
const CHILD_STATUSES = [{ status_key: "enrolling", status_label: "Enrolling" }, { status_key: "waitlisted", status_label: "Waitlisted" }];

/**
 * A decision must carry EXACTLY ONE `update_child_enrollment_status` target — the canonical parser
 * refuses otherwise, because a participant decision IS the child's path and must name the state that
 * path lands in, once. A first draft of these controls omitted it and the parser correctly returned
 * null, which is how the requirement was found.
 */
const decision = (stageKey: string, statusKey: string, label: string): StageWorkParticipantDecisionV1 => ({
    decision_key: `move_child_to_${stageKey}`,
    action_ref: "update_enrollment_status",
    label,
    subject_grain: "child",
    targets: [
        { kind: "update_child_enrollment_status", status_key: statusKey },
        { kind: "move_to_stage", stage_key: stageKey, transition_ref: `move_to_stage:${stageKey}` },
    ],
});

const render = (decisions: StageWorkParticipantDecisionV1[]) =>
    renderToStaticMarkup(
        <StagePerChildPathsEditor
            departmentId="d1"
            stageKey="decision"
            stageLabel="Placement / Decision"
            templateKey="decide_placement"
            templateLabel="Decide placement"
            decisions={decisions}
            process={PROCESS}
            childStages={CHILD_STAGES}
            childStatuses={CHILD_STATUSES}
        />,
    );

describe("the rows it writes are what the runtime reads", () => {
    it("parses through the canonical parser without loss", () => {
        const parsed = parseParticipantDecision(decision("enrolling", "enrolling", "Move child to Enrolling"));
        expect(parsed).not.toBeNull();
        expect(parsed!.subject_grain).toBe("child");
        expect(parsed!.targets.find((t) => t.kind === "move_to_stage")!.stage_key).toBe("enrolling");
        expect(parsed!.targets.filter((t) => t.kind === "update_child_enrollment_status")).toHaveLength(1);
    });

    it("expresses two children going different ways on one decision", () => {
        // The business behaviour: one child to Enrolling, a sibling to Waitlist, family unmoved.
        const rows = [decision("enrolling", "enrolling", "Move child to Enrolling"), decision("waitlist", "waitlisted", "Move child to Waitlist")];
        const parsed = rows.map((r) => parseParticipantDecision(r));
        expect(parsed.every(Boolean)).toBe(true);
        expect(parsed.map((p) => p!.targets.find((t) => t.kind === "move_to_stage")!.stage_key)).toEqual(["enrolling", "waitlist"]);
        expect(new Set(parsed.map((p) => p!.decision_key)).size).toBe(2);
    });

    it("refuses a path with no landing state", () => {
        // The requirement a first draft of this control missed.
        const noStatus = { ...decision("enrolling", "enrolling", "x"), targets: [{ kind: "move_to_stage", stage_key: "enrolling" }] };
        expect(parseParticipantDecision(noStatus)).toBeNull();
    });

    it("never targets the family — every path is child-grain", () => {
        const parsed = parseParticipantDecision(decision("enrolling", "enrolling", "x"))!;
        expect(parsed.subject_grain).toBe("child");
        expect(EDITOR).toContain('subject_grain: "child"');
    });
});

describe("what the operator sees", () => {
    it("says these move one child, not the family", () => {
        const html = render([]);
        expect(html).toContain("Per-child paths");
        expect(html).toMatch(/one child at a time/i);
        expect(html).toMatch(/the family stays where it is/i);
    });

    it("avoids the runtime term in operator copy", () => {
        expect(render([decision("enrolling", "enrolling", "Move child to Enrolling")])).not.toContain("participant_decision");
    });

    it("lists configured paths with their destination", () => {
        const html = render([decision("enrolling", "enrolling", "Move child to Enrolling")]);
        expect(html).toContain("Move child to Enrolling");
        expect(html).toContain("Enrolling");
    });

    it("says plainly when none are configured", () => {
        expect(render([])).toMatch(/Children stay with the family until one is added/);
    });

    it("offers only child-grain destinations", () => {
        // A path onto a family stage is precisely what the validator refuses; offering one would
        // author a known error.
        expect(STAGE_EDITOR).toContain('s.grain === "child"');
    });

    it("appears only on a family-grain stage", () => {
        expect(STAGE_EDITOR).toContain('stageRecord?.grain === "family" && perChildDestinations.length');
    });
});

describe("the route owns the rules", () => {
    it("delegates to the canonical parser rather than defining a decision again", () => {
        expect(ROUTE).toContain("parseParticipantDecision(row)");
        expect(ROUTE).toContain('case "set_work_template_participant_decisions":');
    });

    it("refuses a partial write rather than storing a subset", () => {
        expect(ROUTE).toContain("parsedDecisions.some((d) => d === null)");
        expect(ROUTE).toMatch(/Two per-child paths share the same key/);
    });

    it("refuses unknown process, stage and template before mutating", () => {
        expect(ROUTE).toContain('{ error: `Unknown work template "${templateKey}" on "${stageKey}"` }, { status: 404 }');
    });

    it("saves through the one draft owner, creating no second store", () => {
        expect(EDITOR).toContain('action: "set_work_template_participant_decisions"');
        expect(EDITOR).not.toContain("supabase");
        expect(ROUTE).toContain("saveDraft(draftClient");
    });
});
