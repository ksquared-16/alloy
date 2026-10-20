/**
 * OFFER-SPOT PLACEMENTS COME FROM THE LOCATION'S PROGRAMS — not from a list typed into configuration.
 *
 * A participant-decision `select` input may declare `options_source: "location_program_categories"`
 * instead of static `options`. Its options are then the ACTIVE program categories of the child's own
 * location (the child's participation location, else the family's), valued by
 * `location_program_categories.id` and labelled with the location's display name for the program. They
 * are resolved where the surface is drawn AND again where the decision executes, so validation checks the
 * real categories and the operator's answer is stored as canonical ids (`location_id`,
 * `program_category_id`), never a display string alone.
 *
 * No seat inventory is implied: these are the programs the location offers, not availability.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLocationProgramCategoriesForOrg } from "@/lib/locations/loadLocationProgramCategoriesForOrg";
import { effectiveLocationProgramLabel, resolveActiveProgramCategoriesForSite } from "@/lib/locations/locationProgramCategories";
import type { StageParticipantDecisionInputV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export const PROGRAM_CATEGORY_OPTIONS_SOURCE = "location_program_categories" as const;

export function inputUsesProgramCategories(input: Pick<StageParticipantDecisionInputV1, "options_source">): boolean {
    return input.options_source === PROGRAM_CATEGORY_OPTIONS_SOURCE;
}

/** The location a child's offer is for: the child's participation location, else the family's. */
export async function resolveChildOfferLocationId(
    supabase: SupabaseClient,
    input: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data: ocm } = await supabase
        .from("opportunity_customer_members")
        .select("location_id")
        .eq("org_id", input.orgId)
        .eq("opportunity_id", input.opportunityId)
        .eq("customer_member_id", input.customerMemberId)
        .maybeSingle();
    const own = (ocm as { location_id?: string | null } | null)?.location_id?.trim();
    if (own) return own;
    const { data: opp } = await supabase
        .from("opportunities")
        .select("location_id")
        .eq("org_id", input.orgId)
        .eq("id", input.opportunityId)
        .maybeSingle();
    return (opp as { location_id?: string | null } | null)?.location_id?.trim() || null;
}

/** Program-category options for one location, valued by category id. Empty when none are configured. */
export async function programCategoryOptionsForLocation(
    supabase: SupabaseClient,
    input: { orgId: string; locationId: string | null },
): Promise<Array<{ value: string; label: string }>> {
    if (!input.locationId) return [];
    const rows = await loadLocationProgramCategoriesForOrg(supabase, input.orgId);
    return resolveActiveProgramCategoriesForSite(rows, input.locationId).map((c) => ({ value: c.id, label: effectiveLocationProgramLabel(c) }));
}

/** The decision's inputs with sourced options filled in for this child's location. Pure given the options. */
export function withSourcedInputOptions<T extends { required_inputs?: readonly StageParticipantDecisionInputV1[] }>(
    decision: T,
    programOptions: Array<{ value: string; label: string }>,
): T {
    if (!decision.required_inputs?.some(inputUsesProgramCategories)) return decision;
    return {
        ...decision,
        required_inputs: decision.required_inputs.map((i) => (inputUsesProgramCategories(i) ? { ...i, type: "select", options: programOptions } : i)),
    };
}
