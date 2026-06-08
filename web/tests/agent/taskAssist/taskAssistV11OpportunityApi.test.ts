import { describe, expect, it, vi, afterEach } from "vitest";

import {
    TASK_ASSIST_PROPOSALS_URL,
    buildOperationalTaskBody,
    buildPersistProposalBody,
    buildScheduleSendBody,
    cancelCommunicationScheduledSend,
    createCommunicationScheduledSend,
    createOperationalTask,
    patchOperationalTaskStatus,
    persistTaskAssistProposal,
    postTaskAssistProposalApprove,
    postTaskAssistProposalReject,
    proposalsListUrl,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

function minimalProposal(): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "d".repeat(48),
        generated_at_iso: "2026-05-14T00:00:00.000Z",
        org_id: "11111111-1111-4111-8111-111111111111",
        actor_user_id: "22222222-2222-4222-8222-222222222222",
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

describe("taskAssistV11OpportunityApi", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("buildPersistProposalBody wraps payload", () => {
        const p = minimalProposal();
        expect(buildPersistProposalBody(p)).toEqual({ payload: p, expires_at: null });
    });

    it("persistTaskAssistProposal POSTs proposals URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal("fetch", fetchMock);
        const p = minimalProposal();
        await persistTaskAssistProposal(p);
        expect(fetchMock).toHaveBeenCalledWith(
            TASK_ASSIST_PROPOSALS_URL,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify(buildPersistProposalBody(p)),
            }),
        );
    });

    it("approve and reject hit proposal action routes", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal("fetch", fetchMock);
        const id = "55555555-5555-4555-8555-555555555555";
        await postTaskAssistProposalApprove(id);
        await postTaskAssistProposalReject(id);
        expect(fetchMock).toHaveBeenCalledWith(
            `${TASK_ASSIST_PROPOSALS_URL}/${encodeURIComponent(id)}/approve`,
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            `${TASK_ASSIST_PROPOSALS_URL}/${encodeURIComponent(id)}/reject`,
            expect.any(Object),
        );
    });

    it("buildScheduleSendBody includes future ISO and recipient", () => {
        const iso = "2027-01-15T15:00:00.000Z";
        const b = buildScheduleSendBody({
            entityId: OPP,
            recipientPersonId: PERSON,
            channel: "sms",
            bodySnapshot: " Hi ",
            subjectSnapshot: null,
            scheduledForIso: iso,
            proposalId: null,
        });
        expect(b.entity_id).toBe(OPP);
        expect(b.recipient_person_id).toBe(PERSON);
        expect(b.scheduled_for).toBe(iso);
        expect(b.subject_snapshot).toBeNull();
        expect(b.body_snapshot).toBe("Hi");
    });

    it("cancelCommunicationScheduledSend PATCHes status", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal("fetch", fetchMock);
        const id = "66666666-6666-4666-8666-666666666666";
        await cancelCommunicationScheduledSend(id);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(encodeURIComponent(id)),
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ status: "canceled" }),
            }),
        );
    });

    it("buildOperationalTaskBody trims title", () => {
        const b = buildOperationalTaskBody({
            entityId: OPP,
            title: "  Call  ",
            dueAtIso: "2027-02-01T12:00:00.000Z",
            proposalId: null,
        });
        expect(b.title).toBe("Call");
    });

    it("createOperationalTask and patchOperationalTaskStatus use operational-tasks URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal("fetch", fetchMock);
        await createOperationalTask(
            buildOperationalTaskBody({
                entityId: OPP,
                title: "t",
                dueAtIso: "2027-02-01T12:00:00.000Z",
                proposalId: null,
            }),
        );
        await patchOperationalTaskStatus("77777777-7777-4777-8777-777777777777", "completed");
        expect(fetchMock.mock.calls[0][0]).toContain("/api/admin/operational-tasks");
        expect(fetchMock.mock.calls[1][0]).toContain("/api/admin/operational-tasks/");
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH" });
    });

    it("createCommunicationScheduledSend POSTs scheduled sends URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal("fetch", fetchMock);
        await createCommunicationScheduledSend(
            buildScheduleSendBody({
                entityId: OPP,
                recipientPersonId: PERSON,
                channel: "email",
                bodySnapshot: "b",
                subjectSnapshot: "Subj",
                scheduledForIso: "2027-03-01T10:00:00.000Z",
                proposalId: null,
            }),
        );
        expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/communication-scheduled-sends");
    });

    it("proposalsListUrl encodes entity id", () => {
        expect(proposalsListUrl(OPP)).toContain(encodeURIComponent(OPP));
    });
});
