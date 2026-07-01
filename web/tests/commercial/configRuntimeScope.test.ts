import { describe, it, expect } from "vitest";
import {
    resolveInherited,
    configScopeLabel,
    type ConfigScope,
} from "@/lib/configRuntime/scope";

describe("resolveInherited", () => {
    it("returns org value at org scope", () => {
        const result = resolveInherited<number>(100, undefined);
        expect(result.value).toBe(100);
        expect(result.owner).toBe("org");
        expect(result.isOverride).toBe(false);
    });

    it("location override wins over org default", () => {
        const result = resolveInherited<number>(100, 200);
        expect(result.value).toBe(200);
        expect(result.owner).toBe("location");
        expect(result.isOverride).toBe(true);
        expect(result.orgDefault).toBe(100);
    });

    it("falls back to org when no location override", () => {
        const result = resolveInherited<string>("org-val", undefined);
        expect(result.value).toBe("org-val");
        expect(result.owner).toBe("org");
    });

    it("handles both undefined (unset)", () => {
        const result = resolveInherited<number | undefined>(undefined, undefined);
        expect(result.value).toBeUndefined();
        expect(result.owner).toBe("org");
        expect(result.isOverride).toBe(false);
    });
});

describe("configScopeLabel", () => {
    it("labels org scope", () => {
        const scope: ConfigScope = { kind: "org", orgId: "org1" };
        expect(configScopeLabel(scope)).toBe("Organization default");
    });

    it("labels location scope", () => {
        const scope: ConfigScope = { kind: "location", orgId: "org1", locationId: "loc-abc" };
        expect(configScopeLabel(scope)).toBe("Location override");
    });
});
