import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("E1 canonical intake commit boundaries", () => {
    it("executeCreateLeadAction does not import direct identity writers", () => {
        const source = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(source).not.toMatch(/findOrCreatePersonInOrg/);
        expect(source).not.toMatch(/ensureCustomerForPersonNative/);
        expect(source).toContain("ingestCreateLeadThroughProcessing");
    });

    it("public submit route delegates to Processing adapter", () => {
        const route = read("app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts");
        expect(route).toContain("ingestPublicFormThroughProcessing");
        expect(route).not.toMatch(/applyFormIntakeSafe\s*\(/);
    });

    it("applyFormIntakeSafe always throws (no replay flag, no legacy export)", () => {
        const intake = read("lib/forms/intake/applyFormIntakeSafe.ts");
        expect(intake).not.toMatch(/__legacyDirectWriteReplay/);
        expect(intake).not.toMatch(/applyFormIntakeDirectWriteLegacy/);
        expect(intake).toMatch(/retired \(E1\)/);
    });

    it("source adapters do not import command executor handlers", () => {
        const createLeadAdapter = read("lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts");
        const formAdapter = read("lib/pos/processingIdentity/sources/formIntakeAdapter.ts");
        for (const src of [createLeadAdapter, formAdapter]) {
            expect(src).not.toMatch(/executeApprovedPlan/);
            expect(src).not.toMatch(/from\("persons"\)\.insert/);
            expect(src).not.toMatch(/from\("opportunities"\)\.insert/);
        }
    });

    it("Create Lead modal embeds shared IdentityReviewPanel (no second commit UI)", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("IdentityReviewPanel");
        expect(modal).toContain("processing_case_id");
    });
});

describe("E1 legacy path inventory", () => {
    it("applyFormLeadCaptureIntake remains dead (not imported by submit route)", () => {
        const route = read("app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts");
        expect(route).not.toContain("applyFormLeadCaptureIntake");
    });
});
