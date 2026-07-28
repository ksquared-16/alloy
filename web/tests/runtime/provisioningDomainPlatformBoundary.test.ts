import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/**
 * PLATFORM ↔ DOMAIN boundary guard — provisioning subject identity (Lane 2C, step 1).
 *
 * The commit-critical subject identity flows to the panel as a GENERIC, opaque `SubjectIdentityTruth`
 * bag (`Record<string, unknown>`). The DOMAIN composer (the opportunity answer builder) declares WHICH
 * truth keys it carries (`person.primary_contact_name`, `_inquiry_children`, …); every PLATFORM layer
 * (the work-mode builder, the presentation carriers, the Kernel, the Surface Host) forwards the bag
 * WITHOUT knowing any key. These tests fail if a domain truth key or the retired opportunity-shaped
 * `FocusPanelSubjectSnapshot` re-enters a platform layer — i.e. if the leak comes back.
 */

// The domain-specific tokens no platform layer may name.
const DOMAIN_TRUTH_TOKENS = [
    "person.primary_contact_name",
    "person.primary_phone",
    "person.primary_email",
    "_inquiry_children",
    "inquiry_children",
    "primaryContact",
    "inquiryChildren",
];

describe("provisioning subject-identity platform/domain boundary (Lane 2C)", () => {
    it("the retired opportunity-shaped type `FocusPanelSubjectSnapshot` is gone from every layer", () => {
        for (const f of [
            "lib/runtime/provisioning/workUnitProvisioningAnswer.ts",
            "lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts",
            "components/presentation/workUnit/OperationalSubjectContext.tsx",
            "components/admin/focusPanel/OpportunityFocusPanelBody.tsx",
            "components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx",
            "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx",
        ]) {
            expect(read(f), `${f} must not name FocusPanelSubjectSnapshot`).not.toContain(
                "FocusPanelSubjectSnapshot",
            );
        }
    });

    it("the PLATFORM work-mode builder forwards the identity bag OPAQUELY (no domain truth keys)", () => {
        const src = read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts");
        // It must spread the generic bag …
        expect(src).toContain("...(input.subjectIdentityTruth ?? {})");
        // … and never hard-name a domain truth key.
        for (const token of DOMAIN_TRUTH_TOKENS) {
            expect(src, `platform builder must not name domain token "${token}"`).not.toContain(token);
        }
    });

    it("the PLATFORM presentation carrier uses the generic contract, not a domain shape", () => {
        const src = read("components/presentation/workUnit/OperationalSubjectContext.tsx");
        expect(src).toContain("SubjectIdentityTruth");
        for (const token of DOMAIN_TRUTH_TOKENS) {
            expect(src, `presentation carrier must not name domain token "${token}"`).not.toContain(token);
        }
    });

    it("the platform SubjectIdentityTruth contract is a generic bag, not an opportunity shape", () => {
        const src = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
        expect(src).toContain("export type SubjectIdentityTruth = Record<string, unknown>");
    });

    it("the DOMAIN composer still DECLARES the opportunity truth keys (domain owns them)", () => {
        // The keys belong in the domain composer — this asserts they were relocated there, not deleted.
        const src = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
        expect(src).toContain("person.primary_contact_name");
        expect(src).toContain("_inquiry_children");
    });

    it("the Kernel and Surface Host name no domain truth keys (platform stays entity-agnostic)", () => {
        const files = [
            "lib/runtime/kernel/provisioning.ts",
            "lib/runtime/kernel/focus.ts",
            "lib/runtime/kernel/attention.ts",
            "lib/experience/surfaceHost/SurfaceHostContext.tsx",
            "lib/experience/surfaceHost/surfaceHostRender.ts",
        ];
        for (const f of files) {
            const src = read(f);
            for (const token of DOMAIN_TRUTH_TOKENS) {
                expect(src, `${f} must not name domain token "${token}"`).not.toContain(token);
            }
        }
    });
});
