import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** PKG-18B — record tab mounted into the drawer Communications surface, flag-gated, legacy preserved. */
describe("record tab mount", () => {
    const src = readFileSync(join(process.cwd(), "components", "admin", "communications", "CommunicationsDrawerSection.tsx"), "utf8");
    it("keeps the legacy section and gates the new tab behind comms_v2_record_tab", () => {
        expect(src).toMatch(/function CommunicationsDrawerSectionLegacy\(/);
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_record_tab["']\)/);
        expect(src).toMatch(/<RecordCommunicationsTab/);
        expect(src).toMatch(/<CommunicationsDrawerSectionLegacy \{\.\.\.props\} \/>/);
    });
});
