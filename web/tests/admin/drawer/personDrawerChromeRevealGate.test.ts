import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");

describe("Card 3B-3 — person/child reveal gated on record chrome", () => {
    it("defines personRecordChromePending from recordChromePerson.configResolved (mirrors opportunity/job/schedule)", () => {
        expect(drawer).toContain("const personRecordChromePending =");
        expect(drawer).toMatch(/personRecordChromePending =[\s\S]{0,160}!recordChromePerson\.configResolved/);
    });

    it("includes person chrome in the body reveal gate", () => {
        expect(drawer).toMatch(
            /recordModalV2ChromePending =[\s\S]{0,200}opportunityRecordChromePending \|\| personRecordChromePending/
        );
    });

    it("gates personDrawerPaintReady on record chrome readiness", () => {
        expect(drawer).toMatch(/personDrawerPaintReady =[\s\S]{0,400}recordChromePerson\.configResolved/);
    });

    it("leaves the existing opportunity chrome gate intact", () => {
        expect(drawer).toContain("const opportunityRecordChromePending =");
        expect(drawer).toContain("!recordChromeOpportunity.configResolved");
    });
});
