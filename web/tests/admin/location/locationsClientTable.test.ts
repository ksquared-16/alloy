import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("LocationsHierarchySettingsClient table editor", () => {
    it("uses a bordered table with visible header row and column alignment on canonical settings page", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain('data-locations-editor-table="true"');
        expect(src).toContain("border-collapse");
        expect(src).toContain("divide-x divide-alloy-stone/15");
        expect(src).toContain("LOCATIONS_EDITOR_TABLE_COLUMNS");
        expect(src).not.toMatch(/\bDemo\b/);
    });
});
