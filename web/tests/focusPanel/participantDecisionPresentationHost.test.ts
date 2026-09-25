import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    resolveParticipantDecisionScope,
    resolveParticipantDecisionScopeFromRuntime,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveParticipantDecisionScope";

/**
 * WHICH CARD PRESENTS THE PER-PARTICIPANT DECISIONS.
 *
 * The decisions were mounted only on Current Work. On a record with an active Business Process that
 * card is never on screen — `current_work` is `supersededBy: "business_process"` in the card
 * registry — so the operator was told to "choose a path for each child first" by a completion gate
 * whose control existed on no card they could see. Measured: the surface rendered, the endpoint was
 * correct, and the browser issued zero `/participant-decisions` requests.
 *
 * The repair is a SHARED PRESENTATION WITH TWO HOSTS, not a second panel. These guards hold the
 * shape that makes that true: one component, one scope resolver, and structurally one host mounted.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

type RuntimeArg = Parameters<typeof resolveParticipantDecisionScopeFromRuntime>[0]["runtime"];

const runtime = (over: Record<string, unknown> = {}) =>
    ({
        stage_key: "decision",
        stage_label: "Decision",
        purpose: null,
        journey_segment: "child",
        template_keys: ["decide_paths"],
        primary: { template_key: "decide_paths" },
        additional: [],
        execution: { department_id: "dept-1" },
        ...over,
        // `primary` is a deliberate stub: this suite asserts how the scope resolver reads a runtime,
        // and it reads the template key. Widening through `unknown` keeps the fixture to the fields
        // under test rather than hand-maintaining all 15 of a work item's.
    }) as unknown as RuntimeArg;

describe("both hosts resolve the SAME scope", () => {
    it("the runtime resolver answers what the Current Work resolver answers", () => {
        const fromRuntime = resolveParticipantDecisionScopeFromRuntime({
            opportunityId: "opp-1",
            runtime: runtime(),
        });
        const fromSurface = resolveParticipantDecisionScope({
            opportunityId: "opp-1",
            surface: {
                stageKey: "decision",
                primaryWorkItem: { template_key: "decide_paths" },
                runtime: runtime(),
            } as Parameters<typeof resolveParticipantDecisionScope>[0]["surface"],
        });
        expect(fromRuntime).toEqual({
            opportunityId: "opp-1",
            departmentId: "dept-1",
            stageKey: "decision",
            templateKey: "decide_paths",
        });
        // Not merely both non-null: the two hosts must name the same work, or they are deciding
        // different things under one heading.
        expect(fromSurface).toEqual(fromRuntime);
    });

    it("falls back to the stage's only work when the plan flagged none primary", () => {
        // The exact shape of the stage this was found on: a required template that is not flagged
        // primary. A host with no primary must still reach its own work, not resolve to null.
        expect(
            resolveParticipantDecisionScopeFromRuntime({
                opportunityId: "opp-1",
                runtime: runtime({ primary: null, additional: [{ template_key: "review_paths" }] }),
            }),
        ).toEqual({
            opportunityId: "opp-1",
            departmentId: "dept-1",
            stageKey: "decision",
            templateKey: "review_paths",
        });
    });

    it("refuses a partial scope rather than querying another work item's decisions", () => {
        expect(resolveParticipantDecisionScopeFromRuntime({ opportunityId: "", runtime: runtime() })).toBeNull();
        expect(resolveParticipantDecisionScopeFromRuntime({ opportunityId: "opp-1", runtime: null })).toBeNull();
        expect(
            resolveParticipantDecisionScopeFromRuntime({
                opportunityId: "opp-1",
                runtime: runtime({ execution: { department_id: "  " } }),
            }),
        ).toBeNull();
        expect(
            resolveParticipantDecisionScopeFromRuntime({
                opportunityId: "opp-1",
                runtime: runtime({ stage_key: "" }),
            }),
        ).toBeNull();
        expect(
            resolveParticipantDecisionScopeFromRuntime({
                opportunityId: "opp-1",
                runtime: runtime({ primary: null, additional: [] }),
            }),
        ).toBeNull();
    });

    it("a Current Work surface with no primary work still resolves to null", () => {
        // The delegation must not silently widen the surface host to the runtime's primary: a
        // surface that has committed to no work item is not a surface that can decide one.
        expect(
            resolveParticipantDecisionScope({
                opportunityId: "opp-1",
                surface: {
                    stageKey: "decision",
                    primaryWorkItem: null,
                    runtime: runtime(),
                } as Parameters<typeof resolveParticipantDecisionScope>[0]["surface"],
            }),
        ).toBeNull();
    });
});

describe("the Business Process card hosts the decisions", () => {
    const processCard = code("components/admin/focusPanel/cards/BusinessProcessCard.tsx");

    it("renders the shared component, not a Process-local copy of it", () => {
        expect(processCard).toContain("<CurrentWorkParticipantDecisionsPanel");
        expect(processCard).toContain(
            'from "@/components/admin/focusPanel/cards/CurrentWorkParticipantDecisionsPanel"',
        );
    });

    it("resolves its scope through the shared resolver, from the runtime it already holds", () => {
        expect(processCard).toContain("resolveParticipantDecisionScopeFromRuntime");
        expect(processCard).toContain("context.stageWorkRuntime");
        // Self-suppressing on a null scope — never a query against another work item.
        expect(processCard).toContain("participantDecisionScope ?");
    });

    it("dispatches the same scoped refresh Current Work dispatches", () => {
        // One refresh contract, whichever host the operator happened to be on.
        expect(processCard).toContain('"participant_decision"');
        for (const host of [
            "components/admin/focusPanel/cards/BusinessProcessCard.tsx",
            "components/admin/focusPanel/cards/CurrentWorkCard.tsx",
        ]) {
            expect(code(host)).toContain("dispatchOpportunityDrawerScopedUpdate");
        }
    });
});

describe("Current Work remains a host", () => {
    it("still resolves the scope and renders the same panel", () => {
        const card = code("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("resolveParticipantDecisionScope");
        expect(card).toContain("<CurrentWorkParticipantDecisionsPanel");
    });
});

describe("there is exactly one participant-decision presentation, mounted once", () => {
    it("no fork: one component file owns the presentation", () => {
        const forks = [
            "components/admin/focusPanel/cards/BusinessProcessParticipantDecisionsPanel.tsx",
            "components/operationalCards/ProcessParticipantDecisionsPanel.tsx",
            "components/admin/focusPanel/cards/ParticipantDecisionWorkSection.tsx",
        ];
        for (const fork of forks) {
            let exists = true;
            try {
                readFileSync(join(WEB, fork), "utf8");
            } catch {
                exists = false;
            }
            expect(exists, `${fork} is a second decision presentation`).toBe(false);
        }
    });

    it("the two hosts cannot mount simultaneously", () => {
        // 1 — the registry supersedes the Current Work CELL entirely when a process card is composed.
        const registry = code("lib/adminV2/runtime/focusPanel/focusPanelCardRegistry.ts");
        expect(registry).toContain('supersededBy: "business_process"');
        // 2 — and where the Process card DOES host Current Work (the workspace), it returns that card
        //     INSTEAD of the summary, so the summary's own mount is not also on screen.
        const processCard = code("components/admin/focusPanel/cards/BusinessProcessCard.tsx");
        const workspaceReturn = processCard.indexOf("<CurrentWorkCard");
        const summaryReturn = processCard.indexOf("<BusinessProcessSummary");
        expect(workspaceReturn).toBeGreaterThan(-1);
        expect(summaryReturn).toBeGreaterThan(workspaceReturn);
        // The panel is mounted in the summary branch, which is the branch the workspace replaces.
        expect(processCard.indexOf("<CurrentWorkParticipantDecisionsPanel")).toBeGreaterThan(summaryReturn);
    });

    it("no decisions means no section — the slot is rendered bare", () => {
        // A wrapper element or a heading around the slot would draw an empty labelled region on every
        // stage that configures no decisions, which is a statement that there is work to do.
        const card = code("components/operationalCards/ProcessCard.tsx");
        expect(card).toContain("{participantDecisions}");
        expect(card).not.toMatch(/<div[^>]*>\s*\{participantDecisions\}/);
        expect(card).toContain("participantDecisions = null");
    });

    it("the slot stays presentation-only — the card composes, it does not decide", () => {
        const card = code("components/operationalCards/ProcessCard.tsx");
        // No fetching, no scope, no decision vocabulary in the locked component.
        expect(card).not.toContain("participant-decisions");
        expect(card).not.toContain("useEffect");
    });
});

describe("a row's identity is the participant, not their journey", () => {
    it("multiple children each get an addressable row", () => {
        const panel = code("components/admin/focusPanel/cards/CurrentWorkParticipantDecisionsPanel.tsx");
        // At the Decision stage most children have no journey yet; keying on one made the row that
        // needs deciding the row that could not be addressed.
        expect(panel).toContain("const rowKey = row.customer_member_id;");
        expect(panel).toContain("data-decision-child-row={rowKey}");
        expect(panel).not.toContain("const rowKey = row.process_instance_id");
    });
});
