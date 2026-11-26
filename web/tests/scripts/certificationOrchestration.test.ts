/**
 * Certification orchestration — plan freeze, database-before-storage, and compensation debt.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * The defect under test: the dry run advertised 73 storage deletions that the execute path could
 * not perform. Plan and execution now converge in `executeCertificationReset`, and this exercises
 * that exact function — the same one the CLI calls — with a REAL isolated database and a faithful
 * storage fixture that can succeed, fail, and be re-listed.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { beforeAll, describe, expect, it } from "vitest";

import {
    computePlanIdentity,
    type CertificationPlan,
    type StorageManifest,
} from "@/scripts/lib/certificationPlanIdentity";
import {
    deleteCertificationStorageObjects,
    executeCertificationReset,
    type CertificationStorageClient,
} from "@/scripts/lib/certificationResetOrchestrator";
import {
    ENROLLMENT_RUNTIME_RESET_MODE,
    type DemoCleanupScope,
    type ResolvedDemoIds,
} from "@/scripts/lib/demoRuntimeCleanupScope";

// ------------------------------------------------------------------------------------------------
// faithful storage fixture
// ------------------------------------------------------------------------------------------------

/** In-memory bucket that really stores, really deletes, and can be told to fail specific paths. */
function makeStorage(initial: string[], failOn: string[] = []) {
    const objects = new Set(initial);
    const failures = new Set(failOn);
    const calls: Array<{ bucket: string; paths: string[] }> = [];

    const client: CertificationStorageClient = {
        async remove(bucket, paths) {
            calls.push({ bucket, paths: [...paths] });
            const removed: string[] = [];
            const failed: Array<{ path: string; reason: string }> = [];
            for (const p of paths) {
                if (failures.has(p)) {
                    failed.push({ path: p, reason: "forced failure" });
                    continue;
                }
                objects.delete(p);
                removed.push(p);
            }
            return { removed, failed };
        },
        async exists(_bucket, path) {
            return objects.has(path);
        },
    };
    return { client, objects, calls };
}

const ORG = "aaaa3333-0000-4000-8000-000000000001";
const OTHER = "bbbb4444-0000-4000-8000-000000000002";

const manifestFor = (paths: string[], org = ORG): StorageManifest => ({
    purpose: "firefly_certification_reset_recovery",
    status: "pending_deletion",
    org_id: org,
    bucket: "org_documents",
    expected_object_count: paths.length,
    manifest_sha256: createHash("sha256").update([...paths].sort().join("\n")).digest("hex"),
    objects: [...paths],
});

const P1 = `${ORG}/a/1.pdf`;
const P2 = `${ORG}/a/2.pdf`;
const P3 = `${ORG}/b/3.pdf`;
const UNRELATED = `${ORG}/keep/other.pdf`;

// ------------------------------------------------------------------------------------------------
// storage-only behaviour
// ------------------------------------------------------------------------------------------------

