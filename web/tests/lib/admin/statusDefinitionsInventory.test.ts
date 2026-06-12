import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareDefinitionsToPersisted } from "@/lib/admin/statusDefinitionsInventory";

describe("compareDefinitionsToPersisted", () => {
    it("detects orphan persisted keys not in active definitions", () => {
        const result = compareDefinitionsToPersisted({
            activeDefinitionKeys: new Set(["active", "inactive"]),
            persistedCounts: new Map([
                ["active", 10],
                ["legacy_pipeline", 3],
            ]),
        });
        expect(result.orphan_persisted_keys).toEqual([
            { status_key: "legacy_pipeline", count: 3 },
        ]);
        expect(result.unused_definition_keys).toEqual(["inactive"]);
    });

    it("returns empty orphan and unused when keys align", () => {
        const result = compareDefinitionsToPersisted({
            activeDefinitionKeys: new Set(["open"]),
            persistedCounts: new Map([["open", 1]]),
        });
        expect(result.orphan_persisted_keys).toEqual([]);
        expect(result.unused_definition_keys).toEqual([]);
    });
});

describe("statusDefinitionsInventory script", () => {
    it("exports a runnable inventory script", () => {
        const src = readFileSyncSafe("scripts/statusDefinitionsInventory.ts");
        expect(src).toContain("runStatusDefinitionsInventory");
        expect(src).toContain("OUTPUT=json|summary");
    });

    it("inventory API route is read-only GET", () => {
        const src = readFileSyncSafe("app/api/admin/status-definitions/inventory/route.ts");
        expect(src).toContain("runStatusDefinitionsInventory");
        expect(src).toContain('export async function GET');
        expect(src).not.toContain("POST");
    });
});

function readFileSyncSafe(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}
