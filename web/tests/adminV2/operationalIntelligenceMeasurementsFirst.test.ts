import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    CAPACITY_RECIPES,
    capacityRecipeFromProductTypeLabel,
} from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";

const WEB = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(WEB, rel), "utf8");
}

describe("OI V2 measurements-first product language", () => {
    it("exposes operator capacity recipes without engineering nouns", () => {
        expect(CAPACITY_RECIPES).toHaveLength(2);
        for (const r of CAPACITY_RECIPES) {
            expect(r.title.toLowerCase()).not.toMatch(/fallback|coalesce|ast|projection|binding/);
            expect(r.summary.toLowerCase()).not.toMatch(/fallback|coalesce|ast|projection|binding/);
            expect(r.sourceLine.toLowerCase()).not.toMatch(/fallback|coalesce|organization calculation v\d/);
        }
        expect(capacityRecipeFromProductTypeLabel("Operational seats when available").id).toBe(
            "capacity_operational_with_fallback",
        );
    });

    it("OI home is question-first, not pack inventory", () => {
        const ws = read(
            "components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace.tsx",
        );
        expect(ws).toContain("What do you want to know?");
        expect(ws).toContain("oi-home-add-measurement");
        expect(ws).toContain("data-oi-v2-measurements-first");
        expect(ws).not.toContain("enablement");
        expect(ws).not.toContain("active_pack_count");
        expect(ws).toContain("OiOrgCalcAddWizard");
        expect(ws).toContain("oi-post-activation");
        expect(ws).toContain("Manage how it’s calculated");
        expect(ws).toContain("Calculation library");
    });

    it("measurement wizard uses operator steps and Start measuring", () => {
        const wiz = read(
            "components/adminV2/settings/operationalIntelligence/OiOrgCalcAddWizard.tsx",
        );
        expect(wiz).toContain("What do you want to measure?");
        expect(wiz).toContain("Future Room Capacity");
        expect(wiz).toContain("How should capacity be determined?");
        expect(wiz).toContain("When should Alloy get your attention?");
        expect(wiz).toContain("Start measuring");
        expect(wiz).not.toContain("Business Information");
        expect(wiz).toContain("Start measuring");
        expect(wiz).toContain("/publish"); // architecture path remains; CTA language does not say Publish
        expect(wiz).not.toContain(">Publish<");
        expect(wiz).not.toContain("Publish measurement");
    });

    it("measurement panel prefers How this is calculated over Source binding", () => {
        const panel = read(
            "components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel.tsx",
        );
        expect(panel).toContain("How this is calculated");
        expect(panel).toContain("Calculated using");
        expect(panel).toContain("Check a room");
        expect(panel).toContain("Warn me when capacity is below");
        expect(panel).not.toContain("Source binding");
        expect(panel).not.toContain("Run observation");
        expect(panel).toContain("oi-org-calc-open-definition");
    });
});
