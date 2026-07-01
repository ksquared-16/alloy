/**
 * Delete / inactivate decision for status_definitions admin mutations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    findStatusDefinitionConfigReferences,
    formatStatusDefinitionConfigReference,
} from "@/lib/admin/statusDefinitionConfigReferences";
import { isStatusDefinitionInUse } from "@/lib/admin/statusDefinitionUsage";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

export type StatusDefinitionDeleteAction = "deleted" | "inactivated";

export type StatusDefinitionDeletePlan = {
    action: StatusDefinitionDeleteAction;
    blockHardDelete: boolean;
    blockReason: string | null;
    warnings: string[];
    inUse: boolean;
    configReferences: ReturnType<typeof findStatusDefinitionConfigReferences> extends Promise<infer T> ? T : never;
};

export async function planStatusDefinitionDelete(params: {
    supabase: SupabaseClient;
    orgId: string;
    row: Pick<StatusDefinitionRow, "entity_type" | "status_key" | "is_system">;
}): Promise<StatusDefinitionDeletePlan> {
    const { inUse, hits } = await isStatusDefinitionInUse({
        supabase: params.supabase,
        orgId: params.orgId,
        entityType: params.row.entity_type,
        statusKey: params.row.status_key,
    });

    const configReferences = await findStatusDefinitionConfigReferences({
        supabase: params.supabase,
        orgId: params.orgId,
        entityType: params.row.entity_type,
        statusKey: params.row.status_key,
    });

    const warnings: string[] = [];
    for (const ref of configReferences) {
        warnings.push(
            `Referenced in Business Process configuration: ${formatStatusDefinitionConfigReference(ref)}.`,
        );
    }

    const isSystem = Boolean(params.row.is_system);
    const blockHardDelete = !inUse && configReferences.length > 0;
    const blockReason =
        blockHardDelete
            ? "This status is referenced in Business Process configuration. Remove it from the affected stage or queue membership before deleting."
        :   null;

    if (isSystem || inUse) {
        if (inUse) {
            const hitSummary = hits.map((h) => `${h.table}.${h.column}`).join(", ");
            warnings.unshift(
                `Status is used by live records (${hitSummary}). It will be inactivated instead of deleted.`,
            );
        }
        return {
            action: "inactivated",
            blockHardDelete: false,
            blockReason: null,
            warnings,
            inUse,
            configReferences,
        };
    }

    return {
        action: "deleted",
        blockHardDelete,
        blockReason,
        warnings,
        inUse,
        configReferences,
    };
}

export function statusDefinitionDeleteMessage(action: StatusDefinitionDeleteAction, inUse: boolean): string {
    if (action === "inactivated") {
        return inUse
            ? "Status is used by records, so it was inactivated instead."
            : "Status was inactivated.";
    }
    return "Status deleted.";
}
