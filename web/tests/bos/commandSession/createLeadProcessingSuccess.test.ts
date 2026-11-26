import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BOS processing review + success host", () => {
    it("hosts IdentityReviewPanel and explicit Open Lead without auto-open", () => {
        const host = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"
            ),
            "utf8"
        );
        expect(host).toContain("IdentityReviewPanel");
        expect(host).toContain("dispatchOpportunityQueueUpdated");
        expect(host).toContain("data-bos-command-session-open-lead");
        expect(host).toContain("Explicit Open Lead only");
        expect(host).toContain("opportunityIdFromAttempt");
    });
});
