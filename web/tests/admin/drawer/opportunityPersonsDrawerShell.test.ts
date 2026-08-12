import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("opportunity drawer primary shell payloads", () => {
    it("attaches persons and activity signal on drawer_visible and drawer_primary", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        expect(src).toContain("export async function attachOpportunityPersonsShell");
        expect(src).toContain("export async function attachOpportunityActivitySignalShell");
        expect(src).toMatch(
            /drawer_visible[\s\S]{0,800}attachOpportunityPersonsShell[\s\S]{0,400}attachOpportunityActivitySignalShell/
        );
        expect(src).toMatch(
            /if \(drawerInitial\)[\s\S]{0,600}attachOpportunityPersonsShell[\s\S]{0,400}attachOpportunityActivitySignalShell/
        );
        expect(src).not.toMatch(
            /if \(drawerInitial\)[\s\S]{0,400}attachFieldDefinitionsAndValues/,
        );
        expect(src).toContain("_additional_contacts_shell_count");
        const taskMod = read("lib/admin/drawer/opportunityInquirySummaryTaskPreview.ts");
        expect(src).toContain("attachOpportunityInquirySummaryTaskPreview");
        expect(taskMod).toContain("_inquiry_summary_tasks");
    });

});
