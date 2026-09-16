import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    isOpenAiLiveInvocationFeatureEnabled,
    resolveAiEnrichmentPortalAccess,
} from "@/lib/ai/aiEnrichmentPermissions";
import {
    evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute,
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForStubTaskAssistProposeRoute,
    evaluateOrgPolicyForStubWorkflowAssistProposeRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";

// These carry no capabilities on purpose: the strict-mode tests below prove the grant is read
// from the ACCESS context, so a capability here would let a false pass look like a real one.
const adminCtx = { ok: true as const, orgId: "org-1", role: "admin", userId: "u1", permissionKeys: [] as string[] };
const opsCtx = { ok: true as const, orgId: "org-1", role: "ops", userId: "u1", permissionKeys: [] as string[] };

const accessBase = {
    ok: true as const,
    userId: "u1",
    orgId: "org-1",
    roleKeys: ["admin"],
    permissionKeys: [] as string[],
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

describe("resolveAiEnrichmentPortalAccess", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => vi.unstubAllEnvs());

    it("denies when org_id mismatches between ctx and access", () => {
        const r = resolveAiEnrichmentPortalAccess({
            ctx: adminCtx,
            access: { ...accessBase, orgId: "other" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("ORG_CONTEXT_MISMATCH");
    });

    /*
     * THERE IS NO LEGACY MODE AND NO STRICT MODE.
     *
     * These two cases asserted opposite outcomes for the SAME principal
     * depending on `AI_ENRICHMENT_USE_PERMISSION_REQUIRED`: with it off, admin
     * and ops were admitted holding no grant at all; with it on, an admin
     * holding no grant was refused. The flag was set in tests and in no
     * deployed configuration, so the first case described production and the
     * second described only itself.
     *
     * One question now, asked the same way everywhere.
     */
    it("refuses a principal without the grant, whatever their role title", () => {
        for (const ctx of [adminCtx, opsCtx]) {
            const denied = resolveAiEnrichmentPortalAccess({ ctx, access: accessBase });
            expect(denied.ok).toBe(false);
            if (!denied.ok) expect(denied.error).toBe("AI_ENRICHMENT_FORBIDDEN");
        }
    });

    it("admits any principal holding the grant, including one with no privileged title", () => {
        const granted = { ...accessBase, permissionKeys: [AI_ENRICHMENT_USE_PERMISSION_KEY] };
        for (const ctx of [
            adminCtx,
            opsCtx,
            { ok: true as const, orgId: "org-1", role: "manager", userId: "u1", permissionKeys: [] },
        ]) {
            expect(resolveAiEnrichmentPortalAccess({ ctx, access: granted }).ok).toBe(true);
        }
    });

    it("gives the same answer whatever the live-provider feature flag says", () => {
        const granted = { ...accessBase, permissionKeys: [AI_ENRICHMENT_USE_PERMISSION_KEY] };
        for (const v of ["false", "true", "0", "yes"]) {
            vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", v);
            expect(resolveAiEnrichmentPortalAccess({ ctx: adminCtx, access: accessBase }).ok).toBe(false);
            expect(resolveAiEnrichmentPortalAccess({ ctx: adminCtx, access: granted }).ok).toBe(true);
        }
    });

    it("keeps the flag meaningful for FEATURE availability only", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false");
        expect(isOpenAiLiveInvocationFeatureEnabled()).toBe(false);
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        expect(isOpenAiLiveInvocationFeatureEnabled()).toBe(true);
    });
});

describe("evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute", () => {
    it("allows stub + draft_enrichment when policy enabled", () => {
        const r = evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("denies when draft_enrichment missing", () => {
        const r = evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: [],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });

    it("denies when provider is not stub", () => {
        const r = evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "openai",
                allowed_features: ["draft_enrichment"],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("AI_POLICY_PROVIDER");
    });
});

describe("evaluateOrgPolicyForStubTaskAssistProposeRoute", () => {
    it("allows stub + task_assist_draft when policy enabled", () => {
        const r = evaluateOrgPolicyForStubTaskAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["task_assist_draft"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("denies when task_assist_draft missing", () => {
        const r = evaluateOrgPolicyForStubTaskAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });
});

describe("evaluateOrgPolicyForStubWorkflowAssistProposeRoute", () => {
    it("allows stub + workflow_assist_draft when policy enabled", () => {
        const r = evaluateOrgPolicyForStubWorkflowAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["workflow_assist_draft"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("denies when workflow_assist_draft missing", () => {
        const r = evaluateOrgPolicyForStubWorkflowAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["task_assist_draft"],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });
});

describe("evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute", () => {
    it("allows openai + workflow_assist_draft when policy enabled", () => {
        const r = evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "openai",
                allowed_features: ["workflow_assist_draft"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("denies when provider is not openai", () => {
        const r = evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["workflow_assist_draft"],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("AI_POLICY_PROVIDER");
    });
});

describe("AI enrichment permission seed migration", () => {
    it("defines ai.enrichment.use and optional keys in the SQL seed file", () => {
        const sql = readFileSync(
            join(process.cwd(), "..", "supabase", "migrations", "20260520100000_ai_enrichment_permission_keys_seed.sql"),
            "utf8",
        );
        expect(sql).toContain("ai.enrichment.use");
        expect(sql).toContain("ai.provider.config.manage");
        expect(sql).toContain("ai.telemetry.review");
        expect(sql).toContain("role_permission_grants");
        expect(sql.toLowerCase()).not.toContain("create table");
    });
});
