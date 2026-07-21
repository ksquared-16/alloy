import { describe, expect, it } from "vitest";
import {
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    organizationProgramsHref,
} from "@/lib/admin/canonicalAdminRoutes";
import { organizationConfigurationDomains } from "@/lib/configRuntime/organizationRuntime";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Organization Programs canonical routing", () => {
    it("exposes /organization/programs as the Programs domain href", () => {
        const programs = organizationConfigurationDomains().find((domain) => domain.key === "programs");
        expect(programs?.href).toBe(CANONICAL_ORGANIZATION_PROGRAMS_HREF);
        expect(organizationProgramsHref("program-1")).toBe(
            "/organization/programs?programId=program-1",
        );
    });

    it("rewrites /organization/programs and redirects legacy commercial entry points", () => {
        const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
        expect(nextConfig).toContain(
            '{ source: "/organization/programs", destination: "/adminV2/settings/organization/programs" }',
        );
        expect(nextConfig).toContain(
            '{ source: "/settings/commercial/programs", destination: "/organization/programs", permanent: false }',
        );
        expect(nextConfig).toContain(
            '{ source: "/admin/commercial/programs", destination: "/organization/programs", permanent: false }',
        );
    });

    it("keeps one page owner under organization/programs", () => {
        const canonical = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/organization/programs/page.tsx"),
            "utf8",
        );
        const legacySettings = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/commercial/programs/page.tsx"),
            "utf8",
        );
        const legacyCommercial = readFileSync(
            resolve(process.cwd(), "app/adminV2/commercial/programs/page.tsx"),
            "utf8",
        );
        expect(canonical).toContain("ProgramsPublicationWorkspace");
        expect(legacySettings).toContain("redirect(organizationProgramsHref())");
        expect(legacyCommercial).toContain("redirect(organizationProgramsHref())");
        expect(legacySettings).not.toContain("<ProgramsPublicationWorkspace");
        expect(legacyCommercial).not.toContain("<ProgramsPublicationWorkspace");
    });
});
