import type { ConfigurationOperationV1 } from "../configurationProposalV1";
import type { ApplyVerificationResult } from "../configLayoutAssistTypes";
import type { ApplyOperationResult } from "./configurationProposalApply";

export function buildApplyVerificationResult(params: {
    operations: ConfigurationOperationV1[];
    applyResults: ApplyOperationResult[];
}): ApplyVerificationResult {
    const verified_operations: string[] = [];
    const failed_operations: string[] = [];
    const warnings: string[] = [];

    const byId = new Map(params.applyResults.map((r) => [r.operation_id, r]));

    for (const op of params.operations) {
        if (op.kind === "data_quality_recommendation") {
            warnings.push(`Skipped verification for recommendation ${op.operation_id}`);
            continue;
        }
        const result = byId.get(op.operation_id);
        if (!result) {
            failed_operations.push(op.operation_id);
            continue;
        }
        if (result.ok && result.verified) {
            verified_operations.push(op.operation_id);
        } else if (result.ok && !result.verified) {
            failed_operations.push(op.operation_id);
            warnings.push(result.verification_warning ?? `Verification failed for ${op.operation_id}`);
        } else {
            failed_operations.push(op.operation_id);
            if (result.error) warnings.push(result.error);
        }
    }

    return {
        success: failed_operations.length === 0,
        verified_operations,
        failed_operations,
        warnings,
    };
}
