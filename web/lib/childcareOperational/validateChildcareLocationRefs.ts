/**
 * Location / program reference validation for childcare operational services.
 * DB triggers are authoritative; these checks support early service-layer errors in tests.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LocationRefValidationError = {
    code: "not_found" | "org_mismatch" | "invalid_location_type" | "room_site_mismatch" | "program_site_mismatch";
    message: string;
};

export async function validateSiteLocationRef(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<{ ok: true } | { ok: false; error: LocationRefValidationError }> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, org_id, location_type")
        .eq("id", siteLocationId)
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            error: { code: "not_found", message: `site_location_id ${siteLocationId} not found` },
        };
    }
    const row = data as { org_id?: string; location_type?: string | null };
    if (String(row.org_id) !== orgId) {
        return { ok: false, error: { code: "org_mismatch", message: "site org mismatch" } };
    }
    if (row.location_type !== "site") {
        return {
            ok: false,
            error: {
                code: "invalid_location_type",
                message: `location ${siteLocationId} must be location_type site`,
            },
        };
    }
    return { ok: true };
}

export async function validateRoomLocationUnderSite(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    roomLocationId: string
): Promise<{ ok: true } | { ok: false; error: LocationRefValidationError }> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, org_id, location_type, parent_location_id")
        .eq("id", roomLocationId)
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            error: { code: "not_found", message: `room_location_id ${roomLocationId} not found` },
        };
    }
    const row = data as {
        org_id?: string;
        location_type?: string | null;
        parent_location_id?: string | null;
    };
    if (String(row.org_id) !== orgId) {
        return { ok: false, error: { code: "org_mismatch", message: "room org mismatch" } };
    }
    if (row.location_type !== "unit") {
        return {
            ok: false,
            error: {
                code: "invalid_location_type",
                message: `room ${roomLocationId} must be location_type unit`,
            },
        };
    }
    if (String(row.parent_location_id ?? "") !== siteLocationId) {
        return {
            ok: false,
            error: { code: "room_site_mismatch", message: "room is not a child of site" },
        };
    }
    return { ok: true };
}

export async function validateProgramCategoryForSite(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    programCategoryId: string
): Promise<{ ok: true } | { ok: false; error: LocationRefValidationError }> {
    const { data, error } = await supabase
        .from("location_program_categories")
        .select("id, org_id, location_id")
        .eq("id", programCategoryId)
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            error: { code: "not_found", message: `program_category_id ${programCategoryId} not found` },
        };
    }
    const row = data as { org_id?: string; location_id?: string };
    if (String(row.org_id) !== orgId) {
        return { ok: false, error: { code: "org_mismatch", message: "program category org mismatch" } };
    }
    if (String(row.location_id) !== siteLocationId) {
        return {
            ok: false,
            error: { code: "program_site_mismatch", message: "program category does not belong to site" },
        };
    }
    return { ok: true };
}

export async function validateSchedulePatternForSite(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    schedulePatternId: string
): Promise<{ ok: true } | { ok: false; error: LocationRefValidationError }> {
    const { data, error } = await supabase
        .from("schedule_patterns")
        .select("id, org_id, site_location_id, is_active")
        .eq("id", schedulePatternId)
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            error: { code: "not_found", message: `schedule_pattern_id ${schedulePatternId} not found` },
        };
    }
    const row = data as { org_id?: string; site_location_id?: string; is_active?: boolean };
    if (String(row.org_id) !== orgId) {
        return { ok: false, error: { code: "org_mismatch", message: "schedule pattern org mismatch" } };
    }
    if (String(row.site_location_id) !== siteLocationId) {
        return {
            ok: false,
            error: { code: "program_site_mismatch", message: "schedule pattern does not belong to agreement site" },
        };
    }
    if (row.is_active === false) {
        return {
            ok: false,
            error: { code: "not_found", message: `schedule pattern ${schedulePatternId} is not active` },
        };
    }
    return { ok: true };
}
