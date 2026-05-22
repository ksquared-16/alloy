/**
 * Config Assist apply outcome presentation (BOS UX Card 15).
 * Uses server `apply_results` payloads only — no invented granularity.
 */

import type { ApplyOperationResult } from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";
import { CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS } from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";
import type {
    ConfigurationOperationKindV1,
    ConfigurationOperationV1,
    ConfigurationProposalV1,
} from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { operationKindLabel } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { ApplyVerificationResult } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";

export type ConfigAssistApplyOperationRowStatus = "applied" | "skipped" | "failed" | "unverified";

export type ConfigAssistApplyOperationRow = {
    operationId: string;
    label: string;
    status: ConfigAssistApplyOperationRowStatus;
    detail: string | null;
};

export type ConfigAssistApplyOutcomePresentation = {
    headline: string;
    summary: string;
    rows: ConfigAssistApplyOperationRow[];
    partialFailure: boolean;
    showLayoutIntegrityLink: boolean;
};

const LAYOUT_TOUCH_OPERATION_KINDS: readonly ConfigurationOperationKindV1[] = [
    "create_field",
    "update_field",
    "expose_field_on_layout",
    "hide_field_on_layout",
    "move_field_to_section",
    "create_section",
    "update_section",
    "reorder_section",
];

export function proposalTouchesLayoutIntegrity(operations: readonly ConfigurationOperationV1[]): boolean {
    return operations.some((o) => (LAYOUT_TOUCH_OPERATION_KINDS as readonly string[]).includes(o.kind));
}

function operationRowLabel(op: ConfigurationOperationV1): string {
    const kind = operationKindLabel(op.kind);
    const key = "field_key" in op && typeof op.field_key === "string" ? op.field_key.trim() : "";
    return key ? `${kind} · ${key}` : kind;
}

function mapApplyResultToRow(
    op: ConfigurationOperationV1,
    result: ApplyOperationResult | undefined
): ConfigAssistApplyOperationRow {
    const label = operationRowLabel(op);

    if (op.kind === "data_quality_recommendation") {
        return {
            operationId: op.operation_id,
            label,
            status: "skipped",
            detail: "Recommendation only — not applied.",
        };
    }

    if (!(CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS as readonly string[]).includes(op.kind)) {
        return {
            operationId: op.operation_id,
            label,
            status: "skipped",
            detail: "Not in the current apply catalog for this release.",
        };
    }

    if (!result) {
        return {
            operationId: op.operation_id,
            label,
            status: "skipped",
            detail: "No apply result returned.",
        };
    }

    if (!result.ok) {
        return {
            operationId: op.operation_id,
            label,
            status: "failed",
            detail: result.error?.trim() || "Apply failed for this operation.",
        };
    }

    if (!result.verified) {
        return {
            operationId: op.operation_id,
            label,
            status: "unverified",
            detail: result.verification_warning?.trim() || "Applied but verification did not complete.",
        };
    }

    return {
        operationId: op.operation_id,
        label,
        status: "applied",
        detail: null,
    };
}

export function buildConfigAssistApplyOutcomePresentation(args: {
    proposal: ConfigurationProposalV1;
    applyResults: ApplyOperationResult[];
    verification?: ApplyVerificationResult | null;
}): ConfigAssistApplyOutcomePresentation {
    const byId = new Map(args.applyResults.map((r) => [r.operation_id, r]));
    const operations = args.proposal.proposed_operations ?? [];
    const rows = operations.map((op) => mapApplyResultToRow(op, byId.get(op.operation_id)));

    const appliedCount = rows.filter((r) => r.status === "applied").length;
    const failedCount = rows.filter((r) => r.status === "failed").length;
    const unverifiedCount = rows.filter((r) => r.status === "unverified").length;
    const skippedCount = rows.filter((r) => r.status === "skipped").length;

    const partialFailure =
        failedCount > 0 ||
        unverifiedCount > 0 ||
        args.verification?.success === false ||
        Boolean(args.verification?.failed_operations?.length);

    let headline: string;
    if (failedCount > 0 && appliedCount === 0) {
        headline = "Failed";
    } else if (partialFailure) {
        headline = "Partially applied";
    } else {
        headline = "Applied";
    }

    const summaryParts: string[] = [];
    if (appliedCount > 0) summaryParts.push(`${appliedCount} applied`);
    if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
    if (unverifiedCount > 0) summaryParts.push(`${unverifiedCount} need review`);
    if (failedCount > 0) summaryParts.push(`${failedCount} failed`);

    const summary =
        summaryParts.length > 0 ?
            `Configuration apply: ${summaryParts.join(", ")}.`
        :   "Configuration apply completed.";

    return {
        headline,
        summary,
        rows,
        partialFailure,
        showLayoutIntegrityLink: proposalTouchesLayoutIntegrity(operations) && appliedCount > 0,
    };
}

export type ConfigAssistApplyApiPayload = {
    ok?: boolean;
    apply_results?: ApplyOperationResult[];
    verification?: ApplyVerificationResult;
    message?: string;
    error?: string;
};

export function buildConfigAssistApplyOutcomeFromApi(
    proposal: ConfigurationProposalV1,
    payload: ConfigAssistApplyApiPayload
): ConfigAssistApplyOutcomePresentation {
    const applyResults = Array.isArray(payload.apply_results) ? payload.apply_results : [];
    const base = buildConfigAssistApplyOutcomePresentation({
        proposal,
        applyResults,
        verification: payload.verification ?? null,
    });

    if (!payload.ok && applyResults.length === 0) {
        return {
            ...base,
            headline: "Failed",
            summary: payload.message?.trim() || payload.error?.trim() || "Configuration apply did not complete.",
            partialFailure: true,
            rows: base.rows.length > 0 ? base.rows : [],
        };
    }

    return base;
}
