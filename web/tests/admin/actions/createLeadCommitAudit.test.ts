import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({ work_unit_id: "wu-1", status_key: "open" }),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn(),
}));

vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: vi.fn(),
}));

vi.mock("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter", () => ({
    ingestCreateLeadThroughProcessing: vi.fn().mockResolvedValue({
        ok: true,
        processingCaseId: "proc-case-1",
        sourceId: "src-1",
        idempotencyKey: "idem-1",
        created: true,
        readiness: "needs_plan_review",
    }),
    opportunityIdFromAttempt: vi.fn(),
}));

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/** D4: Create Lead intake is Processing-authoritative; CRM writes occur only after operator commit. */
describe("create lead commit audit — household intake", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("routes intake through Processing without direct person/customer/opportunity writes", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "verticals") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "vert-1" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                return { insert: vi.fn(), select: vi.fn() };
            }),
        };

        const result = await executeCreateLeadAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                merged: {
                    first_name: "Alex",
                    last_name: "Lyons",
                    email: "alex.lyons@test.com",
                    phone: "987988899",
                    child_first_name: "Jaxon",
                    child_last_name: "Lyons",
                    child_date_of_birth: "2013-11-23",
                    location_id: "site-1",
                },
                context: { department_id: "dept-1", work_unit_id: "wu-1" },
            },
        );

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.mode).toBe("processing_review");
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalledTimes(1);
        expect(findOrCreatePersonInOrgWithMeta).not.toHaveBeenCalled();
        expect(ensureCustomerForPersonNative).not.toHaveBeenCalled();
    });

    it("source audit: entryLifecycleActions no longer performs direct CRM inserts", () => {
        const source = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(source).not.toMatch(/from\("opportunities"\)\.insert/);
        expect(source).not.toMatch(/findOrCreatePersonInOrg/);
        expect(source).toContain("ingestCreateLeadThroughProcessing");
    });
});

export const CREATE_LEAD_COMMIT_AUDIT = {
    intake_authority: "Processing case + operator commit plan (D4)",
    creates_at_commit: [
        "persons (via create_person command)",
        "customers (via create_household command)",
        "customer_persons (via link_person_to_household)",
        "customer_members (via create_child)",
        "opportunities (via create_lead command)",
        "process_instances (via create_process_participation when applicable)",
    ],
    does_not_create_at_intake: [
        "any identity-bearing CRM record",
        "addresses",
        "person_relationships rows",
        "contacts table rows on intake path",
    ],
} as const;

describe("CREATE_LEAD_COMMIT_AUDIT reference", () => {
    it("documents D4 authoritative intake vs commit-time writes", () => {
        expect(CREATE_LEAD_COMMIT_AUDIT.intake_authority).toMatch(/Processing/);
        expect(CREATE_LEAD_COMMIT_AUDIT.creates_at_commit).toContain("opportunities (via create_lead command)");
    });
});
