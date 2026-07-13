/**
 * Process / transition condition operands — shared canonical resolver seam.
 */

import {
    resolveCanonicalConditionOperands,
    type CanonicalConditionOperand,
    type ResolveCanonicalConditionOperandsArgs,
} from "@/lib/fields/canonicalConditionOperands";

export type ProcessConditionOperand = CanonicalConditionOperand;

export function resolveProcessConditionOperands(
    args: Omit<ResolveCanonicalConditionOperandsArgs, "consumer"> & {
        consumer?: "process_condition" | "transition_condition";
    } = {},
): ProcessConditionOperand[] {
    return resolveCanonicalConditionOperands({
        ...args,
        consumer: args.consumer ?? "process_condition",
    });
}

export function resolveTransitionConditionOperands(
    filter?: ResolveCanonicalConditionOperandsArgs["filter"],
): ProcessConditionOperand[] {
    return resolveProcessConditionOperands({ consumer: "transition_condition", filter });
}
