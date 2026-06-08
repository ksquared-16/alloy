import { describe, expect, it } from "vitest";

import { buildEntityResolveContext } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import { buildDeterministicConfigurationProposal } from "@/lib/agent/configLayoutAssist/configLayoutAssistPropose";
import {
    buildProposalListPresentation,
    buildProposalListPresentationFromProposal,
    buildProposalReviewPresentation,
    formatProposalLifecycleState,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

const entityResolve = buildEntityResolveContext(
    [{ entity_type: "opportunities", singular: "Inquiry", plural: "Inquiries" }],
    "opportunity"
);

function recommendationOnlyProposal(): ConfigurationProposalV1 {
    return {
        version: 1,
        id: "rec-1",
        category: "data_quality",
        intent: "scan",
        summary: "Layout integrity scan",
        rationale: ["Duplicate section keys detected."],
        impacted_entities: ["opportunity"],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: [],
        proposed_operations: [
            {
                operation_id: "op-rec",
                kind: "data_quality_recommendation",
                entity_type: "opportunity",
                field_key: null,
                section_key: null,
                before: null,
                after: { recommendation: "fix sections" },
                rationale: ["Review section layout."],
                required_permissions: [],
            },
        ],
        apply_mode: "recommendation_only",
        generated_by: "config_layout_assist",
        created_at: "2026-05-16T12:00:00.000Z",
        metadata: { entity_display_label: "Inquiries" },
    };
}

describe("configLayoutAssistProposalPresentation", () => {
    it("create_field renders human confirmation panel", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "Create Preferred Start Date for inquiries",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        const view = buildProposalReviewPresentation(proposal);

        expect(view.kind).toBe("create_field");
        expect(view.title).toBe("Create a new field");
        expect(view.summary).toContain("Inquiries");
        expect(view.fieldRows.find((r) => r.label === "Field name")?.value).toBe("Preferred Start Date");
        expect(view.fieldRows.find((r) => r.label === "Field type")?.value).toBe("Date");
        expect(view.fieldRows.find((r) => r.label === "Record type")?.value).toBe("Inquiries");
        expect(view.fieldRows.find((r) => r.label === "Required")?.value).toBe("No");
        expect(view.confirmationQuestions).toHaveLength(3);
        expect(view.advanced.internal_field_key).toBe("preferred_start_date");
        expect(view.fieldRows.some((r) => r.label === "Internal key")).toBe(false);
    });

    it("set_field_interaction renders ownership and write-target explanation", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "Make first name editable from the inquiry",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        const view = buildProposalReviewPresentation(proposal);

        expect(view.kind).toBe("set_field_interaction");
        expect(view.title).toBe("Change field editing behavior");
        expect(view.fieldRows.find((r) => r.label === "Field")?.value).toBe("First name");
        expect(view.fieldRows.find((r) => r.label === "Shown on")?.value).toBe("Inquiry");
        expect(view.fieldRows.find((r) => r.label === "Owned by")?.value).toBe("Person");
        expect(view.fieldRows.find((r) => r.label === "Updates")?.value).toBe("Person → First name");
        expect(view.fieldRows.find((r) => r.label === "Risk")?.value).toBe("Medium");
        expect(view.humanExplanation).toMatch(/linked Person/i);
    });

    it("recommendation_only renders as recommendation, not applyable change", () => {
        const proposal = recommendationOnlyProposal();
        const view = buildProposalReviewPresentation(proposal);
        const state = formatProposalLifecycleState("draft", proposal.apply_mode, proposal);

        expect(view.kind).toBe("recommendation");
        expect(view.title).toBe("Recommendation");
        expect(view.summary).toMatch(/No system change/i);
        expect(state.isRecommendationOnly).toBe(true);
        expect(state.stateLabel).toContain("recommendation");
    });

    it("formatProposalLifecycleState uses friendly draft label for mutating proposals", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "Create Preferred Start Date for inquiries",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        const state = formatProposalLifecycleState("draft", proposal.apply_mode, proposal);
        expect(state.stateLabel).toBe("Draft · pending review");
        expect(state.statusHint).toBe("Needs confirmation");
        expect(state.stateLabel).not.toContain("recommendation");
    });

    it("proposal list uses friendly title and status from summary", () => {
        const list = buildProposalListPresentation({
            summary: "Create Preferred Start Date field on Inquiries",
            state: "draft",
            apply_mode: "single_operation",
        });
        expect(list.title).toBe("Create Preferred Start Date field");
        expect(list.forLabel).toBe("Inquiries");
        expect(list.statusHint).toBe("Needs confirmation");
    });

    it("proposal list from proposal uses create field title and inquiries label", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "Create Preferred Start Date for inquiries",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        const list = buildProposalListPresentationFromProposal(proposal, "draft", proposal.apply_mode);
        expect(list.title).toBe("Create Preferred Start Date field");
        expect(list.forLabel).toBe("Inquiries");
    });
});
