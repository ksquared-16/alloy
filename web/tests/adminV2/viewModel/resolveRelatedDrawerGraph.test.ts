import { describe, expect, it } from "vitest";

import { resolveRelatedDrawerGraph } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveRelatedDrawerGraph";
import { findBackToLeadOpportunityInStack } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveBackToLeadOpportunity";
import { isDrawerTargetWarm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerTargetCache";
import { resolvePersonDrawerOperatingBackLink } from "@/lib/admin/person/personDrawerBackLink";

describe("resolveRelatedDrawerGraph", () => {
    const ws = { work_unit_id: "wu-1", department_id: "dept-1" };

    it("resolves opportunity warm targets for inquiry children", () => {
        const graph = resolveRelatedDrawerGraph({
            drawer: {
                type: "opportunities",
                id: "opp-1",
                opportunityWorkspaceContext: ws,
            },
            entityType: "opportunities",
            record: {
                id: "opp-1",
                _inquiry_children: [{ person_id: "child-1", customer_member_id: "cm-1" }],
            },
            runtime: "opportunity",
            stack: [],
        });
        expect(graph.relatedChildTargets.some((t) => t.entityId === "child-1")).toBe(true);
        expect(graph.backToLeadOpportunityId).toBeNull();
    });

    it("pins back-to-lead from stack for child runtime", () => {
        const graph = resolveRelatedDrawerGraph({
            drawer: {
                type: "persons",
                id: "child-1",
                opportunityWorkspaceContext: ws,
                personDrawerOpenSeed: {
                    personId: "child-1",
                    presentation_emphasis: "child_lifecycle",
                    opportunity_id: "opp-1",
                },
            },
            entityType: "persons",
            record: { id: "child-1" },
            runtime: "child",
            stack: [
                { type: "opportunities", id: "opp-1", opportunityWorkspaceContext: ws },
                { type: "persons", id: "guardian-1", opportunityWorkspaceContext: ws },
            ],
        });
        expect(graph.backToLeadOpportunityId).toBe("opp-1");
        expect(
            graph.warmTargets.some(
                (t) => t.entityType === "opportunities" && t.entityId === "opp-1"
            )
        ).toBe(true);
    });
});

describe("findBackToLeadOpportunityInStack", () => {
    it("falls back to person drawer seed opportunity id", () => {
        const lead = findBackToLeadOpportunityInStack([], {
            personDrawerOpenSeed: { personId: "p-1", opportunity_id: "opp-seed" },
        });
        expect(lead?.id).toBe("opp-seed");
    });
});

describe("resolvePersonDrawerOperatingBackLink", () => {
    it("shows Back to Lead when stack contains opportunity under person frame", () => {
        const link = resolvePersonDrawerOperatingBackLink(
            true,
            { type: "persons", id: "guardian-1" },
            "opportunity_inquiry_child",
            {
                stack: [{ type: "opportunities", id: "opp-1" }],
                drawer: { personDrawerOpenSeed: { personId: "child-1", opportunity_id: "opp-1" } },
            }
        );
        expect(link?.label).toBe("Back to Lead");
        expect(link?.mode).toBe("back_to_lead");
    });
});

describe("isDrawerTargetWarm", () => {
    it("returns false when VM cache is empty", () => {
        expect(
            isDrawerTargetWarm({
                type: "opportunities",
                id: "opp-cold",
                opportunityWorkspaceContext: { work_unit_id: "wu", department_id: "dept" },
            })
        ).toBe(false);
    });
});
