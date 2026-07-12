import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "lib/fields/personChildRelationship");

function read(name: string): string {
    return readFileSync(join(ROOT, name), "utf8");
}

describe("personChildRelationship architecture boundaries", () => {
    it("canonical modules do not import Focus Panel or Forms UI", () => {
        for (const file of [
            "personChildRelationshipResolver.ts",
            "personChildRelationshipProviders.ts",
            "personChildRelationshipPatch.ts",
        ]) {
            const content = read(file);
            expect(content).not.toContain("@/components/");
            expect(content).not.toContain("focusPanel");
            expect(content).not.toContain("@/lib/forms/");
        }
    });

    it("adapter contract is isolated from database writes", () => {
        const content = read("focusPanelPersonChildRelationshipAdapterContract.ts");
        expect(content).not.toContain("supabase");
        expect(content).not.toContain(".from(");
    });
});
