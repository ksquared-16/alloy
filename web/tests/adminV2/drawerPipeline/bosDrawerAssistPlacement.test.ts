import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { triggerBosDrawerAssistHandoff } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("BOS drawer assist placement", () => {

    it("handoff helper uses existing orchestrator plumbing without mutation", () => {
        expect(typeof triggerBosDrawerAssistHandoff).toBe("function");
        const handoff = readFileSync(join(webRoot, "lib/adminV2/bos/bosDrawerAssistHandoff.ts"), "utf8");
        expect(handoff).toContain("buildOpportunityOperationalContext");
        expect(handoff).toContain("buildBosAssistHandoffPackage");
        expect(handoff).toContain("taskAssistHandoffIntent");
        expect(handoff).toContain("taskAssistHandoffBootstrap");
        expect(handoff).toContain("autoSubmitSeedCommand: true");
    });

    it("compact strip does not render duplicate lower handoff card", () => {
        const strip = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"),
            "utf8"
        );
        expect(strip).toContain("const showHandoffCard = false");
        expect(strip).not.toContain('data-drawer-action="open_in_orchestrator"');
    });
});
