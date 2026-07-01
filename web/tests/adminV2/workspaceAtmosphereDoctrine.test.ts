import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    WORKSPACE_ATMOSPHERE_SPEC,
    WORKSPACE_ATMOSPHERE_VARIANT,
} from "@/lib/adminV2/workspace/workspaceAtmosphereDoctrine";

describe("workspace atmosphere doctrine registry", () => {
    it("locks premium as the shipping profile", () => {
        expect(WORKSPACE_ATMOSPHERE_VARIANT).toBe("premium");
        expect(WORKSPACE_ATMOSPHERE_SPEC.radialPeak).toContain("14% pine");
        expect(WORKSPACE_ATMOSPHERE_SPEC.base).toBe("#f4fbf9");
    });

    it("documents locked premium profile in platform doctrine", () => {
        const doc = readFileSync(
            resolve(__dirname, "../../../docs/system/workspace-atmosphere-doctrine.md"),
            "utf8"
        );
        expect(doc).toContain("Locked");
        expect(doc).toContain("premium pine gradient");
        expect(doc).toContain("80% Bend Pine");
    });
});
