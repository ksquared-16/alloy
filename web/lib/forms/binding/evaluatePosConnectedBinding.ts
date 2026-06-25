/**
 * POS-FP0 — publish-time binding guard (pure orchestrator).
 *
 * Single place that encodes the legacy non-interference guarantee: when a surface
 * is NOT POS-connected, enforcement is skipped entirely (ok, no violations). When
 * it IS POS-connected, the field-binding validator runs.
 *
 * Pure: callers (e.g. the publish route) supply `posConnected`, the parsed schema,
 * and the available registry key set.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    validatePosConnectedFieldBinding,
    type PosConnectedFieldBindingResult,
} from "./validatePosConnectedFieldBinding";

export interface EvaluatePosConnectedBindingArgs {
    posConnected: boolean;
    schema: Pick<FormSchemaV1, "fields">;
    availableFieldKeys: ReadonlySet<string>;
}

export interface EvaluatePosConnectedBindingResult extends PosConnectedFieldBindingResult {
    /** Whether binding enforcement actually ran (true only for POS-connected surfaces). */
    enforced: boolean;
}

export function evaluatePosConnectedBinding(
    args: EvaluatePosConnectedBindingArgs
): EvaluatePosConnectedBindingResult {
    if (!args.posConnected) {
        return { enforced: false, ok: true, violations: [] };
    }
    const result = validatePosConnectedFieldBinding(args.schema, args.availableFieldKeys);
    return { enforced: true, ...result };
}
