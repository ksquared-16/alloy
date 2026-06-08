import type { SupabaseClient } from "@supabase/supabase-js";
import { batchOptionItemLabelsForOrg } from "@/lib/admin/optionItemLabelForOrg";
import {
    applyInquiryChildPlacementDisplayLabels,
    inquiryChildPlacementOptionLabelPairs,
    type InquiryChildOcmPlacementSource,
} from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";

/** Batch-resolve childcare program/schedule labels for inquiry child rows (OCM placement). */
export async function enrichInquiryChildrenWithPlacementOptionLabels<
    T extends InquiryChildOcmPlacementSource,
>(supabase: SupabaseClient, orgId: string, rows: T[]): Promise<T[]> {
    const pairs = inquiryChildPlacementOptionLabelPairs(rows);
    if (!pairs.length) return rows;
    const optionLabelLookup = await batchOptionItemLabelsForOrg(supabase, orgId, pairs);
    return applyInquiryChildPlacementDisplayLabels(rows, optionLabelLookup);
}
