import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/ai/task-assist/apply/route";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";

type CommsSendAuth = { ok: true } | { ok: false; message: string };
type AssertCommsParams = { orgId: string; actor: { userId?: string } | null | undefined };

const { mockGetAdminContextCached, mockExecuteCommunicationsSend, mockAssertCommsSend } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockExecuteCommunicationsSend: vi.fn(),
    mockAssertCommsSend: vi.fn(async (_params: AssertCommsParams): Promise<CommsSendAuth> => ({ ok: true })),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return {
        ...actual,
        requireAdminOrOps: vi.fn(() => Promise.resolve(null)),
    };
});

vi.mock("@/lib/communications/communicationPermissions", async () => {
    const actual = await vi.importActual<typeof import("@/lib/communications/communicationPermissions")>(
        "@/lib/communications/communicationPermissions",
    );
    return {
        ...actual,
        assertCommunicationsSendAllowed: ((params: AssertCommsParams) =>
            mockAssertCommsSend(params)) as typeof actual.assertCommunicationsSendAllowed,
    };
});

// The apply route converged onto the canonical send command in Phase 1 Slice 1,
// so that is what must be mocked. Mocking the legacy adapter here silently
// stopped intercepting and let the real command reach a stub supabase.
vi.mock("@/lib/communications/send/canonicalSend", () => ({
    canonicalSend: (...args: unknown[]) => mockExecuteCommunicationsSend(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

function baseProposal(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "b".repeat(48),
        generated_at_iso: "2026-05-14T00:00:00.000Z",
        org_id: orgId,
        actor_user_id: userId,
        source_surface: "opportunity_drawer",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: oppId,
        context_summary: "ctx",
        recipient_candidates: [{ person_id: personId, display_label: "P", has_sms: true, has_email: true }],
        selected_recipient: null,
        channel: "sms",
        draft_subject: null,
        draft_body: "draft",
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

function postJson(body: unknown) {
    return new NextRequest("http://localhost/api/admin/ai/task-assist/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/admin/ai/task-assist/apply", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
        mockExecuteCommunicationsSend.mockResolvedValue({
        outcome: "sent_to_queue",
        reason: "queued",
        message: "Message queued for delivery.",
        messageId: "msg-1",
        threadId: "thr-1",
    });
        mockAssertCommsSend.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns 400 when final_body is empty", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "",
                channel: "sms",
            }),
        );
        expect(res.status).toBe(400);
        expect(mockExecuteCommunicationsSend).not.toHaveBeenCalled();
    });

    it("returns 400 when proposal has scheduled_for_iso", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal({ scheduled_for_iso: "2026-12-01T12:00:00.000Z" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "Hi",
                channel: "sms",
            }),
        );
        expect(res.status).toBe(400);
        expect(mockExecuteCommunicationsSend).not.toHaveBeenCalled();
    });

    it("calls the canonical send command for a valid approved SMS apply", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "Approved body",
                channel: "sms",
            }),
        );
        expect(res.status).toBe(200);
        expect(mockExecuteCommunicationsSend).toHaveBeenCalledTimes(1);
        const arg = mockExecuteCommunicationsSend.mock.calls[0]![0] as {
            bodyRaw: string;
            recipient: { kind: string; personId: string };
            audience: string;
            category: string;
            purpose: string;
            idempotencyKey: string;
            metadata: Record<string, unknown>;
        };
        expect(arg.bodyRaw).toBe("Approved body");
        // The BOS proposal becomes a TYPED person recipient that the server
        // re-resolves — never a raw address.
        expect(arg.recipient.kind).toBe("person");
        expect(arg.recipient.personId).toBe(personId);
        // Classification is explicit and the purpose is server-owned.
        expect(arg.audience).toBe("external");
        expect(arg.category).toBe("operational");
        expect(arg.purpose).toBe("assisted_operator_message");
        expect(arg.idempotencyKey).toContain(personId);
        expect(arg.metadata?.source).toBe("task_assist_apply_v1");
        const j = (await res.json()) as { ok?: boolean; send?: { communication_message_id?: string } };
        expect(j.ok).toBe(true);
        expect(j.send?.communication_message_id).toBe("msg-1");
    });

    it("returns 400 for workflow-like keys on apply body", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "Hi",
                channel: "sms",
                workflow_id: "x",
            }),
        );
        expect(res.status).toBe(400);
        expect(mockExecuteCommunicationsSend).not.toHaveBeenCalled();
    });

    it("returns 400 for unknown keys on apply body", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "Hi",
                channel: "sms",
                unexpected: 1,
            }),
        );
        expect(res.status).toBe(400);
        expect(mockExecuteCommunicationsSend).not.toHaveBeenCalled();
    });

    it("returns 403 when communications send is not allowed", async () => {
        mockAssertCommsSend.mockResolvedValueOnce({ ok: false, message: "Send not permitted for this role." });
        const res = await POST(
            postJson({
                proposal: baseProposal(),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "Hi",
                channel: "sms",
            }),
        );
        expect(res.status).toBe(403);
        expect(mockExecuteCommunicationsSend).not.toHaveBeenCalled();
        const j = (await res.json()) as { ok?: boolean; error?: string; code?: string };
        expect(j.ok).toBe(false);
        expect(j.code).toBe("communications_send_forbidden");
        expect(j.error).toBe("Send not permitted for this role.");
    });

    it("passes operator final_body to the canonical send command, not proposal draft_body", async () => {
        const res = await POST(
            postJson({
                proposal: baseProposal({ draft_body: "NEVER SEND THIS" }),
                apply_intent: { kind: "send_communication_now" },
                selected_recipient: { person_id: personId },
                final_body: "SEND THIS INSTEAD",
                channel: "sms",
            }),
        );
        expect(res.status).toBe(200);
        const arg = mockExecuteCommunicationsSend.mock.calls[0]![0] as { bodyRaw: string };
        expect(arg.bodyRaw).toBe("SEND THIS INSTEAD");
        // The AI's draft never reaches the send: the operator's final body wins.
        expect(arg.bodyRaw).not.toContain("NEVER SEND");
    });
});
