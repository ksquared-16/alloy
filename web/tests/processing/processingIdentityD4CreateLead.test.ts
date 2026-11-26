import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    serializeCreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { validateCreateLeadProcessingMinimum } from "@/lib/pos/processingIdentity/sources/createLeadMinimumValidation";
import { householdFromFlatCreateLeadMerged } from "@/lib/pos/processingIdentity/sources/householdFromCommitSelection";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open", sort_order: 10, metadata: { default_on_create: true } },
    ]),
    resolveConfiguredDefaultCreateStatusKey: (defs: { status_key: string; metadata?: Record<string, unknown> | null }[]) =>
        defs.find((d) => d.metadata?.default_on_create === true)?.status_key ?? null,
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({
        work_unit_id: "wu-enrollment",
        status_key: "",
    }),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn(),
}));

vi.mock("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter")>();
    return {
        ...actual,
        ingestCreateLeadThroughProcessing: vi.fn(),
    };
});

vi.mock("@/lib/pos/processingIdentity/executor/executorPorts", () => ({
    createExecutorPorts: vi.fn(() => ({})),
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
            caseId: "22222222-2222-4222-8222-222222222222",
            facts: [],
            resolutions: [
                {
                    id: "r1",
                    subject_ref: "person-1",
                    subject_role: "parent",
                    decision_action: "review_required",
                    selected_candidate_id: null,
                    candidates: [
                        {
                            subjectRef: "person-1",
                            recordId: "existing-1",
                            entityType: "person",
                            confidenceBand: "possible",
                            signals: [],
                            blockingConflicts: [],
                            explanation: "possible",
                            resolverVersion: "1",
                        },
                    ],
                    provisional: { first_name: "Ada", last_name: "Lovelace" },
                },
            ],
            plan: null,
            planDiff: null,
            approval: null,
            latestAttempt: null,
            readiness: "needs_identity_review",
            blockingConflictCount: 0,
            subjectEligibility: [
                {
                    subjectRef: "person-1",
                    subjectRole: "parent",
                    state: "needs_review",
                    eligibleForPlan: false,
                    blockingReasons: [],
                    recommendationSummary: null,
                },
            ],
            planEligible: false,
            identityBlockers: ["plausible_match_needs_review: match"],
        }),
        commitApprovedLeadForCase: vi.fn(),
    };
});

vi.mock("@/lib/pos/processingIdentity/operator/createLeadReviewPresentation", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/lib/pos/processingIdentity/operator/createLeadReviewPresentation")
        >();
    return {
        ...actual,
        // Default unit tests keep the interactive Processing review path.
        buildCreateLeadReviewPresentation: vi.fn(() => ({
            mode: "identity_review_required",
            headline: "1 possible match needs review",
            summary: "Review required",
            subjects: [],
            subjectsNeedingAction: 1,
        })),
    };
});

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";

function verticalSupabase() {
    return {
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
            return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
        }),
    } as unknown as SupabaseClient;
}

