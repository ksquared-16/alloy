import { describe, expect, it, beforeAll } from "vitest";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { ingestPublicFormThroughProcessing } from "@/lib/pos/processingIdentity/sources/formIntakeAdapter";
import { loadCaseReview, OperatorServiceError, executeApprovedPlanForCase } from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import {
    approveAndExecuteAllCreateNew,
    approveWithoutExecute,
    countOrgIdentityRecords,
    invokeAtomicGroup,
    loadCaseMetadata,
    makeOperatorDeps,
} from "./cert/processingIdentityCertFlow";
import {
    CERT_OPP_NULL_ORG,
    CERT_ORG_A,
    CERT_PERSON_B_PARENT,
    CERT_USER_A_ADMIN,
    CERT_WU_A,
    SHARED_EMAIL,
    certSupabaseConfigured,
    createCertAdminClient,
    seedProcessingIdentityCertFixtures,
} from "./cert/processingIdentityCertFixtures";

describe.skipIf(!certSupabaseConfigured())("processing identity cert — Manual Create Lead", () => {
    let verticalId: string;

    beforeAll(async () => {
        const admin = createCertAdminClient();
        ({ verticalId } = await seedProcessingIdentityCertFixtures(admin));
    });

    it("new family: zero pre-commit writes, full graph after explicit commit", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: `Brand${tag}`,
                last_name: `New${tag}`,
                email: `brand.new.${tag}@test.local`,
                phone: `+1555${String(tag).slice(-7)}`,
                child_first_name: `Baby${tag}`,
                child_last_name: `New${tag}`,
                child_dob: "2022-05-05",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const afterIntake = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterIntake.persons).toBe(before.persons);
        expect(afterIntake.customers).toBe(before.customers);
        expect(afterIntake.opportunities).toBe(before.opportunities);

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        expect((await loadCaseReview(deps, intake.processingCaseId)).readiness).not.toBe("committed");

        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-new-${tag}`);
        expect(["committed", "partially_committed"]).toContain(attempt.outcome);

        const afterCommit = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterCommit.persons).toBeGreaterThan(afterIntake.persons);
        expect(afterCommit.customers).toBeGreaterThan(afterIntake.customers);
        expect(afterCommit.opportunities).toBeGreaterThan(afterIntake.opportunities);
    });

    it("conflicting DOB: contradiction visible, unsafe commit blocked", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Existing",
                last_name: "ParentA",
                email: SHARED_EMAIL,
                child_first_name: "Existing",
                child_last_name: "ChildA",
                child_dob: "2020-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        const childResolution = review.resolutions.find((r) => r.subject_role === "child");
        expect(childResolution).toBeTruthy();
        const hasConflict =
            childResolution?.decision_action === "reject" ||
            (childResolution?.candidates ?? []).some(
                (c) => c.confidenceBand === "conflicted" || (c.blockingConflicts?.length ?? 0) > 0,
            );
        expect(hasConflict).toBe(true);

        await expect(approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-dob-${Date.now()}`)).rejects.toBeInstanceOf(
            OperatorServiceError,
        );
    });

    it("existing family + new child: reuses household, one new member", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Existing",
                last_name: "ParentA",
                email: SHARED_EMAIL,
                child_first_name: `UniqueChild${tag}`,
                child_last_name: `Cert${tag}`,
                child_dob: "2021-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-child-${tag}`);
        expect(attempt.outcome).not.toBe("preflight_rejected");

        const after = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(after.customers).toBe(before.customers);
        expect(after.members).toBeGreaterThan(before.members);
    });

    it("shared email: resolution required, no auto-commit at intake", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Ambiguous",
                last_name: "Email",
                email: SHARED_EMAIL,
                child_first_name: "Kid",
                child_last_name: "Ambiguous",
                child_dob: "2020-06-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        expect(review.resolutions.length).toBeGreaterThan(0);
        expect(review.approval).toBeNull();
        expect(review.readiness).not.toBe("committed");
    });

    it("existing parent + child: reuses identities, new lead only", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Existing",
                last_name: "ParentA",
                email: SHARED_EMAIL,
                child_first_name: "Existing",
                child_last_name: "ChildA",
                child_dob: "2019-03-15",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-existing-${tag}`);

        const after = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(after.persons).toBe(before.persons);
        expect(after.customers).toBe(before.customers);
        expect(after.opportunities).toBeGreaterThanOrEqual(before.opportunities);
    });

    it("idempotent intake reuses processing case", async () => {
        const admin = createCertAdminClient();
        const tag = Date.now();
        const merged = {
            first_name: "Idem",
            last_name: "Potent",
            email: `idem.${tag}@test.local`,
            child_first_name: "Idem",
            child_last_name: "Child",
            child_dob: "2019-01-01",
        };
        const input = {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged,
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        };
        const first = await ingestCreateLeadThroughProcessing(admin, input);
        const second = await ingestCreateLeadThroughProcessing(admin, input);
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.processingCaseId).toBe(first.processingCaseId);
    });

    it("execute idempotency: replay does not duplicate authoritative records", async () => {
        const admin = createCertAdminClient();
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: `Replay${tag}`,
                last_name: `Exec${tag}`,
                email: `replay.exec.${tag}@test.local`,
                child_first_name: `Replay${tag}`,
                child_last_name: `Child${tag}`,
                child_dob: "2018-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const key = `cert-idem-exec-${tag}`;
        const afterIntake = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const plan = await approveWithoutExecute(deps, intake.processingCaseId);
        const first = await executeApprovedPlanForCase(deps, {
            caseId: intake.processingCaseId,
            planId: plan.planId,
            executionIdempotencyKey: key,
        });
        const afterFirst = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const second = await executeApprovedPlanForCase(deps, {
            caseId: intake.processingCaseId,
            planId: plan.planId,
            executionIdempotencyKey: key,
        });

        expect(first.outcome).toBe("committed");
        expect(second.outcome).toBe("committed");
        expect(afterFirst.persons).toBeGreaterThan(afterIntake.persons);
        expect(await countOrgIdentityRecords(admin, CERT_ORG_A)).toEqual(afterFirst);
    });

    it("cross-tenant: org A intake never selects org B seeded records", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Existing",
                last_name: "ParentB",
                email: "parent-b@test.local",
                child_first_name: "Jamie",
                child_last_name: "Cert",
                child_dob: "2020-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        const orgBCandidate = review.resolutions.some((r) =>
            (r.candidates ?? []).some((c) => c.recordId === CERT_PERSON_B_PARENT),
        );
        expect(orgBCandidate).toBe(false);
    });

    it("atomic rollback: failed RPC leaves no partial identity graph", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const result = await invokeAtomicGroup(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            idempotencyKey: `cert-rollback-${Date.now()}`,
            operations: [
                {
                    op_id: "p1",
                    command_key: "create_person",
                    payload: { first_name: "Rollback", last_name: "Test", email: "rollback@test.local", phone: null },
                },
                { op_id: "bad", command_key: "unsupported_command", payload: {} },
            ],
        });
        expect(result.ok).toBe(false);
        const after = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(after.persons).toBe(before.persons);
        expect(after.customers).toBe(before.customers);
    });
});

describe.skipIf(!certSupabaseConfigured())("processing identity cert — Public Forms", () => {
    let verticalId: string;

    beforeAll(async () => {
        const admin = createCertAdminClient();
        ({ verticalId } = await seedProcessingIdentityCertFixtures(admin));
    });

    it("new household: zero pre-commit writes, records after operator commit", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const submissionId = crypto.randomUUID();
        const tag = Date.now();
        const uniqueEmail = `public.new.${tag}@test.local`;
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId,
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: `Public${tag}`, last_name: `House${tag}`, email: uniqueEmail },
                child: { first_name: `Public${tag}`, last_name: `Child${tag}`, dob: "2020-02-02" },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: { attachment_ref: "doc-123" } },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const afterIntake = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterIntake.persons).toBe(before.persons);
        expect(afterIntake.customers).toBe(before.customers);
        expect(afterIntake.opportunities).toBe(before.opportunities);

        const meta = await loadCaseMetadata(admin, CERT_ORG_A, intake.processingCaseId);
        expect(meta.source_adapter).toBe("public_form_v1");
        expect(meta.form_submission_id).toBe(submissionId);

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-pf-${submissionId}`);
        expect(attempt.outcome).toBe("committed");

        const afterCommit = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterCommit.persons).toBeGreaterThan(afterIntake.persons);
    });

    it("existing household: reuses seeded family on commit", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const submissionId = crypto.randomUUID();
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId,
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Existing", last_name: "ParentA", email: SHARED_EMAIL },
                child: { first_name: "Existing", last_name: "ChildA", dob: "2019-03-15" },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-pf-existing-${submissionId}`);

        const after = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(after.customers).toBe(before.customers);
    });

    it("shared email: review required without intake commit", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId: crypto.randomUUID(),
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Maybe", last_name: "Shared", email: SHARED_EMAIL },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        expect(review.approval).toBeNull();
        expect(review.readiness).not.toBe("committed");
    });

    it("duplicate submission: one case per submission id", async () => {
        const admin = createCertAdminClient();
        const submissionId = crypto.randomUUID();
        const base = {
            orgId: CERT_ORG_A,
            submissionId,
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Dup", last_name: "Submit", email: `dup.${Date.now()}@test.local` },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        };
        const first = await ingestPublicFormThroughProcessing(admin, base);
        const second = await ingestPublicFormThroughProcessing(admin, base);
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.processingCaseId).toBe(first.processingCaseId);
    });

    it("null-org legacy opportunity excluded from org A resolution pool", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId: crypto.randomUUID(),
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Existing", last_name: "ParentA", email: SHARED_EMAIL },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        const citesNullOrg = review.resolutions.some((r) =>
            (r.candidates ?? []).some((c) => c.recordId === CERT_OPP_NULL_ORG),
        );
        expect(citesNullOrg).toBe(false);
    });

    it("approval alone does not commit — explicit execute required", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const submissionId = crypto.randomUUID();
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId,
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Approve", last_name: "Only", email: `approve.only.${Date.now()}@test.local` },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        await approveWithoutExecute(deps, intake.processingCaseId);

        const afterApproval = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterApproval.persons).toBe(before.persons);
        expect(afterApproval.customers).toBe(before.customers);

        const review = await loadCaseReview(deps, intake.processingCaseId);
        expect(review.readiness).toBe("approved_ready_to_commit");
    });

    it("applyFormIntakeSafe rejects direct write", async () => {
        const { applyFormIntakeSafe } = await import("@/lib/forms/intake/applyFormIntakeSafe");
        await expect(
            applyFormIntakeSafe(createCertAdminClient(), {
                orgId: CERT_ORG_A,
                linkMetadata: {},
                payload: { meta: {}, values: {} },
            }),
        ).rejects.toThrow(/retired/);
    });
});
