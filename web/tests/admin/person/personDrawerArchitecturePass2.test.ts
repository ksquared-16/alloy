import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPersonDrawerPresentationProfile } from "@/lib/admin/person/personDrawerPresentationProfile";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("person drawer architecture pass 2", () => {
    it("wires PersonDrawerContextPanel above overview for existing persons", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerContextPanel");
        expect(drawer).toMatch(/PersonDrawerContextPanel[\s\S]*EntityDrawerOverview/);
    });

    it("uses unified enrollment_activity section instead of legacy enrollment keys", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerEnrollmentActivity");
        expect(drawer).toContain('key: "enrollment_activity"');
        expect(drawer).not.toContain("PersonDrawerEnrollmentMirror");
        expect(drawer).not.toContain("PersonDrawerEnrollmentOpportunitiesMirror");
    });

    it("filters legacy enrollment section keys from presentation profile output", () => {
        const sections = [
            { key: "enrollment", title: "Enrollment", fields: [] },
            { key: "enrollment_opportunities", title: "Old", fields: [] },
            { key: "enrollment_activity", title: "Activity", fields: [] },
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name" }] },
        ] as Parameters<typeof applyPersonDrawerPresentationProfile>[0];
        const out = applyPersonDrawerPresentationProfile(sections, {
            profiles: ["child"],
            display: "child",
            badgeLabels: ["Child"],
        });
        expect(out.map((s) => s.key)).toEqual(["enrollment_activity", "basic_info"]);
    });

    it("documents presentation emphasis module", () => {
        const emphasis = read("lib/admin/person/personDrawerPresentationEmphasis.ts");
        expect(emphasis).toContain("PersonDrawerPresentationEmphasis");
        expect(emphasis).toContain("record_drawer_layouts.config_json.presentation_emphasis");
    });

    it("relationships overview returns null instead of empty placeholder copy", () => {
        const rel = read("components/admin/entity/PersonDrawerVisibilitySections.tsx");
        expect(rel).toContain("return null");
        expect(rel).not.toContain("No family relationships on file");
    });
});
