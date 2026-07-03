import type { SupabaseClient } from "@supabase/supabase-js";
import { batchOptionItemLabelsForOrg } from "@/lib/admin/optionItemLabelForOrg";
import {
    inquiryChildPlacementOptionLabelPairs,
    resolveInquiryChildProgramCategoryLabel,
    type InquiryChildOcmPlacementSource,
} from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

export type QueueOcmPlacementRow = {
    opportunity_id: string;
    customer_member_id: string;
    location_id: string | null;
    program_category_id: string | null;
    /** Stable program key derived from the embedded category — display only, never persisted. */
    program_key: string | null;
    /** Category label from the embedded category row. */
    program_label: string | null;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** Batch-fetch OCM placement rows for work-unit opportunity queue enrichment. */
export async function fetchOcmPlacementRowsForOpportunities(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[]
): Promise<QueueOcmPlacementRow[]> {
    const ids = [...new Set(opportunityIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return [];
    const { data } = await supabase
        .from("opportunity_customer_members")
        .select(
            "opportunity_id, customer_member_id, location_id, program_category_id, location_program_categories(key, label)"
        )
        .eq("org_id", orgId)
        .in("opportunity_id", ids);
    const out: QueueOcmPlacementRow[] = [];
    for (const raw of data ?? []) {
        const row = raw as {
            opportunity_id?: string;
            customer_member_id?: string;
            location_id?: string | null;
            program_category_id?: string | null;
            location_program_categories?: { key?: string | null; label?: string | null } | null;
        };
        const opportunity_id = trimOrNull(row.opportunity_id);
        const customer_member_id = trimOrNull(row.customer_member_id);
        if (!opportunity_id || !customer_member_id) continue;
        out.push({
            opportunity_id,
            customer_member_id,
            location_id: trimOrNull(row.location_id),
            program_category_id: trimOrNull(row.program_category_id),
            program_key: trimOrNull(row.location_program_categories?.key),
            program_label: trimOrNull(row.location_program_categories?.label),
        });
    }
    return out;
}

export function indexOcmPlacementByOpportunityAndMember(
    rows: QueueOcmPlacementRow[]
): Map<string, Map<string, QueueOcmPlacementRow>> {
    const byOpp = new Map<string, Map<string, QueueOcmPlacementRow>>();
    for (const row of rows) {
        let members = byOpp.get(row.opportunity_id);
        if (!members) {
            members = new Map();
            byOpp.set(row.opportunity_id, members);
        }
        members.set(row.customer_member_id, row);
    }
    return byOpp;
}

export async function buildChildcarePlacementOptionLabelLookup(
    supabase: SupabaseClient,
    orgId: string,
    rows: InquiryChildOcmPlacementSource[]
): Promise<Map<string, string>> {
    const pairs = inquiryChildPlacementOptionLabelPairs(rows);
    if (!pairs.length) return new Map();
    return batchOptionItemLabelsForOrg(supabase, orgId, pairs);
}

/** Program/category for queue CRM compact — canonical OCM program category FK only. */
export function resolveQueueChildProgramCategoryLabel(args: {
    ocmRow: QueueOcmPlacementRow | null | undefined;
    optionLabelLookup: Map<string, string>;
    locationProgramCategories?: ReadonlyArray<LocationProgramCategoryRow>;
    /** Legacy member metadata — only when no OCM row exists for this member. */
    metadataProgramLabel?: string | null;
}): string | null {
    if (args.ocmRow) {
        return resolveInquiryChildProgramCategoryLabel({
            program_category_id: args.ocmRow.program_category_id,
            program_key: args.ocmRow.program_key,
            desired_program_label: args.ocmRow.program_label,
            location_id: args.ocmRow.location_id,
            optionLabelLookup: args.optionLabelLookup,
            locationProgramCategories: args.locationProgramCategories,
        });
    }
    const legacy = trimOrNull(args.metadataProgramLabel);
    return legacy || null;
}
