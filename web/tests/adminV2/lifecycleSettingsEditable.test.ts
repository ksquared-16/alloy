import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("editable lifecycle settings", () => {
    it("settings index uses Lifecycle title and editable mode", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('title="Lifecycle"');
        expect(page).toMatch(/title="Lifecycle"[\s\S]*mode="editable"/);
        expect(page).not.toContain("Lifecycle stages & requirements");
    });

    it("settings index uses Title Case for key tiles", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('title="Work Units & Queues"');
        expect(page).toContain('title="Action Buttons"');
        expect(page).toContain('title="Record Layouts"');
        expect(page).toContain('title="Forms & Packets"');
        expect(page).toContain('label="Enrollment Operations"');
    });

    it("lifecycle page title is Lifecycle with compact helper", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain(">Lifecycle</h1>");
        expect(page).toContain("lifecycle-page-compact-helper");
        expect(page).toContain("Choose what must be complete before a family moves forward");
    });

    it("hub renders editable checkboxes and save/reset", () => {
        const hub = read("components/adminV2/settings/LifecycleStagesRequirementsHub.tsx");
        expect(hub).toContain('type="checkbox"');
        expect(hub).toContain("lifecycle-settings-save");
        expect(hub).toContain("lifecycle-settings-reset-stage");
        expect(hub).toContain("lifecycle-req-checkbox-");
        expect(hub).toContain("lifecycle-req-field-detail");
        expect(hub).toContain("/lifecycle-requirements");
        expect(hub).toContain('method: "PATCH"');
    });

    it("lifecycle requirements API route supports GET and PATCH", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-requirements/route.ts");
        expect(route).toContain("export async function GET");
        expect(route).toContain("export async function PATCH");
        expect(route).toContain("reset_stage");
        expect(route).toContain("buildLifecycleRequirementsOverridePatch");
    });
});
