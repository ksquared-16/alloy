import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("read consumer architecture boundaries", () => {
    it("Focus Panel collection adapters do not import Forms modules", () => {
        const content = read("lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation.ts");
        expect(content).not.toContain("@/lib/forms/");
        expect(content).not.toContain("forms/collection");
    });

    it("canonical collection registry does not import consumer UI", () => {
        const content = read("lib/fields/collection/canonicalCollectionProviderRegistry.ts");
        expect(content).not.toContain("@/components/");
        expect(content).not.toContain("focusPanel");
        expect(content).not.toContain("@/lib/forms/");
    });

    it("consumer assembly delegates to canonicalDataProviderRegistry", () => {
        const content = read("lib/fields/consumerCanonicalProviderAssembly.ts");
        expect(content).toContain("filterCanonicalDataProviders");
        expect(content).not.toContain("QUEUE_FIELD_CATALOG");
        expect(content).not.toContain("CONCEPT_TREE");
    });
});
