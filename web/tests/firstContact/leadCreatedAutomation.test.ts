import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Automation: "When a new Enrollment lead is created → send a Template Library message."
 * One business event (`lead_created`, genuinely-created leads only, once per lead), one action
 * (`send_communication_template`: the template by reference, current version at send time, through the
 * canonical sender, idempotent per workflow × lead).
 */
const m = vi.hoisted(() => ({
    emitEvent: vi.fn(async () => "evt-1"),
    executeWorkflowRun: vi.fn(async () => ({ ok: true })),
    canonicalSend: vi.fn(),
    buildRecordRenderContext: vi.fn(async () => ({ recipient: { "contact.first_name": "Ravi" } })),
    associate: vi.fn(async () => ({ state: "associated", task_id: "t1", outcome_key: "left_message" })),
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: m.emitEvent }));
vi.mock("@/lib/workflowRun", async (orig) => ({ ...(await orig<typeof import("@/lib/workflowRun")>()), executeWorkflowRun: m.executeWorkflowRun }));
vi.mock("@/lib/communications/send/canonicalSend", () => ({ canonicalSend: m.canonicalSend }));
vi.mock("@/lib/communications/render/buildRecordRenderContext", () => ({ buildRecordRenderContext: m.buildRecordRenderContext }));
vi.mock("@/lib/communications/triggerBackendMessagesQueue", () => ({ triggerBackendMessagesQueue: async () => undefined }));
vi.mock("@/lib/communications/contactAttemptOnProviderAcceptance", () => ({ reconcileContactAttemptOnProviderAcceptance: m.associate }));

