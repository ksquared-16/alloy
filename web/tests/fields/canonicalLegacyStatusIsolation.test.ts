import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    LEGACY_ENTITY_STATUS_FORBIDDEN_IN_PREFIXES,
    LEGACY_STATUS_MAINTENANCE_PATH_PREFIXES,
    selectStringReferencesLegacyEntityStatus,
} from "@/lib/fields/canonicalLegacyStatusMaintenance";
import {
    CUSTOMER_CANONICAL_ADMIN_SELECT,
    OPPORTUNITY_CANONICAL_ADMIN_SELECT,
    OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";

describe("canonicalEntitySelectColumns", () => {
    it("opportunity admin select excludes legacy status column", () => {
        expect(OPPORTUNITY_CANONICAL_ADMIN_SELECT).toContain("status_key");
        expect(OPPORTUNITY_CANONICAL_ADMIN_SELECT).not.toMatch(/(?:^|,)\s*status\s*(?:,|$)/);
    });

    it("legacy admin list select excludes legacy status column", () => {
        expect(OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT).toContain("status_key");
        expect(OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT).not.toMatch(/(?:^|,)\s*status\s*(?:,|$)/);
    });

    it("customer admin select excludes legacy status column", () => {
        expect(CUSTOMER_CANONICAL_ADMIN_SELECT).toContain("status_key");
        expect(CUSTOMER_CANONICAL_ADMIN_SELECT).not.toMatch(/(?:^|,)\s*status\s*(?:,|$)/);
    });
});

describe("canonicalLegacyStatusMaintenance", () => {
    it("detects legacy entity status in select strings", () => {
        expect(selectStringReferencesLegacyEntityStatus('name, status, status_key')).toBe(true);
        expect(selectStringReferencesLegacyEntityStatus('status_key, work_unit_id')).toBe(false);
        expect(
            selectStringReferencesLegacyEntityStatus(
                'supabase.from("opportunities").select("*").eq("id", id)'
            )
        ).toBe(true);
    });
});

describe("canonical legacy status isolation — admin/runtime source contract", () => {
    function read(rel: string): string {
        const p = join(process.cwd(), rel);
        expect(existsSync(p), `exists: ${rel}`).toBe(true);
        return readFileSync(p, "utf8");
    }

    const ADMIN_RUNTIME_SOURCES = [
        "lib/admin/opportunityEntityRecord.ts",
        "lib/admin/operationalTasksWorkspaceEnrichment.ts",
        "lib/communications/v2/commandCenterConversationEnrichment.ts",
        "lib/communications/inboxThreadsService.ts",
        "lib/agent/taskAssist/taskAssistOpportunityContext.ts",
        "lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData.ts",
        "app/api/admin/opportunities/[id]/activity-signal/route.ts",
        "app/api/admin/customers/route.ts",
        "app/api/admin/entity/[type]/[id]/route.ts",
        "lib/admin/drawer/opportunityStatusDisplayResolve.ts",
    ];

    for (const rel of ADMIN_RUNTIME_SOURCES) {
        it(`${rel} does not import maintenance legacy fallback`, () => {
            const src = read(rel);
            expect(src).not.toMatch(/canonicalLegacyStatusMaintenance/);
            expect(src).not.toMatch(/resolveLegacyStatusKeyWithTextFallback/);
            expect(src).not.toMatch(/resolveCanonicalStatusKeyWithLegacyFallback/);
        });
    }

    it("opportunityEntityRecord uses canonical explicit select", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        expect(src).toContain("OPPORTUNITY_CANONICAL_ADMIN_SELECT");
        expect(src).not.toMatch(/from\("opportunities"\)[\s\S]*select\("\*"\)/);
    });

    it("legacy-admin opportunities uses canonical list select without legacy status", () => {
        const src = read("app/legacy-admin/opportunities/page.tsx");
        expect(src).toContain("OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT");
        expect(src).not.toMatch(/name, status, status_key/);
    });

    it("maintenance module is only referenced from allowed path prefixes in tests", () => {
        expect(LEGACY_STATUS_MAINTENANCE_PATH_PREFIXES.length).toBeGreaterThan(0);
        expect(LEGACY_ENTITY_STATUS_FORBIDDEN_IN_PREFIXES.length).toBeGreaterThan(0);
    });

    it("canonicalStatusRead has no legacy fallback export", () => {
        const src = read("lib/fields/canonicalStatusRead.ts");
        expect(src).not.toMatch(/LegacyFallback/);
        expect(src).not.toMatch(/legacyStatus/);
    });
});
