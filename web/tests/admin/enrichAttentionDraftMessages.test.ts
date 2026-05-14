import { describe, expect, it } from "vitest";

import { userFacingEnrichAttentionError } from "@/lib/admin/enrichAttentionDraftMessages";

describe("userFacingEnrichAttentionError", () => {
    it("maps 403 AI_OPENAI_FORBIDDEN to calm copy", () => {
        const msg = userFacingEnrichAttentionError(new Response(null, { status: 403 }), { error: "AI_OPENAI_FORBIDDEN" });
        expect(msg.toLowerCase()).toContain("permission");
        expect(msg).not.toMatch(/sk-[a-zA-Z0-9]/);
    });

    it("maps 503 without echoing raw vendor blobs", () => {
        const msg = userFacingEnrichAttentionError(new Response(null, { status: 503 }), {
            error: "OPENAI_NOT_CONFIGURED",
            message: "Set OPENAI_API_KEY",
        });
        expect(msg.toLowerCase()).toContain("reach");
        expect(msg).not.toContain("OPENAI_API_KEY");
    });

    it("maps generic 500", () => {
        const msg = userFacingEnrichAttentionError(new Response(null, { status: 500 }), { error: "INTERNAL" });
        expect(msg).toContain("Something went wrong");
    });
});
