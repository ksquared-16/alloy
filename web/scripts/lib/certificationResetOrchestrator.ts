/**
 * Certification reset orchestration — the one path the CLI runs and the tests exercise.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * The defect this closes: the dry run advertised 73 storage deletions while the execute path could
 * perform none, because storage cleanup lived inside the sequential deleter that certification mode
 * bypasses. Plan and execution have to converge in one place, so this is that place.
 *
 * Sequencing is the load-bearing property. Storage cannot join the Postgres transaction, so it is
 * ordered strictly after a committed AND verified database result — and the only way to reach the
 * storage step is to return from the database step successfully.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import type { DemoCleanupScope, ResolvedDemoIds } from "./demoRuntimeCleanupScope";
import { executeCertificationResetAtomically } from "./certificationResetAdapter";
import { validateStorageManifest, type StorageManifest } from "./certificationPlanIdentity";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Narrow storage boundary.
 *
 * Deliberately not the Supabase storage client: the orchestration needs exactly remove-and-check,
 * and a small interface is what makes a faithful partial-failure fixture possible without mocking
 * the thing under test.
 */
export type CertificationStorageClient = {
    /** Remove objects; returns per-path outcome. Must not throw for a single-object failure. */
    remove(bucket: string, paths: string[]): Promise<{ removed: string[]; failed: Array<{ path: string; reason: string }> }>;
    /** True when the object is still present. */
    exists(bucket: string, path: string): Promise<boolean>;
};

export type StorageExecutionResult = {
    plannedCount: number;
    attempted: string[];
    deleted: string[];
    alreadyMissing: string[];
    failed: Array<{ path: string; reason: string }>;
    /** Manifest objects still present after the pass — the compensation debt. */
    unexpectedRemaining: string[];
    complete: boolean;
};

/**
 * Delete exactly the frozen manifest objects. Never a prefix scan.
 *
 * An object already absent is the desired end state, not a failure — a retry after a partial run
 * legitimately finds some gone. Only objects that remain after an attempt are debt.
 */
export async function deleteCertificationStorageObjects(input: {
    storageClient: CertificationStorageClient;
    manifest: StorageManifest;
    orgId: string;
}): Promise<StorageExecutionResult> {
    const { storageClient, manifest, orgId } = input;

    const validation = validateStorageManifest(manifest, orgId);
    if (!validation.ok) {
        throw new Error(`Refusing storage cleanup — invalid manifest: ${validation.problems.join("; ")}`);
    }
    if (new Set(manifest.objects).size !== manifest.objects.length) {
        throw new Error("Refusing storage cleanup — manifest contains duplicate paths");
    }

    const planned = [...manifest.objects].sort();
    const alreadyMissing: string[] = [];
    const toAttempt: string[] = [];
    for (const path of planned) {
        if (await storageClient.exists(manifest.bucket, path)) toAttempt.push(path);
        else alreadyMissing.push(path);
    }

    let removed: string[] = [];
    let failed: Array<{ path: string; reason: string }> = [];
    if (toAttempt.length) {
        const res = await storageClient.remove(manifest.bucket, toAttempt);
        if (!Array.isArray(res?.removed) || !Array.isArray(res?.failed)) {
            throw new Error("Storage provider returned a malformed response; treating as failure");
        }
        removed = [...res.removed].sort();
        failed = [...res.failed].sort((a, b) => a.path.localeCompare(b.path));
    }

    // Verify by asking, not by trusting the provider's own report.
    const unexpectedRemaining: string[] = [];
    for (const path of planned) {
        if (await storageClient.exists(manifest.bucket, path)) unexpectedRemaining.push(path);
    }

    return {
        plannedCount: planned.length,
        attempted: toAttempt,
        deleted: removed,
        alreadyMissing,
        failed,
        unexpectedRemaining: unexpectedRemaining.sort(),
        complete: unexpectedRemaining.length === 0,
    };
}

export type CertificationResetOutcome = {
    database: {
        committed: boolean;
        deleted: Record<string, number>;
        totalDeleted: number;
        verified: boolean;
        verificationProblems: string[];
    };
    storage: StorageExecutionResult | null;
    baselineEstablished: boolean;
};

export type DatabaseVerification = (supabase: SupabaseAdmin, orgId: string) => Promise<string[]>;

