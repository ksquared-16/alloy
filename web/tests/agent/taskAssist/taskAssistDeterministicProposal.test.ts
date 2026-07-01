import { describe, expect, it } from "vitest";

import { buildDeterministicTaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/taskAssistDeterministicProposal";
import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";

const OPP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function baseContext(overrides: Partial<TaskAssistOpportunityContextV1> = {}): TaskAssistOpportunityContextV1 {
    return {
        opportunity_id: OPP,
        opportunity_label: "Summer inquiry",
        status_key: "new_inquiry",
        status_label: "New inquiry",
        work_unit_id: null,
        customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        household_label: "Nguyen family",
        primary_person_id: PERSON,
        primary_child_display_name: null,
        children_summary: "One child profile is linked for this family.",
        child_profiles: [],
        activity_summary: "Note added",
        last_activity_at: "2026-05-01T12:00:00.000Z",
        recipient_candidates: [
            {
                person_id: PERSON,
                display_label: "Alex (Primary person)",
                has_sms: true,
                has_email: true,
            },
        ],
        ...overrides,
    };
}

describe("buildDeterministicTaskAssistSuggestionV1", () => {
    it("builds SMS draft with deterministic fields", () => {
        const p = buildDeterministicTaskAssistSuggestionV1({
            orgId: "11111111-1111-4111-8111-111111111111",
            actorUserId: "22222222-2222-4222-8222-222222222222",
            channel: "sms",
            instruction: "Please follow up about tour availability.",
            context: baseContext(),
        });
        expect(p.version).toBe(1);
        expect(p.task_type).toBe("draft_sms");
        expect(p.channel).toBe("sms");
        expect(p.apply_intent).toEqual({ kind: "none" });
        expect(p.selected_recipient).toBeNull();
        expect(p.draft_body).toContain("tour availability");
        expect(p.context_summary).toContain("Summer inquiry");
        expect(p.draft_subject).toBeNull();
        expect(p.recipient_candidates).toHaveLength(1);
        expect(p.suggestion_id).toHaveLength(48);
    });

    it("builds email draft with subject", () => {
        const p = buildDeterministicTaskAssistSuggestionV1({
            orgId: "11111111-1111-4111-8111-111111111111",
            actorUserId: "22222222-2222-4222-8222-222222222222",
            channel: "email",
            instruction: "Hello",
            context: baseContext(),
        });
        expect(p.task_type).toBe("draft_email");
        expect(p.draft_subject).toContain("Follow-up:");
        expect(p.draft_subject).toContain("Summer inquiry");
    });
});