import { emitLeadCreatedEvent } from "@/lib/opportunities/emitLeadCreatedEvent";
import { executeSendCommunicationTemplateWorkflowAction } from "@/lib/workflows/actions/executeSendCommunicationTemplateWorkflowAction";
import { inspectWorkflowConditions } from "@/lib/workflowRun";
import { findPurpose } from "@/lib/communications/purpose/purposeRegistry";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
    return {
        from(table: string) {
            const rows = tables[table] ?? [];
            const filters: Array<(r: Row) => boolean> = [];
            const b = {
                select: () => b,
                eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
                in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
                or: () => b,
                limit: () => b,
                maybeSingle: async () => ({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
                then: (res: (x: { data: Row[]; error: null }) => unknown) => res({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
            };
            return b;
        },
    } as unknown as SupabaseClient;
}

const created = [
    { commandKey: "create_household", status: "committed", recordId: "h1", opKind: "create" },
    { commandKey: "create_person", status: "committed", recordId: "p1", opKind: "create" },
    { commandKey: "create_lead", status: "committed", recordId: "l1", opKind: "create" },
];
const reused = [
    { commandKey: "create_household", status: "committed", recordId: "h1", opKind: "no_op" },
    { commandKey: "create_child", status: "committed", recordId: "k2", opKind: "create" },
    { commandKey: "create_lead", status: "committed", recordId: "l1", opKind: "no_op" },
];
const WF = [{ id: "wf-1", org_id: "o", enabled: true, event_type: "lead_created", entity_type: "opportunities" }];

beforeEach(() => {
    for (const f of Object.values(m)) f.mockClear();
});

describe("lead_created", () => {
    it("a genuinely created lead emits once, says whether the family is new, and runs the org's automations", async () => {
        const db = fakeDb({ workflow_events: [], workflows: WF });
        const r = await emitLeadCreatedEvent({ supabase: db, orgId: "o", operations: created, lead: { id: "l1", customer_id: "h1", primary_person_id: "p1" }, source: "public_form", actorUserId: "u1" });
        expect(r).toMatchObject({ emitted: true, workflowRuns: 1 });
        expect(m.emitEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "lead_created", entity_id: "l1", payload: expect.objectContaining({ new_family: true, actor_user_id: "u1" }) }));
        expect(m.executeWorkflowRun).toHaveBeenCalledWith(db, "wf-1", expect.objectContaining({ lead_id: "l1", new_family: true }), expect.objectContaining({ event_id: "evt-1" }));
    });

    it("a sibling joining the family's open lead is NOT a new lead — nothing is emitted", async () => {
        const r = await emitLeadCreatedEvent({ supabase: fakeDb({ workflow_events: [], workflows: WF }), orgId: "o", operations: reused, lead: { id: "l1" }, source: "public_form", actorUserId: "u1" });
        expect(r.emitted).toBe(false);
        expect(m.emitEvent).not.toHaveBeenCalled();
        expect(m.executeWorkflowRun).not.toHaveBeenCalled();
    });

    it("exactly once per lead — a replayed approval emits and runs nothing again", async () => {
        const db = fakeDb({ workflow_events: [{ id: "e0", org_id: "o", event_type: "lead_created", entity_type: "opportunities", entity_id: "l1" }], workflows: WF });
        const r = await emitLeadCreatedEvent({ supabase: db, orgId: "o", operations: created, lead: { id: "l1" }, source: "public_form", actorUserId: "u1" });
        expect(r.emitted).toBe(false);
        expect(m.executeWorkflowRun).not.toHaveBeenCalled();
    });

    it("an automation's 'only new families' condition reads the event's own fact", () => {
        const [result] = inspectWorkflowConditions({ event_type: "lead_created", new_family: true }, "opportunity", [
            { field_path: "new_family", operator: "eq", value_jsonb: true } as never,
        ]);
        expect(result?.passed).toBe(true);
        const [returning] = inspectWorkflowConditions({ event_type: "lead_created", new_family: false }, "opportunity", [
            { field_path: "new_family", operator: "eq", value_jsonb: true } as never,
        ]);
        expect(returning?.passed).toBe(false);
    });
});

describe("send_communication_template", () => {
    const tables = () => ({
        communication_templates: [{ org_id: "o", id: "t1", channel: "sms", status: "active", current_version_id: "v2" }],
        communication_template_versions: [{ org_id: "o", id: "v2", version_number: 2, subject: null, body: "Hi {{contact.first_name}}, thanks for reaching out!" }],
        opportunities: [{ org_id: "o", id: "l1", customer_id: "h1", primary_person_id: "p1" }],
    });

    it("sends the template's CURRENT version to the lead's primary person through the canonical sender, keyed per workflow × lead", async () => {
        m.canonicalSend.mockResolvedValue({ outcome: "sent_to_queue", reason: "", message: "", messageId: "msg-1", threadId: "th-1" });
        const r = await executeSendCommunicationTemplateWorkflowAction({
            supabase: fakeDb(tables()), orgId: "o", workflowId: "wf-1",
            actionPayload: { communication_template_id: "t1", channel: "sms" },
            workflowPayload: { lead_id: "l1", actor_user_id: "u1" },
        });
        expect(r.status).toBe("completed");
        const req = m.canonicalSend.mock.calls[0]?.[0];
        expect(req).toMatchObject({
            recipient: { kind: "person", personId: "p1" },
            purpose: "automated_family_message",
            channel: "sms",
            bodyRaw: "Hi {{contact.first_name}}, thanks for reaching out!",
            templateId: "t1",
            templateVersion: "2",
            userAuthored: false,
            idempotencyKey: "workflow:wf-1:lead:l1:template:t1:sms",
        });
        expect(req.renderContext).toEqual({ recipient: { "contact.first_name": "Ravi" } });
        // The send DECLARES contact work on the message; the attempt is recorded when the provider accepts it.
        expect(req.metadata).toMatchObject({ opportunity_id: "l1", author_user_id: "u1", work_consequence: "contact_family_work" });
        expect(m.associate).toHaveBeenCalledWith(expect.objectContaining({ messageId: "msg-1" }));
    });

    it("a replay is a duplicate, not a second message", async () => {
        m.canonicalSend.mockResolvedValue({ outcome: "duplicate", reason: "idempotent_replay", message: "" });
        const r = await executeSendCommunicationTemplateWorkflowAction({
            supabase: fakeDb(tables()), orgId: "o", workflowId: "wf-1",
            actionPayload: { communication_template_id: "t1" }, workflowPayload: { lead_id: "l1", actor_user_id: "u1" },
        });
        expect(r).toMatchObject({ status: "skipped", skipReason: "already_sent_for_this_lead" });
        expect(m.associate).not.toHaveBeenCalled();
    });

    it("a refused send (render block, consent, eligibility) completes no work", async () => {
        m.canonicalSend.mockResolvedValue({ outcome: "blocked", reason: "render_blocked:TOKEN_UNRESOLVED", message: "missing" });
        const r = await executeSendCommunicationTemplateWorkflowAction({
            supabase: fakeDb(tables()), orgId: "o", workflowId: "wf-1",
            actionPayload: { communication_template_id: "t1" }, workflowPayload: { lead_id: "l1", actor_user_id: "u1" },
        });
        expect(r.status).toBe("skipped");
        expect(m.associate).not.toHaveBeenCalled();
    });

    it("an inactive template sends nothing", async () => {
        const t = tables();
        t.communication_templates[0]!.status = "archived";
        const r = await executeSendCommunicationTemplateWorkflowAction({
            supabase: fakeDb(t), orgId: "o", workflowId: "wf-1",
            actionPayload: { communication_template_id: "t1" }, workflowPayload: { lead_id: "l1" },
        });
        expect(r).toMatchObject({ status: "skipped", skipReason: "template_not_active" });
        expect(m.canonicalSend).not.toHaveBeenCalled();
    });

    it("the automation purpose is platform-composed only", () => {
        expect(findPurpose("automated_family_message")).toMatchObject({ allowsUserAuthored: false, recipientKinds: ["person"] });
    });
});
