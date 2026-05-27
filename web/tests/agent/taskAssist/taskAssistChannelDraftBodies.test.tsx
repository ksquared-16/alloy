import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { synthesizeOperationalCommunicationDraft } from "@/lib/adminV2/bos/communication/communicationDraftSynthesis";
import { buildDeterministicTaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/taskAssistDeterministicProposal";
import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";
import {
    channelDraftsFromProposal,
    channelDraftsFromSynthesizedDraft,
    draftBodyForChannel,
} from "@/lib/agent/taskAssist/taskAssistChannelDraftBodies";
import TaskAssistCompactDraftCard from "@/components/admin/taskAssist/TaskAssistCompactDraftCard";
import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const ctx: TaskAssistOpportunityContextV1 = {
    opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    opportunity_label: "Sarah Chen",
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
    recipient_candidates: [
        {
            person_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            display_label: "Sarah Chen",
            has_sms: true,
            has_email: true,
        },
    ],
};

const synthesized = synthesizeOperationalCommunicationDraft({
    objective: "initial_outreach",
    channel: "email",
    recipientFirstName: "Sarah",
    siteOrOrgName: "West Campus",
    operatorDisplayName: "Kelly Kurzman",
});

const bootstrap: TaskAssistCommandBootstrap = {
    intent_type: "draft_message",
    channel_hint: "sms",
    instruction: "communication_objective:initial_outreach",
    timing_hint_text: null,
    reminder_title: null,
    reminder_due_hint: null,
    communication_objective: "initial_outreach",
    synthesized_draft: {
        subject: synthesized.subject,
        body: synthesized.body,
        sms_body: synthesized.sms_body,
        mode: "deterministic",
    },
};

describe("taskAssistChannelDraftBodies", () => {
    it("bootstrap carries distinct email and sms bodies", () => {
        const drafts = channelDraftsFromSynthesizedDraft(bootstrap.synthesized_draft);
        expect(drafts.email).toContain("Hi Sarah,");
        expect(drafts.email).toContain("Thank you,\nKelly Kurzman");
        expect(drafts.sms).toContain("Hi Sarah —");
        expect(drafts.sms).toContain("Kelly");
        expect(drafts.sms).not.toContain("Thank you,\nKelly");
        expect(drafts.email).not.toBe(drafts.sms);
    });

    it("proposal exposes both channel bodies for UI swap", () => {
        const proposal = buildDeterministicTaskAssistSuggestionV1({
            orgId: "11111111-1111-4111-8111-111111111111",
            actorUserId: "22222222-2222-4222-8222-222222222222",
            channel: "sms",
            instruction: "communication_objective:initial_outreach",
            context: ctx,
            synthesizedDraft: {
                subject: synthesized.subject,
                body: synthesized.body,
                sms_body: synthesized.sms_body,
            },
        });
        expect(proposal.draft_body_sms).toContain("Hi Sarah —");
        expect(proposal.draft_body_email).toContain("Hi Sarah,");
        expect(proposal.draft_body).toBe(proposal.draft_body_sms);

        const merged = channelDraftsFromProposal(
            proposal,
            channelDraftsFromSynthesizedDraft(bootstrap.synthesized_draft)
        );
        expect(draftBodyForChannel(merged, "sms")).toContain("Hi Sarah —");
        expect(draftBodyForChannel(merged, "email")).toContain("Thank you,\nKelly Kurzman");
    });
});

describe("TaskAssistCompactDraftCard channel UI", () => {
    it("renders channel-specific body from bootstrap when autoPropose is off", () => {
        const prev = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED;
        process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED = "true";
        try {
            const smsHtml = renderToStaticMarkup(
                <TaskAssistCompactDraftCard
                    entityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                    entityLabel="Sarah Chen"
                    bootstrap={{ ...bootstrap, channel_hint: "sms" }}
                    bootstrapKey="k-sms"
                    autoPropose={false}
                />
            );
            expect(smsHtml).toContain('data-task-assist-message-body="sms"');
            expect(smsHtml).toContain("Hi Sarah —");
            expect(smsHtml).not.toContain("Thank you,\nKelly Kurzman");

            const emailHtml = renderToStaticMarkup(
                <TaskAssistCompactDraftCard
                    entityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                    entityLabel="Sarah Chen"
                    bootstrap={{ ...bootstrap, channel_hint: "email" }}
                    bootstrapKey="k-email"
                    autoPropose={false}
                />
            );
            expect(emailHtml).toContain('data-task-assist-message-body="email"');
            expect(emailHtml).toContain("Hi Sarah,");
            expect(emailHtml).toContain("Thank you,\nKelly Kurzman");
        } finally {
            if (prev === undefined) delete process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED;
            else process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED = prev;
        }
    });

    it("source wires channel swap via channelDrafts state", () => {
        const src = readFileSync(
            join(webRoot, "components/admin/taskAssist/TaskAssistCompactDraftCard.tsx"),
            "utf8"
        );
        expect(src).toContain("onSelectChannel");
        expect(src).toContain("channelDraftsFromProposal");
        expect(src).toContain("draftBodyForChannel(channelDrafts, channel)");
        expect(src).toContain("setChannelDrafts((prev) => ({ ...prev, [channel]: e.target.value }))");
    });
});
