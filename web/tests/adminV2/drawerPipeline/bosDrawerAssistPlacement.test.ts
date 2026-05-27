import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BOS_ASSIST_CTA_DRAWER, triggerBosDrawerAssistHandoff } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("BOS drawer assist placement", () => {
    it("drawer header no longer exposes Open in Orchestrator", () => {
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).not.toContain('data-drawer-action="open_in_orchestrator"');
        expect(drawer).not.toContain("HANDOFF_CTA_OPEN");
    });

    it("Review Assist band wires native BOS assist CTA", () => {
        const strip = readFileSync(join(webRoot, "components/admin/drawer/OperationalAttentionHeaderStrip.tsx"), "utf8");
        const cta = readFileSync(join(webRoot, "components/admin/drawer/BosDrawerAssistCta.tsx"), "utf8");
        const rightCol = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx"),
            "utf8",
        );
        expect(strip).toContain("BosDrawerAssistCta");
        expect(strip).toContain("bosAssistSlot");
        expect(cta).toContain('data-drawer-action="bos_assist"');
        expect(cta).toContain("OpportunityDrawerHeaderActionButton");
        expect(cta).toContain("OpportunityDrawerHeaderActionsPanel");
        expect(cta).toContain("BOS_ASSIST_CTA_DRAWER");
        expect(cta).toContain("triggerBosDrawerAssistHandoff");
        expect(rightCol).toContain("bosAssistEntityId={opportunityId}");
    });

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
            "utf8",
        );
        expect(strip).toContain("const showHandoffCard = false");
        expect(strip).not.toContain('data-drawer-action="open_in_orchestrator"');
    });
});
