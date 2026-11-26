import { describe, expect, it, vi } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    applyCreateLeadParseToDraft,
    buildCreateLeadBosPreview,
    emptyBosCommandDraft,
    executeCreateLeadFromBosDraft,
    fingerprintBosCommandDraft,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession";

const ctx: CreateLeadAdapterContext = {
    departmentId: "dept-1",
    workUnitId: "wu-1",
    surface: "bos_recommendations",
    spec: createLeadParserSpec("dept-1"),
};

const PASTE = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

describe("create lead preview / execute wiring", () => {
    it("stale preview fingerprint blocks execute when draft changes", () => {
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), PASTE, ctx);
        const preview = buildCreateLeadBosPreview(draft, ctx);
        expect(preview.draftFingerprint).toBe(fingerprintBosCommandDraft(draft));

        const edited = {
            ...draft,
            values: draft.values.map((v) =>
                v.fieldKey === "first_name" ? { ...v, value: "Jordyn", state: "operator_entered" as const } : v
            ),
        };
        expect(fingerprintBosCommandDraft(edited)).not.toBe(preview.draftFingerprint);
    });

    it("executeCreateLeadFromBosDraft posts registered create_lead action", async () => {
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), PASTE, ctx);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                correlation_id: "c1",
                data: {
                    execution_result: {
                        mode: "processing_review",
                        processing_case_id: "case-99",
                    },
                },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await executeCreateLeadFromBosDraft(draft, ctx);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.processingCaseId).toBe("case-99");
            expect(result.executionKind).toBe("processing_intake");
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
            action_key?: string;
            payload?: Record<string, unknown>;
        };
        expect(body.action_key).toBe("create_lead");
        expect(body.payload?.first_name).toBe("Jordan");
        vi.unstubAllGlobals();
    });
});
