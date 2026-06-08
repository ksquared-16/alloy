import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
} from "@/lib/admin/locationDisplayLabel";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("locationDisplayLabel", () => {
    it("prefers label over address parts", () => {
        expect(
            locationDisplayLabelFromRow({
                label: "North Campus",
                address1: "100 Main St",
                city: "Austin",
            })
        ).toBe("North Campus");
    });

    it("falls back to address parts when label is empty", () => {
        expect(
            locationDisplayLabelFromRow({
                label: null,
                address1: "100 Main St",
                city: "Austin",
                postal_code: "78701",
            })
        ).toBe("100 Main St, Austin, 78701");
    });

    it("returns null when no display fields are present", () => {
        expect(locationDisplayLabelFromRow({})).toBeNull();
    });

    it("select constant does not reference nonexistent name column", () => {
        expect(LOCATION_DISPLAY_LABEL_SELECT).not.toContain("name");
        expect(LOCATION_DISPLAY_LABEL_SELECT).toContain("label");
    });

    it("Task Assist entity search and QueueService use canonical location label select", () => {
        for (const rel of [
            "lib/agent/taskAssist/taskAssistEntitySearchService.ts",
            "lib/queues/QueueService.ts",
        ]) {
            const src = readFileSync(join(repoRoot, rel), "utf8");
            expect(src).toContain("LOCATION_DISPLAY_LABEL_SELECT");
            expect(src).not.toContain("label, name");
            expect(src).not.toMatch(/from\("locations"\)[\s\n]*\.select\("id, label, name/);
        }
    });
});
