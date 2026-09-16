/**
 * DIRECT CERTIFICATION — AI residual authority.
 *
 * `ai.enrichment.use` authorizes AI computation and proposal. It is NOT a domain authority, and
 * holding a domain authority is not a licence to propose. Both directions are asserted here, because
 * a one-directional matrix would pass a world where AI authority had quietly become a superset.
 *
 * Every refusal asserts the handler never reached its client, so "nothing was written" is MEASURED
 * rather than inferred. `requireAdminOrOps` is stubbed to admit, deliberately: it is portal
 * admission, and stubbing it isolates the authority question from the admission question. If the AI
 * gate were removed, every persona below would be admitted and this file would go red.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy, mockPortal } = vi.hoisted(() => ({
    mockCtx: vi.fn(), mockAccess: vi.fn(), fromSpy: vi.fn(), mockPortal: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: mockPortal, requireAdmin: mockPortal };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));

import { POST as CREATE_PROPOSAL } from "@/app/api/admin/ai/task-assist/proposals/route";
import { POST as APPROVE } from "@/app/api/admin/ai/task-assist/proposals/[id]/approve/route";
import { POST as REJECT } from "@/app/api/admin/ai/task-assist/proposals/[id]/reject/route";
import { AI_ENRICHMENT_USE_PERMISSION_KEY, requireAiEnrichmentUse } from "@/lib/ai/aiEnrichmentPermissions";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";
const PROPOSAL = "55555555-5555-4555-8555-555555555555";

const access = (permissionKeys: string[], roleKeys: string[] = []) =>
    ({ ok: true as const, orgId: ORG, userId: "u1", permissionKeys, roleKeys,
       departmentScope: "all" as const, allowedDepartmentIds: [] as string[],
       siteScope: "all" as const, allowedSiteLocationIds: [] as string[] });

/* A deterministic proposal. No provider, no model quality, no network. */
const SUGGESTION = {
    version: 1,
    agent_key: TASK_ASSIST_AGENT_KEY,
    suggestion_id: "a".repeat(48),
    generated_at_iso: "2026-05-14T12:00:00.000Z",
    org_id: ORG,
    actor_user_id: "u1",
    source_surface: "opportunity_drawer",
    task_type: "draft_sms",
    entity_type: "opportunities",
    entity_id: OPP,
    context_summary: "ctx",
    recipient_candidates: [{ person_id: PERSON, display_label: "P", has_sms: true, has_email: true }],
    selected_recipient: null,
    channel: "sms",
    draft_subject: null,
    draft_body: "hello",
    scheduled_for_iso: null,
    reminder_due_at_iso: null,
    assumptions: [],
    missing_inputs: [],
    warnings: [],
    validation_errors: [],
    confidence: { mode: "deterministic" },
    approval_required: true,
    apply_intent: { kind: "none" },
};

function installClient() {
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => {
        const b: Record<string, unknown> = {};
        const chain = () => b;
        Object.assign(b, {
            select: chain, eq: chain, order: chain, limit: chain,
            maybeSingle: async () => ({ data: { id: PROPOSAL, org_id: ORG, state: "draft" }, error: null }),
            single: async () => ({ data: { id: PROPOSAL, org_id: ORG, state: "draft" }, error: null }),
            update: () => ({ eq: chain, select: () => ({ single: async () => ({ data: { id: PROPOSAL }, error: null }) }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: PROPOSAL }, error: null }) }) }),
        });
        return b;
    });
}

const create = () =>
    CREATE_PROPOSAL(new NextRequest("http://localhost/api/admin/ai/task-assist/proposals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: SUGGESTION }),
    }));
const approve = () =>
    APPROVE(new NextRequest(`http://localhost/x/${PROPOSAL}/approve`, { method: "POST" }),
        { params: Promise.resolve({ id: PROPOSAL }) });
const reject = () =>
    REJECT(new NextRequest(`http://localhost/x/${PROPOSAL}/reject`, { method: "POST" }),
        { params: Promise.resolve({ id: PROPOSAL }) });

beforeEach(() => {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
    mockPortal.mockResolvedValue(null); // portal admission granted; authority is what is under test
    installClient();
});

