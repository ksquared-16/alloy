import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { opportunityInquiryDrawerShellStructurallyReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import {
    buildOpportunityDrawerRevealReadiness,
    opportunityDrawerBelowFoldEnrichmentReady,
    opportunityDrawerPostRevealMayOpen,
    opportunityDrawerSecondaryWindowOpen,
} from "@/lib/admin/drawer/opportunityDrawerRevealReadiness";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readDrawerSrc(): string {
    return readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
}

describe("opportunityDrawerRevealReadiness", () => {
    it("opens secondary window from postDrawerVisible without full hydrate", () => {
        expect(
            opportunityDrawerSecondaryWindowOpen("opportunities", "o1", "opportunities:o1")
        ).toBe(true);
        expect(opportunityDrawerSecondaryWindowOpen("opportunities", "o1", null)).toBe(false);
    });

    it("below-fold enrichment requires secondary window and above-fold stable", () => {
        expect(opportunityDrawerBelowFoldEnrichmentReady(true, true)).toBe(true);
        expect(opportunityDrawerBelowFoldEnrichmentReady(true, false)).toBe(false);
        expect(opportunityDrawerBelowFoldEnrichmentReady(false, true)).toBe(false);
    });

    it("post-reveal may open on primary reveal + contract only", () => {
        expect(
            opportunityDrawerPostRevealMayOpen({
                overviewRevealReady: true,
                primaryContractSatisfied: true,
            })
        ).toBe(true);
        expect(
            opportunityDrawerPostRevealMayOpen({
                overviewRevealReady: true,
                primaryContractSatisfied: false,
            })
        ).toBe(false);
    });

    it("readiness flags are independent — full does not imply secondary window", () => {
        const flags = buildOpportunityDrawerRevealReadiness({
            overviewRevealReady: true,
            primaryContractSatisfied: true,
            aboveFoldLocked: true,
            drawerType: "opportunities",
            drawerId: "o1",
            postDrawerVisibleKey: "opportunities:o1",
            fullHydrateReady: true,
        });
        expect(flags.primaryReady).toBe(true);
        expect(flags.secondaryWindowOpen).toBe(true);
        expect(flags.fullHydrateReady).toBe(true);
        expect(flags.aboveFoldStable).toBe(false);
    });
});

describe("opportunityInquiryDrawerShellStructurallyReady", () => {
    it("requires identity when family contacts are in summary", () => {
        expect(
            opportunityInquiryDrawerShellStructurallyReady({
                shellContractPresent: true,
                primaryContractSatisfied: true,
                record: { id: "o1", _record_surface: "drawer_primary" },
                familyContactsInSummary: true,
            })
        ).toBe(false);
        expect(
            opportunityInquiryDrawerShellStructurallyReady({
                shellContractPresent: true,
                primaryContractSatisfied: true,
                record: {
                    id: "o1",
                    _record_surface: "drawer_primary",
                    _identity: { household: { label: "Chen household" } },
                },
                familyContactsInSummary: true,
            })
        ).toBe(true);
    });
});
