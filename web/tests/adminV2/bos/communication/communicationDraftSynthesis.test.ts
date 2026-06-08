import { describe, expect, it } from "vitest";

import { resolveCommunicationObjective } from "@/lib/adminV2/bos/communication/communicationObjectives";
import { synthesizeOperationalCommunicationDraft } from "@/lib/adminV2/bos/communication/communicationDraftSynthesis";
import { generateOperationalDraft } from "@/lib/adminV2/bos/communication/generateOperationalDraft";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import { buildBosAssistHandoffPackage } from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import { buildDeterministicTaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/taskAssistDeterministicProposal";
import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";

const internalRecommendation =
    "Send a warm first response and confirm the family's preferred next step.";

describe("communication objective layer", () => {
    it("maps stale new inquiry to initial_outreach", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(
            resolveCommunicationObjective({
                overviewData: { _operational_recommendation: rec },
                copy: { doNext: internalRecommendation } as never,
            })
        ).toBe("initial_outreach");
    });
});

describe("communicationDraftSynthesis", () => {
    it("does not reuse internal recommendation as message body", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "initial_outreach",
            channel: "email",
            recipientFirstName: "Sarah",
            siteOrOrgName: "West Campus",
            operatorDisplayName: "Kelly Morgan",
            internalGuidance: internalRecommendation,
        });
        expect(draft.body).not.toContain("confirm the family's preferred next step");
        expect(draft.body).toContain("Sarah");
        expect(draft.body).toContain("West Campus");
        expect(draft.body).toContain("Kelly Morgan");
        expect(draft.body).not.toContain("[Staff Name]");
        expect(draft.subject).toContain("West Campus");
    });

    it("omits our center when site is unknown", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "initial_outreach",
            channel: "email",
            recipientFirstName: "Sarah",
        });
        expect(draft.body).not.toContain("our center");
        expect(draft.body).toContain("Thank you for your interest");
    });

    it("follow-up overdue uses reconnect framing", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "follow_up",
            channel: "email",
            recipientFirstName: "Patel",
            siteOrOrgName: "North Site",
        });
        expect(draft.body.toLowerCase()).toMatch(/reconnect|haven't had a chance/);
        expect(draft.body).not.toContain("Send a warm first response");
    });

    it("tour scheduling offers scheduling naturally", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "schedule_tour",
            channel: "email",
            siteOrOrgName: "West Campus",
        });
        expect(draft.body.toLowerCase()).toMatch(/schedule a tour|next steps/);
    });

    it("SMS channel uses dedicated sms_body not email body", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "initial_outreach",
            channel: "sms",
            recipientFirstName: "Sarah",
            siteOrOrgName: "West Campus",
            operatorDisplayName: "Kelly Kurzman",
        });
        expect(draft.sms_body).toContain("Hi Sarah —");
        expect(draft.sms_body).not.toContain("\n\n");
        expect(draft.body).toContain("Hi Sarah,");
    });
});

describe("BOS handoff bootstrap synthesis", () => {
    it("includes synthesized draft in handoff bootstrap for draft_message", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const pkg = buildBosAssistHandoffPackage({
            entityLabel: "Sarah Chen",
            overviewData: {
                _operational_recommendation: rec,
                name: "Sarah Chen",
                _site_name: "West Campus",
            },
        });
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).toBeTruthy();
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).not.toContain(
            "confirm the family's preferred next step"
        );
        expect(pkg.taskAssistBootstrap?.operator_guidance).toBe("Initial outreach");
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).not.toContain("[Staff Name]");
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).not.toContain("our center");
    });
});

describe("propose path with synthesized draft", () => {
    const ctx: TaskAssistOpportunityContextV1 = {
        opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        opportunity_label: "Chen household",
        status_key: "new_inquiry",
        status_label: "New inquiry",
        work_unit_id: null,
        customer_id: null,
        household_label: "Chen household",
        primary_person_id: null,
        primary_child_display_name: null,
        children_summary: null,
        child_profiles: [],
        activity_summary: null,
        last_activity_at: null,
        recipient_candidates: [],
    };

    it("uses synthesized body in deterministic proposal", () => {
        const generated = generateOperationalDraft({
            overviewData: { name: "Sarah Chen", _site_name: "West Campus" },
            copy: {
                eyebrow: "Review assist",
                operationalRead: "New inquiry needs response",
                whyNow: "24 days since inquiry",
                doNext: internalRecommendation,
                contextLine: "Active record",
                ctaLabel: "Continue",
            },
            channel: "email",
        });
        const proposal = buildDeterministicTaskAssistSuggestionV1({
            orgId: "11111111-1111-4111-8111-111111111111",
            actorUserId: "22222222-2222-4222-8222-222222222222",
            channel: "email",
            instruction: `communication_objective:${generated.objective}`,
            context: ctx,
            synthesizedDraft: {
                subject: generated.subject,
                body: generated.body,
                sms_body: generated.sms_body,
            },
        });
        expect(proposal.draft_body).toContain("West Campus");
        expect(proposal.draft_body).not.toContain("confirm the family's preferred next step");
        expect(proposal.draft_subject).toContain("West Campus");
    });

    it("propose uses sms_body when channel is sms", () => {
        const generated = generateOperationalDraft({
            overviewData: { name: "Sarah Chen", _site_name: "West Campus" },
            copy: {
                eyebrow: "Review assist",
                operationalRead: "New inquiry needs response",
                whyNow: "24 days since inquiry",
                doNext: internalRecommendation,
                contextLine: "Active record",
                ctaLabel: "Continue",
            },
            channel: "sms",
            operatorDisplayName: "Kelly Kurzman",
        });
        const proposal = buildDeterministicTaskAssistSuggestionV1({
            orgId: "11111111-1111-4111-8111-111111111111",
            actorUserId: "22222222-2222-4222-8222-222222222222",
            channel: "sms",
            instruction: `communication_objective:${generated.objective}`,
            context: ctx,
            synthesizedDraft: {
                subject: generated.subject,
                body: generated.body,
                sms_body: generated.sms_body,
            },
        });
        expect(proposal.draft_body).toContain("Hi Sarah —");
        expect(proposal.draft_body).not.toContain("Thank you,\nKelly");
    });
});
