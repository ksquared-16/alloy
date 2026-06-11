import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Settings index IA — Settings V2 domains", () => {
    it("groups tiles by configuration domain", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('label="Configure"');
        expect(page).toContain('label="Data Model"');
        expect(page).toContain('label="Operations"');
        expect(page).toContain('label="Workspace Experience"');
        expect(page).toContain("Advanced");
        expect(page).not.toContain('label="Enrollment Operations"');
        expect(page).not.toContain('label="Record Setup"');
        expect(page).not.toContain('label="Actions & Automation"');
    });

    it("business processes tile lives under Operations with editable mode", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('title="Business Processes"');
        expect(page).toContain("/admin/settings/lifecycle");
        expect(page).toMatch(/title="Business Processes"[\s\S]*mode="editable"/);
    });

    it("advanced surfaces stay in sidebar aside", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("/admin/settings/status-transition-rules");
        expect(page).toContain("/admin/settings/field-sections");
        expect(page).toContain("data-testid=\"settings-index-page\"");
    });

    it("action buttons tile lives under Operations", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toMatch(/label="Operations"[\s\S]*title="Action Buttons"/);
        expect(page).toMatch(/title="Action Buttons"[\s\S]*mode="editable"/);
    });
});
