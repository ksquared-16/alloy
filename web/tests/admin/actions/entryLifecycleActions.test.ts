import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    assertMoveToQualificationAllowed,
    executeCreateLeadAction,
    validateMarkLostPayload,
} from "@/lib/admin/actions/entryLifecycleActions";
import { CREATE_LEAD_ACTION_ENTITY_ID, isCreateLeadExecuteRequest } from "@/lib/admin/actions/createLeadActionConstants";
import { QUALIFICATION_STATUS_KEY } from "@/lib/admin/actions/universalActionConstants";
import { resolveCreateLeadEntryDepartmentForOrg } from "@/lib/lifecycle/resolveCreateLeadEntryDepartment";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    // Opportunity status configuration: `open` is the configured default-on-create.
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open", sort_order: 10, metadata: { default_on_create: true } },
    ]),
    resolveConfiguredDefaultCreateStatusKey: (defs: { status_key: string; metadata?: Record<string, unknown> | null }[]) =>
        defs.find((d) => d.metadata?.default_on_create === true)?.status_key ?? null,
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "person-1" }),
}));

vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: vi.fn().mockResolvedValue({ customer_id: "cust-1" }),
}));

vi.mock("@/lib/bookingCustomerPersonLink", () => ({
    ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    // A configured department resolves an owning work unit; status is left to the configured
    // default-on-create (empty here). Individual tests override for the fail-closed case.
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({
        work_unit_id: "wu-enrollment",
        status_key: "",
    }),
}));

// Workspace-level fallback used when the caller's department resolves no binding. Defaults to
// "no configured entry department" so the fail-closed expectations below still hold.
vi.mock("@/lib/lifecycle/resolveCreateLeadEntryDepartment", () => ({
    resolveCreateLeadEntryDepartmentForOrg: vi.fn().mockResolvedValue({ state: "none" }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin/actions/applyCreateLeadLayoutRuntimePersistence", () => ({
    applyCreateLeadLayoutRuntimePersistence: vi.fn().mockResolvedValue({
        child_scoped_contacts: { links_written: 0, links_skipped_invalid_role: 0, assignment_count: 0 },
        address: { household: { path: "none", location_id: null }, person: { path: "none", keys_written: [] } },
        role_contacts: { customer_person_roles: [], opportunity_person_roles: [] },
    }),
}));

vi.mock("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter")>();
    return {
        ...actual,
        ingestCreateLeadThroughProcessing: vi.fn().mockResolvedValue({
            ok: true,
            processingCaseId: "proc-case-1",
            sourceId: "src-1",
            idempotencyKey: "idem-1",
            created: true,
            readiness: "needs_plan_review",
        }),
    };
});

vi.mock("@/lib/pos/processingIdentity/executor/executorPorts", () => ({
    createExecutorPorts: vi.fn(() => ({})),
}));

vi.mock("@/lib/pos/processingIdentity/operator/createLeadReviewPresentation", () => ({
    buildCreateLeadReviewPresentation: vi.fn(() => ({
        mode: "identity_review_required",
        headline: "1 possible match needs review",
        summary: "Review required",
        subjects: [],
        subjectsNeedingAction: 1,
    })),
}));

vi.mock("@/lib/pos/processingIdentity/operator/operatorReviewService", () => {
    class OperatorServiceError extends Error {
        code: string;
        constructor(code: string, message: string) {
            super(message);
            this.code = code;
        }
    }
    return {
        OperatorServiceError,
        loadCaseReview: vi.fn().mockResolvedValue({
            resolutions: [],
            subjectEligibility: [],
            planEligible: false,
            readiness: "needs_identity_review",
            identityBlockers: ["needs_review"],
        }),
        commitApprovedLeadForCase: vi.fn(),
    };
});

import { applyCreateLeadChildParticipation } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";

describe("isCreateLeadExecuteRequest", () => {
    it("accepts create_lead with sentinel or empty entity id", () => {
        expect(isCreateLeadExecuteRequest("create_lead", CREATE_LEAD_ACTION_ENTITY_ID)).toBe(true);
        expect(isCreateLeadExecuteRequest("create_lead", "")).toBe(true);
        expect(isCreateLeadExecuteRequest("create_lead", "opp-1")).toBe(false);
    });
});

describe("validateMarkLostPayload", () => {
    it("requires lost_reason", async () => {
        const bad = await validateMarkLostPayload({});
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error).toMatch(/lost reason/i);

        const good = await validateMarkLostPayload({ lost_reason: "no_response" });
        expect(good.ok).toBe(true);
        if (good.ok) expect(good.lostReason).toBe("no_response");
    });
});