describe("D4 Manual Create Lead authoritative cutover", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ingestCreateLeadThroughProcessing).mockResolvedValue({
            ok: true,
            processingCaseId: CASE,
            sourceId: "src-1",
            idempotencyKey: "idem-1",
            created: true,
            readiness: "needs_plan_review",
        });
    });

    it("routes executeCreateLeadAction through Processing (no direct person write)", async () => {
        const res = await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1", work_unit_id: "wu-enrollment" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.mode).toBe("processing_review");
            expect(res.processing_case_id).toBe(CASE);
            expect(res.opportunity_id).toBeUndefined();
        }
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalledTimes(1);
        expect(findOrCreatePersonInOrgWithMeta).not.toHaveBeenCalled();
    });

    it("auto-commits clean-new through Processing without interactive review UI", async () => {
        const { buildCreateLeadReviewPresentation } = await import(
            "@/lib/pos/processingIdentity/operator/createLeadReviewPresentation"
        );
        const { loadCaseReview, commitApprovedLeadForCase } = await import(
            "@/lib/pos/processingIdentity/operator/operatorReviewService"
        );
        vi.mocked(buildCreateLeadReviewPresentation).mockReturnValueOnce({
            mode: "ready_without_identity_review",
            headline: "Ready to create",
            summary: "No possible duplicates were found.",
            subjects: [],
            subjectsNeedingAction: 0,
        });
        vi.mocked(loadCaseReview).mockResolvedValueOnce({
            caseId: CASE,
            facts: [],
            resolutions: [],
            plan: null,
            planDiff: null,
            approval: null,
            latestAttempt: null,
            readiness: "needs_plan_review",
            blockingConflictCount: 0,
            subjectEligibility: [],
            planEligible: true,
            identityBlockers: [],
        } as never);
        vi.mocked(commitApprovedLeadForCase).mockResolvedValueOnce({
            plan: { planId: "plan-1", contentHash: "hash-1" },
            approval: { approvalId: "ap-1" },
            attempt: {
                attemptId: "at-1",
                outcome: "committed",
                operations: [
                    { commandKey: "create_lead", recordId: "opp-clean-1", status: "committed" },
                ],
            },
        } as never);

        const res = await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { work_unit_id: "wu-enrollment" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.mode).toBe("committed");
            expect(res.opportunity_id).toBe("opp-clean-1");
            expect(res.processing_case_id).toBe(CASE);
        }
        expect(commitApprovedLeadForCase).toHaveBeenCalled();
        expect(findOrCreatePersonInOrgWithMeta).not.toHaveBeenCalled();
    });

    it("stable retry reuses case via adapter idempotency key input", async () => {
        await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { work_unit_id: "wu-enrollment" },
        });
        await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { work_unit_id: "wu-enrollment" },
        });
        const calls = vi.mocked(ingestCreateLeadThroughProcessing).mock.calls;
        expect(calls[0]?.[1]?.merged).toEqual(calls[1]?.[1]?.merged);
    });

    it("enforces server-side person minimum via validateCreateLeadProcessingMinimum", () => {
        const household = householdFromFlatCreateLeadMerged({
            first_name: "Ada",
            last_name: "Lovelace",
        });
        const check = validateCreateLeadProcessingMinimum({
            values: {},
            selection: null,
            household,
            orgId: ORG,
            workUnitId: "wu-1",
            statusKey: "open",
        });
        expect(check.ok).toBe(false);
        if (!check.ok) expect(check.issues.join(" ")).toMatch(/phone or email/i);
    });

    it("builds flat household for brand-new family intake", () => {
        const household = householdFromFlatCreateLeadMerged({
            first_name: "Sarah",
            last_name: "Emerson",
            email: "sarah@example.com",
            child_first_name: "Mia",
            child_last_name: "Emerson",
            child_date_of_birth: "2020-03-15",
        });
        expect(household?.parents_guardians).toHaveLength(1);
        expect(household?.children).toHaveLength(1);
    });

    it("surfaces adapter failures without legacy fallback", async () => {
        vi.mocked(ingestCreateLeadThroughProcessing).mockResolvedValueOnce({
            ok: false,
            error: "Exact parent match requires linking the existing record before commit.",
            status: 400,
        });
        const res = await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { work_unit_id: "wu-enrollment" },
        });
        expect(res.ok).toBe(false);
        expect(findOrCreatePersonInOrgWithMeta).not.toHaveBeenCalled();
    });

    it("accepts serialized household commit selection in payload", async () => {
        const selection = {
            version: 1,
            parents: [
                {
                    candidate_id: "parent:1",
                    include_in_commit: true,
                    first_name: "Alex",
                    last_name: "Lyons",
                    email: "alex@test.com",
                    phone: "",
                    dob: null,
                    validation_state: "valid",
                    source_fact_ids: [],
                },
            ],
            children: [],
            household_resolution: null,
            household_contacts: [],
            address_review_only: null,
        } as unknown as CreateLeadCommitSelection;
        await executeCreateLeadAction(verticalSupabase(), { orgId: ORG, userId: "user-1" }, {
            merged: {
                first_name: "Alex",
                last_name: "Lyons",
                email: "alex@test.com",
                [CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]: serializeCreateLeadCommitSelection(selection),
            },
            context: { work_unit_id: "wu-enrollment" },
        });
        expect(ingestCreateLeadThroughProcessing).toHaveBeenCalled();
    });
});
