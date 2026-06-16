/**
 * BOS extraction confidence surfaced on Create Lead draft fields after Analyze.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";

export type CreateLeadFieldConfidenceState = "high" | "medium" | "low" | "undetected" | "manual";

export function buildCreateLeadFieldConfidenceMap(args: {
    extraction: ActionIntakePasteExtractionResult | null;
    values: Record<string, string>;
    gatherFields: readonly ActionWorkspaceGatherField[];
    materialAnalyzed: boolean;
}): Record<string, CreateLeadFieldConfidenceState> {
    if (!args.materialAnalyzed) return {};

    const extractionByKey = new Map(
        (args.extraction?.fields ?? []).map((field) => [field.payload_key, field.confidence]),
    );
    const out: Record<string, CreateLeadFieldConfidenceState> = {};

    for (const field of args.gatherFields) {
        const key = field.payload_key;
        const value = (args.values[key] ?? "").trim();
        const extracted = extractionByKey.get(key);

        if (value && extracted) {
            out[key] = extracted;
        } else if (value) {
            out[key] = "manual";
        } else if (field.tier === "required") {
            out[key] = "undetected";
        }
    }

    return out;
}
