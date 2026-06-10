import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Settings index IA cleanup", () => {
    it("groups tiles by operator mental model", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('label="Organization"');
        expect(page).toContain('label="Enrollment Operations"');
        expect(page).toContain('label="Record Setup"');
        expect(page).toContain('label="Actions & Automation"');
        expect(page).toContain('label="Documents & Forms"');
        expect(page).toContain("Diagnostics & reference");
        expect(page).not.toContain("Enrollment lifecycle");
        expect(page).not.toContain("Organization setup");
        expect(page).not.toContain("Records & layouts");
    });

    it("lifecycle tile lives under Enrollment operations with read-only mode", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('title="Business Processes"');
        expect(page).toContain("/adminV2/settings/lifecycle");
        expect(page).toMatch(/title="Business Processes"[\s\S]*mode="editable"/);
        expect(page).toContain("settingsSurfacePrefix");
    });

    it("diagnostic surfaces stay in sidebar aside", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("/adminV2/settings/status-transition-rules");
        expect(page).toContain("/adminV2/settings/field-sections");
        expect(page).toContain("data-testid=\"settings-index-page\"");
    });

    it("action buttons tile uses editable mode", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toMatch(/title="Action Buttons"[\s\S]*mode="editable"/);
    });
});