describe("storage cleanup uses the frozen manifest, never a prefix scan", () => {
    it("deletes exactly the manifest objects and leaves unrelated ones alone", async () => {
        const s = makeStorage([P1, P2, P3, UNRELATED]);
        const r = await deleteCertificationStorageObjects({
            storageClient: s.client,
            manifest: manifestFor([P1, P2, P3]),
            orgId: ORG,
        });

        expect(r.deleted.sort()).toEqual([P1, P2, P3].sort());
        expect(r.complete).toBe(true);
        expect(s.objects.has(UNRELATED)).toBe(true);
        for (const call of s.calls) expect(call.paths).not.toContain(UNRELATED);
    });

    it("treats an already-missing object as satisfied, not a failure", async () => {
        const s = makeStorage([P1, P3]); // P2 already gone
        const r = await deleteCertificationStorageObjects({
            storageClient: s.client,
            manifest: manifestFor([P1, P2, P3]),
            orgId: ORG,
        });

        expect(r.alreadyMissing).toEqual([P2]);
        expect(r.attempted.sort()).toEqual([P1, P3].sort());
        expect(r.failed).toEqual([]);
        expect(r.complete).toBe(true);
    });

    it("returns the EXACT failed paths on partial failure", async () => {
        const s = makeStorage([P1, P2, P3], [P2]);
        const r = await deleteCertificationStorageObjects({
            storageClient: s.client,
            manifest: manifestFor([P1, P2, P3]),
            orgId: ORG,
        });

        expect(r.deleted.sort()).toEqual([P1, P3].sort());
        expect(r.failed.map((f) => f.path)).toEqual([P2]);
        expect(r.unexpectedRemaining).toEqual([P2]);
        expect(r.complete).toBe(false);
        expect(s.objects.has(P2)).toBe(true);
    });

    it("a retry attempts only what remains, and completes", async () => {
        const s = makeStorage([P2]); // P1/P3 already deleted by the first pass
        const r = await deleteCertificationStorageObjects({
            storageClient: s.client,
            manifest: manifestFor([P1, P2, P3]),
            orgId: ORG,
        });

        expect(r.attempted).toEqual([P2]);
        expect(r.alreadyMissing.sort()).toEqual([P1, P3].sort());
        expect(r.complete).toBe(true);
    });

    it("a second run against a clean bucket does nothing", async () => {
        const s = makeStorage([UNRELATED]);
        const r = await deleteCertificationStorageObjects({
            storageClient: s.client,
            manifest: manifestFor([P1, P2, P3]),
            orgId: ORG,
        });
        expect(r.attempted).toEqual([]);
        expect(r.complete).toBe(true);
        expect(s.calls).toEqual([]);
    });

    it("REFUSES a cross-org manifest before touching anything", async () => {
        const s = makeStorage([P1]);
        await expect(
            deleteCertificationStorageObjects({ storageClient: s.client, manifest: manifestFor([P1]), orgId: OTHER }),
        ).rejects.toThrow(/invalid manifest/);
        expect(s.calls).toEqual([]);
    });

    it("REFUSES a checksum mismatch and a duplicate path", async () => {
        const s = makeStorage([P1, P2]);
        const tampered = { ...manifestFor([P1, P2]), manifest_sha256: "deadbeef" };
        await expect(
            deleteCertificationStorageObjects({ storageClient: s.client, manifest: tampered, orgId: ORG }),
        ).rejects.toThrow(/invalid manifest/);

        const dup = manifestFor([P1, P1]);
        await expect(
            deleteCertificationStorageObjects({ storageClient: s.client, manifest: dup, orgId: ORG }),
        ).rejects.toThrow(/duplicate paths/);
        expect(s.calls).toEqual([]);
    });

    it("fails closed on a malformed provider response", async () => {
        const bad: CertificationStorageClient = {
            remove: async () => ({}) as never,
            exists: async () => true,
        };
        await expect(
            deleteCertificationStorageObjects({ storageClient: bad, manifest: manifestFor([P1]), orgId: ORG }),
        ).rejects.toThrow(/malformed response/);
    });
});

// ------------------------------------------------------------------------------------------------
// plan freeze
// ------------------------------------------------------------------------------------------------

const scope = (): DemoCleanupScope => ({
    orgId: ORG,
    cleanupMode: ENROLLMENT_RUNTIME_RESET_MODE,
    demoSeedPackage: null,
    demoSeedRunId: null,
    demoSeedFamilyKey: null,
    includeClosedOpportunities: true,
    certificationBaseline: true,
});

const emptyIds = (): ResolvedDemoIds => ({
    opportunityIds: [],
    customerIds: [],
    personIds: [],
    customerMemberIds: [],
    jobIds: [],
    scheduleIds: [],
    threadIds: [],
    formSubmissionIds: [],
    documentIds: [],
    sharedPersonIds: [],
    sharedCustomerIds: [],
    processingCaseIds: [],
    processingPlanIds: [],
    residue: {
        contactIds: [],
        operationalTaskIds: [],
        formPacketSessionIds: [],
        workflowEventIds: [],
        storageObjects: [],
        preserved: [],
        preservedWorkflowEvents: [],
        report: {},
    },
});

