import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPersonDrawerPresentationProfile } from "@/lib/admin/person/personDrawerPresentationProfile";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("person drawer architecture pass 2", () => {

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
        expect(out.map((s) => s.key)).toEqual(["enrollment_activity"]);
    });

    it("documents presentation emphasis module", () => {
        const emphasis = read("lib/admin/person/personDrawerPresentationEmphasis.ts");
        expect(emphasis).toContain("PersonDrawerPresentationEmphasis");
        expect(emphasis).toContain("record_drawer_layouts.config_json.presentation_emphasis");
    });

});
