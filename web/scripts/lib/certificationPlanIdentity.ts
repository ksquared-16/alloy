/**
 * Plan freeze — the reviewed graph and the executed graph must be the same graph.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * The first execution was authorized from a dry-run report and then ran a separately-resolved
 * sequence. Nothing tied the two together, so nothing could have noticed if the tenant had moved
 * between them. This module makes the plan a hashable object: the dry run prints the identity, the
 * execute recomputes it, and a mismatch refuses.
 *
 * Deliberately small. No signing system, no key management — a deterministic digest is enough to
 * catch "this is not what you approved", which is the only thing being defended against.
 */

import { createHash } from "crypto";

export const CERTIFICATION_RESET_PURPOSE = "certification_baseline_reset";
/** Bump when the resolver's meaning changes, so old identities cannot silently validate. */
export const CERTIFICATION_RESOLVER_VERSION = "a4.1";

export type StorageManifest = {
    purpose: string;
    status: string;
    org_id: string;
    bucket: string;
    expected_object_count: number;
    manifest_sha256: string;
    objects: string[];
};

export type CertificationPlan = {
    orgId: string;
    mode: string;
    /** Selected database ids, keyed by table. Order-insensitive — sorted before hashing. */
    databaseIds: Record<string, string[]>;
    /** Workflow events chosen for deletion. */
    workflowEventIds: string[];
    /** Workflow events that MUST survive — part of the identity, so shrinking it changes the plan. */
    protectedWorkflowEventIds: string[];
    /** Storage object paths, from the frozen manifest. */
    storagePaths: string[];
    /** Configuration preservation fingerprint (lifecycle_builder_v1 hash etc.). */
    configurationFingerprint: string;
    resolverVersion: string;
};

/**
 * Deterministic digest of everything a reviewer was shown.
 *
 * Sorting happens here rather than at the call sites so two resolutions of the same tenant produce
 * the same identity regardless of row order, while any change in membership changes it.
 */
export function computePlanIdentity(plan: CertificationPlan): string {
    const canonical = {
        org: plan.orgId,
        mode: plan.mode,
        resolver: plan.resolverVersion,
        db: Object.keys(plan.databaseIds)
            .sort()
            .map((table) => [table, [...plan.databaseIds[table]].sort()]),
        events: [...plan.workflowEventIds].sort(),
        protectedEvents: [...plan.protectedWorkflowEventIds].sort(),
        storage: [...plan.storagePaths].sort(),
        config: plan.configurationFingerprint,
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Short form for operator-facing output. Full digest still governs comparisons. */
export function shortIdentity(identity: string): string {
    return identity.slice(0, 16);
}

export type ManifestValidation = { ok: boolean; problems: string[] };

/**
 * Validate a frozen storage manifest before a single object is touched.
 *
 * The rule that matters most is the negative one: a manifest may only ever SHRINK the deletion set
 * relative to itself. Nothing here discovers objects — if a path is not in the manifest it is not
 * deleted, however tempting the shared prefix makes it.
 */
export function validateStorageManifest(manifest: StorageManifest, expectedOrgId: string): ManifestValidation {
    const problems: string[] = [];

    if (manifest.org_id !== expectedOrgId) {
        problems.push(`manifest org ${manifest.org_id} does not match the reset target ${expectedOrgId}`);
    }
    if (manifest.purpose !== "firefly_certification_reset_recovery") {
        problems.push(`manifest purpose "${manifest.purpose}" is not a certification recovery manifest`);
    }
    if (manifest.objects.length !== manifest.expected_object_count) {
        problems.push(`manifest lists ${manifest.objects.length} objects but declares ${manifest.expected_object_count}`);
    }

    const prefix = `${expectedOrgId}/`;
    for (const p of manifest.objects) {
        if (!p.startsWith(prefix)) {
            problems.push(`object "${p}" is outside the target org prefix`);
        }
        if (p.includes("..")) {
            problems.push(`object "${p}" contains a path traversal segment`);
        }
    }

    const digest = createHash("sha256").update([...manifest.objects].sort().join("\n")).digest("hex");
    if (digest !== manifest.manifest_sha256) {
        problems.push(`manifest checksum mismatch: computed ${digest}, declared ${manifest.manifest_sha256}`);
    }

    return { ok: problems.length === 0, problems };
}

/**
 * Partition a storage deletion result.
 *
 * `missing` is not a failure: an object already gone is the desired end state, and a retry after a
 * partial run will legitimately find some. `failed` is compensation debt and must be reported with
 * exact paths so a human can finish the job.
 */
export function partitionStorageResult(input: {
    planned: string[];
    removed: string[];
    missing: string[];
    failed: string[];
}): { ok: boolean; compensationDebt: string[]; summary: string } {
    const debt = [...input.failed].sort();
    const ok = debt.length === 0;
    return {
        ok,
        compensationDebt: debt,
        summary:
            `planned ${input.planned.length}, removed ${input.removed.length}, ` +
            `already absent ${input.missing.length}, FAILED ${input.failed.length}`,
    };
}
