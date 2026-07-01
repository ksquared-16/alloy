import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Work Units settings UX", () => {
    it("exposes Add Work Unit in header and empty state", () => {
        const client = read("app/admin/system/work-units/WorkUnitsClient.tsx");
        expect(client).toContain("Add Work Unit");
        expect(client).toContain("work-units-add-button");
        expect(client).toContain("work-units-add-button-empty");
    });

    it("hides queue JSON behind Advanced details by default", () => {
        const client = read("app/admin/system/work-units/WorkUnitsClient.tsx");
        expect(client).toContain("work-units-queue-json-advanced");
        expect(client).toContain("Advanced — queue definition (JSON)");
    });

    it("modal save is in sticky footer", () => {
        const client = read("app/admin/system/work-units/WorkUnitsClient.tsx");
        expect(client).toContain("work-units-modal-save");
        expect(client).toMatch(/sticky bottom-0[\s\S]*work-units-modal-save/);
    });

    it("settings page links to Lifecycle", () => {
        const page = read("app/adminV2/settings/work-units/page.tsx");
        expect(page).toContain("WorkUnitsLifecycleCrossLink");
        expect(page).toContain("settings-work-units-page");
    });
});
