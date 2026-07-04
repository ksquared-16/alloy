/**
 * Commercial Execution — Simulator preview builder (pure, Phase 8).
 *
 * The Simulator is the FIRST consumer of Commercial Execution. This pure builder
 * runs the full read path — evaluate() → attribute()? → expand()? — over a real
 * Commercial Export and returns a consumer-neutral preview DTO. It creates NO
 * financial truth: no obligations, draft charges, invoices, or writes.
 *
 * It is deliberately SEPARATE from the existing (Substrate-A) consumption
 * simulator; that path is untouched. Expected deltas between the two are
 * documented in docs/platform/core/commercial-execution-simulator-deltas.md and
 * surfaced per-preview in `notes`.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §8.
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext, CommercialResolution, ConfigSnapshotRef, EvaluationMode, ResolutionWarning } from "@/lib/commercial/execution/executionTypes";
import type { CommercialSchedule, DateRange } from "@/lib/commercial/execution/schedule";
import type { FundingPlan } from "@/lib/commercial/execution/funding";
import type { ExportValidation, ExportValidationIssue } from "@/lib/commercial/execution/export/readerTypes";
import { attribute } from "@/lib/commercial/execution/fundingAttribute";
import { evaluate } from "@/lib/commercial/execution/evaluate/evaluate";
import { expand } from "@/lib/commercial/execution/expand";

export type ExecutionPreviewValidation = {
    ok: boolean;
    errorCount: number;
    warningCount: number;
    issues: ExportValidationIssue[];
};

export type CommercialExecutionPreview = {
    configVersion: ConfigSnapshotRef;
    mode: EvaluationMode;
    validation: ExecutionPreviewValidation;
    resolution: CommercialResolution;
    /** Present only when a horizon is supplied. */
    schedule: CommercialSchedule | null;
    /** Resolution-level warnings (unmapped accounting, unpriced tuition, …). */
    warnings: ResolutionWarning[];
    /** Human notes documenting expected deltas relevant to THIS preview. */
    notes: string[];
};

export type PreviewOptions = { plan?: FundingPlan; horizon?: DateRange };

/**
 * Build a Commercial Execution preview. Pure — takes an already-composed export +
 * validation (the route does the DB read), runs the pipeline, returns the DTO.
 */
export function buildCommercialExecutionPreview(
    exp: CommercialExport,
    validation: ExportValidation,
    context: CommercialContext,
    opts: PreviewOptions = {},
): CommercialExecutionPreview {
    let resolution = evaluate(context, exp);
    if (opts.plan) resolution = attribute(resolution, opts.plan);
    const schedule = opts.horizon ? expand(resolution, opts.horizon) : null;

    const notes: string[] = [];
    if (resolution.warnings.some((w) => w.code.startsWith("accounting_"))) {
        notes.push(
            "Accounting: one or more lines resolve with a null revenue category / GL account (expected until Accounting V2 UI wiring). Surfaced as non-blocking warnings, not errors.",
        );
    }
    if (exp.policies.length === 0) {
        notes.push("Policy: no commercial_policies configured → net === gross. Substrate A may apply financial_policies independently (expected delta).");
    }
    if (!opts.plan) {
        notes.push("Funding: no plan supplied → single-payer residual (full net → primary). Substrate A carries a single responsibility_key (expected delta).");
    }
    notes.push("Pricing source: commercial_tuition_rates + commercial_products (frozen V1). Substrate A prices from childcare_rate_plans/rules; amounts match only when both are configured consistently.");

    const errorCount = validation.issues.filter((i) => i.severity === "error").length;
    const warningCount = validation.issues.length - errorCount;

    return {
        configVersion: exp.version,
        mode: context.mode,
        validation: { ok: validation.ok, errorCount, warningCount, issues: validation.issues },
        resolution,
        schedule,
        warnings: resolution.warnings,
        notes,
    };
}
