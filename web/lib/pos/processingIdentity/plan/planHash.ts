/**
 * Deterministic Commit Plan content hashing (D1).
 *
 * The hash covers only the MATERIAL, executable content of a plan so that:
 *  - identical inputs produce an identical hash (determinism);
 *  - a material edit (value/target/command-version change, or an include/exclude
 *    change that alters what executes) produces a NEW hash (Decision F).
 *
 * Non-material fields (opOrder, reason text, evidence lists, risk display) are
 * excluded — reordering or re-explaining does not invalidate an approval.
 */

import { createHash } from "node:crypto";
import type { CommitPlan, PlanOperation } from "./planTypes";

/** Stable JSON: object keys sorted recursively so serialization is canonical. */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            out[key] = canonicalize((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

/** Material projection of one operation used for hashing. */
function materialOperation(op: PlanOperation): Record<string, unknown> {
    return {
        opId: op.opId,
        commandKey: op.commandKey,
        commandVersion: op.commandVersion,
        targetType: op.targetType,
        targetId: op.targetId,
        payload: op.payload,
        after: op.after,
        dependsOn: [...op.dependsOn].sort(),
        atomicGroup: op.atomicGroup,
        preconditionRecordVersion: op.preconditionRecordVersion,
        included: op.included,
    };
}

export function computePlanContentHash(input: {
    orgId: string;
    caseId: string;
    operations: PlanOperation[];
}): string {
    // Only INCLUDED operations execute, but excluded ops still affect the hash so
    // that toggling inclusion is a material change that voids approval.
    const material = {
        orgId: input.orgId,
        caseId: input.caseId,
        operations: [...input.operations]
            .sort((a, b) => a.opId.localeCompare(b.opId))
            .map(materialOperation),
    };
    const json = JSON.stringify(canonicalize(material));
    return createHash("sha256").update(json).digest("hex");
}

/** Recompute and compare against a stored plan's hash. */
export function planHashMatches(plan: CommitPlan): boolean {
    return (
        plan.contentHash ===
        computePlanContentHash({ orgId: plan.orgId, caseId: plan.caseId, operations: plan.operations })
    );
}
