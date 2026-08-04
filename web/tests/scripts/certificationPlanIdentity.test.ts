/**
 * Plan freeze and the storage recovery manifest.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * Two failures these defend against, both already survived once:
 *   - executing a graph nobody reviewed (the first run resolved twice and tied the two together
 *     with nothing at all)
 *   - deleting storage objects by prefix rather than by authorization
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
    CERTIFICATION_RESET_PURPOSE,
    CERTIFICATION_RESOLVER_VERSION,
    computePlanIdentity,
    partitionStorageResult,
    validateStorageManifest,
    type CertificationPlan,
    type StorageManifest,
} from "@/scripts/lib/certificationPlanIdentity";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";

const basePlan = (): CertificationPlan => ({
    orgId: ORG,
    mode: "certification_baseline",
    databaseIds: { opportunities: ["o2", "o1"], customers: ["c1"] },
    workflowEventIds: ["e2", "e1"],
    protectedWorkflowEventIds: ["p1"],
    storagePaths: [`${ORG}/a.pdf`],
    configurationFingerprint: "sha256:abc",
    resolverVersion: CERTIFICATION_RESOLVER_VERSION,
});

describe("plan identity", () => {
    it("is stable regardless of id ordering", () => {
        const a = computePlanIdentity(basePlan());
        const b = computePlanIdentity({
            ...basePlan(),
            databaseIds: { customers: ["c1"], opportunities: ["o1", "o2"] },
            workflowEventIds: ["e1", "e2"],
        });
        expect(a).toBe(b);
    });

    it("changes when the selected rows change", () => {
        const a = computePlanIdentity(basePlan());
        const b = computePlanIdentity({
            ...basePlan(),
            databaseIds: { opportunities: ["o1", "o2", "o3"], customers: ["c1"] },
        });
        expect(b).not.toBe(a);
    });

    it("changes when the PROTECTED set shrinks — preservation is part of the plan", () => {
        // Silently dropping a protected row would otherwise reuse the same approval.
        const a = computePlanIdentity(basePlan());
        const b = computePlanIdentity({ ...basePlan(), protectedWorkflowEventIds: [] });
        expect(b).not.toBe(a);
    });

    it("changes when the storage manifest changes", () => {
        const a = computePlanIdentity(basePlan());
        const b = computePlanIdentity({ ...basePlan(), storagePaths: [`${ORG}/a.pdf`, `${ORG}/b.pdf`] });
        expect(b).not.toBe(a);
    });

    it("changes when configuration preservation drifts", () => {
        expect(computePlanIdentity({ ...basePlan(), configurationFingerprint: "sha256:def" })).not.toBe(
            computePlanIdentity(basePlan()),
        );
    });

    it("changes when the resolver version changes", () => {
        expect(computePlanIdentity({ ...basePlan(), resolverVersion: "different" })).not.toBe(
            computePlanIdentity(basePlan()),
        );
    });

    it("pins the purpose string the database authority also checks", () => {
        expect(CERTIFICATION_RESET_PURPOSE).toBe("certification_baseline_reset");
    });
});

describe("storage recovery manifest — the committed artifact", () => {
    const manifest = JSON.parse(
        readFileSync(
            join(process.cwd(), "../certification/bp-config-integrity/evidence/firefly-storage-recovery-manifest.json"),
            "utf8",
        ),
    ) as StorageManifest;

    it("carries exactly the 73 previously authorized objects", () => {
        expect(manifest.objects).toHaveLength(73);
        expect(manifest.expected_object_count).toBe(73);
    });

    it("validates against the reset target org", () => {
        const v = validateStorageManifest(manifest, ORG);
        expect(v.problems).toEqual([]);
        expect(v.ok).toBe(true);
    });

    it("every object sits under the org prefix", () => {
        for (const p of manifest.objects) expect(p.startsWith(`${ORG}/`)).toBe(true);
    });

    it("REJECTS the manifest against a different org", () => {
        const v = validateStorageManifest(manifest, "11111111-1111-1111-1111-111111111111");
        expect(v.ok).toBe(false);
        expect(v.problems.join(" ")).toMatch(/does not match the reset target/);
    });

    it("REJECTS a tampered object list — the checksum is load-bearing", () => {
        const tampered = { ...manifest, objects: [...manifest.objects, `${ORG}/sneaky-extra.pdf`] };
        const v = validateStorageManifest(tampered, ORG);
        expect(v.ok).toBe(false);
        expect(v.problems.join(" ")).toMatch(/checksum mismatch|declares/);
    });

    it("REJECTS a cross-org path smuggled into the list", () => {
        const objects = [...manifest.objects.slice(1), "22222222-2222-2222-2222-222222222222/x.pdf"];
        const v = validateStorageManifest({ ...manifest, objects }, ORG);
        expect(v.ok).toBe(false);
        expect(v.problems.join(" ")).toMatch(/outside the target org prefix/);
    });

    it("REJECTS a path traversal segment", () => {
        const objects = [...manifest.objects.slice(1), `${ORG}/../other/x.pdf`];
        const v = validateStorageManifest({ ...manifest, objects }, ORG);
        expect(v.ok).toBe(false);
        expect(v.problems.join(" ")).toMatch(/path traversal/);
    });

    it("declares the recovery purpose and pending status", () => {
        expect(manifest.purpose).toBe("firefly_certification_reset_recovery");
        expect(["pending_deletion","completed"]).toContain(manifest.status);
        expect(manifest.bucket).toBe("org_documents");
    });
});

describe("storage deletion outcome", () => {
    it("treats already-absent objects as satisfied, not failures", () => {
        const r = partitionStorageResult({ planned: ["a", "b"], removed: ["a"], missing: ["b"], failed: [] });
        expect(r.ok).toBe(true);
        expect(r.compensationDebt).toEqual([]);
    });

    it("returns the EXACT remaining paths when deletion partially fails", () => {
        const r = partitionStorageResult({ planned: ["a", "b", "c"], removed: ["a"], missing: [], failed: ["c", "b"] });
        expect(r.ok).toBe(false);
        expect(r.compensationDebt).toEqual(["b", "c"]);
        expect(r.summary).toMatch(/FAILED 2/);
    });

    it("a clean second run has nothing planned and nothing owed", () => {
        const r = partitionStorageResult({ planned: [], removed: [], missing: [], failed: [] });
        expect(r.ok).toBe(true);
        expect(r.compensationDebt).toEqual([]);
    });
});
