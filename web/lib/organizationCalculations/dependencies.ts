/**
 * Dependency extraction for Organization Calculation ASTs.
 */

import type { OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";

export function extractDependencyRefs(expr: OrgCalcExpr): ApprovedInputRef[] {
    const set = new Set<ApprovedInputRef>();

    function walk(node: OrgCalcExpr) {
        switch (node.kind) {
            case "const":
                return;
            case "input":
                set.add(node.ref);
                return;
            case "unary":
                walk(node.arg);
                return;
            case "binary":
                walk(node.left);
                walk(node.right);
                return;
            case "call":
                for (const a of node.args) walk(a);
                return;
            case "equivalent_count":
                return;
        }
    }

    walk(expr);
    return [...set].sort();
}
