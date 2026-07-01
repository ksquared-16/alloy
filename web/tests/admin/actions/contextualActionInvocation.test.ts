import { describe, expect, it } from "vitest";

import {
    buildQueueRowInvocation,
    parseQueueRowActionPayload,
} from "@/lib/admin/actions/contextualActionInvocation";

describe("contextualActionInvocation", () => {
    it("parseQueueRowActionPayload reads registry key and person", () => {
        expect(
            parseQueueRowActionPayload({
                source: "action_registry",
                registryKey: "send_message_placeholder",
                opportunityId: "opp-1",
                personId: "person-1",
            })
        ).toEqual({
            source: "action_registry",
            registryKey: "send_message_placeholder",
            opportunityId: "opp-1",
            personId: "person-1",
        });
    });

    it("buildQueueRowInvocation carries queue and department context", () => {
        const inv = buildQueueRowInvocation({
            itemId: "opp-9",
            payload: { personId: null, displayName: "Lee family" },
            departmentId: "dept-1",
            workUnitId: "wu-1",
            queueKey: "new_inquiry",
            queuePreview: { doNext: "Call within 24h" },
        });
        expect(inv.opportunity_id).toBe("opp-9");
        expect(inv.person_id).toBeNull();
        expect(inv.department_id).toBe("dept-1");
        expect(inv.queue_key).toBe("new_inquiry");
        expect(inv.queue_preview?.doNext).toBe("Call within 24h");
        expect(inv.bos_source_surface).toBe("queue");
    });
});
