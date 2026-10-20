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
import type { StageParticipantDecisionInputV1, StageParticipantDecisionOptionsSource } from "@/lib/lifecycle/stageOperatingPlanV1";
import { placeableRooms, resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import type { ChildParticipationPatch } from "@/lib/childcareOperational/applyChildParticipationEdit";

export const PROGRAM_CATEGORY_OPTIONS_SOURCE = "location_program_categories" as const;
export const ROOM_OPTIONS_SOURCE = "location_rooms" as const;

/** True when any input resolves its options from the child's location. */
export function inputUsesLocationSource(input: Pick<StageParticipantDecisionInputV1, "options_source">): boolean {
    return input.options_source === PROGRAM_CATEGORY_OPTIONS_SOURCE || input.options_source === ROOM_OPTIONS_SOURCE;
}

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

export type SourcedRoom = { id: string; label: string; siteLocationId: string; programCategoryId: string | null };

/**
 * The location's placeable, active rooms — the same rooms the Assignment editor places into — each
 * labelled with its configured program ("Room 3 · Infant"). A room carries its own site and program,
 * so choosing one names a concrete space, not a program category. No seat inventory is implied.
 */
export async function roomsForLocation(
    supabase: SupabaseClient,
    input: { orgId: string; locationId: string | null },
): Promise<SourcedRoom[]> {
    if (!input.locationId) return [];
    const [rooms, categories] = await Promise.all([
        resolveRoomsForLocation(supabase, input.orgId, input.locationId).then(placeableRooms),
        loadLocationProgramCategoriesForOrg(supabase, input.orgId),
    ]);
    const programLabel = new Map(
        resolveActiveProgramCategoriesForSite(categories, input.locationId).map((c) => [c.id, effectiveLocationProgramLabel(c)]),
    );
    return rooms
        .filter((r) => {
            const status = (r.statusKey ?? "").trim().toLowerCase();
            return r.isActive !== false && (status === "" || status === "active" || status === "open");
        })
        .map((r) => {
            const meta = r.metadata ?? {};
            const programCategoryId = typeof meta.program_category_id === "string" && meta.program_category_id.trim() ? meta.program_category_id.trim() : null;
            const name = (r.name ?? "").toString().trim() || "Room";
            const program = programCategoryId ? programLabel.get(programCategoryId) ?? null : null;
            return { id: r.id, label: program ? `${name} · ${program}` : name, siteLocationId: r.siteLocationId, programCategoryId };
        });
}

export type SourcedOptions = Partial<Record<StageParticipantDecisionOptionsSource, Array<{ value: string; label: string }>>>;

/** Every location-sourced option set a decision's inputs need, for this child's location. */
export async function sourcedOptionsForLocation(
    supabase: SupabaseClient,
    input: { orgId: string; locationId: string | null; sources: ReadonlySet<StageParticipantDecisionOptionsSource> },
): Promise<{ options: SourcedOptions; rooms: SourcedRoom[] }> {
    const options: SourcedOptions = {};
    let rooms: SourcedRoom[] = [];
    if (input.sources.has(PROGRAM_CATEGORY_OPTIONS_SOURCE)) {
        options[PROGRAM_CATEGORY_OPTIONS_SOURCE] = await programCategoryOptionsForLocation(supabase, input);
    }
    if (input.sources.has(ROOM_OPTIONS_SOURCE)) {
        rooms = await roomsForLocation(supabase, input);
        options[ROOM_OPTIONS_SOURCE] = rooms.map((r) => ({ value: r.id, label: r.label }));
    }
    return { options, rooms };
}

/** The location sources a set of decisions draw on. */
export function locationSourcesOf(
    decisions: ReadonlyArray<{ required_inputs?: readonly StageParticipantDecisionInputV1[] }>,
): Set<StageParticipantDecisionOptionsSource> {
    const out = new Set<StageParticipantDecisionOptionsSource>();
    for (const d of decisions) for (const i of d.required_inputs ?? []) if (i.options_source) out.add(i.options_source);
    return out;
}

/**
 * The decision's inputs with sourced options filled in for this child's location. Pure given the
 * options. Accepts the legacy program-only array for callers that resolve programs alone.
 */
export function withSourcedInputOptions<T extends { required_inputs?: readonly StageParticipantDecisionInputV1[] }>(
    decision: T,
    sourced: SourcedOptions | Array<{ value: string; label: string }>,
): T {
    if (!decision.required_inputs?.some(inputUsesLocationSource)) return decision;
    const bySource: SourcedOptions = Array.isArray(sourced) ? { [PROGRAM_CATEGORY_OPTIONS_SOURCE]: sourced } : sourced;
    return {
        ...decision,
        required_inputs: decision.required_inputs.map((i) =>
            i.options_source ? { ...i, type: "select", options: bySource[i.options_source] ?? [] } : i,
        ),
    };
}

/**
 * THE PLACEMENT A PATH RECORDS — its answers, mapped onto the child's placement draft by the inputs'
 * explicit `binds_to_participation_field`. A room brings its own site and program; a program brings
 * the offer location. Empty when the path records no placement. Pure given the resolved rooms.
 */
export function participationPatchFromAnswers(input: {
    inputs: readonly StageParticipantDecisionInputV1[];
    answers: ReadonlyArray<{ key: string; value: unknown }>;
    rooms: readonly SourcedRoom[];
    offerLocationId: string | null;
}): ChildParticipationPatch {
    const patch: ChildParticipationPatch = {};
    for (const spec of input.inputs) {
        const field = spec.binds_to_participation_field;
        if (!field) continue;
        const raw = input.answers.find((a) => a.key === spec.key)?.value;
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) continue;
        if (field === "program_room_cohort_key") {
            const room = input.rooms.find((r) => r.id === value);
            if (!room) continue;
            patch.program_room_cohort_key = room.id;
            patch.location_id = room.siteLocationId;
            if (room.programCategoryId && !patch.program_category_id) patch.program_category_id = room.programCategoryId;
        } else if (field === "program_category_id") {
            patch.program_category_id = value;
            if (input.offerLocationId && !patch.location_id) patch.location_id = input.offerLocationId;
        } else if (field === "start_date") {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) patch.start_date = value;
        }
    }
    return patch;
}
