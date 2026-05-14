import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/ai/task-assist/propose/route";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { AI_ENRICHMENT_USE_PERMISSION_KEY } from "@/lib/ai/aiEnrichmentPermissions";

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";
const oppId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const { mockGetAdminContextCached, mockGetAdminAccessContextCached, mockMaybeSingle } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockGetAdminAccessContextCached: vi.fn(),
    mockMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return {
        ...actual,
        getAdminAccessContextCached: mockGetAdminAccessContextCached,
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: mockMaybeSingle,
                }),
            }),
        }),
    })),
}));

vi.mock("@/lib/agent/taskAssist/taskAssistOpportunityContext", () => ({
    assembleTaskAssistOpportunityContextV1: vi.fn(async () => ({
        ok: true as const,
        context: {
            opportunity_id: oppId,
            opportunity_label: "Test Opp",
            status_key: "new_inquiry",
            status_label: "New inquiry",
            work_unit_id: null,
            customer_id: null,
            household_label: null,
            primary_person_id: null,
            children_summary: null,
            activity_summary: null,
            last_activity_at: null,
            recipient_candidates: [
                {
                    person_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    display_label: "Pat",
                    has_sms: true,
                    has_email: false,
                },
            ],
        },
    })),
}));

function baseAccess(permissionKeys: string[]) {
    return {
        ok: true as const,
        userId,
        orgId,
        roleKeys: ["admin"],
        permissionKeys,
        departmentScope: "all" as const,
        allowedDepartmentIds: null,
        siteScope: "all" as const,
        allowedSiteLocationIds: null,
    };
}

function postJson(body: unknown) {
    return new NextRequest("http://localhost/api/admin/ai/task-assist/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/admin/ai/task-assist/propose", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
        mockGetAdminAccessContextCached.mockResolvedValue(baseAccess([AI_ENRICHMENT_USE_PERMISSION_KEY]));
        mockMaybeSingle.mockResolvedValue({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "stub",
                        allowed_features: ["task_assist_draft"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns 403 when portal denies enrichment permission", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        mockGetAdminAccessContextCached.mockResolvedValue(baseAccess([]));
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "sms",
                instruction: "Hi",
            }),
        );
        expect(res.status).toBe(403);
    });

    it("returns 403 when task_assist_draft feature missing", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        mockMaybeSingle.mockResolvedValue({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "stub",
                        allowed_features: ["draft_enrichment"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "sms",
                instruction: "Hi",
            }),
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });

    it("returns 400 for workflow-like body keys", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "sms",
                instruction: "Hi",
                workflow_actions: [],
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 for unsupported entity_type", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({
                entity_type: "jobs",
                entity_id: oppId,
                channel: "sms",
                instruction: "Hi",
            }),
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("ENTITY_TYPE_UNSUPPORTED");
    });

    it("returns 400 for unsupported channel", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "in_app",
                instruction: "Hi",
            }),
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("CHANNEL_UNSUPPORTED");
    });

    it("returns 400 for unknown body keys", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "sms",
                instruction: "Hi",
                surprise: 1,
            }),
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("UNKNOWN_BODY_KEYS");
    });

    it("returns proposal when stub gates pass", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({
                entity_type: "opportunities",
                entity_id: oppId,
                channel: "sms",
                instruction: "Please confirm tour time.",
            }),
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            ok?: boolean;
            proposal?: { draft_body?: string; validation_errors?: string[] };
            proposal_valid?: boolean;
        };
        expect(j.ok).toBe(true);
        expect(j.proposal_valid).toBe(true);
        expect(j.proposal?.draft_body).toContain("tour time");
        expect(j.proposal?.validation_errors?.length).toBe(0);
    });
});
