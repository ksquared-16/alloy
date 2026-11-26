import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("demo readiness cleanup", () => {
    it("Lead Summary contact cards use explicit Save in summary variant", () => {
        const card = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(card).toContain('saveTrigger?: "blur" | "explicit"');
        expect(card).toContain("useExplicitSave");
        const primary = read("components/admin/opportunity/PrimaryPersonContactCard.tsx");
        expect(primary).toContain('saveTrigger={variant === "summary" ? "explicit" : "blur"}');
    });

    it("Children section defers save until explicit Save", () => {
        const children = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(children).toContain("saveInquiryChildRow");
        expect(children).toContain("inquiryChildEditorRowIsDirty");
        expect(children).not.toContain("useDebouncedPatch");
        expect(children).not.toContain("debounced.schedule");
    });

    it("removes low-value Opportunity record copy", () => {
        // The drawer half of this assertion is satisfied absolutely: the router it read is deleted.
        const strip = read("components/admin/opportunity/OpportunityChildLifecycleSummaryStrip.tsx");
        expect(strip).not.toContain("display_summary");
    });

    it("hides child room/cohort placement scope warning in drawer", () => {
        const scope = read("lib/admin/drawer/inquiryChildPlacementScope.ts");
        expect(scope).toMatch(/inquiryChildPlacementScopeDiagnosticHint[\s\S]*return null/);
    });

    it("person drawer overview uses Opportunity lead-summary shell tokens", () => {
        const overview = read("components/admin/entity/EntityDrawerOverview.tsx");
        expect(overview).toContain("oppInqLeadSummaryShellClassName");
        expect(overview).toContain("oppInqInnerCardCompact");
    });

    it("documents person ↔ opportunity contact write path", () => {
        const doc = readFileSync(
            resolve(webRoot, "../docs/sprints/archive/05_2026/person_location_ux_reset.md"),
            "utf8"
        );
        expect(doc).toMatch(/PATCH \/api\/admin\/persons/i);
        expect(doc).toMatch(/Family & contacts/i);
    });
});
