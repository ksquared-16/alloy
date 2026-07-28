import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { executePlatformCommandViaActionsApi } from "@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi";
import { executeCreateLeadCommand } from "@/lib/platform/commands/createLead/executeCreateLeadCommand";
import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";

describe("executePlatformCommandViaActionsApi", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs to /api/admin/actions/execute with bos origin by default", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                correlation_id: "c1",
                data: {
                    affected_id: "opp-1",
                    execution_result: { opportunity_id: "opp-1" },
                },
            }),
        });

        const result = await executePlatformCommandViaActionsApi({
            commandKey: "close_lead",
            entityType: "opportunity",
            entityId: "opp-1",
            payload: { status_key: "lost" },
        });

        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe("/api/admin/actions/execute");
        const body = JSON.parse(String((init as RequestInit).body));
        expect(body.action_key).toBe("close_lead");
        expect(body.context.origin).toBe("bos");
        expect(body.entity_id).toBe("opp-1");
    });

    it("create_lead wrapper uses the shared bridge and synthetic entity id", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                correlation_id: "c2",
                data: {
                    execution_result: { mode: "processing_review", processing_case_id: "pc-1" },
                },
            }),
        });

        const result = await executeCreateLeadCommand({
            payload: { first_name: "A" },
            surface: "bos_recommendations",
        });
        expect(result.ok).toBe(true);
        const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
        expect(body.action_key).toBe("create_lead");
        expect(body.entity_id).toBe(CREATE_LEAD_ACTION_ENTITY_ID);
        expect(body.context.surface).toBe("bos_recommendations");
    });
});
