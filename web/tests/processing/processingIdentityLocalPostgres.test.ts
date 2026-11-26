import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectIdentityReadiness } from "@/lib/pos/processingIdentity/operator/caseStateModel";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const certScript = path.join(repoRoot, "scripts/processing/processingIdentityLocalCert.mjs");

const localDbConfigured =
    process.env.PROCESSING_LOCAL_CERT_ENABLED === "true" ||
    process.env.DATABASE_URL?.includes("54322") ||
    process.env.PROCESSING_LOCAL_CERT_DATABASE_URL?.includes("54322");

describe.skipIf(!localDbConfigured)("processing identity local Postgres certification", () => {
    it("runs certification runner against local Postgres", () => {
        const out = execSync(`node "${certScript}"`, {
            cwd: repoRoot,
            encoding: "utf8",
            env: {
                ...process.env,
                DATABASE_URL:
                    process.env.DATABASE_URL ??
                    process.env.PROCESSING_LOCAL_CERT_DATABASE_URL ??
                    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
            },
        });
        expect(out).toMatch(/Certification complete: \d+\/\d+ passed/);
        expect(out).toMatch(/PASS B0 orphan preflight/);
        expect(out).toMatch(/PASS RPC atomic identity group/);
    });
});

describe("identity review readiness state matrix", () => {
    it("never reports committed without attempt outcome", () => {
        expect(
            projectIdentityReadiness({
                hasFacts: true,
                resolutionCount: 1,
                undecidedResolutionCount: 0,
                blockingConflictCount: 0,
                needsInformation: false,
                plan: { exists: true, supersededOrStale: false },
                hasValidApproval: true,
                latestAttemptOutcome: null,
                hasOpenException: false,
            }),
        ).toBe("approved_ready_to_commit");
    });

    it("public-form path cannot reach committed without explicit attempt", () => {
        expect(
            projectIdentityReadiness({
                hasFacts: true,
                resolutionCount: 1,
                undecidedResolutionCount: 0,
                blockingConflictCount: 0,
                needsInformation: false,
                plan: null,
                hasValidApproval: false,
                latestAttemptOutcome: null,
                hasOpenException: false,
            }),
        ).toBe("needs_plan_review");
    });

    it("failed execution surfaces exception lane", () => {
        expect(
            projectIdentityReadiness({
                hasFacts: true,
                resolutionCount: 1,
                undecidedResolutionCount: 0,
                blockingConflictCount: 0,
                needsInformation: false,
                plan: { exists: true, supersededOrStale: false },
                hasValidApproval: true,
                latestAttemptOutcome: "failed",
                hasOpenException: false,
            }),
        ).toBe("exception");
    });

    it("stale plan blocks approved_ready_to_commit", () => {
        expect(
            projectIdentityReadiness({
                hasFacts: true,
                resolutionCount: 1,
                undecidedResolutionCount: 0,
                blockingConflictCount: 0,
                needsInformation: false,
                plan: { exists: true, supersededOrStale: true },
                hasValidApproval: true,
                latestAttemptOutcome: null,
                hasOpenException: false,
            }),
        ).toBe("stale_plan");
    });
});
