import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("Communications template integration", () => {
    it("shares draft-seeding helpers across compose and announcements", () => {
        const helper = read("lib/communications/v2/communicationTemplateDraftSeed.ts");
        expect(helper).toContain("fetchCommunicationTemplateCurrentVersion");
        expect(helper).toContain("communicationTemplateDraftSeedFromPreview");
        expect(read("app/adminV2/components/QuickMessageModal.tsx")).toContain(
            "communicationTemplateDraftSeedFromPreview"
        );
        expect(read("app/adminV2/communications/AnnouncementsWorkspace.tsx")).toContain(
            "communicationTemplateDraftSeedFromPreview"
        );
    });

    it("documents workflow inline bodies as separate from communication_templates", () => {
        const workflowRun = read("lib/workflowRun.ts");
        expect(workflowRun).toMatch(/case "create_message"/);
        expect(workflowRun).toMatch(/pl\.body/);
        expect(workflowRun).toMatch(/case "send_message"/);
        expect(workflowRun).toMatch(/pl\.template \?\? pl\.body/);
        expect(workflowRun).not.toContain("communication_templates");
    });
});