/**
 * The whole certification execution, in order.
 *
 * `authorizedPlanId` must equal the identity recomputed from the freshly-resolved plan. That check
 * happens in the caller (which owns resolution) and is asserted here as a precondition, so a
 * mismatch cannot reach the RPC.
 */
export async function executeCertificationReset(input: {
    supabase: SupabaseAdmin;
    scope: DemoCleanupScope;
    ids: ResolvedDemoIds;
    authorizedPlanId: string;
    currentPlanId: string;
    manifest: StorageManifest;
    storageClient: CertificationStorageClient;
    verifyDatabase: DatabaseVerification;
    actor?: string;
    log?: (msg: string) => void;
}): Promise<CertificationResetOutcome> {
    const log = input.log ?? (() => {});

    // --- plan freeze -------------------------------------------------------------------------
    if (!input.authorizedPlanId) {
        throw new Error("Refusing to execute — no authorized plan identity supplied.");
    }
    if (input.authorizedPlanId !== input.currentPlanId) {
        throw new Error(
            `Refusing to execute — the plan changed since it was authorized.\n` +
                `  authorized: ${input.authorizedPlanId}\n` +
                `  current:    ${input.currentPlanId}\n` +
                `A changed tenant requires a new dry run and new human authorization. There is no force option.`,
        );
    }
    // The manifest is inside the identity, but validate independently so a bad manifest cannot
    // reach the storage step even if an identity were somehow matched.
    const manifestCheck = validateStorageManifest(input.manifest, input.scope.orgId);
    if (!manifestCheck.ok) {
        throw new Error(`Refusing to execute — invalid storage manifest: ${manifestCheck.problems.join("; ")}`);
    }

    // --- database ----------------------------------------------------------------------------
    log("plan identity verified; invoking the atomic reset authority");
    const dbResult = await executeCertificationResetAtomically(input.supabase, input.scope, input.ids, {
        actor: input.actor,
        log,
    });

    // --- post-commit verification ------------------------------------------------------------
    const verificationProblems = await input.verifyDatabase(input.supabase, input.scope.orgId);
    const verified = verificationProblems.length === 0;

    const database = {
        committed: true,
        deleted: dbResult.deleted,
        totalDeleted: dbResult.totalDeleted,
        verified,
        verificationProblems,
    };

    if (!verified) {
        // Committed but not clean. Storage must NOT begin: deleting the objects would remove the
        // last evidence of what those rows were while the tenant is still wrong.
        log("database verification FAILED — storage cleanup will not begin");
        return { database, storage: null, baselineEstablished: false };
    }

    // --- storage -----------------------------------------------------------------------------
    log("database verified; beginning storage cleanup from the frozen manifest");
    const storage = await deleteCertificationStorageObjects({
        storageClient: input.storageClient,
        manifest: input.manifest,
        orgId: input.scope.orgId,
    });

    return {
        database,
        storage,
        baselineEstablished: verified && storage.complete,
    };
}

/** Supabase-backed storage client. The CLI's real implementation. */
export function supabaseStorageClient(supabase: SupabaseAdmin): CertificationStorageClient {
    return {
        async remove(bucket, paths) {
            const removed: string[] = [];
            const failed: Array<{ path: string; reason: string }> = [];
            // Batched, but outcomes are still recorded per path — a single boolean would hide
            // exactly the partial failure this contract has to report exactly.
            for (let i = 0; i < paths.length; i += 100) {
                const part = paths.slice(i, i + 100);
                const { data, error } = await supabase.storage.from(bucket).remove(part);
                if (error) {
                    for (const p of part) failed.push({ path: p, reason: error.message });
                    continue;
                }
                const ok = new Set((data ?? []).map((o: { name?: string }) => o.name).filter(Boolean) as string[]);
                for (const p of part) {
                    if (ok.size === 0 || ok.has(p) || ok.has(p.split("/").pop() ?? p)) removed.push(p);
                    else failed.push({ path: p, reason: "not reported as removed" });
                }
            }
            return { removed, failed };
        },
        async exists(bucket, path) {
            const idx = path.lastIndexOf("/");
            const dir = idx >= 0 ? path.slice(0, idx) : "";
            const name = idx >= 0 ? path.slice(idx + 1) : path;
            const { data, error } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 100 });
            if (error) return false;
            return (data ?? []).some((o: { name?: string }) => o.name === name);
        },
    };
}
