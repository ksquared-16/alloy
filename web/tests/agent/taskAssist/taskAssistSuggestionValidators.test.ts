import { describe, expect, it } from "vitest";

import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import {
    validateTaskAssistSuggestionV1ForPropose,
    validateTaskAssistSuggestionV1ForSendApply,
    validateTaskAssistV1ApprovalRequired,
    validateTaskAssistV1DraftBodyRequired,
    validateTaskAssistV1EntityType,
    validateTaskAssistV1FollowUpDeferred,
    validateTaskAssistV1InAppDeferred,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
    validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds,
    validateTaskAssistV1RecipientChannelAddress,
    validateTaskAssistV1ReminderFieldDeferred,
    validateTaskAssistV1ScheduledSendDisallowed,
    validateTaskAssistV1SendChannel,
    validateTaskAssistV1SingleSelectedRecipient,
    validateTaskAssistV1TaskTypeChannelAlignment,
    validateTaskAssistV1VersionAndAgent,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

function baseSuggestion(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "sug-1",
        generated_at_iso: "2026-05-14T00:00:00.000Z",
        org_id: ORG,
        actor_user_id: ACTOR,
        source_surface: "opportunity_drawer",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: OPP,
        context_summary: "Follow up on inquiry",
        recipient_candidates: [
            {
                person_id: PERSON,
                display_label: "Parent",
                has_sms: true,
                has_email: true,
            },
        ],
        selected_recipient: { person_id: PERSON },
        channel: "sms",
        draft_subject: null,
        draft_body: "Hello",
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [],
        missing_inputs: [],
        warnings: [],
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "send_communication_now" },
        ...overrides,
    };
}

function baseProposeSuggestion(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        ...baseSuggestion(),
        apply_intent: { kind: "none" },
        selected_recipient: null,
        missing_inputs: ["Select a recipient before send (required for apply)."],
        ...overrides,
    };
}

describe("validateTaskAssistV1VersionAndAgent", () => {
    it("accepts v1 + task_assist", () => {
        expect(validateTaskAssistV1VersionAndAgent({ version: 1, agent_key: TASK_ASSIST_AGENT_KEY })).toEqual([]);
    });
    it("rejects wrong version", () => {
        expect(validateTaskAssistV1VersionAndAgent({ version: 2 as 1, agent_key: TASK_ASSIST_AGENT_KEY })).toContain(
            "task_assist_v1:version_must_be_1"
        );
    });
    it("rejects wrong agent_key", () => {
        expect(
            validateTaskAssistV1VersionAndAgent({ version: 1, agent_key: "other" as typeof TASK_ASSIST_AGENT_KEY })
        ).toContain("task_assist_v1:agent_key_invalid");
    });
});

describe("validateTaskAssistV1EntityType", () => {
    it("accepts opportunities", () => {
        expect(validateTaskAssistV1EntityType("opportunities")).toEqual([]);
    });
    it("rejects jobs", () => {
        expect(validateTaskAssistV1EntityType("jobs")).toEqual(["task_assist_v1:entity_type_unsupported"]);
    });
});

describe("validateTaskAssistV1SendChannel", () => {
    it("accepts sms and email", () => {
        expect(validateTaskAssistV1SendChannel("sms")).toEqual([]);
        expect(validateTaskAssistV1SendChannel("email")).toEqual([]);
    });
    it("rejects in_app", () => {
        expect(validateTaskAssistV1SendChannel("in_app")).toEqual(["task_assist_v1:channel_unsupported"]);
    });
});

describe("validateTaskAssistV1ScheduledSendDisallowed", () => {
    it("accepts null", () => {
        expect(validateTaskAssistV1ScheduledSendDisallowed(null)).toEqual([]);
    });
    it("rejects non-null", () => {
        expect(validateTaskAssistV1ScheduledSendDisallowed("2026-05-15T12:00:00.000Z")).toEqual([
            "task_assist_v1:scheduled_send_disallowed",
        ]);
    });
});

describe("validateTaskAssistV1ApprovalRequired", () => {
    it("requires true", () => {
        expect(validateTaskAssistV1ApprovalRequired(true)).toEqual([]);
        expect(validateTaskAssistV1ApprovalRequired(false)).toEqual(["task_assist_v1:approval_required_must_be_true"]);
    });
});

describe("validateTaskAssistV1DraftBodyRequired", () => {
    it("requires non-empty trimmed body", () => {
        expect(validateTaskAssistV1DraftBodyRequired("x")).toEqual([]);
        expect(validateTaskAssistV1DraftBodyRequired("  ")).toEqual(["task_assist_v1:draft_body_required"]);
    });
});

describe("validateTaskAssistV1SingleSelectedRecipient", () => {
    it("requires selected recipient with UUID", () => {
        expect(validateTaskAssistV1SingleSelectedRecipient(null)).toContain("task_assist_v1:selected_recipient_required");
        expect(validateTaskAssistV1SingleSelectedRecipient({ person_id: "not-a-uuid" })).toContain(
            "task_assist_v1:selected_recipient_person_id_invalid"
        );
    });
});

describe("validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds", () => {
    it("flags duplicate person_id", () => {
        const dup = [
            { person_id: PERSON, display_label: "A", has_sms: true, has_email: false },
            { person_id: PERSON, display_label: "B", has_sms: false, has_email: true },
        ];
        expect(validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds(dup)).toContain(
            "task_assist_v1:duplicate_recipient_person_id"
        );
    });
});

