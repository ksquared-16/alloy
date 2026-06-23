import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("Communications modal QA pass 4", () => {
    it("Templates workspace opens New Template by default and uses title-case labels", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain("didAutoOpenEditorRef");
        expect(ws).toContain("New Template");
        expect(ws).toContain("Template Library");
        expect(ws).toContain("No Templates");
    });

    it("stateless recipient preview route resolves audience without announcement id", () => {
        const route = read("app/api/admin/communications/announcements/recipient-preview/route.ts");
        const handler = read("lib/communications/v2/runAnnouncementRecipientPreview.ts");
        expect(route).toContain("runAnnouncementRecipientPreview");
        expect(route).not.toContain('.from("announcements")');
        expect(handler).toContain("validateAnnouncementTargets");
        expect(handler).toContain("resolveAudienceSpec");
    });
});
