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
    desired_program_type: string | null;
    desired_program_category_id: string | null;
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
            "opportunity_id, customer_member_id, location_id, desired_program_type, desired_program_category_id"
        )
        .eq("org_id", orgId)
        .in("opportunity_id", ids);
    const out: QueueOcmPlacementRow[] = [];
    for (const raw of data ?? []) {
        const row = raw as {
            opportunity_id?: string;
            customer_member_id?: string;
            location_id?: string | null;
            desired_program_type?: string | null;
            desired_program_category_id?: string | null;
        };
        const opportunity_id = trimOrNull(row.opportunity_id);
        const customer_member_id = trimOrNull(row.customer_member_id);
        if (!opportunity_id || !customer_member_id) continue;
        out.push({
            opportunity_id,
            customer_member_id,
            location_id: trimOrNull(row.location_id),
            desired_program_type: trimOrNull(row.desired_program_type),
            desired_program_category_id: trimOrNull(row.desired_program_category_id),
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

/** Program/category for queue CRM compact — canonical OCM desired_program_type only. */
export function resolveQueueChildProgramCategoryLabel(args: {
    ocmRow: QueueOcmPlacementRow | null | undefined;
    optionLabelLookup: Map<string, string>;
    locationProgramCategories?: ReadonlyArray<LocationProgramCategoryRow>;
    /** Legacy member metadata — only when no OCM row exists for this member. */
    metadataProgramLabel?: string | null;
}): string | null {
    if (args.ocmRow) {
        return resolveInquiryChildProgramCategoryLabel({
            desired_program_category_id: args.ocmRow.desired_program_category_id,
            desired_program_type: args.ocmRow.desired_program_type,
            location_id: args.ocmRow.location_id,
            optionLabelLookup: args.optionLabelLookup,
            locationProgramCategories: args.locationProgramCategories,
        });
    }
    const legacy = trimOrNull(args.metadataProgramLabel);
    return legacy || null;
}
