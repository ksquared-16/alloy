import { describe, expect, it } from "vitest";

import {
    buildTaskAssistApplyRequestBody,
    buildTaskAssistProposeRequestBody,
} from "@/lib/agent/taskAssist/taskAssistV1ClientPayloads";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

function minimalProposal(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "c".repeat(48),
        generated_at_iso: "2026-05-14T00:00:00.000Z",
        org_id: ORG,
        actor_user_id: ACTOR,
        source_surface: "opportunity_drawer",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: OPP,
        context_summary: "x",
        recipient_candidates: [{ person_id: PERSON, display_label: "P", has_sms: true, has_email: true }],
        selected_recipient: null,
        channel: "sms",
        draft_subject: null,
        draft_body: "server draft",
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [],
        missing_inputs: [],
        warnings: [],
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "none" },
        ...overrides,
    };
}

describe("buildTaskAssistProposeRequestBody", () => {
    it("builds opportunities-only propose payload", () => {
        expect(
            buildTaskAssistProposeRequestBody({
                entityId: OPP,
                channel: "email",
                instruction: "  follow up  ",
            })
        ).toEqual({
            entity_type: "opportunities",
            entity_id: OPP,
            channel: "email",
            instruction: "follow up",
        });
    });
});

describe("buildTaskAssistApplyRequestBody", () => {
    it("uses edited final_body, not proposal.draft_body", () => {
        const proposal = minimalProposal({ draft_body: "OLD FROM SERVER" });
        const body = buildTaskAssistApplyRequestBody({
            proposal,
            selectedPersonId: PERSON,
            finalBody: "  OPERATOR EDITED  ",
            finalSubject: "",
            channel: "sms",
        });
        expect(body.final_body).toBe("OPERATOR EDITED");
        expect(body.proposal.draft_body).toBe("OLD FROM SERVER");
    });

    it("includes final_subject for email only", () => {
        const proposal = minimalProposal({
            channel: "email",
            task_type: "draft_email",
            draft_subject: "Old subj",
        });
        const body = buildTaskAssistApplyRequestBody({
            proposal,
            selectedPersonId: PERSON,
            finalBody: "Hi",
            finalSubject: "  New subject  ",
            channel: "email",
        });
        expect(body.final_subject).toBe("New subject");
        expect(body.channel).toBe("email");
    });
});