const neverVerify = async () => [];

describe("plan freeze is binding", () => {
    const base = {
        supabase: {} as never,
        scope: scope(),
        ids: emptyIds(),
        manifest: manifestFor([P1]),
        storageClient: makeStorage([P1]).client,
        verifyDatabase: neverVerify,
    };

    it("REFUSES when no authorized identity is supplied", async () => {
        await expect(
            executeCertificationReset({ ...base, authorizedPlanId: "", currentPlanId: "abc" }),
        ).rejects.toThrow(/no authorized plan identity/);
    });

    it("REFUSES a mismatch, naming both identities, before any rpc", async () => {
        let called = false;
        const spy = { rpc: async () => ((called = true), { data: null, error: null }) } as never;
        await expect(
            executeCertificationReset({ ...base, supabase: spy, authorizedPlanId: "aaa", currentPlanId: "bbb" }),
        ).rejects.toThrow(/plan changed since it was authorized[\s\S]*aaa[\s\S]*bbb/);
        expect(called).toBe(false);
    });

    it("offers no force option", () => {
        const src = readFileSync(join(process.cwd(), "scripts/lib/certificationResetOrchestrator.ts"), "utf8");
        expect(src).not.toMatch(/force\s*[:=]/i);
        expect(src).toMatch(/There is no force option/);
    });

    it("identity moves with every component", () => {
        const p: CertificationPlan = {
            orgId: ORG,
            mode: "certification_baseline",
            databaseIds: { opportunities: ["o1"] },
            workflowEventIds: ["e1"],
            protectedWorkflowEventIds: ["p1"],
            storagePaths: [P1],
            configurationFingerprint: "cfg1",
            resolverVersion: "v1",
        };
        const base0 = computePlanIdentity(p);
        expect(computePlanIdentity({ ...p, databaseIds: { opportunities: ["o1", "o2"] } })).not.toBe(base0);
        expect(computePlanIdentity({ ...p, protectedWorkflowEventIds: [] })).not.toBe(base0);
        expect(computePlanIdentity({ ...p, storagePaths: [P1, P2] })).not.toBe(base0);
        expect(computePlanIdentity({ ...p, configurationFingerprint: "cfg2" })).not.toBe(base0);
    });
});

// ------------------------------------------------------------------------------------------------
// ordering — database before storage — against the REAL database
// ------------------------------------------------------------------------------------------------

function certEnv(): { url: string; key: string } | null {
    const p = join(process.cwd(), ".env.certification.local");
    if (!existsSync(p)) return null;
    const txt = readFileSync(p, "utf8");
    const pick = (k: string) => txt.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1)?.trim();
    const url = pick("NEXT_PUBLIC_SUPABASE_URL");
    const key = pick("SUPABASE_SERVICE_ROLE_KEY");
    return url && key ? { url, key } : null;
}