describe("validateTaskAssistV1RecipientChannelAddress", () => {
    const candidates = [{ person_id: PERSON, display_label: "P", has_sms: false, has_email: true }];
    it("requires has_sms for sms", () => {
        expect(validateTaskAssistV1RecipientChannelAddress("sms", PERSON, candidates)).toContain(
            "task_assist_v1:recipient_missing_sms_address"
        );
    });
    it("requires has_email for email", () => {
        const c2 = [{ person_id: PERSON, display_label: "P", has_sms: true, has_email: false }];
        expect(validateTaskAssistV1RecipientChannelAddress("email", PERSON, c2)).toContain(
            "task_assist_v1:recipient_missing_email_address"
        );
    });
    it("requires candidate row for selected person", () => {
        expect(validateTaskAssistV1RecipientChannelAddress("sms", ORG, candidates)).toContain(
            "task_assist_v1:selected_recipient_not_in_candidates"
        );
    });
});

describe("validateTaskAssistV1FollowUpDeferred", () => {
    it("rejects follow-up task type and apply intent", () => {
        expect(
            validateTaskAssistV1FollowUpDeferred("set_opportunity_follow_up", { kind: "send_communication_now" })
        ).toContain("task_assist_v1:follow_up_task_type_deferred");
        expect(
            validateTaskAssistV1FollowUpDeferred("draft_sms", {
                kind: "set_opportunity_follow_up",
                follow_up_at_iso: "2026-05-20T12:00:00.000Z",
            })
        ).toContain("task_assist_v1:follow_up_apply_intent_deferred");
    });
});

describe("validateTaskAssistV1InAppDeferred", () => {
    it("rejects in_app channel and draft_in_app", () => {
        expect(validateTaskAssistV1InAppDeferred("draft_sms", "in_app")).toContain("task_assist_v1:in_app_channel_deferred");
        expect(validateTaskAssistV1InAppDeferred("draft_in_app", "sms")).toContain("task_assist_v1:draft_in_app_deferred");
    });
});

describe("validateTaskAssistV1ReminderFieldDeferred", () => {
    it("rejects non-null reminder", () => {
        expect(validateTaskAssistV1ReminderFieldDeferred("2026-05-20T12:00:00.000Z")).toContain(
            "task_assist_v1:reminder_due_at_deferred"
        );
    });
});

describe("validateTaskAssistV1TaskTypeChannelAlignment", () => {
    it("flags mismatch", () => {
        expect(validateTaskAssistV1TaskTypeChannelAlignment("draft_sms", "email")).toContain("task_assist_v1:task_type_channel_mismatch");
        expect(validateTaskAssistV1TaskTypeChannelAlignment("draft_email", "sms")).toContain("task_assist_v1:task_type_channel_mismatch");
    });
});

describe("validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys", () => {
    it("flags forbidden keys", () => {
        expect(validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys({ workflow_id: "x" })).toContain(
            "task_assist_v1:workflow_key_forbidden:workflow_id"
        );
    });
    it("accepts clean object", () => {
        expect(validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys({ draft_body: "hi" })).toEqual([]);
    });
});

describe("validateTaskAssistSuggestionV1ForSendApply", () => {
    it("returns no errors for a minimal valid SMS send proposal", () => {
        expect(validateTaskAssistSuggestionV1ForSendApply(baseSuggestion())).toEqual([]);
    });
    it("aggregates multiple violations", () => {
        const errs = validateTaskAssistSuggestionV1ForSendApply(
            baseSuggestion({
                approval_required: false,
                scheduled_for_iso: "2026-01-01T00:00:00.000Z",
                draft_body: "   ",
                selected_recipient: null,
            })
        );
        expect(errs).toContain("task_assist_v1:approval_required_must_be_true");
        expect(errs).toContain("task_assist_v1:scheduled_send_disallowed");
        expect(errs).toContain("task_assist_v1:draft_body_required");
        expect(errs).toContain("task_assist_v1:selected_recipient_required");
    });
    it("rejects apply_intent other than send_communication_now", () => {
        expect(
            validateTaskAssistSuggestionV1ForSendApply(
                baseSuggestion({ apply_intent: { kind: "none" }, approval_required: true })
            )
        ).toContain("task_assist_v1:apply_intent_must_be_send_communication_now");
    });
});

describe("validateTaskAssistSuggestionV1ForPropose", () => {
    it("accepts a minimal valid propose artifact", () => {
        expect(validateTaskAssistSuggestionV1ForPropose(baseProposeSuggestion())).toEqual([]);
    });
    it("rejects when no candidate supports the channel", () => {
        const errs = validateTaskAssistSuggestionV1ForPropose(
            baseProposeSuggestion({
                channel: "sms",
                task_type: "draft_sms",
                recipient_candidates: [
                    { person_id: PERSON, display_label: "A", has_sms: false, has_email: true },
                ],
            })
        );
        expect(errs).toContain("task_assist_v1:no_eligible_recipient_for_channel");
    });
    it("rejects when recipient list is empty", () => {
        expect(validateTaskAssistSuggestionV1ForPropose(baseProposeSuggestion({ recipient_candidates: [] }))).toContain(
            "task_assist_v1:no_recipient_candidates"
        );
    });
    it("rejects non-none apply_intent", () => {
        expect(
            validateTaskAssistSuggestionV1ForPropose(
                baseProposeSuggestion({ apply_intent: { kind: "send_communication_now" } })
            )
        ).toContain("task_assist_v1:propose_requires_apply_intent_none");
    });
});
