import { describe, expect, it } from "vitest";

import { parseTaskAssistProposeRequest } from "@/lib/agent/taskAssist/taskAssistProposeRouteValidation";

describe("parseTaskAssistProposeRequest", () => {
    it("accepts minimal valid body with instruction", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "opportunities",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "sms",
            instruction: " Call them ",
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.entity_type).toBe("opportunities");
            expect(r.value.channel).toBe("sms");
            expect(r.value.instruction).toBe("Call them");
        }
    });

    it("accepts goal as instruction alias", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "opportunities",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "email",
            goal: "Send quote",
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.instruction).toBe("Send quote");
    });

    it("rejects unsupported entity_type", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "jobs",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "sms",
            instruction: "x",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("ENTITY_TYPE_UNSUPPORTED");
    });

    it("rejects invalid channel", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "opportunities",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "in_app",
            instruction: "x",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("CHANNEL_UNSUPPORTED");
    });

    it("rejects forbidden workflow-like keys", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "opportunities",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "sms",
            instruction: "x",
            workflow_id: "nope",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("WORKFLOW_KEYS_FORBIDDEN");
    });

    it("rejects unknown body keys", () => {
        const r = parseTaskAssistProposeRequest({
            entity_type: "opportunities",
            entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            channel: "sms",
            instruction: "x",
            extra: 1,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("UNKNOWN_BODY_KEYS");
    });
});