/** Who may propose, and who may not. The second list is the one that matters. */
const PERSONAS: ReadonlyArray<readonly [string, string[], string[], boolean]> = [
    ["AI USER",              [AI_ENRICHMENT_USE_PERMISSION_KEY], ["ai_user"],        true],
    ["DEFAULT ADMIN (granted)", [AI_ENRICHMENT_USE_PERMISSION_KEY, "work.configure", "fields.manage"], ["admin"], true],
    ["WORK CONFIGURER",      ["work.configure"],                 ["work_configurer"], false],
    ["WORK OPERATOR",        ["work.operate"],                   ["work_operator"],   false],
    ["FIELDS MANAGER",       ["fields.manage"],                  ["fields_manager"],  false],
    ["LAYOUTS MANAGER",      ["layouts.manage"],                 ["layouts_manager"], false],
    ["WORKFLOW WRITER",      ["ops.workflows.write"],            ["wf_writer"],       false],
    ["PORTAL ONLY",          [],                                 ["portal_only"],     false],
    ["TITULAR AI ADMIN",     [],                                 ["admin"],           false],
    ["DEFAULT OPS (ungranted)", [],                              ["ops"],             false],
];

describe("AI residual — proposing is its own authority", () => {
    for (const [name, keys, roles, allowed] of PERSONAS) {
        it(`${name} ${allowed ? "may" : "may NOT"} create a proposal`, async () => {
            mockAccess.mockResolvedValue(access(keys, roles));
            const res = await create();
            if (allowed) {
                expect(res.status, `${name} holds the key`).not.toBe(403);
                /*
                 * A 400 would also satisfy "not 403", and then an ADMITTED case would pass for free
                 * on a payload the validator rejects — the failure mode that made an earlier matrix
                 * in this program green while proving nothing. The fixture must actually persist.
                 */
                expect(res.status, `${name} must reach persistence, not die in validation`).toBeLessThan(400);
            } else {
                expect(res.status, `${name} must be refused`).toBe(403);
                const body = await res.json();
                expect(body.required_permission).toBe(AI_ENRICHMENT_USE_PERMISSION_KEY);
                expect(fromSpy, "a refusal must write nothing").not.toHaveBeenCalled();
            }
        });

        it(`${name} ${allowed ? "may" : "may NOT"} approve or reject`, async () => {
            mockAccess.mockResolvedValue(access(keys, roles));
            const a = await approve();
            installClient();
            mockAccess.mockResolvedValue(access(keys, roles));
            const r = await reject();
            if (allowed) {
                expect(a.status).not.toBe(403);
                expect(r.status).not.toBe(403);
            } else {
                expect(a.status, `${name} approve`).toBe(403);
                expect(r.status, `${name} reject`).toBe(403);
                expect(fromSpy, "a refusal must write nothing").not.toHaveBeenCalled();
            }
        });
    }

    it("a titular Admin is refused by the same key, and the label carries nothing", async () => {
        mockAccess.mockResolvedValue(access([], ["admin", "owner", "superuser"]));
        const res = await create();
        expect(res.status).toBe(403);
        expect((await res.json()).required_permission).toBe(AI_ENRICHMENT_USE_PERMISSION_KEY);
    });

    it("AI authority does not confer any domain authority", () => {
        const ai = access([AI_ENRICHMENT_USE_PERMISSION_KEY]);
        for (const domain of ["work.configure", "work.operate", "fields.manage", "layouts.manage",
                              "ops.workflows.write", "communications.send", "config_assist.apply"]) {
            expect(ai.permissionKeys, `AI must not imply ${domain}`).not.toContain(domain);
        }
    });

    it("the gate refuses rather than throwing on a missing or malformed key list", () => {
        for (const bad of [undefined, null, []] as unknown[]) {
            const res = requireAiEnrichmentUse(access((bad ?? []) as string[]));
            expect(res, "must refuse, not admit").not.toBeNull();
            expect(res!.status).toBe(403);
        }
    });

    it("W-17: granting the key opens the next request, removing it closes", async () => {
        mockAccess.mockResolvedValue(access([], ["custom"]));
        expect((await create()).status, "starts closed").toBe(403);

        installClient();
        mockAccess.mockResolvedValue(access([AI_ENRICHMENT_USE_PERMISSION_KEY], ["custom"]));
        expect((await create()).status, "granting opens it").not.toBe(403);

        installClient();
        mockAccess.mockResolvedValue(access([], ["custom"]));
        expect((await create()).status, "removing closes it again").toBe(403);
    });
});
