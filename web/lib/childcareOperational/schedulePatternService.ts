import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchedulePatternRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { validateSiteLocationRef } from "@/lib/childcareOperational/validateChildcareLocationRefs";

const PATTERN_KEY_RE = /^[a-z0-9_]{2,64}$/;

export type ListSchedulePatternsFilters = {
    siteLocationId?: string;
    isActive?: boolean;
};

export type CreateSchedulePatternInput = {
    orgId: string;
    siteLocationId: string;
    key: string;
    label: string;
    scheduleTypeKey: string;
    weekdays: number[];
    sortOrder?: number;
    metadata?: Record<string, unknown>;
};

export type UpdateSchedulePatternInput = {
    orgId: string;
    patternId: string;
    label?: string;
    scheduleTypeKey?: string;
    weekdays?: number[];
    sortOrder?: number;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
};

export async function listSchedulePatterns(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListSchedulePatternsFilters = {}
): Promise<SchedulePatternRow[]> {
    let q = supabase
        .from("schedule_patterns")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (filters.siteLocationId) {
        q = q.eq("site_location_id", filters.siteLocationId);
    }
    if (filters.isActive === true) {
        q = q.eq("is_active", true);
    } else if (filters.isActive === false) {
        q = q.eq("is_active", false);
    }

    const { data, error } = await q;
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return (data ?? []) as SchedulePatternRow[];
}

export async function getSchedulePatternById(
    supabase: SupabaseClient,
    orgId: string,
    patternId: string
): Promise<SchedulePatternRow | null> {
    const { data, error } = await supabase
        .from("schedule_patterns")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", patternId)
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as SchedulePatternRow) : null;
}

export async function createSchedulePattern(
    supabase: SupabaseClient,
    input: CreateSchedulePatternInput
): Promise<SchedulePatternRow> {
    const siteLocationId = trimOrNull(input.siteLocationId);
    const key = trimOrNull(input.key);
    const label = trimOrNull(input.label);
    const scheduleTypeKey = trimOrNull(input.scheduleTypeKey);

    if (!siteLocationId || !key || !label || !scheduleTypeKey) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "siteLocationId, key, label, and scheduleTypeKey are required"
        );
    }
    if (!PATTERN_KEY_RE.test(key)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "key must match [a-z0-9_]{2,64}"
        );
    }
    if (!input.weekdays?.length) {
        throw new OperationalEnrollmentServiceError("invalid_input", "weekdays must be non-empty");
    }

    const siteCheck = await validateSiteLocationRef(supabase, input.orgId, siteLocationId);
    if (!siteCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", siteCheck.error.message);
    }

    const row = {
        org_id: input.orgId,
        site_location_id: siteLocationId,
        key,
        label,
        schedule_type_key: scheduleTypeKey,
        weekdays: input.weekdays,
        sort_order: input.sortOrder ?? 100,
        is_active: true,
        metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase.from("schedule_patterns").insert(row).select("*").single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "insert failed");
    }
    return data as SchedulePatternRow;
}

export async function updateSchedulePattern(
    supabase: SupabaseClient,
    input: UpdateSchedulePatternInput
): Promise<SchedulePatternRow> {
    const existing = await getSchedulePatternById(supabase, input.orgId, input.patternId);
    if (!existing) {
        throw new OperationalEnrollmentServiceError("not_found", "Schedule pattern not found");
    }

    const updates: Record<string, unknown> = {};
    if (input.label != null) {
        const label = trimOrNull(input.label);
        if (!label) {
            throw new OperationalEnrollmentServiceError("invalid_input", "label cannot be empty");
        }
        updates.label = label;
    }
    if (input.scheduleTypeKey != null) {
        const scheduleTypeKey = trimOrNull(input.scheduleTypeKey);
        if (!scheduleTypeKey) {
            throw new OperationalEnrollmentServiceError("invalid_input", "scheduleTypeKey cannot be empty");
        }
        updates.schedule_type_key = scheduleTypeKey;
    }
    if (input.weekdays != null) {
        if (!input.weekdays.length) {
            throw new OperationalEnrollmentServiceError("invalid_input", "weekdays must be non-empty");
        }
        updates.weekdays = input.weekdays;
    }
    if (input.sortOrder != null) {
        updates.sort_order = input.sortOrder;
    }
    if (input.isActive != null) {
        updates.is_active = input.isActive;
    }
    if (input.metadata != null) {
        updates.metadata = input.metadata;
    }

    if (!Object.keys(updates).length) {
        throw new OperationalEnrollmentServiceError("invalid_input", "No updates provided");
    }

    const { data, error } = await supabase
        .from("schedule_patterns")
        .update(updates)
        .eq("org_id", input.orgId)
        .eq("id", input.patternId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    return data as SchedulePatternRow;
}
