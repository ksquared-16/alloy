import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    isAiEnrichmentUsePermissionRequired,
    resolveAiEnrichmentPortalAccess,
} from "@/lib/ai/aiEnrichmentPermissions";
import {
    evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute,
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForStubTaskAssistProposeRoute,
    evaluateOrgPolicyForStubWorkflowAssistProposeRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";

const adminCtx = { ok: true as const, orgId: "org-1", role: "admin", userId: "u1" };
const opsCtx = { ok: true as const, orgId: "org-1", role: "ops", userId: "u1" };

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

    it("legacy mode: allows admin or ops when permission strict is off", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false");
        expect(isAiEnrichmentUsePermissionRequired()).toBe(false);
        const okAdmin = resolveAiEnrichmentPortalAccess({ ctx: adminCtx, access: accessBase });
        expect(okAdmin.ok).toBe(true);
        const okOps = resolveAiEnrichmentPortalAccess({ ctx: opsCtx, access: accessBase });
        expect(okOps.ok).toBe(true);
        const badOther = resolveAiEnrichmentPortalAccess({
            ctx: { ok: true as const, orgId: "org-1", role: "manager", userId: "u1" },
            access: accessBase,
        });
        expect(badOther.ok).toBe(false);
    });

    it("strict mode: requires ai.enrichment.use grant", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        expect(isAiEnrichmentUsePermissionRequired()).toBe(true);
        const denied = resolveAiEnrichmentPortalAccess({ ctx: adminCtx, access: accessBase });
        expect(denied.ok).toBe(false);
        if (!denied.ok) expect(denied.error).toBe("AI_ENRICHMENT_FORBIDDEN");

        const allowed = resolveAiEnrichmentPortalAccess({
            ctx: opsCtx,
            access: {
                ...accessBase,
                permissionKeys: [AI_ENRICHMENT_USE_PERMISSION_KEY],
            },
        });
        expect(allowed.ok).toBe(true);
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
