/**
 * Pure Organization Calculation AST evaluator + explanation steps.
 * Never mutates Facts/Config/Intent. No IO.
 */

import type { OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import { catalogLabelForRef, type ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import type { CalculationResolutionStatus } from "@/lib/operationalCalculations/resultContract";

export type ExplanationStep = {
    nodeId: string;
    label: string;
    op: string;
    inputs: Array<{ label: string; value: number | null }>;
    output: number | null;
    notes?: string[];
};

export type OrgCalcEvalWarning = {
    code: string;
    message: string;
};

export type OrgCalcEvaluationResult = {
    status: CalculationResolutionStatus;
    value: number | null;
    explanation: ExplanationStep[];
    warnings: OrgCalcEvalWarning[];
};

export type InputResolution = {
    value: number | null;
    /** Upstream platform resolution status for this input's source. */
    upstreamStatus?: CalculationResolutionStatus;
    note?: string;
};

export type OrgCalcEvalContext = {
    resolveInput: (ref: ApprovedInputRef) => InputResolution;
    /** Exact-version population×weighting aggregate (preloaded at room evaluation). */
    resolveEquivalentCount?: (
        populationVersionId: string,
        weightingVersionId: string,
    ) => InputResolution;
};

function mergeStatus(
    a: CalculationResolutionStatus,
    b: CalculationResolutionStatus,
): CalculationResolutionStatus {
    const rank: Record<CalculationResolutionStatus, number> = {
        resolved: 0,
        partial: 1,
        incomplete: 2,
        not_configured: 3,
        conflicted: 4,
    };
    return rank[a] >= rank[b] ? a : b;
}

let nodeSeq = 0;
function nextId(explicit?: string): string {
    if (explicit) return explicit;
    nodeSeq += 1;
    return `n${nodeSeq}`;
}

export function evaluateOrgCalcExpr(
    expr: OrgCalcExpr,
    ctx: OrgCalcEvalContext,
): OrgCalcEvaluationResult {
    nodeSeq = 0;
    const explanation: ExplanationStep[] = [];
    const warnings: OrgCalcEvalWarning[] = [];
    let status: CalculationResolutionStatus = "resolved";

    function noteUnknown(code: string, message: string) {
        warnings.push({ code, message });
        status = mergeStatus(status, "incomplete");
    }

    function evalNode(node: OrgCalcExpr): number | null {
        const id = nextId(node.id);

        switch (node.kind) {
            case "const": {
                explanation.push({
                    nodeId: id,
                    label: "Constant",
                    op: "const",
                    inputs: [],
                    output: node.value,
                });
                return node.value;
            }
            case "input": {
                const resolved = ctx.resolveInput(node.ref);
                if (resolved.upstreamStatus) {
                    status = mergeStatus(status, resolved.upstreamStatus);
                }
                const label = catalogLabelForRef(node.ref);
                const notes = resolved.note ? [resolved.note] : undefined;
                if (resolved.value == null) {
                    noteUnknown("input_unknown", `${label} is not available`);
                }
                explanation.push({
                    nodeId: id,
                    label,
                    op: "input",
                    inputs: [],
                    output: resolved.value,
                    notes,
                });
                return resolved.value;
            }
            case "unary": {
                const arg = evalNode(node.arg);
                const output = arg == null ? null : -arg;
                if (arg == null) noteUnknown("unary_unknown", "Negation received an unknown value");
                explanation.push({
                    nodeId: id,
                    label: "Negate",
                    op: "neg",
                    inputs: [{ label: "value", value: arg }],
                    output,
                });
                return output;
            }
            case "binary": {
                const left = evalNode(node.left);
                const right = evalNode(node.right);
                let output: number | null = null;
                const opLabel =
                    node.op === "add" ? "Add"
                    : node.op === "sub" ? "Subtract"
                    : node.op === "mul" ? "Multiply"
                    : "Divide";

                if (node.op === "div") {
                    if (right == null || right === 0 || left == null) {
                        output = null;
                        noteUnknown(
                            right === 0 ? "div_by_zero" : "div_unknown",
                            right === 0 ? "Division by zero" : "Division received an unknown value",
                        );
                    } else {
                        output = left / right;
                    }
                } else if (left == null || right == null) {
                    output = null;
                    noteUnknown("binary_unknown", `${opLabel} received an unknown value`);
                } else if (node.op === "add") output = left + right;
                else if (node.op === "sub") output = left - right;
                else output = left * right;

                explanation.push({
                    nodeId: id,
                    label: opLabel,
                    op: node.op,
                    inputs: [
                        { label: "left", value: left },
                        { label: "right", value: right },
                    ],
                    output,
                });
                return output;
            }
            case "call": {
                const args = node.args.map((a) => evalNode(a));
                let output: number | null = null;

                if (node.fn === "coalesce") {
                    output = args.find((v) => v != null) ?? null;
                    if (output == null) noteUnknown("coalesce_unknown", "No non-unknown argument for coalesce");
                } else {
                    const known = args.filter((v): v is number => v != null);
                    if (known.length === 0) {
                        output = null;
                        noteUnknown(`${node.fn}_unknown`, `All arguments to ${node.fn} are unknown`);
                    } else if (node.fn === "min") {
                        output = Math.min(...known);
                    } else {
                        output = Math.max(...known);
                    }
                }

                explanation.push({
                    nodeId: id,
                    label: node.fn === "min" ? "Minimum" : node.fn === "max" ? "Maximum" : "Coalesce",
                    op: node.fn,
                    inputs: args.map((value, i) => ({ label: `arg${i + 1}`, value })),
                    output,
                });
                return output;
            }
            case "equivalent_count": {
                const resolve = ctx.resolveEquivalentCount;
                const resolved =
                    resolve ?
                        resolve(node.population_version_id, node.weighting_version_id)
                    :   {
                            value: null as number | null,
                            upstreamStatus: "incomplete" as const,
                            note: "Equivalent count resolver was not provided",
                        };
                if (resolved.upstreamStatus) {
                    status = mergeStatus(status, resolved.upstreamStatus);
                }
                if (resolved.value == null) {
                    noteUnknown(
                        "equivalent_count_unknown",
                        resolved.note ?? "Equivalent count is not available",
                    );
                }
                explanation.push({
                    nodeId: id,
                    label: "Equivalent count",
                    op: "equivalent_count",
                    inputs: [],
                    output: resolved.value,
                    notes: resolved.note ? [resolved.note] : undefined,
                });
                return resolved.value;
            }
        }
    }

    const value = evalNode(expr);
    return { status, value, explanation, warnings };
}