describe("database-before-storage ordering, against the isolated database", () => {
    const env = certEnv();
    let db: SupabaseClient | null = null;
    let reachable = false;

    beforeAll(async () => {
        if (!env) return;
        db = createClient(env.url, env.key, { auth: { persistSession: false } });
        const { error } = await db.from("orgs").select("id").limit(1);
        if (error) return;
        reachable = true;
        await db.from("orgs").upsert([{ id: ORG, name: "Orchestration Org", slug: "orch-org" }], { onConflict: "id" });
    });

    it("RPC failure ⇒ zero storage calls, manifest intact", async (ctx) => {
        if (!db || !reachable) return ctx.skip();
        const s = makeStorage([P1, P2]);
        const plan = "identity-1";

        await expect(
            executeCertificationReset({
                supabase: db,
                scope: { ...scope(), orgId: "00000000-0000-4000-8000-00000000dead" }, // org does not exist
                ids: emptyIds(),
                authorizedPlanId: plan,
                currentPlanId: plan,
                manifest: manifestFor([P1, P2], "00000000-0000-4000-8000-00000000dead"),
                storageClient: s.client,
                verifyDatabase: neverVerify,
            }),
        ).rejects.toThrow();

        expect(s.calls).toEqual([]);
        expect(s.objects.has(P1)).toBe(true);
        expect(s.objects.has(P2)).toBe(true);
    });

    it("database VERIFICATION failure ⇒ zero storage calls, baseline false", async (ctx) => {
        if (!db || !reachable) return ctx.skip();
        const s = makeStorage([P1, P2]);
        const plan = "identity-2";

        const outcome = await executeCertificationReset({
            supabase: db,
            scope: scope(),
            ids: emptyIds(),
            authorizedPlanId: plan,
            currentPlanId: plan,
            manifest: manifestFor([P1, P2]),
            storageClient: s.client,
            verifyDatabase: async () => ["opportunities still has 3 rows"],
        });

        expect(outcome.database.committed).toBe(true);
        expect(outcome.database.verified).toBe(false);
        expect(outcome.storage).toBeNull();
        expect(outcome.baselineEstablished).toBe(false);
        expect(s.calls).toEqual([]);
        expect(s.objects.size).toBe(2);
    });

    it("commit + verification ⇒ storage runs; full success sets baselineEstablished", async (ctx) => {
        if (!db || !reachable) return ctx.skip();
        const s = makeStorage([P1, P2, UNRELATED]);
        const plan = "identity-3";

        const outcome = await executeCertificationReset({
            supabase: db,
            scope: scope(),
            ids: emptyIds(),
            authorizedPlanId: plan,
            currentPlanId: plan,
            manifest: manifestFor([P1, P2]),
            storageClient: s.client,
            verifyDatabase: neverVerify,
        });

        expect(outcome.database.committed).toBe(true);
        expect(outcome.database.verified).toBe(true);
        expect(outcome.storage?.deleted.sort()).toEqual([P1, P2].sort());
        expect(outcome.storage?.complete).toBe(true);
        expect(outcome.baselineEstablished).toBe(true);
        expect(s.objects.has(UNRELATED)).toBe(true);
    });

    it("storage partial failure ⇒ database stays reset, baseline FALSE, exact debt returned", async (ctx) => {
        if (!db || !reachable) return ctx.skip();
        const s = makeStorage([P1, P2, P3], [P2]);
        const plan = "identity-4";

        const outcome = await executeCertificationReset({
            supabase: db,
            scope: scope(),
            ids: emptyIds(),
            authorizedPlanId: plan,
            currentPlanId: plan,
            manifest: manifestFor([P1, P2, P3]),
            storageClient: s.client,
            verifyDatabase: neverVerify,
        });

        expect(outcome.database.verified).toBe(true);
        expect(outcome.storage?.failed.map((f) => f.path)).toEqual([P2]);
        expect(outcome.storage?.unexpectedRemaining).toEqual([P2]);
        expect(outcome.baselineEstablished).toBe(false);

        // Retry: only the debt is attempted, and it completes.
        const retry = makeStorage([P2]);
        const again = await executeCertificationReset({
            supabase: db,
            scope: scope(),
            ids: emptyIds(),
            authorizedPlanId: plan,
            currentPlanId: plan,
            manifest: manifestFor([P1, P2, P3]),
            storageClient: retry.client,
            verifyDatabase: neverVerify,
        });
        expect(again.storage?.attempted).toEqual([P2]);
        expect(again.storage?.complete).toBe(true);
        expect(again.baselineEstablished).toBe(true);
        // The retry's database work is an idempotent zero-delete.
        expect(again.database.totalDeleted).toBe(0);
    });
});
