/**
 * Organization Calculation AST — proving-slice node types + structural validation.
 * Closed set only; not a string formula language.
 */

import {
    APPROVED_INPUT_REFS,
    type ApprovedInputRef,
    type BinaryOp,
    type CallFn,
} from "@/lib/organizationCalculations/catalog";

export type OrgCalcExpr =
    | { kind: "const"; value: number; id?: string }
    | { kind: "input"; ref: ApprovedInputRef; id?: string }
    | { kind: "unary"; op: "neg"; arg: OrgCalcExpr; id?: string }
    | { kind: "binary"; op: BinaryOp; left: OrgCalcExpr; right: OrgCalcExpr; id?: string }
    | { kind: "call"; fn: CallFn; args: OrgCalcExpr[]; id?: string };

export type OrgCalcValidationIssue = {
    code: string;
    message: string;
    path?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function isApprovedRef(v: unknown): v is ApprovedInputRef {
    return typeof v === "string" && (APPROVED_INPUT_REFS as readonly string[]).includes(v);
}

const BINARY_OPS = new Set(["add", "sub", "mul", "div"]);
const CALL_FNS = new Set(["min", "max", "coalesce"]);

/**
 * Validate unknown JSON into a typed AST. Fail-closed on unsupported nodes/refs.
 */
export function parseAndValidateOrgCalcExpr(
    raw: unknown,
    path = "root",
): { ok: true; expr: OrgCalcExpr } | { ok: false; issues: OrgCalcValidationIssue[] } {
    const issues: OrgCalcValidationIssue[] = [];

    function walk(node: unknown, p: string): OrgCalcExpr | null {
        if (!isRecord(node) || typeof node.kind !== "string") {
            issues.push({ code: "invalid_node", message: "Expression node must be an object with kind", path: p });
            return null;
        }

        switch (node.kind) {
            case "const": {
                if (typeof node.value !== "number" || !Number.isFinite(node.value)) {
                    issues.push({ code: "invalid_const", message: "const.value must be a finite number", path: p });
                    return null;
                }
                return { kind: "const", value: node.value, id: typeof node.id === "string" ? node.id : undefined };
            }
            case "input": {
                if (!isApprovedRef(node.ref)) {
                    issues.push({
                        code: "unknown_input_ref",
                        message: `Unknown or disallowed input ref: ${String(node.ref)}`,
                        path: p,
                    });
                    return null;
                }
                return { kind: "input", ref: node.ref, id: typeof node.id === "string" ? node.id : undefined };
            }
            case "unary": {
                if (node.op !== "neg") {
                    issues.push({ code: "unsupported_unary", message: `Unsupported unary op: ${String(node.op)}`, path: p });
                    return null;
                }
                const arg = walk(node.arg, `${p}.arg`);
                if (!arg) return null;
                return { kind: "unary", op: "neg", arg, id: typeof node.id === "string" ? node.id : undefined };
            }
            case "binary": {
                if (typeof node.op !== "string" || !BINARY_OPS.has(node.op)) {
                    issues.push({
                        code: "unsupported_binary",
                        message: `Unsupported binary op: ${String(node.op)}`,
                        path: p,
                    });
                    return null;
                }
                const left = walk(node.left, `${p}.left`);
                const right = walk(node.right, `${p}.right`);
                if (!left || !right) return null;
                return {
                    kind: "binary",
                    op: node.op as BinaryOp,
                    left,
                    right,
                    id: typeof node.id === "string" ? node.id : undefined,
                };
            }
            case "call": {
                if (typeof node.fn !== "string" || !CALL_FNS.has(node.fn)) {
                    issues.push({ code: "unsupported_call", message: `Unsupported function: ${String(node.fn)}`, path: p });
                    return null;
                }
                if (!Array.isArray(node.args) || node.args.length < 1) {
                    issues.push({
                        code: "invalid_arity",
                        message: `${node.fn} requires at least one argument`,
                        path: p,
                    });
                    return null;
                }
                const args: OrgCalcExpr[] = [];
                for (let i = 0; i < node.args.length; i++) {
                    const a = walk(node.args[i], `${p}.args[${i}]`);
                    if (!a) return null;
                    args.push(a);
                }
                return {
                    kind: "call",
                    fn: node.fn as CallFn,
                    args,
                    id: typeof node.id === "string" ? node.id : undefined,
                };
            }
            default:
                issues.push({ code: "unsupported_kind", message: `Unsupported kind: ${node.kind}`, path: p });
                return null;
        }
    }

    const expr = walk(raw, path);
    if (!expr || issues.length) return { ok: false, issues };
    return { ok: true, expr };
}

/** Reference AST for the proving-slice demo calculation. */
export function provingMinPhysicalLicensedAst(): OrgCalcExpr {
    return {
        kind: "call",
        fn: "min",
        id: "root",
        args: [
            { kind: "input", ref: "capacity.room_binding.physical", id: "in_physical" },
            { kind: "input", ref: "capacity.room_binding.licensed", id: "in_licensed" },
        ],
    };
}
