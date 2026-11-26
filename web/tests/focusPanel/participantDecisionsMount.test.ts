import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveParticipantDecisionScope } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveParticipantDecisionScope";

/**
 * PER-CHILD DECISION — Current Work is the owner, because Current Work is where the gate fires.
 *
 * `completeStageWorkWithOutcome` refuses to complete a template that declares
 * `participant_decisions` while any child is undecided, and tells the operator — in this surface —
 * to "choose a path for each child first". While the only surface offering that lived in the
 * deleted overview body, the step could not be completed by any route.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const surface = (over: Record<string, unknown> = {}) =>
    ({
        stageKey: "decision",
        primaryWorkItem: { template_key: "decide_paths" },
        runtime: { execution: { department_id: "dept-1" } },
        ...over,
    }) as Parameters<typeof resolveParticipantDecisionScope>[0]["surface"];

describe("the decision scope comes from the runtime the card already holds", () => {
    it("reads department, stage and template from the projection", () => {
        expect(resolveParticipantDecisionScope({ opportunityId: "opp-1", surface: surface() })).toEqual({
            opportunityId: "opp-1",
            departmentId: "dept-1",
            stageKey: "decision",
            templateKey: "decide_paths",
        });
    });

    it("refuses a partial scope rather than querying another work item's decisions", () => {
        // Each of these would still produce a well-formed request — against the wrong work.
        expect(resolveParticipantDecisionScope({ opportunityId: "", surface: surface() })).toBeNull();
        expect(
            resolveParticipantDecisionScope({
                opportunityId: "opp-1",
                surface: surface({ runtime: { execution: { department_id: "  " } } }),
            }),
        ).toBeNull();
        expect(
            resolveParticipantDecisionScope({ opportunityId: "opp-1", surface: surface({ stageKey: "" }) }),
        ).toBeNull();
        expect(
            resolveParticipantDecisionScope({
                opportunityId: "opp-1",
                surface: surface({ primaryWorkItem: null }),
            }),
        ).toBeNull();
        expect(resolveParticipantDecisionScope({ opportunityId: "opp-1", surface: null })).toBeNull();
    });
});

describe("the panel is mounted in Current Work", () => {
    it("Current Work resolves the scope and renders the panel", () => {
        const card = code("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("resolveParticipantDecisionScope");
        expect(card).toContain("<CurrentWorkParticipantDecisionsPanel");
        // Self-suppressing on a null scope — never a query against another work item.
        expect(card).toContain("participantDecisionScope ?");
    });

    it("the focused surface renders it as persistent context, not inside outcome mode", () => {
        const surfaceSrc = code("components/admin/focusPanel/cards/CurrentWorkFocusedSurface.tsx");
        expect(surfaceSrc).toContain("participantDecisions");
        // Suppressed only while a capability panel owns the surface.
        expect(surfaceSrc).toContain("participantDecisions && !hasPanel");
    });

    it("the panel no longer claims to be a card with its own Current work heading", () => {
        const panel = code("components/admin/focusPanel/cards/CurrentWorkParticipantDecisionsPanel.tsx");
        expect(panel).toContain('presentation = "panel"');
        expect(panel).toContain("alloy-os-currentwork__participant-decisions");
        // Execution is unchanged — the same two endpoints, the same explicit child identity.
        expect(panel).toContain("executeParticipantDecision");
        expect(panel).toContain("executeFamilyClose");
    });

    it("Close family stays on the governed process path, not a bespoke mutation", () => {
        const client = code("lib/lifecycle/familyCloseClient.ts");
        expect(client).toContain("/api/admin/lifecycle-builder/family-close");
        // Same stage + template scope as the per-child decisions — one configuration, one authority.
        expect(client).toContain("stage_key");
        expect(client).toContain("template_key");
    });
});

describe("the completion gate and the surface that satisfies it agree", () => {
    it("the gate demands participant resolution, and Current Work is where it is offered", () => {
        const gate = code("lib/lifecycle/completeStageWorkWithOutcome.ts");
        expect(gate).toContain("requires_all_participants_resolved");
        expect(gate).toContain("participant_decisions");
        // The message the gate produces tells the operator to choose a path per child.
        expect(readFileSync(join(WEB, "lib/lifecycle/completeStageWorkWithOutcome.ts"), "utf8")).toContain(
            "Choose a path for each child first.",
        );
    });
});
