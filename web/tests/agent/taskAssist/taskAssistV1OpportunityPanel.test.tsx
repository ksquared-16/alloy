import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import TaskAssistV1OpportunityPanel, {
    computeReminderSubmitDisabled,
    computeScheduleSendDisabled,
    computeTaskAssistSendDisabled,
} from "@/components/admin/taskAssist/TaskAssistV1OpportunityPanel";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

function validProposal(): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "d".repeat(48),
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
        draft_body: "hello",
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [],
        missing_inputs: [],
        warnings: [],
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "none" },
    };
}

describe("computeTaskAssistSendDisabled", () => {
    it("disables when no recipient selected", () => {
        expect(
            computeTaskAssistSendDisabled({
                proposal: validProposal(),
                proposalValid: true,
                proposeLoading: false,
                applyLoading: false,
                selectedPersonId: null,
                finalBody: "text",
                finalSubject: "",
                channel: "sms",
            })
        ).toBe(true);
    });

    it("disables when body empty", () => {
        expect(
            computeTaskAssistSendDisabled({
                proposal: validProposal(),
                proposalValid: true,
                proposeLoading: false,
                applyLoading: false,
                selectedPersonId: PERSON,
                finalBody: "   ",
                finalSubject: "",
                channel: "sms",
            })
        ).toBe(true);
    });

    it("disables when proposal invalid from server", () => {
        expect(
            computeTaskAssistSendDisabled({
                proposal: validProposal(),
                proposalValid: false,
                proposeLoading: false,
                applyLoading: false,
                selectedPersonId: PERSON,
                finalBody: "text",
                finalSubject: "",
                channel: "sms",
            })
        ).toBe(true);
    });
});

describe("computeScheduleSendDisabled", () => {
    const base = {
        proposalValid: true,
        selectedPersonId: PERSON,
        finalBody: "Hello",
        finalSubject: "",
        channel: "sms" as const,
    };

    it("disables when scheduled time is in the past", () => {
        expect(
            computeScheduleSendDisabled({
                ...base,
                scheduledForLocal: "2000-01-01T12:00",
            })
        ).toBe(true);
    });

    it("disables when proposal not valid", () => {
        expect(
            computeScheduleSendDisabled({
                ...base,
                proposalValid: false,
                scheduledForLocal: "2099-01-01T12:00",
            })
        ).toBe(true);
    });

    it("disables email without subject", () => {
        expect(
            computeScheduleSendDisabled({
                ...base,
                channel: "email",
                finalSubject: "   ",
                scheduledForLocal: "2099-01-01T12:00",
            })
        ).toBe(true);
    });
});

describe("computeReminderSubmitDisabled", () => {
    it("requires title and future due", () => {
        expect(computeReminderSubmitDisabled("", "2099-01-01T10:00")).toBe(true);
        expect(computeReminderSubmitDisabled("x", "")).toBe(true);
        expect(computeReminderSubmitDisabled("x", "2000-01-01T10:00")).toBe(true);
    });
});

describe("TaskAssistV1OpportunityPanel markup", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("does not render send control until a draft exists", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "false");
        const html = renderToStaticMarkup(<TaskAssistV1OpportunityPanel entityId={OPP} active />);
        expect(html).not.toContain("data-task-assist-send");
        expect(html).toContain("Draft message");
    });

    it("with V1 flag on, renders V1.1 lists section (save draft appears after a draft exists)", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "true");
        const html = renderToStaticMarkup(<TaskAssistV1OpportunityPanel entityId={OPP} active />);
        expect(html).toContain("data-task-assist-v11-lists");
        expect(html).toContain("Saved proposals");
    });

    it("does not reference workflow in markup", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "true");
        const html = renderToStaticMarkup(<TaskAssistV1OpportunityPanel entityId={OPP} active />);
        expect(html.toLowerCase()).not.toContain("workflow");
    });
});