describe("assertMoveToQualificationAllowed", () => {
    function supabaseForMove(fromStatus: string | null, person: { email?: string | null; phone?: string | null } | null) {
        const oppSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            status_key: fromStatus,
                            primary_person_id: person ? "person-1" : null,
                            metadata: {},
                        },
                        error: null,
                    }),
                }),
            }),
        });
        const personSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: person, error: null }),
                }),
            }),
        });
        return {
            from: vi.fn((table: string) => {
                if (table === "opportunities") return { select: oppSelect };
                if (table === "persons") return { select: personSelect };
                return { select: vi.fn() };
            }),
        };
    }

    it("rejects when not a new lead", async () => {
        const sb = supabaseForMove("contact_attempted", { email: "a@b.com" });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/new lead/i);
    });

    it("rejects when parent has no phone or email", async () => {
        const sb = supabaseForMove("new_inquiry", { email: null, phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/phone or email/i);
    });

    it("allows new lead with parent contact info", async () => {
        const sb = supabaseForMove("new_inquiry", { email: "parent@example.com", phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(true);
    });

    it("does not require contact_attempted status for qualification transition", async () => {
        expect(QUALIFICATION_STATUS_KEY).toBe("qualification");
        const sb = supabaseForMove("new_inquiry", { email: "parent@example.com", phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
            status_key: QUALIFICATION_STATUS_KEY,
        });
        expect(res.ok).toBe(true);
    });
});

describe("executeCreateLeadAction validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function supabaseForCreate(verticalId: string | null) {
        const customerMembersInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "cm-child" }, error: null }),
            }),
        });
        const ocmInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "ocm-child" }, error: null }),
            }),
        });
        let capturedOppInsert: Record<string, unknown> | null = null;
        const sb = {
            from: vi.fn((table: string) => {
                if (table === "verticals") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: verticalId ? { id: verticalId } : null,
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "opportunities") {
                    const insert = vi.fn((payload: Record<string, unknown>) => {
                        capturedOppInsert = payload;
                        return {
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "opp-new" }, error: null }),
                            }),
                        };
                    });
                    return { insert, getCapturedInsert: () => capturedOppInsert };
                }
                if (table === "opportunity_persons") {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return { insert: customerMembersInsert };
                }
                if (table === "opportunity_customer_members") {
                    return { insert: ocmInsert };
                }
                if (table === "work_units") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: { key: "lifecycle_wu_lead" },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return { select: vi.fn(), insert: vi.fn() };
            }),
            getCapturedOppInsert: () => capturedOppInsert,
        };
        return sb;
    }

    const ctx = { orgId: "org-1", userId: "user-1", accessScope: null };

    it("returns structured error when names missing", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { email: "a@b.com" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/first name/i);
        }
    });

    it("returns structured error when contact missing", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/phone or email/i);
        }
    });

    it("opens Processing review when minimum fields present and org has a vertical", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.mode).toBe("processing_review");
            expect(res.processing_case_id).toBe("proc-case-1");
            expect(res.opportunity_id).toBeUndefined();
        }
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalled();
        expect(ensureCustomerForPersonNative).not.toHaveBeenCalled();
        expect(applyCreateLeadChildParticipation).not.toHaveBeenCalled();
    });

    it("passes flat child fields to Processing intake (participation at commit, not intake)", async () => {
        const sb = supabaseForCreate("vert-1");
        const siteId = "11111111-1111-4111-8111-111111111111";
        const merged = {
            first_name: "Kelly",
            last_name: "Kurzman",
            email: "kelly.kurzman@gmail.com",
            phone: "6022904816",
            location_id: siteId,
        };
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged,
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(true);
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({ merged, locationId: siteId }),
        );
    });

    it("returns configured status_key in processing review response (commit applies later)", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.status_key).toBe("open");
    });

    it("opens Processing review when org has no configured vertical", async () => {
        const sb = supabaseForCreate(null);
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.mode).toBe("processing_review");
            expect(res.processing_case_id).toBeTruthy();
        }
        expect(ensureCustomerForPersonNative).not.toHaveBeenCalled();
    });

    it("passes explicit merged vertical_id to Processing intake", async () => {
        const sb = supabaseForCreate("org-default-vert");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                vertical_id: "explicit-vert",
            },
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(true);
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({ verticalId: "explicit-vert" }),
        );
    });

    it("forwards enrollment child payload to Processing intake", async () => {
        const sb = supabaseForCreate("vert-1");
        const merged = {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            location_id: "11111111-1111-4111-8111-111111111111",
            child_program: "infant",
            child_schedule_type: "full_day",
            child_program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
            child_start_date: "2026-09-01",
        };
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged,
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(true);
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({ merged }),
        );
    });

    it("surfaces Processing intake failures (no legacy child OCM fallback)", async () => {
        vi.mocked(ingestCreateLeadThroughProcessing).mockResolvedValueOnce({
            ok: false,
            error: "Enrollment participation requires at least one child.",
            status: 400,
        });
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                child_program: "infant",
            },
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/child/i);
        }
    });

    it("fails closed when no owning work unit can be resolved (never orphans a lead)", async () => {
        // Department resolves NO work unit (misconfigured process/location) and no explicit
        // work_unit_id is passed → Create Lead must fail closed, not persist work_unit_id = NULL.
        vi.mocked(resolveLifecycleCreateLeadBinding).mockResolvedValueOnce({
            work_unit_id: null,
            status_key: "",
            activation: null,
        });
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(422);
            expect(res.error).toMatch(/not configured for this process\/location/i);
        }
        // No opportunity row was inserted.
        expect(sb.getCapturedOppInsert()).toBeNull();
    });

    it("resolves the entry department from configuration when the caller names none", async () => {
        // Workspace surfaces ("All locations", slash Create Lead) send no department. Configuration
        // is the authority — the lead must still land on the configured entry work unit.
        vi.mocked(resolveCreateLeadEntryDepartmentForOrg).mockResolvedValueOnce({
            state: "resolved",
            departmentId: "dept-enrollment",
            workUnitId: "wu-entry",
        });
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.work_unit_id).toBe("wu-entry");
    });

    it("asks rather than guessing when several processes can create leads", async () => {
        vi.mocked(resolveCreateLeadEntryDepartmentForOrg).mockResolvedValueOnce({
            state: "ambiguous",
            departmentIds: ["dept-a", "dept-b"],
        });
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(422);
            expect(res.error).toMatch(/more than one process/i);
        }
        expect(sb.getCapturedOppInsert()).toBeNull();
    });
});
