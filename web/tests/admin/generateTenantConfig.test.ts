import { describe, expect, it } from "vitest";
import { generateTenantConfig, normalizePrompt } from "@/lib/admin/configGenerator/generateTenantConfig";
import { parseTenantBootstrapPayload } from "@/lib/admin/tenantBootstrap/parseTenantBootstrapPayload";

describe("normalizePrompt", () => {
    it("lowercases and trims", () => {
        expect(normalizePrompt("  Hello WORLD  ")).toBe("hello world");
    });

    it("handles undefined", () => {
        expect(normalizePrompt(undefined)).toBe("");
    });
});

describe("generateTenantConfig", () => {
    it('maps "childcare center" to childcare tenant (valid payload, enrollment dept)', () => {
        const payload = generateTenantConfig({ prompt: "We run a childcare center" });
        expect(payload.structural_config.vertical_key).toBe("childcare");
        expect(payload.structural_config.departments.some((d) => d.key === "enrollment")).toBe(true);

        const parsed = parseTenantBootstrapPayload(payload);
        expect(parsed.ok).toBe(true);
    });

    it('maps "house cleaning business" to cleaning tenant', () => {
        const payload = generateTenantConfig({ prompt: "house cleaning business" });
        expect(payload.structural_config.vertical_key).toBe("cleaning");
        expect(payload.org_profile.industry_key).toBe("cleaning");
        expect(payload.growth_department_keys).toContain("sales");
        expect(payload.structural_config.departments.some((d) => d.key === "sales")).toBe(true);

        const parsed = parseTenantBootstrapPayload(payload);
        expect(parsed.ok).toBe(true);
    });

    it("throws on unknown prompt", () => {
        expect(() => generateTenantConfig({ prompt: "plumbing empire" })).toThrow(/unsupported prompt/i);
    });
});
