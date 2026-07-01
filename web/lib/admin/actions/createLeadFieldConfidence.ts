/**
 * BOS extraction confidence surfaced on Create Lead draft fields after Analyze.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import type { BosFieldConfidenceDisplayLevel } from "@/lib/admin/actions/actionWorkspaceBosTheme";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import { CREATE_LEAD_PLATFORM_REQUIRED_KEYS } from "@/lib/admin/actions/createLeadPlatformGather";

export type CreateLeadFieldConfidenceState = BosFieldConfidenceDisplayLevel;

function valueFailsValidation(field: ActionWorkspaceGatherField, value: string): boolean {
    if (field.value_kind === "email") return !isValidCreateLeadEmail(value);
    if (field.value_kind === "phone") return !isValidCreateLeadPhone(value);
    return false;
}

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

    const platformRequired = new Set<string>(CREATE_LEAD_PLATFORM_REQUIRED_KEYS);
    const email = (args.values.email ?? "").trim();
    const phone = (args.values.phone ?? "").trim();
    const needsContact = !email && !phone;

    for (const field of args.gatherFields) {
        const key = field.payload_key;
        const value = (args.values[key] ?? "").trim();
        const extracted = extractionByKey.get(key);

        if (value && valueFailsValidation(field, value)) {
            out[key] = "invalid";
        } else if (extracted === "invalid") {
            out[key] = "invalid";
        } else if (value && extracted === "high") {
            out[key] = "high";
        } else if (value && extracted) {
            out[key] = extracted === "medium" || extracted === "low" ? extracted : "high";
        } else if (value) {
            out[key] = "manual";
        } else if (platformRequired.has(key)) {
            out[key] = "undetected";
        } else if ((key === "email" || key === "phone") && needsContact) {
            out[key] = "undetected";
        } else if (field.tier === "required") {
            out[key] = "undetected";
        }
    }

    return out;
}
