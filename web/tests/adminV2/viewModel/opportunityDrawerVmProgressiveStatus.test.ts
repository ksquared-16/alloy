import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM drawer header status", () => {

    it("compose builds dropdown status control when multiple opportunity defs exist", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader.ts");
        expect(compose).toContain('renderAs: "dropdown"');
    });

    it("runtime debug badge only when NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG is enabled", () => {
        const debug = read("lib/adminV2/drawer/drawerRuntimeDebug.ts");
        expect(debug).toContain("NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG");
    });
});
