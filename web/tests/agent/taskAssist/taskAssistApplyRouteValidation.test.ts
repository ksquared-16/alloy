import { describe, expect, it } from "vitest";

import { parseAndValidateTaskAssistApplyRequest } from "@/lib/agent/taskAssist/taskAssistApplyRouteValidation";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

function baseProposal(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "a".repeat(48),
        generated_at_iso: "2026-05-14T00:00:00.000Z",
        org_id: ORG,
        actor_user_id: ACTOR,
        source_surface: "opportunity_drawer",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: OPP,
        context_summary: "ctx",
        recipient_candidates: [{ person_id: PERSON, display_label: "P", has_sms: true, has_email: true }],
        selected_recipient: null,
        channel: "sms",
        draft_subject: null,
        draft_body: "old",
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

describe("parseAndValidateTaskAssistApplyRequest", () => {
    it("accepts valid apply and merges final_body + recipient", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: " Final text ",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.merged.draft_body).toBe("Final text");
            expect(r.value.merged.selected_recipient).toEqual({ person_id: PERSON });
            expect(r.value.merged.apply_intent).toEqual({ kind: "send_communication_now" });
            expect(r.value.merged.scheduled_for_iso).toBeNull();
        }
    });

    it("rejects proposal shell when entity_type is not opportunities", () => {
        const bad = { ...baseProposal(), entity_type: "jobs" } as unknown as TaskAssistSuggestionV1;
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: bad,
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_INVALID");
    });

    it("rejects org mismatch", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({ org_id: "99999999-9999-4999-8999-999999999999" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("ORG_MISMATCH");
    });

    it("rejects workflow-ish top-level keys", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
                workflow_id: "w",
            } as Record<string, unknown>,
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("WORKFLOW_KEYS_FORBIDDEN");
    });

    it("rejects empty final_body", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "   ",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("FINAL_BODY_REQUIRED");
    });

    it("rejects email without final_subject", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({
                    channel: "email",
                    task_type: "draft_email",
                    draft_subject: "Old",
                }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "Body",
                channel: "email",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("FINAL_SUBJECT_REQUIRED");
    });

    it("rejects proposal with non-null scheduled_for_iso before merge", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({ scheduled_for_iso: "2026-01-01T00:00:00.000Z" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_SCHEDULED_FORBIDDEN");
    });

    it("rejects apply_intent none", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "none" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("APPLY_INTENT_INVALID");
    });

    it("rejects unknown top-level body keys", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
                extra_field: true,
            } as Record<string, unknown>,
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("UNKNOWN_BODY_KEYS");
    });

    it("rejects non-null reminder_due_at_iso on proposal", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({ reminder_due_at_iso: "2026-06-01T12:00:00.000Z" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_REMINDER_FORBIDDEN");
    });

    it("rejects channel mismatch vs proposal.channel", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({ channel: "sms" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "x",
                channel: "email",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("CHANNEL_MISMATCH");
    });

    it("rejects invalid selected_recipient person_id", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: "not-a-uuid" },
                final_body: "x",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("SELECTED_RECIPIENT_INVALID");
    });

    it("merged draft_body uses final_body, not stale proposal.draft_body", () => {
        const r = parseAndValidateTaskAssistApplyRequest(
            {
                proposal: baseProposal({ draft_body: "STALE" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: PERSON },
                final_body: "OPERATOR_FINAL",
                channel: "sms",
            },
            { orgId: ORG, actorUserId: ACTOR }
        );
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.merged.draft_body).toBe("OPERATOR_FINAL");
    });
});
