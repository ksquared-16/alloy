import { describe, expect, it, beforeAll } from "vitest";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { ingestPublicFormThroughProcessing } from "@/lib/pos/processingIdentity/sources/formIntakeAdapter";
import { loadCaseReview } from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import {
    approveAndExecuteAllCreateNew,
    countOrgIdentityRecords,
    makeOperatorDeps,
} from "./cert/processingIdentityCertFlow";
import {
    CERT_ORG_A,
    CERT_ORG_B,
    CERT_USER_A_ADMIN,
    CERT_WU_A,
    SHARED_EMAIL,
    certSupabaseConfigured,
    createCertAdminClient,
    seedProcessingIdentityCertFixtures,
} from "./cert/processingIdentityCertFixtures";

describe.skipIf(!certSupabaseConfigured())("processing identity cert E2E (Create Lead + Public Form)", () => {
    let verticalId: string;
    let baselineA: Awaited<ReturnType<typeof countOrgIdentityRecords>>;

    beforeAll(async () => {
        const admin = createCertAdminClient();
        ({ verticalId } = await seedProcessingIdentityCertFixtures(admin));
        baselineA = await countOrgIdentityRecords(admin, CERT_ORG_A);
    });

    it("A: brand-new family — zero writes before commit, full graph after", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Brand",
                last_name: "New",
                email: "brand.new.cert@test.local",
                phone: "+15555550101",
                child_first_name: "Baby",
                child_last_name: "New",
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
        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-a-new-${Date.now()}`);
        expect(["committed", "partially_committed"]).toContain(attempt.outcome);

        const afterCommit = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterCommit.persons).toBeGreaterThan(before.persons);
        expect(afterCommit.customers).toBeGreaterThan(before.customers);
        expect(afterCommit.opportunities).toBeGreaterThan(before.opportunities);

        const review = await loadCaseReview(deps, intake.processingCaseId);
        expect(review.latestAttempt?.outcome).toBeTruthy();
    });

    it("B: existing family, new child — reuses household, one new child", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Existing",
                last_name: "ParentA",
                email: SHARED_EMAIL,
                child_first_name: "NewChild",
                child_last_name: "Cert",
                child_dob: "2021-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-b-child-${Date.now()}`);
        expect(attempt.outcome).not.toBe("preflight_rejected");

        const after = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(after.customers).toBe(before.customers);
        expect(after.members).toBeGreaterThan(baselineA.members);
    });

    it("D: shared email surfaces resolution without auto-commit at intake", async () => {
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
    });

    it("F: idempotent intake reuses processing case", async () => {
        const admin = createCertAdminClient();
        const merged = {
            first_name: "Idem",
            last_name: "Potent",
            email: "idem.cert@test.local",
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

    it("public form A: zero identity writes at intake, records after commit", async () => {
        const admin = createCertAdminClient();
        const before = await countOrgIdentityRecords(admin, CERT_ORG_A);
        const submissionId = crypto.randomUUID();
        const uniqueEmail = `public.new.${Date.now()}@test.local`;
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId,
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Public", last_name: "House", email: uniqueEmail },
                child: { first_name: "Public", last_name: "Child", dob: "2020-02-02" },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const afterIntake = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterIntake.persons).toBe(before.persons);
        expect(afterIntake.customers).toBe(before.customers);
        expect(afterIntake.opportunities).toBe(before.opportunities);

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const attempt = await approveAndExecuteAllCreateNew(deps, intake.processingCaseId, `cert-pf-${submissionId}`);
        expect(attempt.outcome).not.toBe("failed");

        const afterCommit = await countOrgIdentityRecords(admin, CERT_ORG_A);
        expect(afterCommit.persons).toBeGreaterThan(before.persons);
    });

    it("public form F: cross-tenant — org A intake never sees org B seeded person as committed", async () => {
        const admin = createCertAdminClient();
        const intake = await ingestPublicFormThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            submissionId: crypto.randomUUID(),
            formDefinitionId: crypto.randomUUID(),
            intakeMeta: {
                guardian: { first_name: "Existing", last_name: "ParentB", email: "parent-b@test.local" },
                vertical_id: verticalId,
            },
            payload: { meta: { intake: {} }, values: {} },
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;
        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const review = await loadCaseReview(deps, intake.processingCaseId);
        const linkedOrgB = review.resolutions.some((r) =>
            (r.candidates ?? []).some((c) => String(c.recordId ?? "").includes(CERT_ORG_B)),
        );
        expect(linkedOrgB).toBe(false);
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
